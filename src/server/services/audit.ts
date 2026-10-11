import { prisma, type Tx } from "@/lib/db";
import type { Prisma } from "@prisma/client";

const SENSITIVE = /token|secret|password|authorization|card|cvv/i;

/** Elimina claves sensibles antes de persistir metadatos de auditoría o eventos. */
export function scrub(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? "[redactado]" : scrub(v, depth + 1);
    }
    return out;
  }
  return value;
}

export async function audit(
  entry: {
    actorId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    merchantId?: string | null;
    metadata?: Record<string, unknown>;
    ip?: string | null;
  },
  tx: Tx = prisma,
) {
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      merchantId: entry.merchantId ?? null,
      metadata: entry.metadata ? (scrub(entry.metadata) as Prisma.InputJsonValue) : undefined,
      ip: entry.ip ?? null,
    },
  });
}

export async function systemEvent(
  level: "info" | "warn" | "error",
  source: string,
  message: string,
  context?: Record<string, unknown>,
  merchantId?: string | null,
) {
  try {
    await prisma.systemEvent.create({
      data: {
        level,
        source,
        message: message.slice(0, 1000),
        context: context ? (scrub(context) as Prisma.InputJsonValue) : undefined,
        merchantId: merchantId ?? null,
      },
    });
  } catch {
    // El registro de eventos nunca debe romper el flujo principal.
  }
  if (level === "error") console.error(`[${source}] ${message}`);
}
