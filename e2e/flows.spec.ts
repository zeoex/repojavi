import { expect, test, type Page } from "@playwright/test";

// Requiere la base de desarrollo con `npm run db:seed` y un superadmin root@demo.fedexpress.local
// (npm run superadmin:promote -- root@demo.fedexpress.local).
const D = "demo.fedexpress.local";

async function login(page: Page, email: string, callbackUrl = "/") {
  await page.goto(`/ingresar?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  await page.locator("#dev-email").fill(email);
  await page.getByRole("button", { name: "Ingresar con email de prueba" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/ingresar"));
}

test("visitante: explora el catálogo pero no puede comprar", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Supermercado Central").first()).toBeVisible();
  await page.goto("/comercios/supermercado-central");
  await expect(page.getByText("Leche entera 1 litro").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Ingresá para comprar" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Agregar" })).toHaveCount(0);
  for (const path of ["/checkout/cualquiera", "/carrito", "/pedidos", "/panel", "/admin"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/ingresar\?callbackUrl=/);
  }
});

test("cliente: carrito → checkout → pago simulado → pedido pagado; el comercio lo ve", async ({ page, browser }) => {
  await login(page, `lucia.gomez@${D}`, "/comercios/supermercado-central");
  const card = page.locator("div.rounded-2xl").filter({ has: page.getByRole("heading", { name: "Leche entera 1 litro" }) }).last();
  await card.getByRole("button", { name: "Agregar" }).click();
  await expect(card.getByText("Agregado ✓")).toBeVisible();

  await page.goto("/carrito");
  await page.getByRole("link", { name: "Ver carrito de Supermercado Central" }).click();
  await page.getByRole("link", { name: "Continuar al pago" }).click();
  await expect(page).toHaveURL(/\/checkout\//);
  // Por debajo del pedido mínimo del comercio ($ 5.000) no se puede confirmar
  await expect(page.getByRole("button", { name: /Confirmar y pagar/ })).toBeDisabled();
  await expect(page.getByText(/mínimo/i).first()).toBeVisible();
  const checkoutUrl = page.url();

  await page.goto("/comercios/supermercado-central");
  for (let i = 0; i < 3; i++) await card.getByRole("button", { name: "Sumar una unidad" }).click();
  await card.getByRole("button", { name: "Agregar" }).click();
  await expect(card.getByText("Agregado ✓")).toBeVisible();
  await page.goto(checkoutUrl);
  await page.getByRole("button", { name: /Confirmar y pagar/ }).click();
  await page.waitForURL(/\/pedidos\/[^/?]+/);
  await expect(page.getByText("Modo demostración — pago SIMULADO, no es un cobro real")).toBeVisible();
  const orderUrl = page.url();
  await page.getByRole("button", { name: "Simular pago aprobado" }).click();
  await expect(page.getByText("Pago aprobado").first()).toBeVisible();
  await expect(page.getByText("PAGO SIMULADO").first()).toBeVisible();

  const orderId = new URL(orderUrl).pathname.split("/").pop()!;
  // El admin del comercio ve el pedido; el admin de OTRO comercio recibe 404
  const ctx = await browser.newContext();
  const admin = await ctx.newPage();
  await login(admin, `admin.central@${D}`, "/panel");
  await expect(admin).toHaveURL(/\/panel\/[^/]+/);
  const merchantId = new URL(admin.url()).pathname.split("/")[2];
  await admin.goto(`/panel/${merchantId}/pedidos/${orderId}`);
  await expect(admin.getByText("Leche entera 1 litro").first()).toBeVisible();
  await ctx.close();

  const ctx2 = await browser.newContext();
  const other = await ctx2.newPage();
  await login(other, `admin.la-esquina@${D}`);
  const res = await other.goto(`/panel/${merchantId}/pedidos/${orderId}`);
  expect(res?.status()).toBe(404);
  const csv = await other.request.get(`/api/panel/${merchantId}/export`);
  expect(csv.status()).toBe(404);
  await ctx2.close();
});

test("permisos: el cliente no entra a /admin; el superadmin sí", async ({ page, browser }) => {
  await login(page, `martin.fernandez@${D}`);
  const r = await page.goto("/admin");
  expect(r?.status()).toBe(404);

  const ctx = await browser.newContext();
  const root = await ctx.newPage();
  await login(root, `root@${D}`, "/admin");
  await expect(root.getByText(/no son ingresos de Fedexpress|no ingresos de Fedexpress/i).first()).toBeVisible();
  await ctx.close();
});

test("repartidor: ve solo sus entregas", async ({ page }) => {
  await login(page, `repartidor.don-pedro@${D}`, "/repartidor");
  await expect(page.getByRole("heading").first()).toBeVisible();
  await expect(page.getByText("Almacén Don Pedro").first()).toBeVisible();
  await expect(page.getByText("Supermercado Central")).toHaveCount(0);
});
