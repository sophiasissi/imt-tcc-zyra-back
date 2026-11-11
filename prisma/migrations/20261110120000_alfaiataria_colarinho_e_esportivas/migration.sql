-- Corte de alfaiataria separado do tecido (10/11/2026). Alfaiataria é o
-- corte, não a fibra: a calça de alfaiataria de viscose da Sophia estava
-- salva como "casual de viscose", e o motor a punha num look de shopping.
ALTER TABLE "Peca" ADD COLUMN "alfaiataria" BOOLEAN;

-- Gola de camisa: a polo era salva como camiseta e entrava no look de casa.
ALTER TABLE "Peca" ADD COLUMN "colarinho" BOOLEAN;

-- Toda camisa tem colarinho. O resto fica nulo até o `npm run
-- reanalisar:pecas`. A alfaiataria não é copiada do material: a calça cargo
-- de sarja da Sophia estava salva com o tecido ALFAIATARIA.
UPDATE "Peca" SET "colarinho" = true WHERE "categoria" = 'CAMISA';

-- Roupa de treino só vai para atividade física: a análise marcava toda peça
-- esportiva também como dia a dia (as 23 do banco em 10/11/2026), e a
-- camiseta dry-fit saía no look de shopping.
UPDATE "Peca"
SET "ocasioes" = array_remove(array_remove("ocasioes", 'DIA_A_DIA'::"Ocasiao"), 'CASA'::"Ocasiao")
WHERE "estilo" = 'ESPORTIVO'
  AND ("ocasioes" && ARRAY['DIA_A_DIA', 'CASA']::"Ocasiao"[]);

UPDATE "Peca"
SET "ocasioes" = array_append("ocasioes", 'ACADEMIA'::"Ocasiao")
WHERE "estilo" = 'ESPORTIVO' AND NOT ('ACADEMIA'::"Ocasiao" = ANY("ocasioes"));
