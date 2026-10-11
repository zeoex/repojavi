"use server";

import { revalidatePath } from "next/cache";
import { runAction, fdStr, type ActionResult } from "@/server/action";
import { requireActor } from "@/server/authz";
import { courierUpdateDelivery } from "@/server/services/couriers";
import { ValidationError } from "@/lib/errors";

type Prev = ActionResult<unknown> | null;
type CourierAction = "accept" | "pickup" | "deliver" | "fail";

const MESSAGES: Record<CourierAction, string> = {
  accept: "Entrega aceptada",
  pickup: "Marcaste el pedido como retirado",
  deliver: "¡Entrega confirmada!",
  fail: "Registramos que no se pudo entregar. El comercio lo va a reasignar.",
};

export async function courierDeliveryAction(deliveryId: string, action: CourierAction, _prev: Prev, fd: FormData): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    if (!(action in MESSAGES)) throw new ValidationError("Acción inválida");
    const actor = await requireActor();
    const note = fdStr(fd, "note").trim();
    if (action === "fail" && note.length < 3) throw new ValidationError("Contanos qué pasó para que el comercio pueda resolverlo.", { note: "Ingresá un motivo" });
    // courierUpdateDelivery valida que la entrega sea de un perfil de repartidor activo del usuario.
    await courierUpdateDelivery(actor, deliveryId, action, note ? note.slice(0, 300) : undefined);
    revalidatePath("/repartidor");
  }, MESSAGES[action]);
}
