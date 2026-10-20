-- O ColorADD oficial tem 27 simbolos, e o manual de normas graficas (2.4)
-- proibe criar outros. A visao devolvia COLORADD_CINZA (cinza medio), que nao
-- existe, e o app chegou a ter simbolos de rosa. Esta migration passa as pecas
-- ja' salvas para os simbolos oficiais, com a mesma regra da visao:
--   - cinza: L* do hex >= 50 vira cinza claro; abaixo, cinza escuro;
--   - rosa: vermelho claro, que era o que a visao devolvia para rosa.
--
-- L* calculado como em src/looks/cor.ts (sRGB -> CIELAB, D65).
CREATE FUNCTION pg_temp.luminosidade(hex TEXT) RETURNS DOUBLE PRECISION AS $$
  WITH canais AS (
    SELECT ('x' || substr(hex, 2, 2))::bit(8)::int / 255.0 AS r,
           ('x' || substr(hex, 4, 2))::bit(8)::int / 255.0 AS g,
           ('x' || substr(hex, 6, 2))::bit(8)::int / 255.0 AS b
  ),
  lineares AS (
    SELECT
      CASE WHEN r > 0.04045 THEN power((r + 0.055) / 1.055, 2.4) ELSE r / 12.92 END AS r,
      CASE WHEN g > 0.04045 THEN power((g + 0.055) / 1.055, 2.4) ELSE g / 12.92 END AS g,
      CASE WHEN b > 0.04045 THEN power((b + 0.055) / 1.055, 2.4) ELSE b / 12.92 END AS b
    FROM canais
  ),
  y AS (SELECT 0.2126 * r + 0.7152 * g + 0.0722 * b AS y FROM lineares)
  SELECT CASE WHEN y > 0.008856 THEN 116 * cbrt(y) - 16 ELSE 903.3 * y END FROM y;
$$ LANGUAGE SQL IMMUTABLE;

-- Cor principal
UPDATE "Peca"
SET "colorAddSymbol" = 'COLORADD_CINZA_CLARO', "corNome" = 'Cinza Claro'
WHERE "colorAddSymbol" = 'COLORADD_CINZA' AND pg_temp.luminosidade("hex") >= 50;

UPDATE "Peca"
SET "colorAddSymbol" = 'COLORADD_CINZA_ESCURO', "corNome" = 'Cinza Escuro'
WHERE "colorAddSymbol" = 'COLORADD_CINZA';

UPDATE "Peca"
SET "colorAddSymbol" = 'COLORADD_VERMELHO_CLARO', "corNome" = 'Vermelho Claro'
WHERE "colorAddSymbol" IN ('COLORADD_ROSA', 'COLORADD_ROSA_CLARO', 'COLORADD_ROSA_ESCURO');

-- Cor secundaria (sem hex, nao ha como saber o tom: fica cinza claro)
UPDATE "Peca"
SET "colorAddSymbolSecundario" = 'COLORADD_CINZA_CLARO', "corSecundariaNome" = 'Cinza Claro'
WHERE "colorAddSymbolSecundario" = 'COLORADD_CINZA'
  AND ("hexSecundario" IS NULL OR pg_temp.luminosidade("hexSecundario") >= 50);

UPDATE "Peca"
SET "colorAddSymbolSecundario" = 'COLORADD_CINZA_ESCURO', "corSecundariaNome" = 'Cinza Escuro'
WHERE "colorAddSymbolSecundario" = 'COLORADD_CINZA';

UPDATE "Peca"
SET "colorAddSymbolSecundario" = 'COLORADD_VERMELHO_CLARO', "corSecundariaNome" = 'Vermelho Claro'
WHERE "colorAddSymbolSecundario" IN ('COLORADD_ROSA', 'COLORADD_ROSA_CLARO', 'COLORADD_ROSA_ESCURO');
