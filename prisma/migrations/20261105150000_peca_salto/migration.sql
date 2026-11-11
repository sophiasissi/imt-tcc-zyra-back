-- Calcado com salto (sapato, sandalia ou bota), pela analise da OpenAI. O
-- motor tira o salto do passeio do dia a dia e da balada. As pecas antigas
-- ganham o valor pelo `npm run reanalisar:pecas`.
ALTER TABLE "Peca" ADD COLUMN "salto" BOOLEAN;
