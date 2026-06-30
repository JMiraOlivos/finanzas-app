import ExcelJS from "exceljs";
import { FinancialColumnGroup, FinancialRow } from "./eerr";

export async function buildEerrWorkbook(params: {
  title: string;
  periodLabel: string;
  columnGroups: FinancialColumnGroup[];
  rows: FinancialRow[];
}): Promise<Uint8Array> {
  const { title, periodLabel, columnGroups, rows } = params;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Finanzas App";
  const ws = workbook.addWorksheet("EERR");

  // Title rows
  ws.addRow([title]);
  ws.getRow(1).font = { bold: true, size: 14 };
  ws.addRow([periodLabel]);
  ws.getRow(2).font = { size: 11, italic: true, color: { argb: "FF666666" } };
  ws.addRow([]);

  // Build column array
  const flatCols = columnGroups.flatMap((g) =>
    g.columns.map((c) => ({ ...c, groupId: g.id, groupLabel: g.label }))
  );

  // Header row 1: group labels
  const h1: (string | null)[] = ["PnL"];
  for (const g of columnGroups) {
    h1.push(g.label);
    for (let i = 1; i < g.columns.length; i++) h1.push(null);
  }
  const r1 = ws.addRow(h1);
  r1.font = { bold: true };
  r1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };

  // Merge group header cells
  let colIdx = 2;
  for (const g of columnGroups) {
    if (g.columns.length > 1) {
      ws.mergeCells(4, colIdx, 4, colIdx + g.columns.length - 1);
    }
    ws.getCell(4, colIdx).alignment = { horizontal: "center" };
    colIdx += g.columns.length;
  }

  // Header row 2: column labels
  const h2 = ["", ...flatCols.map((c) => c.label)];
  const r2 = ws.addRow(h2);
  r2.font = { bold: true };
  r2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };

  const startDataRow = 6;

  // Data rows
  for (const row of rows) {
    const indent = "  ".repeat(row.level);
    const excelRow = [
      indent + row.label,
      ...flatCols.map((c) => {
        const v = row.values[c.id];
        return v === null || v === undefined ? null : v;
      }),
    ];

    const er = ws.addRow(excelRow);

    if (row.isBold || row.lineType !== "detail") {
      er.font = { bold: true };
    }
    if (row.isHighlighted) {
      er.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F0F0" } };
    }
    if (row.lineType === "calculated") {
      er.border = {
        top: { style: "medium", color: { argb: "FF333333" } },
        bottom: { style: "double", color: { argb: "FF333333" } },
      };
    }

    // Format number columns
    for (let j = 0; j < flatCols.length; j++) {
      const cell = er.getCell(j + 2);
      const col = flatCols[j];
      if (col.type === "currency") {
        cell.numFmt = '#,##0.0;(#,##0.0)';
        const val = row.values[col.id];
        if (typeof val === "number" && val < 0) {
          cell.font = { ...cell.font, color: { argb: "FFCC0000" } };
        }
      } else if (col.type === "percentage") {
        cell.numFmt = '0.0%;(0.0%)';
      }
    }
  }

  // Column widths
  ws.getColumn(1).width = 36;
  for (let i = 2; i <= flatCols.length + 1; i++) {
    ws.getColumn(i).width = 15;
    ws.getColumn(i).alignment = { horizontal: "right" };
  }

  // Freeze panes: first column + header rows
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: startDataRow - 1 }];

  // Auto-filter on header row
  ws.autoFilter = {
    from: { row: startDataRow - 1, column: 1 },
    to: { row: startDataRow - 1, column: flatCols.length + 1 },
  };

  const ab = await workbook.xlsx.writeBuffer();
  return new Uint8Array(ab);
}
