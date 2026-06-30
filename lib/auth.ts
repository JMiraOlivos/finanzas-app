import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { sql } from "./db";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "Email y Contraseña",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const rows = await sql`
          SELECT id, email, full_name, password_hash, role, is_active
          FROM finanzas.app_users
          WHERE email = ${credentials.email as string}
          LIMIT 1
        `;

        const user = rows[0];
        if (!user || !user.is_active) return null;

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.password_hash as string
        );
        if (!valid) return null;

        return {
          id: user.id as string,
          email: user.email as string,
          name: user.full_name as string,
          role: user.role as string,
        };
      },
    }),
  ],
});
