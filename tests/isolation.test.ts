import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { addToCart } from "@/server/services/cart";
import {
  adjustStock,
  getProductForMerchant,
  listProductsForMerchant,
  saveProduct,
  setProductActive,
  softDeleteProduct,
} from "@/server/services/catalog";
import { assignCourier, courierUpdateDelivery, listCouriers, saveCourier, setCourierActive } from "@/server/services/couriers";
import { deleteZone, setSalesPaused, updateMerchantProfile, upsertZone } from "@/server/services/merchants";
import { createOrderFromCart, getOrderForCustomer, getOrderForMerchant, listOrdersForMerchant, updateOrderStatusByMerchant } from "@/server/services/orders";
import { disconnectMercadoPago, startMercadoPagoConnect } from "@/server/services/paymentAccounts";
import { exportMerchantOrdersCsv, merchantDashboard, platformDashboard } from "@/server/services/reports";
import { createMerchant, setMerchantStatus } from "@/server/services/merchants";
import { key, makeAddress, makeMerchant, makeProduct, makeUser, resetDb } from "./helpers";

/**
 * Pruebas de aislamiento: un administrador de comercio manipulando IDs (como haría alterando
 * una URL o el cuerpo de una request) no puede leer ni modificar recursos de otro comercio.
 */
describe("aislamiento entre comercios", () => {
  beforeEach(resetDb);

  async function world() {
    const adminA = await makeUser("admin-a@x.com");
    const adminB = await makeUser("admin-b@x.com");
    const client = await makeUser("cliente@x.com");
    const A = await makeMerchant("Comercio A", adminA);
    const B = await makeMerchant("Comercio B", adminB);
    const pb = await makeProduct(B.id, "Producto B", "1000", 10);
    const addr = await makeAddress(client.userId);
    await addToCart(client, pb.variant.id, 1);
    const orderB = await createOrderFromCart(client, { merchantId: B.id, addressId: addr.id, contactName: "Cli Ente", contactPhone: "11555544", idempotencyKey: key() });
    const courierB = await prisma.courier.create({ data: { merchantId: B.id, name: "Repartidor B", email: "rep-b@x.com" } });
    const zoneB = await prisma.deliveryZone.findFirstOrThrow({ where: { merchantId: B.id } });
    return { adminA, adminB, client, A, B, pb, orderB, courierB, zoneB };
  }

  it("admin A no puede operar sobre B pasando el merchantId de B", async () => {
    const { adminA, B, pb, orderB, courierB, zoneB } = await world();
    const deny = [
      () => listProductsForMerchant(adminA, B.id),
      () => getProductForMerchant(adminA, B.id, pb.product.id),
      () => saveProduct(adminA, B.id, null, { name: "X", variants: [{ sku: "X1", price: "1", stock: 1 }] }),
      () => adjustStock(adminA, B.id, pb.variant.id, 0),
      () => setProductActive(adminA, B.id, pb.product.id, false),
      () => softDeleteProduct(adminA, B.id, pb.product.id),
      () => listOrdersForMerchant(adminA, B.id),
      () => getOrderForMerchant(adminA, B.id, orderB.id),
      () => updateOrderStatusByMerchant(adminA, B.id, orderB.id, "CANCELLED"),
      () => listCouriers(adminA, B.id),
      () => saveCourier(adminA, B.id, null, { name: "Intruso", email: "i@x.com" }),
      () => setCourierActive(adminA, B.id, courierB.id, false),
      () => assignCourier(adminA, B.id, orderB.id, courierB.id),
      () => upsertZone(adminA, B.id, zoneB.id, { name: "Hack", postalCodes: "1", fee: "0", etaMinMinutes: 10, etaMaxMinutes: 20 }),
      () => deleteZone(adminA, B.id, zoneB.id),
      () => updateMerchantProfile(adminA, B.id, { name: "Hackeado", businessType: "Almacén" }),
      () => setSalesPaused(adminA, B.id, true),
      () => merchantDashboard(adminA, B.id),
      () => exportMerchantOrdersCsv(adminA, B.id),
      () => disconnectMercadoPago(adminA, B.id),
      () => startMercadoPagoConnect(adminA, B.id),
    ];
    for (const fn of deny) await expect(fn()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("admin A no puede operar recursos de B usando SU merchantId con IDs ajenos", async () => {
    const { adminA, A, pb, orderB, courierB, zoneB } = await world();
    await expect(getProductForMerchant(adminA, A.id, pb.product.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(saveProduct(adminA, A.id, pb.product.id, { name: "Xx", variants: [{ sku: "X1", price: "1", stock: 1 }] })).rejects.toBeInstanceOf(NotFoundError);
    await expect(adjustStock(adminA, A.id, pb.variant.id, 0)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setProductActive(adminA, A.id, pb.product.id, false)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getOrderForMerchant(adminA, A.id, orderB.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateOrderStatusByMerchant(adminA, A.id, orderB.id, "CANCELLED")).rejects.toBeInstanceOf(NotFoundError);
    await expect(setCourierActive(adminA, A.id, courierB.id, false)).rejects.toBeInstanceOf(NotFoundError);
    await expect(upsertZone(adminA, A.id, zoneB.id, { name: "Hack", postalCodes: "1", fee: "0", etaMinMinutes: 10, etaMaxMinutes: 20 })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteZone(adminA, A.id, zoneB.id)).rejects.toBeInstanceOf(NotFoundError);
    // Un variant de B no puede colarse como variante existente de un producto de A
    const pa = await makeProduct(A.id, "Producto A", "500", 5);
    await expect(
      saveProduct(adminA, A.id, pa.product.id, { name: "Producto A", variants: [{ id: pb.variant.id, sku: "ROBO", price: "1", stock: 0 }] }),
    ).rejects.toThrow(/Variante inválida/);

    // Nada cambió en B
    const after = await prisma.productVariant.findUniqueOrThrow({ where: { id: pb.variant.id }, include: { inventory: true, product: true } });
    expect(after.inventory?.quantity).toBe(10);
    expect(after.product.active).toBe(true);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderB.id } })).status).toBe("PENDING_PAYMENT");
    expect(await prisma.courier.count({ where: { merchantId: (await prisma.courier.findUniqueOrThrow({ where: { id: courierB.id } })).merchantId, active: true } })).toBe(1);
  });

  it("un comercio no puede asignar un repartidor de otro comercio", async () => {
    const { adminB, B, A, orderB } = await world();
    const courierA = await prisma.courier.create({ data: { merchantId: A.id, name: "Rep A", email: "rep-a@x.com" } });
    await prisma.order.update({ where: { id: orderB.id }, data: { status: "READY" } });
    await expect(assignCourier(adminB, B.id, orderB.id, courierA.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("un cliente no puede ver pedidos de otro cliente", async () => {
    const { orderB } = await world();
    const intruso = await makeUser("intruso@x.com");
    await expect(getOrderForCustomer(intruso, orderB.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("un repartidor solo opera sus entregas", async () => {
    const { adminB, B, orderB, courierB } = await world();
    const repUser = await makeUser("rep-b@x.com");
    await prisma.courier.update({ where: { id: courierB.id }, data: { userId: repUser.userId } });
    const otroRep = await makeUser("otro-rep@x.com");
    await prisma.order.update({ where: { id: orderB.id }, data: { status: "READY" } });
    await assignCourier(adminB, B.id, orderB.id, courierB.id);
    const d = await prisma.delivery.findUniqueOrThrow({ where: { orderId: orderB.id } });
    await expect(courierUpdateDelivery(otroRep, d.id, "accept")).rejects.toBeInstanceOf(NotFoundError);
    await courierUpdateDelivery(repUser, d.id, "accept");
    await courierUpdateDelivery(repUser, d.id, "pickup");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderB.id } })).status).toBe("ON_THE_WAY");
    await courierUpdateDelivery(repUser, d.id, "deliver");
    const o = await prisma.order.findUniqueOrThrow({ where: { id: orderB.id }, include: { statusHistory: true } });
    expect(o.status).toBe("DELIVERED");
    expect(o.statusHistory.at(-1)?.actorId).toBe(repUser.userId);
  });
});

describe("permisos de superadministrador", () => {
  beforeEach(resetDb);

  it("solo el superadmin crea comercios, los suspende y ve el dashboard global", async () => {
    const sa = await makeUser("root@x.com", "SUPERADMIN");
    const comun = await makeUser("comun@x.com");
    await expect(createMerchant(comun, { name: "X", businessType: "Almacén", adminEmail: "a@x.com" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(platformDashboard(comun, {})).rejects.toBeInstanceOf(ForbiddenError);

    const m = await createMerchant(sa, { name: "Nuevo Comercio", businessType: "Almacén", adminEmail: "duenio@x.com" });
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: "duenio@x.com" } });
    expect(owner.platformRole).toBe("CUSTOMER"); // el admin de comercio NO es superadmin
    expect(await prisma.merchantUser.count({ where: { merchantId: m.id, userId: owner.id } })).toBe(1);

    await setMerchantStatus(sa, m.id, "SUSPENDED");
    expect((await prisma.merchant.findUniqueOrThrow({ where: { id: m.id } })).status).toBe("SUSPENDED");
    const dash = await platformDashboard(sa, {});
    expect(dash.merchants.suspended).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "merchant.create" } })).toBe(1);
  });

  it("el superadmin puede supervisar un comercio, el admin de comercio solo el suyo", async () => {
    const sa = await makeUser("root@x.com", "SUPERADMIN");
    const admin = await makeUser("a@x.com");
    const m = await makeMerchant("A", admin);
    await expect(listProductsForMerchant(sa, m.id)).resolves.toEqual([]);
    await expect(listProductsForMerchant(admin, m.id)).resolves.toEqual([]);
  });
});
