-- Corset separado de blusa e colete: com a amarração na frente, ele era
-- salvo como colete e o motor o punha por cima de outra blusa. As peças já
-- cadastradas passam para a categoria nova com `npm run reanalisar:pecas`.
ALTER TYPE "Categoria" ADD VALUE 'CORSET' AFTER 'BODY';
