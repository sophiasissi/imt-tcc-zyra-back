-- Ultima vez que a peca apareceu num look sugerido pelo chat. O motor da
-- preferencia as pecas usadas ha mais tempo, para variar entre as conversas.
ALTER TABLE "Peca" ADD COLUMN "sugeridaEm" TIMESTAMP(3);
