import { sql } from "@/lib/db";

export type ValidationError = {
  code: string;
  message: string;
  context?: Record<string, unknown>;
};

export type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
};

export async function validatePnlStructure(versionId: string): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  const lines = await sql`
    SELECT id, code, parent_code, line_type, formula_key, sort_order
    FROM finanzas.pnl_lines_versioned
    WHERE structure_version_id = ${versionId}::uuid
      AND is_active = true
  `;

  // Empty structure
  if (lines.length === 0) {
    errors.push({ code: "EMPTY_STRUCTURE", message: "La versión no tiene líneas activas" });
    return { valid: false, errors, warnings };
  }

  const codeSet = new Set(lines.map((l) => l.code as string));
  const sortOrders = lines.map((l) => l.sort_order as number);

  // Duplicate sort_order
  const sortDupes = sortOrders.filter((s, i) => sortOrders.indexOf(s) !== i);
  if (sortDupes.length) {
    errors.push({
      code: "DUPLICATE_SORT_ORDER",
      message: `Sort orders duplicados: ${[...new Set(sortDupes)].join(", ")}`,
    });
  }

  for (const line of lines) {
    const code       = line.code       as string;
    const parentCode = line.parent_code as string | null;
    const lineType   = line.line_type  as string;
    const formulaKey = line.formula_key as string | null;

    // parent_code must exist in same version
    if (parentCode && !codeSet.has(parentCode)) {
      errors.push({
        code: "ORPHAN_PARENT",
        message: `Línea "${code}" referencia padre "${parentCode}" que no existe en esta versión`,
        context: { code, parentCode },
      });
    }

    // calculated lines need formula_key
    if (lineType === "calculated" && !formulaKey) {
      errors.push({
        code: "CALCULATED_WITHOUT_FORMULA",
        message: `Línea "${code}" es tipo "calculated" pero no tiene formula_key`,
        context: { code },
      });
    }

    // non-calculated lines should not have formula_key
    if (lineType !== "calculated" && formulaKey) {
      warnings.push({
        code: "FORMULA_KEY_ON_NON_CALCULATED",
        message: `Línea "${code}" tiene formula_key "${formulaKey}" pero su tipo es "${lineType}"`,
        context: { code, lineType, formulaKey },
      });
    }
  }

  // Detect hierarchy cycles (DFS)
  const parentMap = new Map<string, string | null>();
  for (const l of lines) parentMap.set(l.code as string, (l.parent_code as string | null) ?? null);

  const cyclesReported = new Set<string>();
  for (const startCode of codeSet) {
    const visited = new Set<string>();
    let current: string | null = startCode;
    while (current) {
      if (visited.has(current)) {
        if (!cyclesReported.has(current)) {
          cyclesReported.add(current);
          errors.push({
            code: "HIERARCHY_CYCLE",
            message: `Ciclo detectado en jerarquía en "${current}"`,
            context: { startCode, cycleAt: current },
          });
        }
        break;
      }
      visited.add(current);
      current = parentMap.get(current) ?? null;
    }
  }

  // formula_key components must reference existing active lines
  // Note: pnl_formula_components_versioned has no is_active column
  const formulaKeys = [...new Set(lines.filter((l) => l.formula_key).map((l) => l.formula_key as string))];

  const components = await sql`
    SELECT formula_key, component_line_code
    FROM finanzas.pnl_formula_components_versioned
    WHERE structure_version_id = ${versionId}::uuid
  `;

  const componentsByKey = new Map<string, string[]>();
  for (const c of components) {
    const key = c.formula_key as string;
    if (!componentsByKey.has(key)) componentsByKey.set(key, []);
    componentsByKey.get(key)!.push(c.component_line_code as string);
  }

  for (const key of formulaKeys) {
    const comps = componentsByKey.get(key) ?? [];
    if (!comps.length) {
      errors.push({
        code: "FORMULA_WITHOUT_COMPONENTS",
        message: `Fórmula "${key}" no tiene componentes`,
        context: { formulaKey: key },
      });
    }
    for (const compCode of comps) {
      if (!codeSet.has(compCode)) {
        errors.push({
          code: "FORMULA_COMPONENT_NOT_FOUND",
          message: `Componente "${compCode}" de fórmula "${key}" no existe como línea activa`,
          context: { formulaKey: key, componentCode: compCode },
        });
      }
    }
  }

  // Warn about formula_keys in formula table that no calculated line references
  const referencedKeys = new Set(formulaKeys);
  for (const key of componentsByKey.keys()) {
    if (!referencedKeys.has(key)) {
      warnings.push({
        code: "ORPHAN_FORMULA",
        message: `Fórmula "${key}" existe en la tabla pero ninguna línea la referencia`,
        context: { formulaKey: key },
      });
    }
  }

  // Mappings point to existing active lines
  const badMappings = await sql`
    SELECT DISTINCT m.pnl_line_code
    FROM finanzas.account_pnl_mappings_versioned m
    WHERE m.structure_version_id = ${versionId}::uuid
      AND m.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM finanzas.pnl_lines_versioned l
        WHERE l.structure_version_id = ${versionId}::uuid
          AND l.code = m.pnl_line_code
          AND l.is_active = true
      )
  `;
  for (const row of badMappings) {
    errors.push({
      code: "MAPPING_LINE_NOT_FOUND",
      message: `Mapping referencia línea "${row.pnl_line_code}" que no existe en esta versión`,
      context: { pnlLineCode: row.pnl_line_code },
    });
  }

  // Warn if no mappings at all
  const [mappingCount] = await sql`
    SELECT COUNT(*)::int AS cnt
    FROM finanzas.account_pnl_mappings_versioned
    WHERE structure_version_id = ${versionId}::uuid AND is_active = true
  `;
  if (Number(mappingCount.cnt) === 0) {
    warnings.push({
      code: "NO_MAPPINGS",
      message: "La versión no tiene mappings de cuentas — los reportes quedarán vacíos",
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}
