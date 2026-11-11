-- Suéter separado do moletom (10/11/2026, pedido da Sophia): o suéter
-- listrado de tricô dela estava salvo como "moletom preto". O valor novo do
-- enum só pode ser usado na migration seguinte (o Postgres não deixa usar o
-- valor na mesma transação que o cria).
ALTER TYPE "Categoria" ADD VALUE 'SUETER' AFTER 'MOLETOM';
