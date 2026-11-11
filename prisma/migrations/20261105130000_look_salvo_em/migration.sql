-- Data em que a pessoa salvou o look pela ultima vez; a galeria ordena por
-- ela. Salvar de novo as mesmas pecas atualiza esta data, e o look volta para
-- o topo. Os looks que ja existem ficam com a data de criacao.
ALTER TABLE "Look" ADD COLUMN "salvoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Look" SET "salvoEm" = "criadoEm";
