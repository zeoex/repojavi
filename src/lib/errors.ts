// Errores de dominio. Los mensajes son seguros para mostrar al usuario;
// nunca incluyen detalles internos (SQL, tokens, stack traces).

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Tenés que iniciar sesión para continuar.") {
    super(message, "UNAUTHORIZED", 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "No tenés permiso para realizar esta acción.") {
    super(message, "FORBIDDEN", 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "No encontramos lo que buscabas.") {
    super(message, "NOT_FOUND", 404);
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message, "VALIDATION", 400);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, "CONFLICT", 409);
  }
}

export class RateLimitError extends AppError {
  constructor() {
    super("Hiciste demasiados intentos. Esperá un momento y probá de nuevo.", "RATE_LIMIT", 429);
  }
}

export function toPublicMessage(err: unknown): string {
  if (err instanceof AppError) return err.message;
  return "Ocurrió un error inesperado. Probá de nuevo en unos minutos.";
}
