import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import { magicLinkEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { getLocaleFromCookies } from "@/i18n/locale";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "database", maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: "/login", verifyRequest: "/login/check-email", error: "/login" },
  providers: [
    Resend({
      // The key is only used by our own sender below; Auth.js requires a value.
      apiKey: process.env.RESEND_API_KEY ?? "dev",
      from: process.env.EMAIL_FROM ?? "Silsilah <onboarding@resend.dev>",
      maxAge: 60 * 60, // magic links are valid for one hour
      async sendVerificationRequest({ identifier, url }) {
        const locale = await getLocaleFromCookies();
        await sendEmail({ to: identifier, ...magicLinkEmail(url, locale) });
      },
    }),
  ],
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
