/**
 * Datos de demostración reproducibles.
 *  - NO crea superadministradores (ver scripts/promote-superadmin.ts).
 *  - NO incluye credenciales reales, tokens de Mercado Pago ni tarjetas.
 *  - Los pagos de los pedidos de ejemplo son SIMULADOS (provider DEMO, isSimulated = true).
 * Uso: npm run db:seed   (en una base recién migrada)
 */
import { PrismaClient } from "@prisma/client";
import { dec } from "../src/lib/money";
import type { Actor } from "../src/server/actor";
import { addToCart } from "../src/server/services/cart";
import { assignCourier, courierUpdateDelivery } from "../src/server/services/couriers";
import { cancelOrderByCustomer, createOrderFromCart, updateOrderStatusByMerchant } from "../src/server/services/orders";
import { applyPaymentResult } from "../src/server/services/payments";

const prisma = new PrismaClient();
const DOMAIN = "demo.fedexpress.local"; // dominio ficticio reservado para la demo

const CATEGORIES = ["Almacén", "Bebidas", "Limpieza", "Lácteos", "Carnicería", "Frutas y verduras", "Congelados"];

type P = { key: string; name: string; desc: string; cat: string; img: string };
const PRODUCTS: P[] = [
  { key: "ARROZ1KG", name: "Arroz largo fino 1 kg", desc: "Arroz largo fino tipo 00000.", cat: "Almacén", img: "arroz" },
  { key: "ACEITE900", name: "Aceite de girasol 900 ml", desc: "Aceite de girasol refinado.", cat: "Almacén", img: "aceite" },
  { key: "LECHE1L", name: "Leche entera 1 litro", desc: "Leche entera larga vida.", cat: "Lácteos", img: "leche" },
  { key: "AZUCAR1KG", name: "Azúcar 1 kg", desc: "Azúcar blanca refinada.", cat: "Almacén", img: "azucar" },
  { key: "YERBA1KG", name: "Yerba mate 1 kg", desc: "Yerba mate con palo, molienda tradicional.", cat: "Almacén", img: "yerba" },
  { key: "GASEOSA225", name: "Gaseosa cola 2,25 litros", desc: "Bebida gaseosa sabor cola.", cat: "Bebidas", img: "gaseosa" },
  { key: "DETERG750", name: "Detergente 750 ml", desc: "Detergente para vajilla, aroma limón.", cat: "Limpieza", img: "detergente" },
  { key: "FIDEOS500", name: "Fideos spaghetti 500 g", desc: "Fideos secos de sémola.", cat: "Almacén", img: "fideos" },
];

// precio, promo, stock por comercio (precios y stocks ficticios, distintos por comercio)
const CATALOG: Record<string, Record<string, [string, string | null, number]>> = {
  "almacen-don-pedro": {
    ARROZ1KG: ["1290", null, 20], ACEITE900: ["2890", "2590", 12], LECHE1L: ["1450", null, 30], AZUCAR1KG: ["1190", null, 15],
    YERBA1KG: ["4590", null, 10], GASEOSA225: ["3290", null, 18], DETERG750: ["1890", null, 9], FIDEOS500: ["990", "850", 25],
  },
  "supermercado-central": {
    ARROZ1KG: ["1199", null, 8], ACEITE900: ["2750", null, 40], LECHE1L: ["1390", null, 60], AZUCAR1KG: ["1150", "999", 50],
    YERBA1KG: ["4390", null, 35], GASEOSA225: ["3150", "2799", 48], DETERG750: ["1790", null, 22], FIDEOS500: ["940", null, 80],
  },
  "minimercado-la-esquina": {
    ARROZ1KG: ["1350", null, 0], ACEITE900: ["2990", null, 4], LECHE1L: ["1490", null, 10], AZUCAR1KG: ["1250", null, 6],
    YERBA1KG: ["4690", null, 3], GASEOSA225: ["3390", null, 12], FIDEOS500: ["1050", null, 2],
  },
};

