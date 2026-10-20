-- Cadastro de pecas mais especifico (testes da Sophia em 19/10/2026):
--   - categorias novas de peca de cima: blusa, cropped, top e body. Antes o
--     body virava camiseta ou vestido, e a blusa fina de manga longa, moletom;
--   - materiais: de jeans e couro para 12 tecidos, pelo nome que as pessoas
--     usam ("calca de moletom", "pijama de soft");
--   - manga (sem manga, curta, longa), para o app escrever "camiseta manga longa".
--
-- So' acrescenta valores e uma coluna opcional: nenhuma peca muda.

-- AlterEnum
ALTER TYPE "Categoria" ADD VALUE 'BLUSA' AFTER 'CAMISA';
ALTER TYPE "Categoria" ADD VALUE 'CROPPED' AFTER 'BLUSA';
ALTER TYPE "Categoria" ADD VALUE 'TOP' AFTER 'CROPPED';
ALTER TYPE "Categoria" ADD VALUE 'BODY' AFTER 'TOP';

-- AlterEnum
ALTER TYPE "Material" ADD VALUE 'MOLETOM';
ALTER TYPE "Material" ADD VALUE 'MALHA';
ALTER TYPE "Material" ADD VALUE 'POLIAMIDA';
ALTER TYPE "Material" ADD VALUE 'TRICO';
ALTER TYPE "Material" ADD VALUE 'SOFT';
ALTER TYPE "Material" ADD VALUE 'LINHO';
ALTER TYPE "Material" ADD VALUE 'ALFAIATARIA';
ALTER TYPE "Material" ADD VALUE 'CETIM';
ALTER TYPE "Material" ADD VALUE 'VISCOSE';
ALTER TYPE "Material" ADD VALUE 'VELUDO';

-- CreateEnum
CREATE TYPE "Manga" AS ENUM ('SEM_MANGA', 'CURTA', 'LONGA');

-- AlterTable
ALTER TABLE "Peca" ADD COLUMN "manga" "Manga";
