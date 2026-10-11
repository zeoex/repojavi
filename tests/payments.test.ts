import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { dec } from "@/lib/money";
import { encryptSecret, hmacSha256Hex } from "@/lib/crypto";
import { addToCart } from "@/server/services/cart";
import { createOrderFromCart, expireStaleOrders, updateOrderStatusByMerchant } from "@/server/services/orders";
import { applyPaymentResult, handleMercadoPagoNotification, simulateDemoPayment, startPayment } from "@/server/services/payments";
import { verifyWebhookSignature } from "@/server/payments/mercadopago";
import { inventoryOf, key, makeAddress, makeMerchant, makeProduct, makeUser, resetDb } from "./helpers";

async function scenario(stock = 10, qty = 2) {
  const admin = await makeUser("admin@x.com");
  const client = await makeUser("cliente@x.com");
  const m = await makeMerchant("Almacén", admin);
  const p = await makeProduct(m.id, "Arroz", "1000", stock);
  const addr = await makeAddress(client.userId);
  await addToCart(client, p.variant.id, qty);
  const order = await createOrderFromCart(client, { merchantId: m.id, addressId: addr.id, contactName: "Juan Pérez", contactPhone: "1155554444", idempotencyKey: key() });
  return { admin, client, m, p, order };
}

const approved = (o: { id: string; merchantId: string; total: ReturnType<typeof dec> }, pid = "111") => ({
  orderId: o.id,
  merchantId: o.merchantId,
  provider: "MERCADOPAGO" as const,
  providerPaymentId: pid,
  status: "APPROVED" as const,
  amount: o.total,
  currency: "ARS",
  isSimulated: false,
});

describe("firma de webhooks de Mercado Pago", () => {
  const secret = "s3cr3t";
  const sign = (id: string, req: string, ts: string) => hmacSha256Hex(secret, `id:${id};request-id:${req};ts:${ts};`);

  it("acepta una firma válida y rechaza una alterada o ausente", () => {
    const ts = "1704908010";
    const v1 = sign("123456", "req-1", ts);
    expect(verifyWebhookSignature({ xSignature: `ts=${ts},v1=${v1}`, xRequestId: "req-1", dataId: "123456", secret }).ok).toBe(true);
    expect(verifyWebhookSignature({ xSignature: `ts=${ts},v1=${v1}`, xRequestId: "req-1", dataId: "999999", secret }).ok).toBe(false);
    expect(verifyWebhookSignature({ xSignature: `ts=${ts},v1=deadbeef`, xRequestId: "req-1", dataId: "123456", secret }).ok).toBe(false);
    expect(verifyWebhookSignature({ xSignature: null, xRequestId: "req-1", dataId: "123456", secret }).reason).toBe("missing-signature");
    expect(verifyWebhookSignature({ xSignature: `ts=${ts},v1=${v1}`, xRequestId: "req-1", dataId: "123456", secret: "" }).ok).toBe(false);
  });

  it("pasa a minúsculas los data.id alfanuméricos y controla la antigüedad", () => {
    const ts = String(Date.now());
    const v1 = sign("abc123", "r", ts);
    expect(verifyWebhookSignature({ xSignature: `ts=${ts},v1=${v1}`, xRequestId: "r", dataId: "ABC123", secret }).ok).toBe(true);
    expect(
      verifyWebhookSignature({ xSignature: `ts=${ts},v1=${v1}`, xRequestId: "r", dataId: "ABC123", secret, toleranceSeconds: 60, now: Date.now() + 3600_000 }).reason,
    ).toBe("stale");
  });
});

