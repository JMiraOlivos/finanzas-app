import { sql } from "@/lib/db";

export async function logAudit(opts: {
  userId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await sql`
      INSERT INTO finanzas.audit_log (user_id, action, entity_type, entity_id, metadata)
      VALUES (
        ${opts.userId ?? null},
        ${opts.action},
        ${opts.entityType ?? null},
        ${opts.entityId ?? null},
        ${opts.metadata ? JSON.stringify(opts.metadata) : null}
      )
    `;
  } catch {
    // Audit log failure must never break the main operation
  }
}
