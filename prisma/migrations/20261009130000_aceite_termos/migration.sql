-- Aceite dos Termos de uso no cadastro: quando e qual versao. Contas antigas
-- ficam com null (aceitaram pelo aviso "Ao criar uma conta, voce concorda...",
-- sem checkbox).

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN "termosAceitosEm" TIMESTAMP(3),
ADD COLUMN "versaoTermosAceita" TEXT;
