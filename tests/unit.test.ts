import { describe, expect, it } from "vitest";
import { canTransition, nextStatusesFor } from "@/server/domain/orderStatus";
import { dec, effectivePrice, formatARS, parseMoneyInput } from "@/lib/money";
import { computeTotals, findZone } from "@/server/services/pricing";
import { isOpenAt } from "@/lib/time";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { scrub } from "@/server/services/audit";
import { signOAuthState, verifyOAuthState } from "@/server/services/paymentAccounts";

describe("máquina de estados de pedidos", () => {
  it("solo el sistema confirma pagos", () => {
    expect(canTransition("PENDING_PAYMENT", "PAID", "SYSTEM")).toBe(true);
    expect(canTransition("PENDING_PAYMENT", "PAID", "CUSTOMER")).toBe(false);
    expect(canTransition("PENDING_PAYMENT", "PAID", "MERCHANT")).toBe(false);
  });
  it("no permite saltar etapas ni revivir pedidos entregados", () => {
    expect(canTransition("PAID", "DELIVERED", "MERCHANT")).toBe(false);
    expect(canTransition("DELIVERED", "PREPARING", "MERCHANT")).toBe(false);
    expect(canTransition("REFUNDED", "PAID", "SYSTEM")).toBe(false);
  });
  it("lista las acciones válidas del comercio", () => {
    expect(nextStatusesFor("PAID", "MERCHANT").sort()).toEqual(["PREPARING", "REFUND_PENDING"]);
    expect(nextStatusesFor("ON_THE_WAY", "COURIER").sort()).toEqual(["DELIVERED", "READY"]);
  });
});

describe("dinero", () => {
  it("formatea en pesos argentinos", () => {
    expect(formatARS(dec("1234.5")).replace(/\s/g, " ")).toBe("$ 1.234,50");
  });
  it("parsea importes locales", () => {
    expect(parseMoneyInput("1.234,50")?.toFixed(2)).toBe("1234.50");
    expect(parseMoneyInput("99.9")?.toFixed(2)).toBe("99.90");
    expect(parseMoneyInput("abc")).toBeNull();
  });
  it("usa el precio promocional solo si es menor", () => {
    expect(effectivePrice(dec(100), dec(80)).toString()).toBe("80");
    expect(effectivePrice(dec(100), dec(120)).toString()).toBe("100");
  });
  it("suma sin errores de punto flotante", () => {
    const t = computeTotals([{ lineTotal: dec("0.1"), listPrice: dec("0.1"), quantity: 1 }, { lineTotal: dec("0.2"), listPrice: dec("0.2"), quantity: 1 }], { fee: dec("0"), freeShippingOver: null });
    expect(t.total.toFixed(2)).toBe("0.30");
    expect(t.total.equals(dec("0.3"))).toBe(true);
  });
});

describe("zonas y horarios", () => {
  it("encuentra la zona por código postal (CPA o numérico)", () => {
    const zones = [{ postalCodes: ["C1414", "1425"], active: true }];
    expect(findZone(zones, "c1414")).not.toBeNull();
    expect(findZone(zones, "C1425ABC")).not.toBeNull(); // CPA dentro del CP 1425
    expect(findZone(zones, "B1900")).toBeNull();
    expect(findZone(zones, "1425")).not.toBeNull();
    expect(findZone([{ postalCodes: ["1000"], active: false }], "1000")).toBeNull();
  });
  it("calcula abierto/cerrado en hora argentina, incluso cruzando medianoche", () => {
    // 2026-10-12 es lunes. 15:00 UTC = 12:00 ART
    const mondayNoon = new Date("2026-10-12T15:00:00Z");
    expect(isOpenAt([{ dayOfWeek: 1, opensAt: "09:00", closesAt: "18:00" }], mondayNoon)).toBe(true);
    expect(isOpenAt([{ dayOfWeek: 2, opensAt: "09:00", closesAt: "18:00" }], mondayNoon)).toBe(false);
    // Lunes 01:00 ART = 04:00 UTC; franja de domingo 20:00–02:00
    expect(isOpenAt([{ dayOfWeek: 0, opensAt: "20:00", closesAt: "02:00" }], new Date("2026-10-12T04:00:00Z"))).toBe(true);
    expect(isOpenAt([], mondayNoon)).toBe(true);
  });
});

describe("seguridad", () => {
  it("cifra y descifra credenciales con AES-GCM y detecta manipulación", () => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
    const enc = encryptSecret("APP_USR-secreto");
    expect(enc).not.toContain("secreto");
    expect(decryptSecret(enc)).toBe("APP_USR-secreto");
    const parts = enc.split(".");
    parts[3] = Buffer.from("otra cosa").toString("base64");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });
  it("redacta claves sensibles en auditoría", () => {
    expect(scrub({ access_token: "x", nested: { refreshToken: "y", ok: 1 } })).toEqual({ access_token: "[redactado]", nested: { refreshToken: "[redactado]", ok: 1 } });
  });
  it("el state de OAuth de Mercado Pago es firmado y no se puede alterar", () => {
    const s = signOAuthState("m1", "u1", "nonce");
    expect(verifyOAuthState(s)).toEqual({ merchantId: "m1", userId: "u1", nonce: "nonce" });
    expect(verifyOAuthState(s.replace("m1", "m2"))).toBeNull();
    expect(verifyOAuthState(signOAuthState("m1", "u1", "n", -10))).toBeNull();
  });
});
