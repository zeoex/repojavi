"use server";

import { redirect } from "next/navigation";
import { runAction, fdBool, fdStr, type ActionResult } from "@/server/action";
import { requireActor } from "@/server/authz";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { addToCart, clearCart, setCartItemQuantity } from "@/server/services/cart";
import { deleteAddress, listAddresses, saveAddress } from "@/server/services/addresses";
import { cancelOrderByCustomer, createOrderFromCart, retryOrderPayment } from "@/server/services/orders";
import { simulateDemoPayment, startPayment } from "@/server/services/payments";

type Prev = ActionResult<unknown> | null;

export type AddToCartData = { needsConfirmation: boolean; otherMerchants?: string[]; merchantName: string };

// ───────────── Carrito ─────────────

/** Se invoca directamente desde el cliente (no es un formulario). Solo recibe ids y cantidades: el precio se calcula en el servidor. */
export async function addToCartAction(variantId: string, quantity: number, confirmed: boolean): Promise<ActionResult<AddToCartData>> {
  return runAction(async () => {
    const actor = await requireActor();
    if (typeof variantId !== "string" || !variantId) throw new ValidationError("Producto inválido.");
    const r = await addToCart(actor, variantId, Number(quantity), { confirmed: confirmed === true });
    if (r.needsConfirmation) return { needsConfirmation: true, otherMerchants: r.otherMerchants, merchantName: r.merchantName };
    return { needsConfirmation: false, merchantName: r.merchantName };
  });
}

export async function setCartItemQuantityAction(itemId: string, quantity: number): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const actor = await requireActor();
    await setCartItemQuantity(actor, itemId, Number(quantity));
  });
}

export async function clearCartAction(merchantId: string): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const actor = await requireActor();
    await clearCart(actor, merchantId);
  }, "Vaciaste el carrito.");
}

// ───────────── Direcciones ─────────────

function addressInput(fd: FormData) {
  return {
    label: fdStr(fd, "label"),
    street: fdStr(fd, "street"),
    streetNumber: fdStr(fd, "streetNumber"),
    apartment: fdStr(fd, "apartment"),
    city: fdStr(fd, "city"),
    province: fdStr(fd, "province"),
    postalCode: fdStr(fd, "postalCode"),
    instructions: fdStr(fd, "instructions"),
    contactName: fdStr(fd, "contactName"),
    contactPhone: fdStr(fd, "contactPhone"),
    isDefault: fdBool(fd, "isDefault"),
  };
}

export async function saveAddressAction(addressId: string | null, _prev: Prev, fd: FormData): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const actor = await requireActor();
    const a = await saveAddress(actor, addressId, addressInput(fd));
    return { id: a.id };
  }, addressId ? "Dirección actualizada." : "Dirección guardada.");
}

/** Alta de dirección desde el checkout: guarda y vuelve al checkout con esa dirección elegida. */
export async function checkoutAddAddressAction(merchantId: string, _prev: Prev, fd: FormData): Promise<ActionResult<unknown>> {
  const r = await runAction(async () => {
    const actor = await requireActor();
    return saveAddress(actor, null, addressInput(fd));
  });
  if (r.ok && r.data) redirect(`/checkout/${encodeURIComponent(merchantId)}?address=${encodeURIComponent(r.data.id)}`);
  return r;
}

export async function deleteAddressAction(addressId: string): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const actor = await requireActor();
    await deleteAddress(actor, addressId);
  }, "Dirección eliminada.");
}

export async function setDefaultAddressAction(addressId: string): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const actor = await requireActor();
    const a = (await listAddresses(actor.userId)).find((x) => x.id === addressId);
    if (!a) throw new NotFoundError("No encontramos esa dirección.");
    await saveAddress(actor, a.id, {
      label: a.label,
      street: a.street,
      streetNumber: a.streetNumber,
      apartment: a.apartment,
      city: a.city,
      province: a.province,
      postalCode: a.postalCode,
      instructions: a.instructions,
      contactName: a.contactName,
      contactPhone: a.contactPhone,
      isDefault: true,
    });
  }, "Dirección predeterminada actualizada.");
}

// ───────────── Checkout y pagos ─────────────

/**
 * Crea el pedido (idempotente por idempotencyKey) e inicia el pago.
 * Mercado Pago → redirección externa. Demo → detalle del pedido. Error al iniciar el pago → detalle con aviso.
 */
export async function checkoutAction(merchantId: string, _prev: Prev, fd: FormData): Promise<ActionResult<unknown>> {
  const r = await runAction(async () => {
    const actor = await requireActor();
    const order = await createOrderFromCart(actor, {
      merchantId,
      addressId: fdStr(fd, "addressId"),
      contactName: fdStr(fd, "contactName"),
      contactPhone: fdStr(fd, "contactPhone"),
      idempotencyKey: fdStr(fd, "idempotencyKey"),
    });
    let target = `/pedidos/${order.id}?pago=error`;
    if (order.status === "PENDING_PAYMENT") {
      try {
        const pay = await startPayment(actor, order.id);
        target = pay.kind === "redirect" ? pay.url : `/pedidos/${order.id}`;
      } catch {
        target = `/pedidos/${order.id}?pago=error`;
      }
    } else {
      // Doble envío de un pedido que ya avanzó: mostrar su estado.
      target = `/pedidos/${order.id}`;
    }
    return { target };
  });
  if (r.ok && r.data) redirect(r.data.target);
  return r;
}

/** Inicia (o reinicia) el pago de un pedido pendiente. */
export async function payOrderAction(orderId: string): Promise<ActionResult<unknown>> {
  const r = await runAction(async () => {
    const actor = await requireActor();
    return startPayment(actor, orderId);
  });
  if (r.ok && r.data?.kind === "redirect") redirect(r.data.url);
  return r;
}

export async function simulatePaymentAction(orderId: string, outcome: "approved" | "rejected"): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const actor = await requireActor();
    if (outcome !== "approved" && outcome !== "rejected") throw new ValidationError("Resultado inválido.");
    await simulateDemoPayment(actor, orderId, outcome);
  }, outcome === "approved" ? "Pago simulado aprobado." : "Pago simulado rechazado.");
}

/** Reintento tras un pago rechazado: vuelve a reservar stock e inicia el pago. */
export async function retryPaymentAction(orderId: string): Promise<ActionResult<unknown>> {
  const r = await runAction(async () => {
    const actor = await requireActor();
    await retryOrderPayment(actor, orderId);
    try {
      const pay = await startPayment(actor, orderId);
      return pay.kind === "redirect" ? pay.url : `/pedidos/${orderId}`;
    } catch {
      return `/pedidos/${orderId}?pago=error`;
    }
  });
  if (r.ok && r.data) redirect(r.data);
  return r;
}

export async function cancelOrderAction(orderId: string): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const actor = await requireActor();
    await cancelOrderByCustomer(actor, orderId);
  }, "Pedido cancelado.");
}
