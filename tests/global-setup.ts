import { execSync } from "node:child_process";

// Aplica las migraciones versionadas a la base de PRUEBAS (no destructivo).
// Cada test vacía las tablas con resetDb() (tests/helpers.ts).
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/fedexpress_test";
  if (!/test/.test(url)) throw new Error("TEST_DATABASE_URL debe apuntar a una base de pruebas (su nombre debe contener 'test').");
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url } });
}
