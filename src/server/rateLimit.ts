import { prisma } from "@/lib/db";
import { RateLimitError } from "@/lib/errors";

/**
 * Rate limiting de ventana fija respaldado en PostgreSQL (funciona con múltiples
 * instancias serverless, a diferencia de un limitador en memoria).
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "windowStart")
    VALUES (${key}, 1, now())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."windowStart" < now() - make_interval(secs => ${windowSeconds})
                     THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimitBucket"."windowStart" < now() - make_interval(secs => ${windowSeconds})
                     THEN now() ELSE "RateLimitBucket"."windowStart" END
    RETURNING "count"`;
  if ((rows[0]?.count ?? 0) > limit) throw new RateLimitError();
}
