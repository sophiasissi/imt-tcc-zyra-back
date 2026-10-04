-- Bolsa e mochila deixam de ser cadastraveis: o valor BOLSA sai do enum
-- Categoria.
--
-- O PostgreSQL nao remove valor de enum. O tipo e recriado sem BOLSA e a
-- coluna e convertida para o tipo novo. Nenhuma peca gravada e bolsa; se
-- houver alguma, a conversao falha e a transacao inteira e desfeita.

BEGIN;

ALTER TYPE "Categoria" RENAME TO "Categoria_old";

CREATE TYPE "Categoria" AS ENUM ('CAMISETA', 'CAMISA', 'MOLETOM', 'JAQUETA', 'BLAZER', 'CALCA', 'SHORT', 'SAIA', 'VESTIDO', 'TENIS', 'SAPATO');

ALTER TABLE "Peca" ALTER COLUMN "categoria" TYPE "Categoria" USING ("categoria"::text::"Categoria");

DROP TYPE "Categoria_old";

COMMIT;