const MERCHANTS = [
  {
    slug: "almacen-don-pedro", name: "Almacén Don Pedro", businessType: "Almacén", logo: "don-pedro", featured: true,
    description: "Almacén de barrio desde 1987. Atención personalizada y los clásicos de siempre.",
    street: "Gorriti", streetNumber: "4850", city: "CABA", province: "Ciudad Autónoma de Buenos Aires", postalCode: "C1414",
    phone: "11 4831-0000",
    zones: [{ name: "Palermo", postalCodes: ["C1414", "1414", "C1425", "1425"], fee: "900", freeOver: "25000", min: "3000", eta: [25, 45] }],
    hours: [1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, opensAt: "08:00", closesAt: "21:00" })),
  },
  {
    slug: "supermercado-central", name: "Supermercado Central", businessType: "Supermercado", logo: "central", featured: true,
    description: "Supermercado con todo para tu casa. Abierto las 24 horas.",
    street: "Av. Córdoba", streetNumber: "5200", city: "CABA", province: "Ciudad Autónoma de Buenos Aires", postalCode: "C1414",
    phone: "11 4772-0000",
    zones: [
      { name: "Palermo y Villa Crespo", postalCodes: ["C1414", "1414", "C1406", "1406"], fee: "1200", freeOver: "30000", min: "5000", eta: [30, 60] },
      { name: "Almagro", postalCodes: ["C1176", "1176", "C1177", "1177"], fee: "1800", freeOver: null, min: "8000", eta: [45, 75] },
    ],
    hours: [], // sin horario cargado = 24 h
  },
  {
    slug: "minimercado-la-esquina", name: "Minimercado La Esquina", businessType: "Minimercado", logo: "la-esquina", featured: false,
    description: "Lo que te falta, a la vuelta de tu casa.",
    street: "Thames", streetNumber: "1100", city: "CABA", province: "Ciudad Autónoma de Buenos Aires", postalCode: "C1414",
    phone: "11 4899-0000",
    zones: [{ name: "Palermo Viejo", postalCodes: ["C1414", "1414"], fee: "600", freeOver: null, min: "0", eta: [15, 30] }],
    hours: [0, 1, 2, 3, 4, 5, 6].flatMap((d) => [
      { dayOfWeek: d, opensAt: "09:00", closesAt: "13:30" },
      { dayOfWeek: d, opensAt: "17:00", closesAt: "23:00" },
    ]),
  },
];

const CUSTOMERS = [
  { email: `lucia.gomez@${DOMAIN}`, name: "Lucía Gómez", phone: "11 5555-0101", street: "Honduras", number: "4700", apt: "3° B", pc: "C1414" },
  { email: `martin.fernandez@${DOMAIN}`, name: "Martín Fernández", phone: "11 5555-0202", street: "Malabia", number: "1200", apt: null, pc: "C1414" },
  { email: `sofia.rodriguez@${DOMAIN}`, name: "Sofía Rodríguez", phone: "11 5555-0303", street: "Scalabrini Ortiz", number: "900", apt: "PB", pc: "C1414" },
];

function actorOf(u: { id: string; email: string; name: string | null; platformRole: "CUSTOMER" | "SUPERADMIN" }): Actor {
  return { userId: u.id, email: u.email, name: u.name, platformRole: u.platformRole };
}

