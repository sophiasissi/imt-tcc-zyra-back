/*
  Warnings:

  - You are about to drop the column `googleId` on the `Usuario` table. All the data in the column will be lost.
  - You are about to drop the column `provedorAutenticacao` on the `Usuario` table. All the data in the column will be lost.
  - You are about to drop the column `senhaHash` on the `Usuario` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[cognitoSub]` on the table `Usuario` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `cognitoSub` to the `Usuario` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Usuario_googleId_key";

-- AlterTable
ALTER TABLE "Usuario" DROP COLUMN "googleId",
DROP COLUMN "provedorAutenticacao",
DROP COLUMN "senhaHash",
ADD COLUMN     "cognitoSub" TEXT NOT NULL;

-- DropEnum
DROP TYPE "ProvedorAutenticacao";

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_cognitoSub_key" ON "Usuario"("cognitoSub");
