import { sql } from "@/lib/db";
import { validatePnlStructure, type ValidationError } from "./validatePnlStructure";
import { triggerDbtRun } from "@/lib/dbt";
import { logAudit } from "@/lib/audit";

type PublishResult =
  | { ok: true }
  | { ok: false; reason: "validation_failed"; errors: ValidationError[] }
  | { ok: false; reason: "not_draft" | "not_found" };

export async function publishPnlStructureVersion(
  versionId: string,
  userId: string
): Promise<PublishResult> {
  // Verify version exists and is draft
  const [version] = await sql`
    SELECT id, status FROM finanzas.pnl_structure_versions WHERE id = ${versionId}::uuid
  `;
  if (!version) return { ok: false, reason: "not_found" };
  if (version.status !== "draft") return { ok: false, reason: "not_draft" };

  // Run structural validation — errors block publish, warnings do not
  const validation = await validatePnlStructure(versionId);
  if (!validation.valid) {
    return { ok: false, reason: "validation_failed", errors: validation.errors };
  }

  // Atomic transaction: archive current active → publish new
  await sql.begin(async (tx) => {
    // Archive whatever is currently active (may be none if first publish)
    await tx`
      UPDATE finanzas.pnl_structure_versions
      SET
        status      = 'archived',
        is_active   = false,
        archived_by = ${userId}::uuid,
        archived_at = now()
      WHERE is_active = true
        AND id != ${versionId}::uuid
    `;

    // Publish the new version
    await tx`
      UPDATE finanzas.pnl_structure_versions
      SET
        status       = 'published',
        is_active    = true,
        published_by = ${userId}::uuid,
        published_at = now()
      WHERE id = ${versionId}::uuid
    `;

    // Write change log entry
    await tx`
      INSERT INTO finanzas.pnl_structure_change_log
        (structure_version_id, changed_by, change_type, entity_type, entity_code)
      VALUES (
        ${versionId}::uuid,
        ${userId}::uuid,
        'publish',
        'pnl_structure_version',
        ${versionId}
      )
    `;
  });

  // Post-commit: audit log + trigger dbt (non-blocking)
  await logAudit({
    userId,
    action: "pnl_version.publish",
    entityType: "pnl_structure_versions",
    entityId: versionId,
  });

  void triggerDbtRun("pnl_structure_publish");

  return { ok: true };
}
