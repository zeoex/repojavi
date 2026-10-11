/**
 * Procedimiento seguro para crear/promover el superadministrador.
 * Requiere acceso directo a la base (DATABASE_URL), es decir, a la infraestructura: nadie puede
 * convertirse en superadmin desde la web ni desde el registro.
 *
 *   npm run superadmin:promote -- persona@empresa.com           # promueve (crea el usuario si no existe)
 *   npm run superadmin:promote -- persona@empresa.com --demote  # vuelve a cliente
 *
 * Luego la persona ingresa con Google usando ESE email; la cuenta se vincula automáticamente.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [emailArg, flag] = process.argv.slice(2);
  const email = emailArg?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error("Uso: npm run superadmin:promote -- email@dominio.com [--demote]");
    process.exit(1);
  }
  const demote = flag === "--demote";
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name: email.split("@")[0], platformRole: demote ? "CUSTOMER" : "SUPERADMIN", customerProfile: { create: {} } },
    update: { platformRole: demote ? "CUSTOMER" : "SUPERADMIN" },
  });
  await prisma.auditLog.create({
    data: { action: demote ? "superadmin.demote.cli" : "superadmin.promote.cli", entityType: "User", entityId: user.id, metadata: { email, via: "cli" } },
  });
  console.log(demote ? `✔ ${email} ahora es CLIENTE.` : `✔ ${email} ahora es SUPERADMINISTRADOR. Ingresá con Google usando ese email.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
