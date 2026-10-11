"use server";

import { revalidatePath } from "next/cache";
import { runAction, fdStr, type ActionResult } from "@/server/action";
import { requireActor } from "@/server/authz";
import { assertSuperadmin } from "@/server/actor";
import {
  addMerchantAdmin,
  createMerchant,
  removeMerchantAdmin,
  setMerchantFeatured,
  setMerchantStatus,
  setUserStatus,
  softDeleteMerchant,
} from "@/server/services/merchants";
import { requestRefundForOrder } from "@/server/services/payments";
import { updatePlatformSettings } from "@/server/services/platform";
import { audit } from "@/server/services/audit";
import { prisma } from "@/lib/db";
import { ConflictError } from "@/lib/errors";

type Prev = ActionResult<unknown> | null;

async function superadmin() {
  const actor = await requireActor();
  assertSuperadmin(actor);
  return actor;
}

export async function createMerchantAction(_prev: Prev, fd: FormData): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const actor = await superadmin();
    const m = await createMerchant(actor, {
      name: fdStr(fd, "name"),
      businessType: fdStr(fd, "businessType"),
      description: fdStr(fd, "description"),
      phone: fdStr(fd, "phone"),
      email: fdStr(fd, "email"),
      adminEmail: fdStr(fd, "adminEmail"),
    });
    revalidatePath("/admin/comercios");
    return { id: m.id };
  }, "Comercio creado. El administrador ya puede ingresar con su cuenta de Google.");
}

export async function setMerchantStatusAction(merchantId: string, status: "ACTIVE" | "SUSPENDED"): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const actor = await superadmin();
    if (status !== "ACTIVE" && status !== "SUSPENDED") throw new ConflictError("Estado inválido");
    const m = await prisma.merchant.findUnique({ where: { id: merchantId }, select: { deletedAt: true } });
    if (m?.deletedAt) throw new ConflictError("El comercio está eliminado; no se puede cambiar su estado.");
    await setMerchantStatus(actor, merchantId, status);
    revalidatePath("/admin/comercios");
  }, status === "ACTIVE" ? "Comercio activado" : "Comercio suspendido");
}

export async function setMerchantFeaturedAction(merchantId: string, featured: boolean): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const actor = await superadmin();
    await setMerchantFeatured(actor, merchantId, featured);
    revalidatePath("/admin/comercios");
  }, featured ? "Comercio destacado" : "Se quitó el destacado");
}

export async function softDeleteMerchantAction(merchantId: string): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const actor = await superadmin();
    await softDeleteMerchant(actor, merchantId);
    revalidatePath("/admin/comercios");
  }, "Comercio eliminado (lógicamente)");
}

export async function addMerchantAdminAction(merchantId: string, _prev: Prev, fd: FormData): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const actor = await superadmin();
    await addMerchantAdmin(actor, merchantId, fdStr(fd, "email").trim().toLowerCase());
  }, "Administrador agregado");
}

export async function removeMerchantAdminAction(merchantId: string, userId: string): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const actor = await superadmin();
    const count = await prisma.merchantUser.count({ where: { merchantId } });
    if (count <= 1) throw new ConflictError("El comercio debe tener al menos un administrador.");
    await removeMerchantAdmin(actor, merchantId, userId);
  }, "Administrador quitado");
}

export async function setUserStatusAction(userId: string, status: "ACTIVE" | "SUSPENDED"): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const actor = await superadmin();
    if (status !== "ACTIVE" && status !== "SUSPENDED") throw new ConflictError("Estado inválido");
    await setUserStatus(actor, userId, status);
    revalidatePath("/admin/usuarios");
  }, status === "ACTIVE" ? "Usuario reactivado" : "Usuario suspendido");
}

export async function retryRefundAction(orderId: string): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const actor = await superadmin();
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true, merchantId: true } });
    if (!order || order.status !== "REFUND_PENDING") throw new ConflictError("El pedido no tiene un reembolso pendiente.");
    await audit({ actorId: actor.userId, action: "order.refund.retry", entityType: "Order", entityId: orderId, merchantId: order.merchantId });
    await requestRefundForOrder(orderId, actor.userId);
    revalidatePath(`/admin/pedidos/${orderId}`);
  }, "Se reintentó el reembolso. Revisá el estado del pedido y los eventos del sistema.");
}

export async function updatePlatformSettingsAction(_prev: Prev, fd: FormData): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const actor = await superadmin();
    await updatePlatformSettings(actor, { announcement: fdStr(fd, "announcement"), supportEmail: fdStr(fd, "supportEmail") });
    revalidatePath("/", "layout");
  }, "Configuración guardada");
}
