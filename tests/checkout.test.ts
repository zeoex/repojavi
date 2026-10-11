import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { addToCart, getPricedCart, setCartItemQuantity } from "@/server/services/cart";
import { createOrderFromCart, cancelOrderByCustomer, expireStaleOrders } from "@/server/services/orders";
import { inventoryOf, key, makeAddress, makeMerchant, makeProduct, makeUser, resetDb } from "./helpers";

describe("carritos, checkout y stock", () => {
  beforeEach(resetDb);

  it("mantiene carritos separados por comercio y pide confirmación al mezclar", async () => {
    const adminA = await makeUser("a@x.com");
    const adminB = await makeUser("b@x.com");
    const client = await makeUser("cliente@x.com");
    const A = await makeMerchant("Almacen A", adminA);
    const B = await makeMerchant("Super B", adminB);
    const pa = await makeProduct(A.id, "Arroz", "1000", 10);
    const pb = await makeProduct(B.id, "Arroz", "900", 5);

    const r1 = await addToCart(client, pa.variant.id, 2);
    expect(r1.needsConfirmation).toBe(false);
    const r2 = await addToCart(client, pb.variant.id, 1);
    expect(r2.needsConfirmation).toBe(true);
    if (r2.needsConfirmation) expect(r2.otherMerchants).toEqual(["Almacen A"]);
    await addToCart(client, pb.variant.id, 1, { confirmed: true });

    const carts = await prisma.cart.findMany({ where: { userId: client.userId }, include: { items: true } });
    expect(carts).toHaveLength(2);
    for (const c of carts) expect(c.items).toHaveLength(1);
  });

  it("no deja agregar más unidades que el stock disponible", async () => {
    const admin = await makeUser("a@x.com");
    const client = await makeUser("c@x.com");
    const m = await makeMerchant("A", admin);
    const p = await makeProduct(m.id, "Yerba", "3000", 3);
    await expect(addToCart(client, p.variant.id, 4)).rejects.toThrow(/Solo hay 3/);
    const ok = await addToCart(client, p.variant.id, 3);
    expect(ok.needsConfirmation).toBe(false);
    const item = await prisma.cartItem.findFirstOrThrow({});
    await expect(setCartItemQuantity(client, item.id, 5)).rejects.toThrow();
  });

  it("calcula importes en el servidor con precio promocional, envío y envío gratis", async () => {
    const admin = await makeUser("a@x.com");
    const client = await makeUser("c@x.com");
    const m = await makeMerchant("A", admin, { fee: "750.50", freeOver: "10000" });
    const p1 = await makeProduct(m.id, "Aceite", "2500.99", 10, "ACE", "1999.99");
    const p2 = await makeProduct(m.id, "Leche", "1200", 10, "LEC");
    const addr = await makeAddress(client.userId);
    await addToCart(client, p1.variant.id, 2);
    await addToCart(client, p2.variant.id, 1);
    const priced = await getPricedCart(client.userId, m.id, addr.id);
    expect(priced!.totals.subtotal.toFixed(2)).toBe("5199.98");
    expect(priced!.totals.discountTotal.toFixed(2)).toBe("1002.00");
    expect(priced!.totals.shippingFee.toFixed(2)).toBe("750.50");
    expect(priced!.totals.total.toFixed(2)).toBe("5950.48");

    // Envío gratis al superar el umbral
    await addToCart(client, p2.variant.id, 5);
    const priced2 = await getPricedCart(client.userId, m.id, addr.id);
    expect(priced2!.totals.subtotal.toFixed(2)).toBe("11199.98");
    expect(priced2!.totals.shippingFee.toFixed(2)).toBe("0.00");
  });

  it("crea el pedido con snapshot, reserva stock, vacía el carrito y es idempotente", async () => {
    const admin = await makeUser("a@x.com");
    const client = await makeUser("c@x.com");
    const m = await makeMerchant("A", admin);
    const p = await makeProduct(m.id, "Fideos", "800", 10);
    const addr = await makeAddress(client.userId);
    await addToCart(client, p.variant.id, 3);
    const k = key();
    const input = { merchantId: m.id, addressId: addr.id, contactName: "Juan", contactPhone: "1155554444", idempotencyKey: k };
    const order = await createOrderFromCart(client, input);
    expect(order.status).toBe("PENDING_PAYMENT");
    expect(order.total.toFixed(2)).toBe("2900.00");
    const again = await createOrderFromCart(client, input);
    expect(again.id).toBe(order.id);
    expect(await prisma.order.count()).toBe(1);

    const inv = await inventoryOf(p.variant.id);
    expect(inv).toMatchObject({ quantity: 10, reserved: 3 });
    expect(await prisma.cartItem.count()).toBe(0);

    // El cambio posterior de precio/nombre no altera el pedido histórico
    await prisma.productVariant.update({ where: { id: p.variant.id }, data: { price: 9999 } });
    await prisma.product.update({ where: { id: p.product.id }, data: { name: "Otro nombre" } });
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    expect(item.productName).toBe("Fideos");
    expect(item.unitPrice.toFixed(2)).toBe("800.00");
  });

  it("rechaza direcciones fuera de zona y pedidos por debajo del mínimo", async () => {
    const admin = await makeUser("a@x.com");
    const client = await makeUser("c@x.com");
    const m = await makeMerchant("A", admin);
    await prisma.merchantSettings.update({ where: { merchantId: m.id }, data: { minOrderAmount: 5000 } });
    const p = await makeProduct(m.id, "Azúcar", "1000", 10);
    const far = await makeAddress(client.userId, "X9999");
    const near = await makeAddress(client.userId, "C1000");
    await addToCart(client, p.variant.id, 2);
    await expect(createOrderFromCart(client, { merchantId: m.id, addressId: far.id, contactName: "Juan", contactPhone: "11555544", idempotencyKey: key() })).rejects.toThrow(/no realiza envíos/);
    await expect(createOrderFromCart(client, { merchantId: m.id, addressId: near.id, contactName: "Juan", contactPhone: "11555544", idempotencyKey: key() })).rejects.toThrow(/pedido mínimo/);
  });

  it("no usa una dirección de otro usuario", async () => {
    const admin = await makeUser("a@x.com");
    const client = await makeUser("c@x.com");
    const other = await makeUser("o@x.com");
    const m = await makeMerchant("A", admin);
    const p = await makeProduct(m.id, "Azúcar", "1000", 10);
    const foreign = await makeAddress(other.userId);
    await addToCart(client, p.variant.id, 1);
    await expect(createOrderFromCart(client, { merchantId: m.id, addressId: foreign.id, contactName: "Juan", contactPhone: "11555544", idempotencyKey: key() })).rejects.toThrow(/dirección/);
  });

  it("impide vender por encima del stock con compras concurrentes", async () => {
    const admin = await makeUser("a@x.com");
    const m = await makeMerchant("A", admin);
    const p = await makeProduct(m.id, "Gaseosa", "1500", 5);
    const clients = await Promise.all(Array.from({ length: 8 }, (_, i) => makeUser(`c${i}@x.com`)));
    for (const c of clients) {
      await addToCart(c, p.variant.id, 1);
      await makeAddress(c.userId);
    }
    const addrs = await prisma.address.findMany();
    const results = await Promise.allSettled(
      clients.map((c) =>
        // cada cliente quiere 1, pero agregamos 1 más al carrito de todos para forzar competencia por 2 unidades
        prisma.cartItem.updateMany({ where: { cart: { userId: c.userId } }, data: { quantity: 2 } }).then(() =>
          createOrderFromCart(c, { merchantId: m.id, addressId: addrs.find((a) => a.userId === c.userId)!.id, contactName: "X Y", contactPhone: "11555544", idempotencyKey: key() }),
        ),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    expect(ok).toBe(2); // 5 unidades / 2 por pedido = 2 pedidos
    const inv = await inventoryOf(p.variant.id);
    expect(inv.reserved).toBe(4);
    expect(inv.reserved).toBeLessThanOrEqual(inv.quantity);
  });

  it("cancelación del cliente y vencimiento liberan la reserva", async () => {
    const admin = await makeUser("a@x.com");
    const client = await makeUser("c@x.com");
    const m = await makeMerchant("A", admin);
    const p = await makeProduct(m.id, "Detergente", "1100", 10);
    const addr = await makeAddress(client.userId);
    await addToCart(client, p.variant.id, 4);
    const o1 = await createOrderFromCart(client, { merchantId: m.id, addressId: addr.id, contactName: "Juan", contactPhone: "11555544", idempotencyKey: key() });
    await cancelOrderByCustomer(client, o1.id);
    expect((await inventoryOf(p.variant.id)).reserved).toBe(0);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o1.id } })).status).toBe("CANCELLED");

    await addToCart(client, p.variant.id, 2);
    const o2 = await createOrderFromCart(client, { merchantId: m.id, addressId: addr.id, contactName: "Juan", contactPhone: "11555544", idempotencyKey: key() });
    expect((await inventoryOf(p.variant.id)).reserved).toBe(2);
    const { expired } = await expireStaleOrders(new Date(Date.now() + 31 * 60_000));
    expect(expired).toBe(1);
    expect((await inventoryOf(p.variant.id)).reserved).toBe(0);
    const o2db = await prisma.order.findUniqueOrThrow({ where: { id: o2.id }, include: { statusHistory: true } });
    expect(o2db.status).toBe("CANCELLED");
    expect(o2db.statusHistory.at(-1)?.actorType).toBe("SYSTEM");
  });

  it("no permite comprar en un comercio con ventas pausadas o suspendido", async () => {
    const admin = await makeUser("a@x.com");
    const client = await makeUser("c@x.com");
    const m = await makeMerchant("A", admin);
    const p = await makeProduct(m.id, "Leche", "1000", 10);
    await prisma.merchant.update({ where: { id: m.id }, data: { salesPaused: true } });
    await expect(addToCart(client, p.variant.id, 1)).rejects.toThrow(/pausó/);
    await prisma.merchant.update({ where: { id: m.id }, data: { salesPaused: false, status: "SUSPENDED" } });
    await expect(addToCart(client, p.variant.id, 1)).rejects.toThrow(/no está disponible/);
  });
});
