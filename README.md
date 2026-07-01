# Finanzas App — Portal financiero E&V

Next.js + Neon Postgres. Reemplaza Evidence.dev como front de reportería.

## Setup rápido

### 1. Variables de entorno

```bash
cp .env.local.example .env.local   # si existe; si no, edita .env.local
```

Configura `DATABASE_URL` con el connection string de Neon y `AUTH_SECRET` con un valor aleatorio:

```
DATABASE_URL=postgresql://...@ep-falling-dream-ataeez3h-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require&options=--search_path%3Dfinanzas
AUTH_SECRET=<openssl rand -base64 32>
AUTH_URL=http://localhost:3000
```

### 2. Schema en Neon

Ejecutar en orden (una sola vez):

```bash
psql $DATABASE_URL -f sql/001_schema.sql
psql $DATABASE_URL -f sql/002_seed_companies.sql
psql $DATABASE_URL -f sql/003_seed_pnl_lines.sql
psql $DATABASE_URL -f sql/004_views.sql
psql $DATABASE_URL -f sql/005_functions.sql

# Solo si hay datos en fact_libro_diario existentes:
psql $DATABASE_URL -f sql/006_migration.sql
```

Migraciones incrementales (correr según versión instalada):

```bash
# Forma recomendada: script que aplica 007-010 en orden
npx tsx scripts/migrate.ts

# O manualmente:
psql $DATABASE_URL -f sql/007_upload_versioning.sql    # versioning de cargas (superseded_by)
psql $DATABASE_URL -f sql/008_budget_forecast.sql      # tablas budget/forecast + v_scenario_monthly
psql $DATABASE_URL -f sql/009_formula_components.sql   # pnl_formula_components (reemplaza IN-lists)
psql $DATABASE_URL -f sql/010_constraints.sql          # unique indexes para versiones activas
```

### 3. Crear usuario admin

```bash
npx tsx scripts/create-admin.ts
```

### 4. Correr local

```bash
npm run dev   # → http://localhost:3000
```

---

## Estructura

```
finanzas-app/
├── sql/                      Migrations & schema
│   ├── 001_schema.sql        Tablas base
│   ├── 002_seed_companies.sql
│   ├── 003_seed_pnl_lines.sql
│   ├── 004_views.sql         v_pnl_movements, v_unmapped_pnl_accounts, v_pnl_base_monthly
│   ├── 005_functions.sql     fn_pnl_ytd, fn_pnl_monthly, fn_pnl_lmonth_ytd, fn_pnl_drilldown, fn_dashboard_kpis
│   ├── 006_migration.sql     One-shot: fact_libro_diario → journal_entries
│   ├── 007_upload_versioning.sql  ADD COLUMN superseded_by en uploaded_files
│   ├── 008_budget_forecast.sql    budget_versions, budget_monthly, forecast_*, v_scenario_monthly
│   ├── 009_formula_components.sql pnl_formula_components (EBITDA + Resultado)
│   └── 010_constraints.sql        unique partial indexes versiones activas budget/forecast
├── scripts/
│   ├── create-admin.ts       Crea primer usuario admin
│   └── migrate.ts            Aplica migraciones 007-010 en orden
├── app/
│   ├── (auth)/login          Login page
│   ├── (portal)/
│   │   ├── dashboard         KPIs ejecutivos + ranking empresas
│   │   ├── eerr              EERR YTD / Mes+YTD / vs Presupuesto
│   │   ├── eerr/monthly      Vista mensual (columnas por mes)
│   │   └── eerr/lmonth       Mes + YTD side by side
│   ├── admin/
│   │   ├── upload            Cargar libro diario Excel
│   │   ├── mappings          Asignar cuentas a líneas PnL
│   │   ├── files             Historial de cargas
│   │   ├── budget            Cargar y gestionar presupuesto
│   │   ├── forecast          Cargar y gestionar forecast
│   │   ├── control           Control de calidad (semáforos debe/haber, unmapped)
│   │   ├── audit             Audit trail de acciones
│   │   └── users             Gestión de usuarios y permisos
│   └── api/
│       ├── eerr              GET → FinancialStatementPayload (YTD | lmonth | vs_budget | excel)
│       ├── eerr/monthly      GET → payload mensual
│       ├── drilldown         GET → cuentas y movimientos de una línea PnL
│       ├── dashboard         GET → KPI metrics
│       ├── upload            POST → cargar archivo Excel
│       ├── mappings          GET + POST → CRUD de mappings
│       ├── companies         GET → empresas del usuario
│       ├── pnl-lines         GET → líneas PnL para selector
│       ├── budget            GET + POST → versiones de presupuesto
│       ├── forecast          GET + POST → versiones de forecast
│       ├── export/board-pack GET → PDF ejecutivo
│       ├── control           GET → datos calidad financiera
│       └── audit             GET → audit log paginado
├── components/
│   ├── financial/
│   │   ├── FinancialStatementTable.tsx
│   │   ├── DrillDownDrawer.tsx
│   │   └── EerrFilters.tsx
│   ├── dashboard/
│   │   ├── KpiCard.tsx
│   │   ├── ScenarioKpiCard.tsx
│   │   ├── DashboardCharts.tsx
│   │   ├── AlertsPanel.tsx
│   │   └── CompanyRanking.tsx
│   ├── admin/UploadPanel.tsx
│   └── admin/MappingTable.tsx
├── lib/
│   ├── db.ts                 postgres.js connection
│   ├── auth.ts               Auth.js v5 (Credentials provider)
│   ├── permissions.ts        getAllowedCompanyIds, assertCanViewCompany, assertCanExport
│   ├── audit.ts              logAuditEvent
│   ├── formatters.ts         formatCurrency, formatPercentage
│   ├── eerr.ts               Tipos TypeScript del PnL
│   ├── export-excel.ts       buildEerrWorkbook (exceljs)
│   └── ingest/
│       ├── parseJournal.ts   Parser Excel (xlsx/SheetJS)
│       ├── loadJournal.ts    Ingesta con transacción, dedup y reemplazo
│       ├── parseBudget.ts    Parser presupuesto Excel
│       ├── loadBudget.ts     Carga presupuesto con reemplazo de versión activa
│       └── loadForecast.ts   Carga forecast
└── middleware.ts             Protección de rutas + redirect a login
```

## Roles

| Rol        | Empresas visibles    | Admin | Upload | Export | Drill-down |
|-----------|---------------------|-------|--------|--------|------------|
| admin      | Todas               | ✓     | ✓      | ✓      | ✓          |
| finance    | Todas               | ✓     | ✓      | ✓      | ✓          |
| director   | Asignadas           | ✗     | ✗      | Por empresa | ✓     |
| partner    | Asignadas           | ✗     | ✗      | Por empresa | ✗     |
| stakeholder| Asignadas           | ✗     | ✗      | Por empresa | ✗     |

## Deploy en Vercel

1. Conectar repo en Vercel
2. Agregar variables de entorno en Vercel Dashboard:
   - `DATABASE_URL`
   - `AUTH_SECRET`
   - `AUTH_URL` (URL de producción)
3. Deploy

## TODOs pendientes

- `TODO(business)`: Multi-moneda COP/CLP (E&V Bogotá)
- `TODO(later)`: dbt layer — staging → intermediate → marts financieros
- `TODO(later)`: Alertas automáticas por email
