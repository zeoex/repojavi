import type { z } from "zod";
import { ValidationError } from "@/lib/errors";
import { fieldErrors } from "@/lib/validation";

export function parseOrThrow<S extends z.ZodTypeAny>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const fields = fieldErrors(r.error);
    const first = Object.values(fields)[0] ?? "Datos inválidos";
    throw new ValidationError(first, fields);
  }
  return r.data;
}
