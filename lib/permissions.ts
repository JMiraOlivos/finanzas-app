import { sql } from "./db";

export type AppUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: "admin" | "finance" | "director" | "partner" | "stakeholder";
  isActive: boolean;
};

const ALL_ACCESS_ROLES = ["admin", "finance"] as const;

export async function getUserByEmail(email: string): Promise<AppUser | null> {
  const rows = await sql`
    SELECT id, email, full_name, role, is_active
    FROM finanzas.app_users
    WHERE email = ${email}
    LIMIT 1
  `;
  const u = rows[0];
  if (!u) return null;
  return {
    id: u.id as string,
    email: u.email as string,
    fullName: u.full_name as string | null,
    role: u.role as AppUser["role"],
    isActive: u.is_active as boolean,
  };
}

export async function getAllowedCompanyIds(userId: string, role: string): Promise<string[] | null> {
  // admin/finance can see all companies
  if ((ALL_ACCESS_ROLES as readonly string[]).includes(role)) return null;

  const rows = await sql`
    SELECT company_id
    FROM finanzas.user_company_access
    WHERE user_id = ${userId}
      AND can_view = TRUE
  `;
  return rows.map((r) => r.company_id as string);
}

export async function assertCanViewCompany(userId: string, role: string, companyId: string): Promise<void> {
  if ((ALL_ACCESS_ROLES as readonly string[]).includes(role)) return;

  const rows = await sql`
    SELECT 1
    FROM finanzas.user_company_access
    WHERE user_id   = ${userId}
      AND company_id = ${companyId}
      AND can_view   = TRUE
    LIMIT 1
  `;
  if (!rows.length) throw new Error("Forbidden");
}

export async function assertCanExport(userId: string, role: string, companyId: string): Promise<void> {
  if ((ALL_ACCESS_ROLES as readonly string[]).includes(role)) return;

  const rows = await sql`
    SELECT 1
    FROM finanzas.user_company_access
    WHERE user_id    = ${userId}
      AND company_id  = ${companyId}
      AND can_export  = TRUE
    LIMIT 1
  `;
  if (!rows.length) throw new Error("Forbidden: export not allowed");
}

export function isAdmin(role: string): boolean {
  return (ALL_ACCESS_ROLES as readonly string[]).includes(role);
}

export function canViewMovements(role: string): boolean {
  return role === "admin" || role === "finance" || role === "director";
}