let seq = 0;
async function demoPay(orderId: string, outcome: "APPROVED" | "REJECTED") {
  const o = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  return applyPaymentResult({
    orderId,
    merchantId: o.merchantId,
    provider: "DEMO",
    providerPaymentId: `demo_seed_${++seq}`,
    status: outcome,
    statusDetail: "PAGO SIMULADO — datos de demostración",
    amount: o.total,
    currency: "ARS",
    isSimulated: true,
  });
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.SEED_ALLOW_PRODUCTION !== "true") {
    throw new Error("El seed de demostración no se ejecuta en producción (usá SEED_ALLOW_PRODUCTION=true solo en un entorno de demo).");
  }
  if (await prisma.merchant.findUnique({ where: { slug: "almacen-don-pedro" } })) {
    console.log("Los datos de demostración ya están cargados. Para recargarlos, recreá la base (ver README) y volvé a ejecutar el seed.");
    return;
  }

  // Categorías globales
  for (const [i, name] of CATEGORIES.entries()) {
    const slug = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await prisma.category.create({ data: { name, slug, sortOrder: i } });
  }
  const cats = new Map((await prisma.category.findMany()).map((c) => [c.name, c.id]));

  // Comercios, administradores y repartidores
  const merchantIds = new Map<string, string>();
  const admins = new Map<string, Actor>();
  const couriers = new Map<string, { courierId: string; actor: Actor }>();
  for (const m of MERCHANTS) {
    const adminEmail = `admin.${m.logo}@${DOMAIN}`;
    const admin = await prisma.user.create({ data: { email: adminEmail, name: `Admin ${m.name}`, customerProfile: { create: {} } } });
    const merchant = await prisma.merchant.create({
      data: {
        slug: m.slug, name: m.name, businessType: m.businessType, description: m.description, phone: m.phone,
        email: `contacto.${m.logo}@${DOMAIN}`, logoUrl: `/demo/logo-${m.logo}.svg`, coverUrl: `/demo/cover-${m.logo}.svg`,
        street: m.street, streetNumber: m.streetNumber, city: m.city, province: m.province, postalCode: m.postalCode,
        status: "ACTIVE", featured: m.featured,
        settings: { create: { reservationMinutes: 30 } },
        members: { create: { userId: admin.id, role: "OWNER" } },
        zones: {
          create: m.zones.map((z) => ({
            name: z.name, postalCodes: z.postalCodes, fee: dec(z.fee), freeShippingOver: z.freeOver ? dec(z.freeOver) : null,
            minOrderAmount: dec(z.min), etaMinMinutes: z.eta[0], etaMaxMinutes: z.eta[1],
          })),
        },
      },
    });
    merchantIds.set(m.slug, merchant.id);
    admins.set(m.slug, actorOf(admin));

    const courierEmail = `repartidor.${m.logo}@${DOMAIN}`;
    const courierUser = await prisma.user.create({ data: { email: courierEmail, name: `Repartidor ${m.name}`, customerProfile: { create: {} } } });
    const courier = await prisma.courier.create({
      data: { merchantId: merchant.id, userId: courierUser.id, name: `Repartidor ${m.name.split(" ").slice(-1)[0]}`, email: courierEmail, phone: "11 5000-0000", vehicle: "Moto" },
    });
    couriers.set(m.slug, { courierId: courier.id, actor: actorOf(courierUser) });

    for (const p of PRODUCTS) {
      const row = CATALOG[m.slug][p.key];
      if (!row) continue;
      const [price, promo, stock] = row;
      await prisma.product.create({
        data: {
          merchantId: merchant.id, name: p.name, description: p.desc, categoryId: cats.get(p.cat), featured: ["YERBA1KG", "ACEITE900"].includes(p.key),
          images: { create: { url: `/demo/${p.img}.svg`, alt: p.name } },
          variants: {
            create: {
              merchantId: merchant.id, name: "Única", sku: p.key, price: dec(price), promoPrice: promo ? dec(promo) : null,
              inventory: { create: { quantity: stock, minStock: 5 } },
            },
          },
        },
      });
    }
  }
  // Variante adicional de ejemplo: gaseosa en dos sabores en el Supermercado Central
  const gaseosa = await prisma.product.findFirstOrThrow({ where: { merchantId: merchantIds.get("supermercado-central"), name: { startsWith: "Gaseosa" } } });
  await prisma.productVariant.create({
    data: { productId: gaseosa.id, merchantId: gaseosa.merchantId, name: "Lima-limón", sku: "GASEOSA225-LL", price: dec("3050"), sortOrder: 1, inventory: { create: { quantity: 14, minStock: 5 } } },
  });
  // Categoría propia de un comercio
  await prisma.category.create({ data: { merchantId: merchantIds.get("almacen-don-pedro"), name: "Ofertas del día", slug: "ofertas-del-dia", sortOrder: 99 } });

  // Clientes con direcciones
  const customers: Actor[] = [];
  for (const c of CUSTOMERS) {
    const u = await prisma.user.create({
      data: {
        email: c.email, name: c.name, phone: c.phone, customerProfile: { create: { phone: c.phone } },
        addresses: {
          create: {
            label: "Casa", street: c.street, streetNumber: c.number, apartment: c.apt, city: "CABA", province: "Ciudad Autónoma de Buenos Aires",
            postalCode: c.pc, contactName: c.name, contactPhone: c.phone, isDefault: true, instructions: "Tocar timbre. Dirección de prueba.",
          },
        },
      },
    });
    customers.push(actorOf(u));
  }

  // Pedidos de ejemplo usando los mismos servicios que la aplicación (stock y estados consistentes)
  const variantOf = async (slug: string, sku: string) =>
    (await prisma.productVariant.findFirstOrThrow({ where: { merchantId: merchantIds.get(slug), sku } })).id;
  const order = async (customer: Actor, slug: string, items: [string, number][]) => {
    for (const [sku, q] of items) await addToCart(customer, await variantOf(slug, sku), q, { confirmed: true });
    const addr = await prisma.address.findFirstOrThrow({ where: { userId: customer.userId } });
    return createOrderFromCart(customer, {
      merchantId: merchantIds.get(slug)!, addressId: addr.id, contactName: customer.name ?? "Cliente", contactPhone: "11 5555-0000",
      idempotencyKey: `seed-${slug}-${customer.email}-${++seq}`,
    });
  };
  const [lucia, martin, sofia] = customers;

  // 1) Entregado (flujo completo con repartidor)
  const o1 = await order(lucia, "almacen-don-pedro", [["YERBA1KG", 1], ["ARROZ1KG", 2], ["LECHE1L", 2]]);
  await demoPay(o1.id, "APPROVED");
  const dp = admins.get("almacen-don-pedro")!;
  await updateOrderStatusByMerchant(dp, o1.merchantId, o1.id, "PREPARING");
  await updateOrderStatusByMerchant(dp, o1.merchantId, o1.id, "READY");
  await assignCourier(dp, o1.merchantId, o1.id, couriers.get("almacen-don-pedro")!.courierId);
  const d1 = await prisma.delivery.findUniqueOrThrow({ where: { orderId: o1.id } });
  const cDP = couriers.get("almacen-don-pedro")!.actor;
  await courierUpdateDelivery(cDP, d1.id, "accept");
  await courierUpdateDelivery(cDP, d1.id, "pickup");
  await courierUpdateDelivery(cDP, d1.id, "deliver", "Recibió el titular");

  // 2) En camino
  const o2 = await order(sofia, "almacen-don-pedro", [["ACEITE900", 1], ["FIDEOS500", 3]]);
  await demoPay(o2.id, "APPROVED");
  await updateOrderStatusByMerchant(dp, o2.merchantId, o2.id, "PREPARING");
  await updateOrderStatusByMerchant(dp, o2.merchantId, o2.id, "READY");
  await assignCourier(dp, o2.merchantId, o2.id, couriers.get("almacen-don-pedro")!.courierId);
  const d2 = await prisma.delivery.findUniqueOrThrow({ where: { orderId: o2.id } });
  await courierUpdateDelivery(cDP, d2.id, "pickup");

  // 3) En preparación
  const sc = admins.get("supermercado-central")!;
  const o3 = await order(martin, "supermercado-central", [["GASEOSA225", 2], ["AZUCAR1KG", 1], ["FIDEOS500", 4]]);
  await demoPay(o3.id, "APPROVED");
  await updateOrderStatusByMerchant(sc, o3.merchantId, o3.id, "PREPARING");

  // 4) Pago aprobado, esperando que el comercio lo prepare
  const o4 = await order(lucia, "supermercado-central", [["LECHE1L", 6], ["DETERG750", 2]]);
  await demoPay(o4.id, "APPROVED");

  // 5) Pendiente de pago (stock reservado)
  await order(sofia, "supermercado-central", [["YERBA1KG", 2], ["ACEITE900", 2]]);

  // 6) Pago rechazado
  const o6 = await order(martin, "minimercado-la-esquina", [["GASEOSA225", 1], ["LECHE1L", 2]]);
  await demoPay(o6.id, "REJECTED");

  // 7) Cancelado por el cliente antes de pagar
  const o7 = await order(martin, "almacen-don-pedro", [["AZUCAR1KG", 2], ["YERBA1KG", 1]]);
  await cancelOrderByCustomer(martin, o7.id, "Me equivoqué de dirección");

  // 8) Reembolsado (pagado y cancelado por el comercio; reembolso simulado)
  const o8 = await order(sofia, "supermercado-central", [["ARROZ1KG", 2], ["FIDEOS500", 2], ["LECHE1L", 2]]);
  await demoPay(o8.id, "APPROVED");
  await updateOrderStatusByMerchant(sc, o8.merchantId, o8.id, "REFUND_PENDING", "Sin repartidores disponibles");

  // Horarios al final (para no bloquear la creación de pedidos de ejemplo según la hora actual)
  for (const m of MERCHANTS) {
    if (m.hours.length) await prisma.merchantHours.createMany({ data: m.hours.map((h) => ({ ...h, merchantId: merchantIds.get(m.slug)! })) });
  }

  console.log("✔ Datos de demostración cargados.");
  console.log("  Comercios:", MERCHANTS.map((m) => m.name).join(", "));
  console.log("  Admins de comercio:", [...admins.values()].map((a) => a.email).join(", "));
  console.log("  Repartidores:", [...couriers.values()].map((c) => c.actor.email).join(", "));
  console.log("  Clientes:", customers.map((c) => c.email).join(", "));
  console.log("  Todos los pagos de ejemplo son SIMULADOS. No se creó ningún superadministrador (ver README).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
