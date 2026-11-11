-- Colete separado de blusa e jaqueta, e o comprimento de saia e vestido.
-- O valor novo do enum só pode ser usado na migration seguinte (o Postgres
-- não deixa usar o valor na mesma transação que o cria).
ALTER TYPE "Categoria" ADD VALUE 'COLETE' AFTER 'BLAZER';

ALTER TABLE "Peca" ADD COLUMN "curta" BOOLEAN;
