-- Jaqueta sem manga é colete. Os coletes salvos como blusa não têm como ser
-- reconhecidos pelos dados: o npm run reanalisar:pecas corrige.
UPDATE "Peca" SET "categoria" = 'COLETE' WHERE "categoria" = 'JAQUETA' AND "manga" = 'SEM_MANGA';
