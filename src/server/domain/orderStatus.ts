import type { OrderStatus } from "@prisma/client";

export type TransitionActor = "CUSTOMER" | "MERCHANT" | "COURIER" | "SYSTEM" | "SUPERADMIN";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Pendiente de pago",
  PAID: "Pago aprobado",
  PREPARING: "En preparación",
  READY: "Listo para entregar",
  COURIER_ASSIGNED: "Repartidor asignado",
  ON_THE_WAY: "En camino",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
  PAYMENT_REJECTED: "Pago rechazado",
  REFUND_PENDING: "Reembolso pendiente",
  REFUNDED: "Reembolsado",
};

export const ORDER_STATUS_TONE: Record<OrderStatus, "gray" | "amber" | "green" | "blue" | "red" | "violet"> = {
  PENDING_PAYMENT: "amber",
  PAID: "green",
  PREPARING: "blue",
  READY: "blue",
  COURIER_ASSIGNED: "violet",
  ON_THE_WAY: "violet",
  DELIVERED: "green",
  CANCELLED: "gray",
  PAYMENT_REJECTED: "red",
  REFUND_PENDING: "amber",
  REFUNDED: "gray",
};

/**
 * Máquina de estados. Para cada (desde → hacia) se listan los actores autorizados.
 * Cualquier transición no listada es inválida.
 */
const T: Partial<Record<OrderStatus, Partial<Record<OrderStatus, TransitionActor[]>>>> = {
  PENDING_PAYMENT: {
    PAID: ["SYSTEM"],
    PAYMENT_REJECTED: ["SYSTEM"],
    CANCELLED: ["CUSTOMER", "MERCHANT", "SYSTEM", "SUPERADMIN"],
  },
  PAYMENT_REJECTED: {
    PENDING_PAYMENT: ["CUSTOMER"], // reintentar el pago
    PAID: ["SYSTEM"], // pago aprobado tardío
    REFUND_PENDING: ["SYSTEM"], // aprobado tardío sin stock disponible
    CANCELLED: ["CUSTOMER", "MERCHANT", "SYSTEM", "SUPERADMIN"],
  },
  CANCELLED: {
    PAID: ["SYSTEM"], // pago aprobado después del vencimiento (si hay stock)
    REFUND_PENDING: ["SYSTEM"], // pago aprobado después del vencimiento sin stock
  },
  PAID: {
    PREPARING: ["MERCHANT"],
    REFUND_PENDING: ["CUSTOMER", "MERCHANT", "SUPERADMIN"],
    REFUNDED: ["SYSTEM"],
  },
  PREPARING: {
    READY: ["MERCHANT"],
    REFUND_PENDING: ["MERCHANT", "SUPERADMIN"],
    REFUNDED: ["SYSTEM"],
  },
  READY: {
    COURIER_ASSIGNED: ["MERCHANT"],
    DELIVERED: ["MERCHANT"], // retiro en local
    REFUND_PENDING: ["MERCHANT", "SUPERADMIN"],
    REFUNDED: ["SYSTEM"],
  },
  COURIER_ASSIGNED: {
    ON_THE_WAY: ["COURIER", "MERCHANT"],
    READY: ["MERCHANT", "COURIER"], // desasignar repartidor / entrega fallida
    REFUND_PENDING: ["MERCHANT", "SUPERADMIN"],
    REFUNDED: ["SYSTEM"],
  },
  ON_THE_WAY: {
    DELIVERED: ["COURIER", "MERCHANT"],
    READY: ["COURIER", "MERCHANT"], // entrega fallida: vuelve al comercio
    REFUND_PENDING: ["MERCHANT", "SUPERADMIN"],
    REFUNDED: ["SYSTEM"],
  },
  DELIVERED: {
    REFUND_PENDING: ["MERCHANT", "SUPERADMIN"],
    REFUNDED: ["SYSTEM"], // reembolso o contracargo externo
  },
  REFUND_PENDING: {
    REFUNDED: ["SYSTEM", "MERCHANT", "SUPERADMIN"],
  },
};

export function canTransition(from: OrderStatus, to: OrderStatus, actor: TransitionActor): boolean {
  return T[from]?.[to]?.includes(actor) ?? false;
}

export function nextStatusesFor(from: OrderStatus, actor: TransitionActor): OrderStatus[] {
  const row = T[from] ?? {};
  return (Object.keys(row) as OrderStatus[]).filter((to) => row[to]?.includes(actor));
}

/** Estados con pago confirmado y stock descontado. */
export const PAID_STATUSES: OrderStatus[] = ["PAID", "PREPARING", "READY", "COURIER_ASSIGNED", "ON_THE_WAY", "DELIVERED"];
export const ACTIVE_STATUSES: OrderStatus[] = ["PAID", "PREPARING", "READY", "COURIER_ASSIGNED", "ON_THE_WAY"];
