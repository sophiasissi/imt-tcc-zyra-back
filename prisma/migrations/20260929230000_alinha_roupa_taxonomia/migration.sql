-- Alinha a tabela Roupa com a taxonomia de pecas (taxonomy.py da visao e
-- src/looks/taxonomia.ts). As colunas de texto livre viram enums, "tecido"
-- da lugar a "aquecimento" e "material", e "ocasiao" vira a lista "ocasioes".
--
-- Os valores ja gravados sao convertidos, nao descartados. O que nao tem
-- equivalente na taxonomia vira NULL.

-- CreateEnum
CREATE TYPE "Categoria" AS ENUM ('CAMISETA', 'CAMISA', 'MOLETOM', 'JAQUETA', 'BLAZER', 'CALCA', 'SHORT', 'SAIA', 'VESTIDO', 'TENIS', 'SAPATO', 'BOLSA');
CREATE TYPE "Estilo" AS ENUM ('CASUAL', 'SOCIAL', 'ESPORTIVO', 'STREETWEAR', 'ELEGANTE', 'BASICO');
CREATE TYPE "Estampa" AS ENUM ('LISO', 'ESTAMPADO', 'LISTRADO', 'XADREZ', 'LOGO');
CREATE TYPE "Ocasiao" AS ENUM ('DIA_A_DIA', 'TRABALHO', 'FESTA', 'ACADEMIA', 'PRAIA', 'CASA');
CREATE TYPE "Aquecimento" AS ENUM ('LEVE', 'MEDIO', 'QUENTE');
CREATE TYPE "Material" AS ENUM ('JEANS', 'COURO');

-- Categoria: a lista antiga tinha nomes mais finos; cada um cai no grupo da
-- taxonomia (ex.: blusa e regata em CAMISETA, casaco em JAQUETA).
ALTER TABLE "Roupa" ALTER COLUMN "categoria" TYPE "Categoria" USING (
  CASE lower("categoria")
    WHEN 'camiseta' THEN 'CAMISETA'
    WHEN 'blusa' THEN 'CAMISETA'
    WHEN 'camisa' THEN 'CAMISA'
    WHEN 'moletom' THEN 'MOLETOM'
    WHEN 'jaqueta' THEN 'JAQUETA'
    WHEN 'casaco' THEN 'JAQUETA'
    WHEN 'blazer' THEN 'BLAZER'
    WHEN 'calca' THEN 'CALCA'
    WHEN 'short' THEN 'SHORT'
    WHEN 'bermuda' THEN 'SHORT'
    WHEN 'saia' THEN 'SAIA'
    WHEN 'vestido' THEN 'VESTIDO'
    WHEN 'macacao' THEN 'VESTIDO'
    WHEN 'tenis' THEN 'TENIS'
    WHEN 'sapato' THEN 'SAPATO'
    WHEN 'sandalia' THEN 'SAPATO'
    WHEN 'bota' THEN 'SAPATO'
    WHEN 'bolsa' THEN 'BOLSA'
  END
)::"Categoria";

ALTER TABLE "Roupa" ALTER COLUMN "estilo" TYPE "Estilo" USING (
  CASE WHEN upper("estilo") IN ('CASUAL', 'SOCIAL', 'ESPORTIVO', 'STREETWEAR', 'ELEGANTE', 'BASICO')
    THEN upper("estilo") END
)::"Estilo";

ALTER TABLE "Roupa" ALTER COLUMN "estampa" TYPE "Estampa" USING (
  CASE lower("estampa")
    WHEN 'lisa' THEN 'LISO'
    WHEN 'estampada' THEN 'ESTAMPADO'
    WHEN 'floral' THEN 'ESTAMPADO'
    WHEN 'poa' THEN 'ESTAMPADO'
    WHEN 'listrada' THEN 'LISTRADO'
    WHEN 'xadrez' THEN 'XADREZ'
    WHEN 'logo' THEN 'LOGO'
  END
)::"Estampa";

-- Tecido -> material: so jeans e couro existem na taxonomia.
ALTER TABLE "Roupa" ADD COLUMN "material" "Material";
UPDATE "Roupa" SET "material" = (
  CASE lower("tecido") WHEN 'jeans' THEN 'JEANS' WHEN 'couro' THEN 'COURO' END
)::"Material";
ALTER TABLE "Roupa" DROP COLUMN "tecido";

ALTER TABLE "Roupa" ADD COLUMN "aquecimento" "Aquecimento";

-- Ocasiao (uma) -> ocasioes (lista).
ALTER TABLE "Roupa" ADD COLUMN "ocasioes" "Ocasiao"[] DEFAULT ARRAY[]::"Ocasiao"[];
UPDATE "Roupa" SET "ocasioes" = CASE lower("ocasiao")
    WHEN 'dia a dia' THEN ARRAY['DIA_A_DIA']::"Ocasiao"[]
    WHEN 'trabalho' THEN ARRAY['TRABALHO']::"Ocasiao"[]
    WHEN 'formal' THEN ARRAY['TRABALHO']::"Ocasiao"[]
    WHEN 'festa' THEN ARRAY['FESTA']::"Ocasiao"[]
    WHEN 'esporte' THEN ARRAY['ACADEMIA']::"Ocasiao"[]
    WHEN 'praia' THEN ARRAY['PRAIA']::"Ocasiao"[]
    ELSE ARRAY[]::"Ocasiao"[]
  END;
ALTER TABLE "Roupa" DROP COLUMN "ocasiao";
