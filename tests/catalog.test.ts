import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createMerchantCategory, listPublicProducts, saveProduct, setProductActive, softDeleteProduct, adjustStock } from "@/server/services/catalog";
import { listPublicMerchants } from "@/server/services/merchants";
import { addToCart } from "@/server/services/cart";
import { createOrderFromCart } from "@/server/services/orders";
import { key, makeAddress, makeMerchant, makeUser, resetDb } from "./helpers";

describe("catálogo e inventario independiente", () => {
  beforeEach(resetDb);

  it("el mismo producto tiene precio y stock independientes por comercio", async () => {
    const a1 = await makeUser("a1@x.com");
    const a2 = await makeUser("a2@x.com");
    const m1 = await makeMerchant("Don Pedro", a1);
    const m2 = await makeMerchant("Central", a2);
    await saveProduct(a1, m1.id, null, { name: "Arroz 1 kg", variants: [{ sku: "ARROZ1", price: "1200", stock: 20 }] });
    await saveProduct(a2, m2.id, null, { name: "Arroz 1 kg", variants: [{ sku: "ARROZ1", price: "1150,50", stock: 8 }] });
    const p1 = await listPublicProducts(m1.id);
    const p2 = await listPublicProducts(m2.id);
    expect(p1[0].variants[0].price.toFixed(2)).toBe("1200.00");
    expect(p1[0].variants[0].inventory?.quantity).toBe(20);
    expect(p2[0].variants[0].price.toFixed(2)).toBe("1150.50");
    expect(p2[0].variants[0].inventory?.quantity).toBe(8);
  });

  it("publica automáticamente altas y cambios; oculta inactivos y eliminados", async () => {
    const a = await makeUser("a@x.com");
    const m = await makeMerchant("A", a);
    const p = await saveProduct(a, m.id, null, { name: "Yerba 1 kg", variants: [{ sku: "YER", price: "3000", stock: 5 }] });
    expect((await listPublicProducts(m.id)).map((x) => x.name)).toEqual(["Yerba 1 kg"]);

    const full = await prisma.product.findUniqueOrThrow({ where: { id: p.id }, include: { variants: true } });
    await saveProduct(a, m.id, p.id, { name: "Yerba Mate 1 kg", variants: [{ id: full.variants[0].id, sku: "YER", price: "3200", promoPrice: "2990", stock: 7 }] });
    const after = await listPublicProducts(m.id);
    expect(after[0].name).toBe("Yerba Mate 1 kg");
    expect(after[0].variants[0].promoPrice?.toFixed(2)).toBe("2990.00");
    expect(after[0].variants[0].inventory?.quantity).toBe(7);

    await setProductActive(a, m.id, p.id, false);
    expect(await listPublicProducts(m.id)).toHaveLength(0);
    await setProductActive(a, m.id, p.id, true);
    await softDeleteProduct(a, m.id, p.id);
    expect(await listPublicProducts(m.id)).toHaveLength(0);
    expect(await prisma.product.count()).toBe(1); // eliminación lógica
  });

  it("valida SKU único por comercio, promo menor al precio y stock no negativo", async () => {
    const a = await makeUser("a@x.com");
    const m = await makeMerchant("A", a);
    await saveProduct(a, m.id, null, { name: "Leche", variants: [{ sku: "LECHE", price: "1000", stock: 1 }] });
    await expect(saveProduct(a, m.id, null, { name: "Otra", variants: [{ sku: "leche", price: "1", stock: 1 }] })).rejects.toThrow(/SKU/);
    await expect(saveProduct(a, m.id, null, { name: "Promo mala", variants: [{ sku: "P", price: "100", promoPrice: "150", stock: 1 }] })).rejects.toThrow(/promocional/);
    await expect(saveProduct(a, m.id, null, { name: "Neg", variants: [{ sku: "N", price: "100", stock: -1 }] })).rejects.toThrow(/negativo/);
  });

  it("no permite bajar el stock por debajo de lo reservado", async () => {
    const a = await makeUser("a@x.com");
    const c = await makeUser("c@x.com");
    const m = await makeMerchant("A", a);
    const p = await saveProduct(a, m.id, null, { name: "Fideos", variants: [{ sku: "FID", price: "800", stock: 5 }] });
    const v = await prisma.productVariant.findFirstOrThrow({ where: { productId: p.id } });
    await addToCart(c, v.id, 3);
    const addr = await makeAddress(c.userId);
    await createOrderFromCart(c, { merchantId: m.id, addressId: addr.id, contactName: "Ce Ce", contactPhone: "11555544", idempotencyKey: key() });
    await expect(adjustStock(a, m.id, v.id, 2)).rejects.toThrow(/reservadas/);
    await adjustStock(a, m.id, v.id, 3);
    const moves = await prisma.inventoryMovement.findMany({ where: { inventory: { variantId: v.id } } });
    expect(moves.map((x) => x.type).sort()).toEqual(["ADJUSTMENT", "ADJUSTMENT", "RESERVE"]);
  });

  it("categorías propias por comercio y búsqueda pública", async () => {
    const a = await makeUser("a@x.com");
    const m = await makeMerchant("Farmacia Ejemplo", a);
    const cat = await createMerchantCategory(a, m.id, { name: "Perfumería" });
    await saveProduct(a, m.id, null, { name: "Jabón", categoryId: cat.id, variants: [{ sku: "JAB", price: "500", stock: 3 }] });
    await saveProduct(a, m.id, null, { name: "Shampoo", variants: [{ sku: "SHA", price: "900", stock: 0 }] });
    expect((await listPublicProducts(m.id, { categoryId: cat.id })).map((p) => p.name)).toEqual(["Jabón"]);
    expect((await listPublicProducts(m.id, { onlyAvailable: true })).map((p) => p.name)).toEqual(["Jabón"]);
    expect((await listPublicMerchants({ q: "jabón" })).map((x) => x.name)).toEqual(["Farmacia Ejemplo"]);
    await expect(createMerchantCategory(a, m.id, { name: "Perfumería" })).rejects.toThrow(/Ya existe/);
  });
});
