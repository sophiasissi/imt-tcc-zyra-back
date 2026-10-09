-- Quem ja' concluiu o cadastro com o tipo de daltonismo vazio respondeu
-- "Nao tenho": no cadastro, essa era a unica forma de deixar o campo vazio.
--
-- O cadastro so' termina com a data de nascimento, que e' obrigatoria e vai no
-- mesmo PATCH do tipo de daltonismo. Quem nao tem data ainda nao respondeu e
-- continua vazio.
UPDATE "Usuario"
SET "tipoDaltonismo" = 'NAO_TENHO'
WHERE "tipoDaltonismo" IS NULL
  AND "dataNascimento" IS NOT NULL;
