SET search_path TO finanzas;

-- Full PnL hierarchy. sort_order defines the display order.
-- level 0 = section header (subtotal or calculated)
-- level 1 = detail line (maps to account_pnl_mappings)
-- is_bold  = TRUE for all section headers and calculated lines
-- formula_key = non-null only for calculated lines (EBITDA, RESULTADO_ANTES_IMP, RESULTADO_FINAL)

INSERT INTO pnl_lines
  (code, label, parent_code, level, sort_order, line_type, formula_key, is_bold, is_highlighted, show_in_report)
VALUES

-- ─── INGRESOS ────────────────────────────────────────────────────────────────
('INGRESOS',           'Ingresos',              NULL,        0, 100, 'subtotal',   NULL,                   TRUE,  TRUE,  TRUE),
('INGRESOS_DETALLE',   'Ingresos',              'INGRESOS',  1, 110, 'detail',     NULL,                   FALSE, FALSE, TRUE),

-- ─── GASTOS VARIABLES ────────────────────────────────────────────────────────
('GASTOS_VARIABLES',          'Gastos Variables',      NULL,              0, 200, 'subtotal', NULL, TRUE,  FALSE, TRUE),
('BONO_CAPTACION',            'Bono Captación',        'GASTOS_VARIABLES',1, 210, 'detail',   NULL, FALSE, FALSE, TRUE),
('COMISIONES_FREE_LANCE',     'Comisiones Free Lance', 'GASTOS_VARIABLES',1, 220, 'detail',   NULL, FALSE, FALSE, TRUE),
('COMISIONES_FULL_TIME',      'Comisiones Full Time',  'GASTOS_VARIABLES',1, 230, 'detail',   NULL, FALSE, FALSE, TRUE),
('COMISIONES_STAFF',          'Comisiones Staff',      'GASTOS_VARIABLES',1, 240, 'detail',   NULL, FALSE, FALSE, TRUE),
('REFERIDOS',                 'Referidos',             'GASTOS_VARIABLES',1, 250, 'detail',   NULL, FALSE, FALSE, TRUE),
('ROYALTIES',                 'Royalties',             'GASTOS_VARIABLES',1, 260, 'detail',   NULL, FALSE, FALSE, TRUE),

-- ─── RRHH ────────────────────────────────────────────────────────────────────
('RRHH',                  'RRHH',                 NULL,    0, 300, 'subtotal', NULL, TRUE,  FALSE, TRUE),
('BIENESTAR',             'Bienestar',            'RRHH',  1, 310, 'detail',   NULL, FALSE, FALSE, TRUE),
('FINIQUITOS',            'Finiquitos',           'RRHH',  1, 320, 'detail',   NULL, FALSE, FALSE, TRUE),
('PROVISION_VACACIONES',  'Provisión Vacaciones', 'RRHH',  1, 330, 'detail',   NULL, FALSE, FALSE, TRUE),
('REMUNERACIONES',        'Remuneraciones',       'RRHH',  1, 340, 'detail',   NULL, FALSE, FALSE, TRUE),
('SENA',                  'SENA',                 'RRHH',  1, 350, 'detail',   NULL, FALSE, FALSE, TRUE),

-- ─── MARKETING ───────────────────────────────────────────────────────────────
('MARKETING',          'Marketing',          NULL,        0, 400, 'subtotal', NULL, TRUE,  FALSE, TRUE),
('AGENCIA_MARKETING',  'Agencia Marketing',  'MARKETING', 1, 410, 'detail',   NULL, FALSE, FALSE, TRUE),
('FOTOGRAFO',          'Fotógrafo',          'MARKETING', 1, 420, 'detail',   NULL, FALSE, FALSE, TRUE),
('GASTOS_MARKETING',   'Gastos Marketing',   'MARKETING', 1, 430, 'detail',   NULL, FALSE, FALSE, TRUE),
('MEDIOS',             'Medios',             'MARKETING', 1, 440, 'detail',   NULL, FALSE, FALSE, TRUE),
('MERCHANDISING',      'Merchandising',      'MARKETING', 1, 450, 'detail',   NULL, FALSE, FALSE, TRUE),
('PORTALES',           'Portales',           'MARKETING', 1, 460, 'detail',   NULL, FALSE, FALSE, TRUE),

