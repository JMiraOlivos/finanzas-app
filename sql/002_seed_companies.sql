SET search_path TO finanzas;

INSERT INTO companies (name, country, base_currency) VALUES
  ('E&V Algarrobo',        'Chile',    'CLP'),
  ('E&V Calera de Tango',  'Chile',    'CLP'),
  ('E&V Chile',            'Chile',    'CLP'),
  ('E&V Comercial',        'Chile',    'CLP'),
  ('E&V Lo Barnechea',     'Chile',    'CLP'),
  ('E&V Ñuñoa',            'Chile',    'CLP'),
  ('E&V Rancagua',         'Chile',    'CLP'),
  ('E&V Vitacura',         'Chile',    'CLP'),
  ('E&V Bogotá',           'Colombia', 'COP')
ON CONFLICT (name) DO NOTHING;
