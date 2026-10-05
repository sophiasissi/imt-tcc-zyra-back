-- Amplia a taxonomia de pecas com base na ontologia Fashionpedia (ECCV 2020),
-- na Google Product Taxonomy e nos codigos de vestimenta do Emily Post
-- Institute. So acrescenta valores: nenhuma peca gravada muda.
--
-- AFTER mantem no banco a mesma ordem do schema.prisma.

BEGIN;

-- Categoria: polo, regata, cardiga, casaco, colete e macacao deixam de ser
-- variacoes de outras categorias; bota e sandalia saem de SAPATO.
ALTER TYPE "Categoria" ADD VALUE 'POLO' AFTER 'CAMISETA';
ALTER TYPE "Categoria" ADD VALUE 'REGATA' AFTER 'POLO';
ALTER TYPE "Categoria" ADD VALUE 'CARDIGA' AFTER 'MOLETOM';
ALTER TYPE "Categoria" ADD VALUE 'CASACO' AFTER 'JAQUETA';
ALTER TYPE "Categoria" ADD VALUE 'COLETE' AFTER 'BLAZER';
ALTER TYPE "Categoria" ADD VALUE 'MACACAO' AFTER 'VESTIDO';
ALTER TYPE "Categoria" ADD VALUE 'BOTA' AFTER 'SAPATO';
ALTER TYPE "Categoria" ADD VALUE 'SANDALIA' AFTER 'BOTA';

-- Estilo: esporte fino (business casual), entre casual e social.
ALTER TYPE "Estilo" ADD VALUE 'ESPORTE_FINO' AFTER 'CASUAL';

-- Estampa: as tres mais comuns que antes caiam em ESTAMPADO.
ALTER TYPE "Estampa" ADD VALUE 'FLORAL' AFTER 'XADREZ';
ALTER TYPE "Estampa" ADD VALUE 'POA' AFTER 'FLORAL';
ALTER TYPE "Estampa" ADD VALUE 'ANIMAL_PRINT' AFTER 'POA';

-- Ocasiao: evento formal (casamento, formatura, gala) separado de festa.
ALTER TYPE "Ocasiao" ADD VALUE 'EVENTO_FORMAL' AFTER 'FESTA';

-- Material: os que se reconhecem pela foto.
ALTER TYPE "Material" ADD VALUE 'VERNIZ' AFTER 'COURO';
ALTER TYPE "Material" ADD VALUE 'CAMURCA' AFTER 'VERNIZ';
ALTER TYPE "Material" ADD VALUE 'TRICO' AFTER 'CAMURCA';
ALTER TYPE "Material" ADD VALUE 'PELO' AFTER 'TRICO';
ALTER TYPE "Material" ADD VALUE 'PAETE' AFTER 'PELO';

COMMIT;
