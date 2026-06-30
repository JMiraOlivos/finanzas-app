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
│   ├── 001_schema.sql        Tablas nuevas
│   ├── 002_seed_companies.sql
│   ├── 003_seed_pnl_lines.sql
│   ├── 004_views.sql         v_pnl_movements, v_unmapped_pnl_accounts, v_pnl_base_monthly
│   ├── 005_functions.sql     fn_pnl_ytd, fn_pnl_monthly, fn_pnl_lmonth_ytd, fn_pnl_drilldown, fn_dashboard_kpis
│   └── 006_migration.sql     One-shot: fact_libro_diario → journal_entries
├── app/
│   ├── (auth)/login          Login page
│   ├── (portal)/
│   │   ├── dashboard         KPIs ejecutivos
│   │   ├── eerr              EERR YTD / Mes+YTD
│   │   ├── eerr/monthly      Vista mensual (columnas por mes)
│   │   └── eerr/lmonth       Mes + YTD side by side
│   ├── admin/
│   │   ├── upload            Cargar libro diario Excel
│   │   ├── mappings          Asignar cuentas a líneas PnL
│   │   └── files             Historial de cargas
│   └── api/
│       ├── eerr              GET → FinancialStatementPayload (YTD | lmonth | excel)
│       ├── eerr/monthly      GET → payload mensual
│       ├── drilldown         GET → cuentas y movimientos de una línea PnL
│       ├── dashboard         GET → KPI metrics
│       ├── upload            POST → cargar archivo Excel
│       ├── mappings          GET + POST → CRUD de mappings
│       ├── companies         GET → empresas del usuario
│       └── pnl-lines         GET → líneas PnL para selector
├── components/
│   ├── financial/
│   │   ├── FinancialStatementTable.tsx  Tabla principal (custom, sin AG Grid)
│   │   ├── DrillDownDrawer.tsx          Drawer de movimientos
│   │   └── EerrFilters.tsx              Filtros período + empresa + modo
│   ├── dashboard/KpiCard.tsx
│   ├── admin/UploadPanel.tsx
│   └── admin/MappingTable.tsx
├── lib/
│   ├── db.ts                 postgres.js connection
│   ├── auth.ts               Auth.js v5 (Credentials provider)
│   ├── permissions.ts        Helpers de acceso por rol y empresa
│   ├── formatters.ts         formatCurrency, formatPercentage
│   ├── eerr.ts               Tipos TypeScript del PnL
│   ├── export-excel.ts       buildEerrWorkbook (exceljs)
│   └── ingest/
│       ├── parseJournal.ts   Parser Excel (xlsx/SheetJS)
│       └── loadJournal.ts    Ingesta completa con dedup y batch insert
└── middleware.ts             Protección de rutas + redirect a login
```

## Roles

| Rol        | Empresas visibles    | Admin | Upload | Drill-down |
|-----------|---------------------|-------|--------|------------|
| admin      | Todas               | ✓     | ✓      | ✓          |
| finance    | Todas               | ✓     | ✓      | ✓          |
| director   | Asignadas           | ✗     | ✗      | ✓          |
| partner    | Asignadas           | ✗     | ✗      | ✗          |
| stakeholder| Asignadas           | ✗     | ✗      | ✗          |

## Deploy en Vercel

1. Conectar repo en Vercel
2. Agregar variables de entorno en Vercel Dashboard:
   - `DATABASE_URL`
   - `AUTH_SECRET`
   - `AUTH_URL` (URL de producción)
3. Deploy

## TODOs pendientes de decisión

- `TODO(business)`: Confirmar `sign_multiplier` para cada sección PnL
- `TODO(business)`: Definir política de reemplazar vs. acumular cargas del mismo período
- `TODO(business)`: Multi-moneda COP/CLP (E&V Bogotá)
- `TODO(later)`: Forecast, budget vs actual
- `TODO(later)`: PDF export
- `TODO(later)`: Alertas automáticas
