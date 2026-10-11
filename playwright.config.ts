import { defineConfig } from "@playwright/test";

/**
 * E2E contra `next dev` con login de desarrollo y pagos simulados habilitados,
 * sobre la base de datos de desarrollo con el seed cargado (npm run db:seed).
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : undefined,
  },
  webServer: {
    command: "npx next dev -p 3100",
    url: "http://localhost:3100/api/health",
    timeout: 180_000,
    reuseExistingServer: true,
    env: {
      DEV_LOGIN_ENABLED: "true",
      DEMO_PAYMENTS_ENABLED: "true",
      NEXTAUTH_URL: "http://localhost:3100",
      APP_URL: "http://localhost:3100",
    },
  },
});
