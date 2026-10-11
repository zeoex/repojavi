import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { linkCouriersToUser } from "@/server/services/couriers";
import { audit } from "@/server/services/audit";

/**
 * Login de desarrollo (sin Google). Solo existe si:
 *  - NODE_ENV !== "production" (Vercel, incluso en previews, corre en production) y
 *  - DEV_LOGIN_ENABLED === "true".
 * Nunca puede crear ni otorgar roles privilegiados: los roles se leen siempre de la base.
 */
export function devLoginEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.DEV_LOGIN_ENABLED === "true";
}

const providers: NextAuthOptions["providers"] = [];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Google verifica los emails; se valida además email_verified en signIn.
      // Necesario para que un admin/repartidor dado de alta por email pueda vincular su cuenta Google.
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

if (devLoginEnabled()) {
  providers.push(
    CredentialsProvider({
      id: "dev-login",
      name: "Acceso de desarrollo",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
        let user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          user = await prisma.user.create({
            data: { email, name: email.split("@")[0], customerProfile: { create: {} } },
          });
          await linkCouriersToUser(user.id, email);
        }
        if (user.status !== "ACTIVE" || user.deletedAt) return null;
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  );
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  // JWT: permite el login de desarrollo. El rol y el estado se leen de la base en cada request
  // (ver getActor), por lo que una suspensión tiene efecto inmediato.
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  providers,
  pages: { signIn: "/ingresar", error: "/ingresar" },
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider === "google") {
        const p = profile as { email_verified?: boolean; email?: string } | undefined;
        if (!p?.email || p.email_verified !== true) return false;
      }
      if (user?.email) {
        const existing = await prisma.user.findUnique({ where: { email: user.email.toLowerCase() } });
        if (existing && (existing.status !== "ACTIVE" || existing.deletedAt)) return "/ingresar?error=suspended";
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) token.uid = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.uid) (session.user as { id?: string }).id = token.uid as string;
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      // Todo usuario nuevo es CLIENTE (valor por defecto del esquema). Nunca se elige el rol.
      await prisma.customerProfile.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} });
      if (user.email) await linkCouriersToUser(user.id, user.email);
      await audit({ actorId: user.id, action: "user.register", entityType: "User", entityId: user.id });
    },
  },
  cookies: undefined, // NextAuth usa cookies httpOnly + secure (__Secure-) automáticamente bajo HTTPS
  secret: process.env.NEXTAUTH_SECRET,
};
