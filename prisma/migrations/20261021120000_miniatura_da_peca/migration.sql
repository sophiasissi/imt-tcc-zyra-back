-- Miniatura da foto da peca (opcional). So' acrescenta a coluna; o script
-- scripts/gerar-miniaturas.ts preenche as pecas ja' cadastradas.

-- AlterTable
ALTER TABLE "Peca" ADD COLUMN     "imagemMiniS3Key" TEXT;

