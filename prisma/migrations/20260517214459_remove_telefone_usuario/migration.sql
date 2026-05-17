/*
  Warnings:

  - You are about to drop the column `telefone` on the `Usuario` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Usuario_telefone_key";

-- AlterTable
ALTER TABLE "Usuario" DROP COLUMN "telefone";
