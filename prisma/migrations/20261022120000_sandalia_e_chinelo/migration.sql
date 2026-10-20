-- Calcados abertos separados do sapato: o chinelo era salvo como sapato e
-- entrava em look de festa e de trabalho. So' acrescenta valores; nenhuma peca muda.

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Categoria" ADD VALUE 'SANDALIA';
ALTER TYPE "Categoria" ADD VALUE 'CHINELO';

