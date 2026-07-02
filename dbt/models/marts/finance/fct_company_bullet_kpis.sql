{{ config(materialized='table', tags=['mart']) }}

-- KPIs de cumplimiento por empresa para bullet charts: real YTD vs presupuesto (target) y año anterior (LY).
-- Dos filas por (company, period): REVENUE_YTD y EBITDA_YTD.
-- El status de EBITDA maneja correctamente targets negativos (el signo de comparación se invierte).

with base as (
    select
        company_id,
        company_name,
        period_month,
        revenue_ytd,
        revenue_ytd_budget       as revenue_target_ytd,
        revenue_ytd_prior        as revenue_ly_ytd,
        ebitda_ytd,
        ebitda_ytd_budget        as ebitda_target_ytd,
        ebitda_ytd_prior         as ebitda_ly_ytd
    from {{ ref('fct_dashboard_kpis') }}
),

unpivoted as (
    select
        company_id,
        company_name,
        period_month,
        'REVENUE_YTD'::text      as metric_code,
        'Ingresos YTD'::text     as metric_label,
        revenue_ytd              as actual_ytd,
        revenue_target_ytd       as target_ytd,
        revenue_ly_ytd           as ly_ytd,
        10                       as sort_order
    from base

    union all

    select
        company_id,
        company_name,
        period_month,
        'EBITDA_YTD'::text       as metric_code,
        'EBITDA YTD'::text       as metric_label,
        ebitda_ytd               as actual_ytd,
        ebitda_target_ytd        as target_ytd,
        ebitda_ly_ytd            as ly_ytd,
        20                       as sort_order
    from base
),

calc as (
    select
        *,
        actual_ytd - target_ytd                                              as variance_vs_target,
        case
            when target_ytd is null or target_ytd = 0 then null
            else (actual_ytd - target_ytd) / abs(target_ytd)
        end                                                                  as variance_vs_target_pct,
        case
            when target_ytd is null or target_ytd = 0 then null
            else actual_ytd / target_ytd
        end                                                                  as attainment_pct,
        actual_ytd - ly_ytd                                                  as variance_vs_ly,
        case
            when ly_ytd is null or ly_ytd = 0 then null
            else (actual_ytd - ly_ytd) / abs(ly_ytd)
        end                                                                  as variance_vs_ly_pct
    from unpivoted
)

select
    company_id,
    company_name,
    period_month,
    metric_code,
    metric_label,
    actual_ytd,
    target_ytd,
    ly_ytd,
    variance_vs_target,
    variance_vs_target_pct,
    attainment_pct,
    variance_vs_ly,
    variance_vs_ly_pct,
    sort_order,

    case
        -- ── REVENUE_YTD ──────────────────────────────────────────────────────
        when metric_code = 'REVENUE_YTD' then
            case
                when target_ytd is null or target_ytd = 0 then 'gray'
                when attainment_pct < 0.80  then 'red'
                when attainment_pct < 0.95  then 'yellow'
                when attainment_pct <= 1.05 then 'green'
                else                              'blue'
            end

        -- ── EBITDA_YTD ───────────────────────────────────────────────────────
        -- El signo de la comparación cambia cuando target es negativo:
        -- actual > target (menos negativo) = mejor rendimiento.
        when metric_code = 'EBITDA_YTD' then
            case
                when target_ytd is null or target_ytd = 0 then 'gray'

                -- Target positivo, actual positivo: attainment_pct normal
                when target_ytd > 0 and actual_ytd >= 0 then
                    case
                        when attainment_pct < 0.75  then 'red'
                        when attainment_pct < 0.95  then 'yellow'
                        when attainment_pct <= 1.05 then 'green'
                        else                              'blue'
                    end

                -- Actual negativo con target positivo: siempre crítico
                when target_ytd > 0 and actual_ytd < 0 then 'red'

                -- Target negativo, actual positivo o cero: superó ampliamente
                when target_ytd < 0 and actual_ytd >= 0 then 'blue'

                -- Target negativo, actual menos negativo (mejor que target)
                when target_ytd < 0 and actual_ytd > target_ytd then
                    case
                        when variance_vs_target_pct >= 0.05 then 'green'
                        else                                      'yellow'
                    end

                -- Target negativo, actual más negativo (peor que target en > 5%)
                when target_ytd < 0 and actual_ytd <= target_ytd * 1.05 then 'yellow'

                else 'red'
            end

        else 'gray'
    end as status

from calc
