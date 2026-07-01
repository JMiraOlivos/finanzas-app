"use client";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Tooltip, Legend, Filler
);

// E&V functional palette colors
const EV_BLUE        = "#284B6E";
const EV_BLUE_ALPHA  = "rgba(40,75,110,0.12)";
const EV_GREEN       = "#527F1F";
const EV_GRAY7       = "#CCCCCC";
const EV_GRAY3       = "#666666";

const EXPENSE_COLORS = [
  "#C35A1E",  // RRHH        → orange
  "#482E23",  // Gastos Var. → brown
  "#E6B90E",  // Marketing   → yellow
  "#284B6E",  // Adm.        → blue
  "#86776C",  // Asesorías   → greige
  "#527F1F",  // Oficina     → green
  "#808080",  // Tecnología  → gray
];

const COMPANY_COLORS = ["#284B6E", "#3A6A9A", "#4E8BC0", "#6AAED6", "#90C4E4"];

function fmtM(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000)     return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)         return `${(v / 1_000).toFixed(0)}k`;
  return v.toFixed(0);
}

const TICK_FONT = {
  family: '"EngelVoelkersText", Arial, sans-serif',
  size: 10,
};

export type ChartsData = {
  monthly:   { labels: string[]; revenue: number[]; ebitda: number[] };
  expenses:  { labels: string[]; values: number[] };
  companies: Array<{ name: string; revenue: number }>;
};

export function DashboardCharts({ monthly, expenses, companies }: ChartsData) {
  return (
    <div className="space-y-4">
      {/* Monthly trend — full width */}
      <div className="border border-ev-gray7 bg-white p-5">
        <p className="text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3 mb-4">
          Tendencia Mensual
        </p>
        <div className="h-56">
          <Line
            data={{
              labels: monthly.labels,
              datasets: [
                {
                  label: "Ingresos",
                  data: monthly.revenue,
                  borderColor: EV_BLUE,
                  backgroundColor: EV_BLUE_ALPHA,
                  fill: true,
                  tension: 0.35,
                  pointRadius: 3,
                  pointHoverRadius: 5,
                  borderWidth: 2,
                },
                {
                  label: "EBITDA",
                  data: monthly.ebitda,
                  borderColor: EV_GREEN,
                  backgroundColor: "transparent",
                  fill: false,
                  tension: 0.35,
                  pointRadius: 3,
                  pointHoverRadius: 5,
                  borderWidth: 2,
                  borderDash: [5, 3],
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              interaction: { mode: "index", intersect: false },
              plugins: {
                legend: {
                  position: "top",
                  align: "end",
                  labels: { ...TICK_FONT, boxWidth: 10, padding: 10, color: EV_GRAY3 },
                },
                tooltip: {
                  callbacks: {
                    label: (ctx) => `  ${ctx.dataset.label}: ${fmtM(ctx.parsed.y)} CLP`,
                  },
                },
              },
              scales: {
                x: {
                  border: { color: EV_GRAY7 },
                  grid: { color: "transparent" },
                  ticks: { ...TICK_FONT, color: EV_GRAY3 },
                },
                y: {
                  border: { color: "transparent", dash: [3, 3] },
                  grid: { color: EV_GRAY7 },
                  ticks: { ...TICK_FONT, color: EV_GRAY3, callback: (v) => fmtM(Number(v)) },
                },
              },
            }}
          />
        </div>
      </div>

      {/* Expense breakdown + Company comparison */}
      <div className={`grid gap-4 ${companies.length > 1 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
        {/* Expense breakdown */}
        <div className="border border-ev-gray7 bg-white p-5">
          <p className="text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3 mb-4">
            Estructura de Gastos YTD
          </p>
          <div className="h-56">
            <Bar
              data={{
                labels: expenses.labels,
                datasets: [{
                  data: expenses.values,
                  backgroundColor: EXPENSE_COLORS,
                  borderWidth: 0,
                  borderRadius: 0,
                }],
              }}
              options={{
                indexAxis: "y",
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      label: (ctx) => `  ${fmtM(ctx.parsed.x)} CLP`,
                    },
                  },
                },
                scales: {
                  x: {
                    border: { color: "transparent" },
                    grid: { color: EV_GRAY7 },
                    ticks: { ...TICK_FONT, color: EV_GRAY3, callback: (v) => fmtM(Number(v)) },
                  },
                  y: {
                    border: { color: EV_GRAY7 },
                    grid: { color: "transparent" },
                    ticks: { ...TICK_FONT, color: EV_GRAY3 },
                  },
                },
              }}
            />
          </div>
        </div>

        {/* Company comparison — only when multiple companies */}
        {companies.length > 1 && (
          <div className="border border-ev-gray7 bg-white p-5">
            <p className="text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3 mb-4">
              Ingresos por Empresa YTD
            </p>
            <div className="h-56">
              <Bar
                data={{
                  labels: companies.map((c) => c.name.replace("E&V ", "")),
                  datasets: [{
                    data: companies.map((c) => c.revenue),
                    backgroundColor: COMPANY_COLORS.slice(0, companies.length),
                    borderWidth: 0,
                    borderRadius: 0,
                  }],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      callbacks: {
                        label: (ctx) => `  ${fmtM(ctx.parsed.y)} CLP`,
                      },
                    },
                  },
                  scales: {
                    x: {
                      border: { color: EV_GRAY7 },
                      grid: { color: "transparent" },
                      ticks: { ...TICK_FONT, color: EV_GRAY3 },
                    },
                    y: {
                      border: { color: "transparent" },
                      grid: { color: EV_GRAY7 },
                      ticks: { ...TICK_FONT, color: EV_GRAY3, callback: (v) => fmtM(Number(v)) },
                    },
                  },
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
