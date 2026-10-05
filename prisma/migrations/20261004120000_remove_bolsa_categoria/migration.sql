-- Bolsa e mochila deixaram de ser cadastraveis: a visao passou a recusa-las
-- e elas nao entram nos looks.
--
-- A conversao abaixo FALHA se ainda existir alguma peca com categoria BOLSA.
-- E' de proposito: melhor parar do que apagar a peca de alguem sem avisar.
-- Se falhar, remova essas pecas pelo app (DELETE /pecas/:id, que tambem apaga
-- a foto no S3) e rode a migration de novo.

-- AlterEnum
BEGIN;
CREATE TYPE "Categoria_new" AS ENUM ('CAMISETA', 'CAMISA', 'MOLETOM', 'JAQUETA', 'BLAZER', 'CALCA', 'SHORT', 'SAIA', 'VESTIDO', 'TENIS', 'SAPATO');
ALTER TABLE "Peca" ALTER COLUMN "categoria" TYPE "Categoria_new" USING ("categoria"::text::"Categoria_new");
ALTER TYPE "Categoria" RENAME TO "Categoria_old";
ALTER TYPE "Categoria_new" RENAME TO "Categoria";
DROP TYPE "public"."Categoria_old";
COMMIT;

