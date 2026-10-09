-- Registro do consentimento para guardar o tipo de daltonismo, que e' dado de
-- saude (dado pessoal sensivel, LGPD art. 5o, II, e art. 11, I). A LGPD poe no
-- controlador o onus de provar o consentimento (art. 8o, par. 2o).
--
-- Contas antigas ficam com null: o tipo que ja' tinham continua salvo, e a
-- autorizacao e' pedida na proxima vez que mudarem o tipo de daltonismo.

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN "consentimentoSaudeEm" TIMESTAMP(3);
