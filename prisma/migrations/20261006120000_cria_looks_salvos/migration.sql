-- Looks salvos pelo usuario a partir do chat.

-- CreateTable
CREATE TABLE "Look" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "nome" TEXT,
    "ocasiao" "Ocasiao",
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Look_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LookPeca" (
    "lookId" TEXT NOT NULL,
    "pecaId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "LookPeca_pkey" PRIMARY KEY ("lookId","pecaId")
);

-- CreateIndex
CREATE INDEX "Look_usuarioId_idx" ON "Look"("usuarioId");

-- CreateIndex
CREATE INDEX "LookPeca_pecaId_idx" ON "LookPeca"("pecaId");

-- AddForeignKey
ALTER TABLE "Look" ADD CONSTRAINT "Look_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LookPeca" ADD CONSTRAINT "LookPeca_lookId_fkey" FOREIGN KEY ("lookId") REFERENCES "Look"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LookPeca" ADD CONSTRAINT "LookPeca_pecaId_fkey" FOREIGN KEY ("pecaId") REFERENCES "Peca"("id") ON DELETE CASCADE ON UPDATE CASCADE;

