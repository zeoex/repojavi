"use server";

import { redirect } from "next/navigation";
import type { OrderStatus } from "@prisma/client";
import { ValidationError } from "@/lib/errors";
import { type ActionResult, fdBool, fdStr, runAction } from "@/server/action";
import { assertMerchantAccess, requireActor } from "@/server/authz";
import { setSalesPaused, updateMerchantProfile, updateMerchantSettings, replaceMerchantHours, upsertZone, deleteZone } from "@/server/services/merchants";
import { adjustStock, createMerchantCategory, deleteMerchantCategory, saveProduct, setProductActive, softDeleteProduct } from "@/server/services/catalog";
import { getOrderForMerchant, updateOrderStatusByMerchant } from "@/server/services/orders";
import { assignCourier, saveCourier, setCourierActive, unassignCourier } from "@/server/services/couriers";
import { connectWithManualCredentials, disconnectMercadoPago } from "@/server/services/paymentAccounts";
import { requestRefundForOrder } from "@/server/services/payments";
import { uploadImage } from "@/server/storage";

// Todas las acciones del panel del comercio. Los servicios verifican el acceso al comercio;
// el merchantId llega por argumentos vinculados (bind) y nunca se toma del contenido del formulario.

type R = ActionResult<unknown>;
type Prev = R | null;

function parsePayload(fd: FormData): unknown {
  try {
    return JSON.parse(fdStr(fd, "payload"));
  } catch {
    throw new ValidationError("Datos inválidos. Recargá la página y probá de nuevo.");
  }
}

function optionalNote(fd: FormData) {
  const n = fdStr(fd, "note").trim().slice(0, 300);
  return n || undefined;
}

// ───────────── Comercio ─────────────

export async function setSalesPausedAction(merchantId: string, paused: boolean): Promise<R> {
  return runAction(async () => {
    const actor = await requireActor();
    await setSalesPaused(actor, merchantId, paused);
  }, paused ? "Ventas pausadas" : "Ventas reanudadas");
}

export async function updateProfileAction(merchantId: string, _prev: Prev, fd: FormData): Promise<R> {
  return runAction(async () => {
    const actor = await requireActor();
    const keys = ["name", "businessType", "description", "phone", "email", "logoUrl", "coverUrl", "street", "streetNumber", "city", "province", "postalCode", "legalName", "taxId"] as const;
    const input = Object.fromEntries(keys.map((k) => [k, fdStr(fd, k)]));
    await updateMerchantProfile(actor, merchantId, input);
  }, "Perfil actualizado");
}

export async function replaceHoursAction(merchantId: string, _prev: Prev, fd: FormData): Promise<R> {
  return runAction(async () => {
    const actor = await requireActor();
    await replaceMerchantHours(actor, merchantId, parsePayload(fd));
  }, "Horarios guardados");
}

export async function saveZoneAction(merchantId: string, zoneId: string | null, _prev: Prev, fd: FormData): Promise<R> {
  return runAction(async () => {
    const actor = await requireActor();
    await upsertZone(actor, merchantId, zoneId, {
      name: fdStr(fd, "name"),
      postalCodes: fdStr(fd, "postalCodes"),
      fee: fdStr(fd, "fee"),
      freeShippingOver: fdStr(fd, "freeShippingOver"),
      minOrderAmount: fdStr(fd, "minOrderAmount") || "0",
      etaMinMinutes: fdStr(fd, "etaMinMinutes"),
      etaMaxMinutes: fdStr(fd, "etaMaxMinutes"),
      active: fdBool(fd, "active"),
    });
  }, zoneId ? "Zona actualizada" : "Zona creada");
}

export async function deleteZoneAction(merchantId: string, zoneId: string): Promise<R> {
  return runAction(async () => {
    const actor = await requireActor();
    await deleteZone(actor, merchantId, zoneId);
  }, "Zona eliminada");
}

export async function updateSettingsAction(merchantId: string, _prev: Prev, fd: FormData): Promise<R> {
  return runAction(async () => {
    const actor = await requireActor();
    await updateMerchantSettings(actor, merchantId, {
      minOrderAmount: fdStr(fd, "minOrderAmount") || "0",
      reservationMinutes: Number(fdStr(fd, "reservationMinutes")),
      allowCustomerCancelPaid: fdBool(fd, "allowCustomerCancelPaid"),
    });
  }, "Ajustes guardados");
}

// ───────────── Pedidos ─────────────

const MERCHANT_ACTIONS: OrderStatus[] = ["PREPARING", "READY", "DELIVERED", "ON_THE_WAY", "CANCELLED", "REFUND_PENDING"];

export async function updateOrderStatusAction(merchantId: string, orderId: string, to: OrderStatus, _prev: Prev, fd: FormData): Promise<R> {
  return runAction(async () => {
    const actor = await requireActor();
    if (!MERCHANT_ACTIONS.includes(to)) throw new ValidationError("Acción no permitida");
    await updateOrderStatusByMerchant(actor, merchantId, orderId, to, optionalNote(fd));
  }, "Pedido actualizado");
}

export async function assignCourierAction(merchantId: string, orderId: string, _prev: Prev, fd: FormData): Promise<R> {
  return runAction(async () => {
    const actor = await requireActor();
    const courierId = fdStr(fd, "courierId");
    if (!courierId) throw new ValidationError("Elegí un repartidor", { courierId: "Elegí un repartidor" });
    await assignCourier(actor, merchantId, orderId, courierId);
  }, "Repartidor asignado");
}

