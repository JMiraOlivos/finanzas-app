import type { NextAuthConfig } from "next-auth";

// Lightweight config used ONLY by middleware (Edge Runtime).
// No bcrypt, no postgres — just JWT validation and route rules.
export const authConfig: NextAuthConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
      }
      return session;
    },
  },
  providers: [], // Credentials provider added in lib/auth.ts (Node.js only)
};
