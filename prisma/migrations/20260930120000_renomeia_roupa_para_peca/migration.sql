-- Alinha a tabela de pecas com o model combinado com o chat de looks: "Roupa"
-- vira "Peca", os campos de cor ganham os nomes usados pelo chat e pela visao
-- (hex, colorAddSymbol) e a cor secundaria passa a existir.
--
-- Tudo e renomeado, nao recriado: as pecas ja cadastradas e as fotos no S3
-- continuam valendo.
--
-- Roda numa transacao: se qualquer passo falhar, nada e alterado.

BEGIN;

-- Tabela e os objetos que carregam o nome dela.
ALTER TABLE "Roupa" RENAME TO "Peca";
ALTER TABLE "Peca" RENAME CONSTRAINT "Roupa_pkey" TO "Peca_pkey";
ALTER TABLE "Peca" RENAME CONSTRAINT "Roupa_usuarioId_fkey" TO "Peca_usuarioId_fkey";
ALTER INDEX "Roupa_usuarioId_idx" RENAME TO "Peca_usuarioId_idx";

-- Cor principal.
ALTER TABLE "Peca" RENAME COLUMN "corHex" TO "hex";
ALTER TABLE "Peca" RENAME COLUMN "corColorAdd" TO "colorAddSymbol";

-- "nome" nunca foi preenchido pelo app e nao faz parte do model combinado.
ALTER TABLE "Peca" DROP COLUMN "nome";

-- Cor e categoria passam a ser obrigatorias. Nenhuma peca gravada tem esses
-- campos vazios: o cadastro ja recusava peca sem categoria e o app sempre
-- mandou a cor. Se houver alguma, a migration inteira e desfeita.
ALTER TABLE "Peca" ALTER COLUMN "categoria" SET NOT NULL,
ALTER COLUMN "corNome" SET NOT NULL,
ALTER COLUMN "hex" SET NOT NULL,
ALTER COLUMN "colorAddSymbol" SET NOT NULL;

-- Cor secundaria (pecas listradas ou estampadas).
ALTER TABLE "Peca" ADD COLUMN "corSecundariaNome" TEXT,
ADD COLUMN "hexSecundario" TEXT,
ADD COLUMN "colorAddSymbolSecundario" TEXT;

COMMIT;
