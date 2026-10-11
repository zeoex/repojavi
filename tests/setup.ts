// Entorno de pruebas: base aislada y secretos ficticios (no son credenciales reales).
const url = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/fedexpress_test";
if (!/test/.test(url)) throw new Error("TEST_DATABASE_URL debe apuntar a una base de pruebas");
process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.NEXTAUTH_SECRET = "test-secret-no-real";
process.env.APP_URL = "https://fedexpress.test";
process.env.MP_WEBHOOK_SECRET = "test-webhook-secret";
process.env.MP_CLIENT_ID = "test-client";
process.env.MP_CLIENT_SECRET = "test-client-secret";
