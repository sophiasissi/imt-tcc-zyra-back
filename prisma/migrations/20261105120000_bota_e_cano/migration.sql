-- Bota separada do sapato, com a altura do cano (05/11/2026). A bota castanha
-- de couro da Sophia era salva como sapato. So' acrescenta valores e uma
-- coluna; as botas antigas passam a BOTA pelo `npm run reanalisar:pecas`.
ALTER TYPE "Categoria" ADD VALUE 'BOTA' AFTER 'SAPATO';

CREATE TYPE "Cano" AS ENUM ('CURTO', 'MEDIO', 'LONGO', 'ACIMA_DO_JOELHO');

ALTER TABLE "Peca" ADD COLUMN "cano" "Cano";
