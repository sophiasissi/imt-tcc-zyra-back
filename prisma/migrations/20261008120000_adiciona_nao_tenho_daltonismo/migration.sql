-- "Nao tenho" daltonismo passa a ser uma resposta salva. Antes o cadastro
-- deixava o campo vazio, e o app nao distinguia quem nao e' daltonico de quem
-- nao respondeu.
--
-- So' acrescenta o valor: nenhuma linha muda aqui. O preenchimento de quem ja'
-- se cadastrou fica na migration seguinte, porque o Postgres nao deixa usar um
-- valor de enum na mesma transacao em que ele foi criado.

-- AlterEnum
ALTER TYPE "TipoDaltonismo" ADD VALUE 'NAO_TENHO' AFTER 'NAO_SEI';
