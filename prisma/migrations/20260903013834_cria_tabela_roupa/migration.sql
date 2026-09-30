-- CreateTable
CREATE TABLE "Roupa" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "nome" TEXT,
    "imagemS3Key" TEXT NOT NULL,
    "corNome" TEXT,
    "corHex" TEXT,
    "corColorAdd" TEXT,
    "categoria" TEXT,
    "estilo" TEXT,
    "estampa" TEXT,
    "tecido" TEXT,
    "ocasiao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Roupa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Roupa_usuarioId_idx" ON "Roupa"("usuarioId");

-- AddForeignKey
ALTER TABLE "Roupa" ADD CONSTRAINT "Roupa_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
