-- CreateEnum
CREATE TYPE "ProvedorAutenticacao" AS ENUM ('EMAIL', 'TELEFONE', 'GOOGLE');

-- CreateEnum
CREATE TYPE "Genero" AS ENUM ('MASCULINO', 'FEMININO', 'NAO_BINARIO', 'PREFIRO_NAO_DIZER', 'OUTRO');

-- CreateEnum
CREATE TYPE "TipoDaltonismo" AS ENUM ('PROTANOMALIA', 'PROTANOPIA', 'DEUTERANOMALIA', 'DEUTERANOPIA', 'TRITANOMALIA', 'TRITANOPIA', 'ACROMATOPSIA', 'NAO_SEI', 'PREFIRO_NAO_DIZER');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nome" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "senhaHash" TEXT,
    "dataNascimento" TIMESTAMP(3),
    "genero" "Genero",
    "tipoDaltonismo" "TipoDaltonismo",
    "nivelDificuldadeLooks" INTEGER,
    "provedorAutenticacao" "ProvedorAutenticacao" NOT NULL DEFAULT 'EMAIL',
    "googleId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_telefone_key" ON "Usuario"("telefone");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_googleId_key" ON "Usuario"("googleId");