-- ─── GASTOS ADMINISTRACIÓN ───────────────────────────────────────────────────
('GASTOS_ADMIN',             'Gastos Administración',    NULL,          0, 500, 'subtotal', NULL, TRUE,  FALSE, TRUE),
('GASTOS_BANCARIOS',         'Gastos Bancarios',         'GASTOS_ADMIN',1, 510, 'detail',   NULL, FALSE, FALSE, TRUE),
('GASTOS_GENERALES',         'Gastos Generales',         'GASTOS_ADMIN',1, 520, 'detail',   NULL, FALSE, FALSE, TRUE),
('GASTOS_LEGALES_ADM',       'Gastos Legales',           'GASTOS_ADMIN',1, 530, 'detail',   NULL, FALSE, FALSE, TRUE),
('OTROS_GASTOS_ADM',         'Otros Gastos Adm',         'GASTOS_ADMIN',1, 540, 'detail',   NULL, FALSE, FALSE, TRUE),
('PATENTE',                  'Patente',                  'GASTOS_ADMIN',1, 550, 'detail',   NULL, FALSE, FALSE, TRUE),
('REPRESENTACION_VIAJES',    'Representación y Viajes',  'GASTOS_ADMIN',1, 560, 'detail',   NULL, FALSE, FALSE, TRUE),
('SEGUROS',                  'Seguros',                  'GASTOS_ADMIN',1, 570, 'detail',   NULL, FALSE, FALSE, TRUE),

-- ─── ASESORÍAS ───────────────────────────────────────────────────────────────
('ASESORIAS',           'Asesorías',           NULL,         0, 600, 'subtotal', NULL, TRUE,  FALSE, TRUE),
('ASESORIA_CONTABLE',   'Asesoría Contable',   'ASESORIAS',  1, 610, 'detail',   NULL, FALSE, FALSE, TRUE),
('LEGALES_ASESORIA',    'Legales',             'ASESORIAS',  1, 620, 'detail',   NULL, FALSE, FALSE, TRUE),
('OTRAS_ASESORIAS',     'Otras',               'ASESORIAS',  1, 630, 'detail',   NULL, FALSE, FALSE, TRUE),
('REVISOR_FISCAL',      'Revisor Fiscal',      'ASESORIAS',  1, 640, 'detail',   NULL, FALSE, FALSE, TRUE),

-- ─── GASTOS OFICINA / OCUPACIÓN ──────────────────────────────────────────────
('GASTOS_OFICINA',            'Gastos Oficina/Ocupación',    NULL,            0, 700, 'subtotal', NULL, TRUE,  FALSE, TRUE),
('ARRIENDOS',                 'Arriendos',                   'GASTOS_OFICINA',1, 710, 'detail',   NULL, FALSE, FALSE, TRUE),
('GASTOS_DE_OFICINA',         'Gastos de Oficina',           'GASTOS_OFICINA',1, 720, 'detail',   NULL, FALSE, FALSE, TRUE),
('MANTENCIONES',              'Mantenciones y Adecuaciones', 'GASTOS_OFICINA',1, 730, 'detail',   NULL, FALSE, FALSE, TRUE),
('SERVICIOS_BASICOS',         'Servicios Básicos',           'GASTOS_OFICINA',1, 740, 'detail',   NULL, FALSE, FALSE, TRUE),
('TELEFONIA_INTERNET',        'Telefonía e Internet',        'GASTOS_OFICINA',1, 750, 'detail',   NULL, FALSE, FALSE, TRUE),

-- ─── TECNOLOGÍA ──────────────────────────────────────────────────────────────
('TECNOLOGIA',          'Tecnología',          NULL,          0, 800, 'subtotal', NULL, TRUE,  FALSE, TRUE),
('GASTOS_IT_ALEMANIA',  'Gastos IT Alemania',  'TECNOLOGIA',  1, 810, 'detail',   NULL, FALSE, FALSE, TRUE),
('GO4',                 'GO4',                 'TECNOLOGIA',  1, 820, 'detail',   NULL, FALSE, FALSE, TRUE),
('SERVICIOS_IT',        'Servicios IT',        'TECNOLOGIA',  1, 830, 'detail',   NULL, FALSE, FALSE, TRUE),
('SOFTWARE',            'Software',            'TECNOLOGIA',  1, 840, 'detail',   NULL, FALSE, FALSE, TRUE),

