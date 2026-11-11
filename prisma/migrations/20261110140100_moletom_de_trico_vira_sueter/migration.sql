-- A blusa fechada de tricô ou lã salva como moletom passa a suéter.
UPDATE "Peca" SET "categoria" = 'SUETER', "atualizadoEm" = now()
WHERE "categoria" = 'MOLETOM' AND "material" = 'TRICO';