describe("procesamiento idempotente de pagos", () => {
  beforeEach(resetDb);
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.DEMO_PAYMENTS_ENABLED;
  });

  it("un pago aprobado descuenta el stock una sola vez aunque llegue repetido o en paralelo", async () => {
    const { order, p } = await scenario(10, 2);
    const results = await Promise.all([applyPaymentResult(approved(order)), applyPaymentResult(approved(order)), applyPaymentResult(approved(order))]);
    expect(results.filter((r) => r === "paid")).toHaveLength(1);
    expect(results.filter((r) => r === "already_paid")).toHaveLength(2);
    expect(await inventoryOf(p.variant.id)).toMatchObject({ quantity: 8, reserved: 0 });
    const o = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { delivery: true, payments: true } });
    expect(o.status).toBe("PAID");
    expect(o.stockCommitted).toBe(true);
    expect(o.delivery?.status).toBe("PENDING_ASSIGNMENT");
    expect(o.payments).toHaveLength(1);
    const commits = await prisma.inventoryMovement.count({ where: { orderId: order.id, type: "COMMIT" } });
    expect(commits).toBe(1);
  });

  it("no marca como pagado si el importe no coincide", async () => {
    const { order } = await scenario();
    const r = await applyPaymentResult({ ...approved(order), amount: dec("1.00") });
    expect(r).toBe("amount_mismatch");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING_PAYMENT");
    expect(await prisma.systemEvent.count({ where: { level: "error" } })).toBe(1);
  });

  it("un rechazo mantiene la reserva (reintento) y un aprobado posterior la confirma", async () => {
    const { order, p } = await scenario(10, 2);
    expect(await applyPaymentResult({ ...approved(order, "1"), status: "REJECTED" })).toBe("rejected");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAYMENT_REJECTED");
    expect((await inventoryOf(p.variant.id)).reserved).toBe(2);
    expect(await applyPaymentResult(approved(order, "2"))).toBe("paid");
    expect(await inventoryOf(p.variant.id)).toMatchObject({ quantity: 8, reserved: 0 });
  });

  it("pago aprobado después del vencimiento: descuenta si hay stock, si no queda para reembolso", async () => {
    const a = await scenario(10, 2);
    await expireStaleOrders(new Date(Date.now() + 3600_000));
    expect((await prisma.order.findUniqueOrThrow({ where: { id: a.order.id } })).status).toBe("CANCELLED");
    expect(await applyPaymentResult(approved(a.order, "late-1"))).toBe("paid");
    expect(await inventoryOf(a.p.variant.id)).toMatchObject({ quantity: 8, reserved: 0 });

    await resetDb();
    const b = await scenario(2, 2);
    await expireStaleOrders(new Date(Date.now() + 3600_000));
    await prisma.inventory.update({ where: { variantId: b.p.variant.id }, data: { quantity: 1 } }); // se vendió en otro lado
    vi.stubGlobal("fetch", vi.fn()); // no debe llamarse a MP sin cuenta conectada
    expect(await applyPaymentResult(approved(b.order, "late-2"))).toBe("refund_pending_no_stock");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: b.order.id } })).status).toBe("REFUND_PENDING");
    expect(await inventoryOf(b.p.variant.id)).toMatchObject({ quantity: 1, reserved: 0 });
  });

  it("detecta un segundo pago aprobado para el mismo pedido", async () => {
    const { order } = await scenario();
    await applyPaymentResult(approved(order, "A"));
    expect(await applyPaymentResult(approved(order, "B"))).toBe("duplicate_payment");
  });

  it("procesa la notificación consultando el pago real (API mockeada) e ignora pagos de otra cuenta", async () => {
    const { order, m, p } = await scenario(10, 2);
    await prisma.merchantPaymentAccount.create({
      data: { merchantId: m.id, providerUserId: "777", accessTokenEnc: encryptSecret("TEST-token-del-comercio"), status: "CONNECTED" },
    });
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(String(url)).toBe("https://api.mercadopago.com/v1/payments/5555");
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer TEST-token-del-comercio");
      return new Response(
        JSON.stringify({ id: 5555, status: "approved", status_detail: "accredited", transaction_amount: Number(order.total), currency_id: "ARS", external_reference: order.id, collector_id: 777 }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const params = { merchantId: m.id, topic: "payment", resourceId: "5555", requestId: "req-1", signatureOk: true, payload: { type: "payment" } };
    const r1 = await handleMercadoPagoNotification(params);
    expect(r1).toMatchObject({ duplicate: false, outcome: "paid" });
    const r2 = await handleMercadoPagoNotification(params);
    expect(r2.duplicate).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await inventoryOf(p.variant.id)).toMatchObject({ quantity: 8, reserved: 0 });

    // Pago cuyo collector es otra cuenta: se ignora
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: 6666, status: "approved", transaction_amount: 1, currency_id: "ARS", external_reference: order.id, collector_id: 999 }), { status: 200 })));
    const r3 = await handleMercadoPagoNotification({ ...params, resourceId: "6666", requestId: "req-2" });
    expect(r3).toMatchObject({ outcome: "ignored" });
  });

  it("crea la preferencia con el token del comercio y el total exacto (API mockeada)", async () => {
    const { order, m, client } = await scenario(10, 2);
    await prisma.merchantPaymentAccount.create({ data: { merchantId: m.id, providerUserId: "777", accessTokenEnc: encryptSecret("TEST-abc"), status: "CONNECTED" } });
    let body: { items: { unit_price: number; quantity: number }[]; external_reference: string; notification_url: string } | null = null;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ id: "pref-1", init_point: "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-1", sandbox_init_point: "https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-1" }), { status: 201 });
    }));
    const r = await startPayment(client, order.id);
    expect(r.kind).toBe("redirect");
    expect(body!.external_reference).toBe(order.id);
    expect(body!.notification_url).toBe(`https://fedexpress.test/api/webhooks/mercadopago?m=${m.id}`);
    const sum = body!.items.reduce((a, i) => a + i.unit_price * i.quantity, 0);
    expect(sum.toFixed(2)).toBe(order.total.toFixed(2));
  });

  it("sin Mercado Pago conectado y sin modo demo no se puede pagar", async () => {
    const { order, client } = await scenario();
    await expect(startPayment(client, order.id)).rejects.toThrow(/no tiene Mercado Pago conectado/);
  });

  it("los pagos simulados solo existen con DEMO_PAYMENTS_ENABLED y quedan marcados", async () => {
    const { order, client, admin, p } = await scenario(10, 2);
    await expect(simulateDemoPayment(client, order.id, "approved")).rejects.toThrow(/deshabilitados/);
    process.env.DEMO_PAYMENTS_ENABLED = "true";
    expect(await startPayment(client, order.id)).toEqual({ kind: "demo" });
    expect(await simulateDemoPayment(client, order.id, "approved")).toBe("paid");
    const pay = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    expect(pay.isSimulated).toBe(true);
    expect(pay.provider).toBe("DEMO");

    // Cancelación del comercio de un pedido pagado: reembolso (simulado) y devolución de stock
    await updateOrderStatusByMerchant(admin, order.merchantId, order.id, "REFUND_PENDING", "Sin repartidores");
    const o = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o.status).toBe("REFUNDED");
    expect(await inventoryOf(p.variant.id)).toMatchObject({ quantity: 10, reserved: 0 });
  });
});
