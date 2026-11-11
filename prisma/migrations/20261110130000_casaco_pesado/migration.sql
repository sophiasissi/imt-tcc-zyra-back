-- Casaco pesado de frio forte (puffer, parka, sobretudo de lã), pela análise
-- da OpenAI. O motor só o usa com 13 °C ou menos: a jaqueta acolchoada da
-- Sophia entrou num jantar com 16 a 19 °C (10/11/2026). As jaquetas e os
-- blazers antigos ganham o valor pelo `npm run reanalisar:pecas`.
ALTER TABLE "Peca" ADD COLUMN "casacoPesado" BOOLEAN;