export async function unassignCourierAction(merchantId: string, orderId: string): Promise<R> {
  return runAction(async () => {
    const actor = await requireActor();
    await unassignCourier(actor, merchantId, orderId);
  }, "Repartidor desasignado");
}

export async function retryRefundAction(merchantId: string, orderId: string): Promise<R> {
  const r = await runAction(async () => {
    const actor = await requireActor();
    await assertMerchantAccess(actor, merchantId);
    // Verifica que el pedido pertenezca a este comercio antes de reintentar
    const order = await getOrderForMerchant(actor, merchantId, orderId);
    if (order.status !== "REFUND_PENDING") throw new ValidationError("El pedido no tiene un reembolso pendiente.");
    await requestRefundForOrder(orderId, actor.userId);
    const after = await getOrderForMerchant(actor, merchantId, orderId);
    return after.status;
  });
  if (r.ok) {
    return {
      ok: true,
      message: r.data === "REFUNDED" ? "Reembolso aprobado" : "Reembolso solicitado. Si Mercado Pago no lo confirma, vas a ver el pedido como pendiente; podés reintentar más tarde.",
    };
  }
  return r;
}

// ───────────── Catálogo ─────────────

export async function saveProductAction(merchantId: string, productId: string | null, _prev: Prev, fd: FormData): Promise<R> {
  const r = await runAction(async () => {
    const actor = await requireActor();
    await saveProduct(actor, merchantId, productId, parsePayload(fd));
  }, "Producto guardado");
  if (r.ok) redirect(productId ? `/panel/${merchantId}/productos/${productId}?guardado=1` : `/panel/${merchantId}/productos?creado=1`);
  return r;
}

export async function setProductActiveAction(merchantId: string, productId: string, active: boolean): Promise<R> {
  return runAction(async () => {
    const actor = await requireActor();
    await setProductActive(actor, merchantId, productId, active);
  }, active ? "Producto activado" : "Producto pausado");
}

export async function deleteProductAction(merchantId: string, productId: string, goToList: boolean): Promise<R> {
  const r = await runAction(async () => {
    const actor = await requireActor();
    await softDeleteProduct(actor, merchantId, productId);
  }, "Producto eliminado");
  if (r.ok && goToList) redirect(`/panel/${merchantId}/productos`);
  return r;
}

export async function uploadProductImageAction(merchantId: string, _prev: Prev, fd: FormData): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    const actor = await requireActor();
    await assertMerchantAccess(actor, merchantId);
    const file = fd.get("file");
    if (!(file instanceof File)) throw new ValidationError("Elegí una imagen");
    return { url: await uploadImage(merchantId, file) };
  }, "Imagen subida");
}

export async function adjustStockAction(merchantId: string, variantId: string, _prev: Prev, fd: FormData): Promise<R> {
  return runAction(async () => {
    const actor = await requireActor();
    const raw = fdStr(fd, "quantity").trim();
    const quantity = Number(raw);
    if (!raw || !Number.isInteger(quantity) || quantity < 0) throw new ValidationError("Ingresá una cantidad entera mayor o igual a 0");
    await adjustStock(actor, merchantId, variantId, quantity);
  }, "Stock actualizado");
}

export async function createCategoryAction(merchantId: string, _prev: Prev, fd: FormData): Promise<R> {
  return runAction(async () => {
    const actor = await requireActor();
    await createMerchantCategory(actor, merchantId, { name: fdStr(fd, "name") });
  }, "Categoría creada");
}

export async function deleteCategoryAction(merchantId: string, categoryId: string): Promise<R> {
  return runAction(async () => {
    const actor = await requireActor();
    await deleteMerchantCategory(actor, merchantId, categoryId);
  }, "Categoría eliminada");
}

// ───────────── Repartidores ─────────────

export async function saveCourierAction(merchantId: string, courierId: string | null, _prev: Prev, fd: FormData): Promise<R> {
  return runAction(async () => {
    const actor = await requireActor();
    await saveCourier(actor, merchantId, courierId, {
      name: fdStr(fd, "name"),
      email: fdStr(fd, "email"),
      phone: fdStr(fd, "phone"),
      vehicle: fdStr(fd, "vehicle"),
    });
  }, courierId ? "Repartidor actualizado" : "Repartidor creado");
}

export async function setCourierActiveAction(merchantId: string, courierId: string, active: boolean): Promise<R> {
  return runAction(async () => {
    const actor = await requireActor();
    await setCourierActive(actor, merchantId, courierId, active);
  }, active ? "Repartidor activado" : "Repartidor desactivado");
}

// ───────────── Mercado Pago ─────────────

export async function disconnectMercadoPagoAction(merchantId: string): Promise<R> {
  return runAction(async () => {
    const actor = await requireActor();
    await disconnectMercadoPago(actor, merchantId);
  }, "Mercado Pago desconectado");
}

export async function connectManualCredentialsAction(merchantId: string, _prev: Prev, fd: FormData): Promise<R> {
  return runAction(async () => {
    const actor = await requireActor();
    const accessToken = fdStr(fd, "accessToken");
    if (!accessToken.trim()) throw new ValidationError("Ingresá el Access Token", { accessToken: "Ingresá el Access Token" });
    await connectWithManualCredentials(actor, merchantId, accessToken, fdStr(fd, "publicKey") || undefined);
  }, "Credenciales de prueba conectadas");
}