-- ─── NO OPERACIONALES ────────────────────────────────────────────────────────
('NO_OPERACIONALES',             'No Operacionales',                  NULL,               0, 900, 'subtotal', NULL, TRUE,  FALSE, TRUE),
('CORRECCION_MONETARIA',         'Corrección Monetaria',              'NO_OPERACIONALES', 1, 910, 'detail',   NULL, FALSE, FALSE, TRUE),
('DIFERENCIA_CAMBIO',            'Diferencia de Cambio',              'NO_OPERACIONALES', 1, 920, 'detail',   NULL, FALSE, FALSE, TRUE),
('INGRESOS_NO_OPERACIONALES',    'Ingresos No Operacionales',         'NO_OPERACIONALES', 1, 930, 'detail',   NULL, FALSE, FALSE, TRUE),
('OTROS_GASTOS_EXPLOTACION',     'Otros Gastos Fuera de la Explotación','NO_OPERACIONALES',1, 940, 'detail',  NULL, FALSE, FALSE, TRUE),
('RETENCIONES_PAGOS_EXTRANJERO', 'Retenciones Pagos Extranjero',      'NO_OPERACIONALES', 1, 950, 'detail',   NULL, FALSE, FALSE, TRUE),
('VENTA_ACTIVOS_FIJOS',          'Venta Activos Fijos',               'NO_OPERACIONALES', 1, 960, 'detail',   NULL, FALSE, FALSE, TRUE),

-- ─── EBITDA (calculated) ─────────────────────────────────────────────────────
('EBITDA', 'EBITDA', NULL, 0, 1000, 'calculated', 'EBITDA', TRUE, TRUE, TRUE),

-- ─── INTERESES, IMPUESTOS, DEPR. Y AMORT. ────────────────────────────────────
('INTERESES_DEPR',               'Intereses, Impuestos, Depr. y Amort.', NULL,              0, 1100, 'subtotal', NULL, TRUE,  FALSE, TRUE),
('AJUSTES',                      'Ajustes',                              'INTERESES_DEPR',  1, 1110, 'detail',   NULL, FALSE, FALSE, TRUE),
('DEPRECIACION',                 'Depreciación',                         'INTERESES_DEPR',  1, 1120, 'detail',   NULL, FALSE, FALSE, TRUE),
('DETERIORO_CARTERA',            'Deterioro Cartera',                    'INTERESES_DEPR',  1, 1130, 'detail',   NULL, FALSE, FALSE, TRUE),
('IMPUESTO_ADICIONAL',           'Impuesto Adicional',                   'INTERESES_DEPR',  1, 1140, 'detail',   NULL, FALSE, FALSE, TRUE),
('IMPUESTO_IND_COMERCIO',        'Impuesto Industria y Comercio',        'INTERESES_DEPR',  1, 1150, 'detail',   NULL, FALSE, FALSE, TRUE),
('OTROS_INTERESES',              'Otros',                                'INTERESES_DEPR',  1, 1160, 'detail',   NULL, FALSE, FALSE, TRUE),
('OTROS_IMPUESTOS',              'Otros Impuestos',                      'INTERESES_DEPR',  1, 1170, 'detail',   NULL, FALSE, FALSE, TRUE),
('REAJUSTES_MULTAS',             'Reajustes, Multas e Intereses',        'INTERESES_DEPR',  1, 1180, 'detail',   NULL, FALSE, FALSE, TRUE),

-- ─── RESULTADO ANTES IMP. (calculated) ───────────────────────────────────────
('RESULTADO_ANTES_IMP', 'Resultado Antes Imp.', NULL, 0, 1200, 'calculated', 'RESULTADO_ANTES_IMP', TRUE, TRUE, TRUE),

-- ─── IMPUESTO ────────────────────────────────────────────────────────────────
('IMPUESTO',          'Impuesto',           NULL,       0, 1300, 'subtotal', NULL, TRUE,  FALSE, TRUE),
('IMPUESTO_RENTA',    'Impuesto a la Renta','IMPUESTO', 1, 1310, 'detail',   NULL, FALSE, FALSE, TRUE),

-- ─── RESULTADO FINAL (calculated) ────────────────────────────────────────────
('RESULTADO_FINAL', 'Resultado Final', NULL, 0, 1400, 'calculated', 'RESULTADO_FINAL', TRUE, TRUE, TRUE)

ON CONFLICT (code) DO NOTHING;
