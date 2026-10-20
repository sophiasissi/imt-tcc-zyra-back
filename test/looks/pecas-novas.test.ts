import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Intencao } from '../../src/looks/interpretar-pedido';
import { montarLook, PecaMotor, ResultadoMotor } from '../../src/looks/motor';
import { nomeDaPeca } from '../../src/looks/nome-da-peca';
import { compatibilidade } from '../../src/looks/ocasioes';

// Categorias (blusa, cropped, top, body), materiais e manga que entraram em
// 19/10/2026, a partir dos testes de cadastro da Sophia.

let proximoId = 0;

function peca(
  categoria: PecaMotor['categoria'],
  corNome: string,
  colorAddSymbol: string,
  hex: string,
  extras: Partial<PecaMotor> = {},
): PecaMotor {
  return {
    id: `n${++proximoId}`,
    categoria,
    corNome,
    colorAddSymbol,
    hex,
    estilo: 'CASUAL',
    estampa: 'LISO',
    ocasioes: ['DIA_A_DIA'],
    aquecimento: 'MEDIO',
    material: null,
    manga: null,
    ...extras,
  };
}

function intencao(extras: Partial<Intencao> = {}): Intencao {
  return {
    tipo: 'LOOK',
    ocasiao: null,
    formalidade: null,
    estilo: null,
    aquecimento: null,
    paletaNeutra: false,
    incluir: [],
    evitarCategorias: [],
    evitarCores: [],
    pergunta: null,
    naoMapeado: [],
    trocar: [],
    ...extras,
  };
}

function look(resultado: ResultadoMotor) {
  assert.equal(resultado.status, 'LOOK', JSON.stringify(resultado));
  return resultado as Extract<ResultadoMotor, { status: 'LOOK' }>;
}

describe('nomeDaPeca', () => {
  it('põe o tecido nas peças de baixo', () => {
    assert.equal(nomeDaPeca({ categoria: 'CALCA', material: 'JEANS' }), 'Calça jeans');
    assert.equal(nomeDaPeca({ categoria: 'CALCA', material: 'MOLETOM' }), 'Calça de moletom');
    assert.equal(nomeDaPeca({ categoria: 'SHORT', material: 'SOFT' }), 'Short de soft');
    assert.equal(nomeDaPeca({ categoria: 'CALCA', material: null }), 'Calça');
  });

  it('nas outras peças, só jeans e couro', () => {
    assert.equal(nomeDaPeca({ categoria: 'JAQUETA', material: 'COURO' }), 'Jaqueta de couro');
    assert.equal(nomeDaPeca({ categoria: 'JAQUETA', material: 'MOLETOM' }), 'Casaco de moletom');
    assert.equal(nomeDaPeca({ categoria: 'JAQUETA', material: null }), 'Jaqueta');
    assert.equal(nomeDaPeca({ categoria: 'BLUSA', material: 'VISCOSE' }), 'Blusa');
    assert.equal(nomeDaPeca({ categoria: 'MOLETOM', material: 'MOLETOM' }), 'Moletom');
  });

  it('diz a manga quando não é a curta', () => {
    assert.equal(nomeDaPeca({ categoria: 'CAMISETA', manga: 'LONGA' }), 'Camiseta manga longa');
    assert.equal(nomeDaPeca({ categoria: 'CAMISETA', manga: 'SEM_MANGA' }), 'Regata');
    assert.equal(nomeDaPeca({ categoria: 'BODY', manga: 'LONGA' }), 'Body manga longa');
    assert.equal(nomeDaPeca({ categoria: 'BLUSA', manga: 'CURTA' }), 'Blusa');
    assert.equal(nomeDaPeca({ categoria: 'TOP', manga: 'SEM_MANGA' }), 'Top');
  });
});

describe('ocasiões das peças novas', () => {
  const cropped = peca('CROPPED', 'Preto', 'COLORADD_PRETO', '#1A1A1A');
  const top = peca('TOP', 'Preto', 'COLORADD_PRETO', '#1A1A1A', {
    ocasioes: ['ACADEMIA'],
    estilo: 'ESPORTIVO',
  });
  const calcaSoft = peca('CALCA', 'Cinza Escuro', 'COLORADD_CINZA_ESCURO', '#555555', {
    material: 'SOFT',
    ocasioes: ['CASA', 'DIA_A_DIA'],
  });
  const calcaAlfaiataria = peca('CALCA', 'Preto', 'COLORADD_PRETO', '#1A1A1A', {
    material: 'ALFAIATARIA',
    ocasioes: ['TRABALHO'],
  });
  const moletom = peca('MOLETOM', 'Azul Claro', 'COLORADD_AZUL_CLARO', '#AFC6DA', {
    material: 'MOLETOM',
  });

  it('cropped e top não vão ao trabalho', () => {
    assert.equal(compatibilidade(cropped, 'TRABALHO'), 'PROIBIDA');
    assert.equal(compatibilidade(top, 'TRABALHO'), 'PROIBIDA');
    assert.equal(compatibilidade(top, 'ACADEMIA'), 'ADEQUADA');
  });

  it('soft é de casa', () => {
    assert.equal(compatibilidade(calcaSoft, 'CASA'), 'ADEQUADA');
    assert.equal(compatibilidade(calcaSoft, 'TRABALHO'), 'PROIBIDA');
    assert.equal(compatibilidade(calcaSoft, 'FESTA'), 'PROIBIDA');
    assert.equal(compatibilidade(calcaSoft, 'ACADEMIA'), 'PROIBIDA');
  });

  it('alfaiataria não vai à academia, e moletom não vai à praia', () => {
    assert.equal(compatibilidade(calcaAlfaiataria, 'ACADEMIA'), 'PROIBIDA');
    assert.equal(compatibilidade(moletom, 'PRAIA'), 'PROIBIDA');
  });
});

describe('motor com as peças novas', () => {
  const blusaPreta = peca('BLUSA', 'Preto', 'COLORADD_PRETO', '#1A1A1A', { manga: 'LONGA' });
  const camisetaPreta = peca('CAMISETA', 'Preto', 'COLORADD_PRETO', '#1A1A1A', {
    manga: 'CURTA',
  });
  const regataBranca = peca('CAMISETA', 'Branco', 'COLORADD_BRANCO', '#F2F2F2', {
    manga: 'SEM_MANGA',
  });
  const bodyBranco = peca('BODY', 'Branco', 'COLORADD_BRANCO', '#F2F2F2', {
    manga: 'LONGA',
    material: 'POLIAMIDA',
  });
  const croppedBege = peca('CROPPED', 'Castanho Claro', 'COLORADD_CASTANHO_CLARO', '#D9C4A0');
  const calcaSoft = peca('CALCA', 'Cinza Escuro', 'COLORADD_CINZA_ESCURO', '#555555', {
    material: 'SOFT',
    ocasioes: ['CASA'],
  });
  const calcaJeans = peca('CALCA', 'Azul', 'COLORADD_AZUL', '#3B5B85', { material: 'JEANS' });
  const saiaPreta = peca('SAIA', 'Preto', 'COLORADD_PRETO', '#1A1A1A');
  const shortJeans = peca('SHORT', 'Azul Claro', 'COLORADD_AZUL_CLARO', '#9DB4CC', {
    material: 'JEANS',
  });
  const calcaMoletom = peca('CALCA', 'Azul Claro', 'COLORADD_AZUL_CLARO', '#AFC6DA', {
    material: 'MOLETOM',
  });

  const armarioSemBlusa = [
    camisetaPreta,
    regataBranca,
    bodyBranco,
    croppedBege,
    peca('CAMISA', 'Azul', 'COLORADD_AZUL', '#2F5DA8'),
    calcaSoft,
    calcaJeans,
    saiaPreta,
    shortJeans,
    calcaMoletom,
  ];

  it('"minha blusa preta" acha a camiseta preta quando não há blusa', () => {
    const r = look(
      montarLook(
        armarioSemBlusa,
        intencao({
          incluir: [{ categoria: 'BLUSA', cor: { familia: 'PRETO', tom: null }, material: null }],
        }),
        { aleatorio: () => 0 },
      ),
    );
    assert.ok(r.pecas.some((p) => p.id === camisetaPreta.id));
  });

  it('com blusa preta no armário, usa a blusa', () => {
    const r = look(
      montarLook(
        [...armarioSemBlusa, blusaPreta],
        intencao({
          incluir: [{ categoria: 'BLUSA', cor: { familia: 'PRETO', tom: null }, material: null }],
        }),
        { aleatorio: () => 0 },
      ),
    );
    assert.ok(r.pecas.some((p) => p.id === blusaPreta.id));
  });

  it('a calça de soft não sai com jeans', () => {
    for (let i = 0; i < 20; i++) {
      const r = look(
        montarLook(
          armarioSemBlusa,
          intencao({
            incluir: [{ categoria: 'CALCA', cor: null, material: 'SOFT' }],
          }),
          { aleatorio: () => i / 20 },
        ),
      );
      assert.ok(r.pecas.some((p) => p.id === calcaSoft.id));
      assert.ok(!r.pecas.some((p) => [calcaJeans.id, shortJeans.id].includes(p.id)));
    }
  });

  it('no calor, prefere regata a manga longa', () => {
    const r = look(
      montarLook(armarioSemBlusa, intencao({ aquecimento: 'LEVE' }), { aleatorio: () => 0 }),
    );
    assert.ok(!r.pecas.some((p) => p.id === bodyBranco.id));
  });

  it('descreve com o nome completo da peça', () => {
    const r = look(
      montarLook(
        armarioSemBlusa,
        intencao({
          incluir: [
            { categoria: 'CALCA', cor: null, material: 'MOLETOM' },
            { categoria: 'BODY', cor: null, material: null },
          ],
        }),
        { aleatorio: () => 0 },
      ),
    );
    assert.match(r.descricao, /Body manga longa Branco/);
    assert.match(r.descricao, /Calça de moletom Azul Clara/);
  });

  it('"meu moletom azul" acha o casaco de moletom', () => {
    const casacoAzul = peca('JAQUETA', 'Azul Claro', 'COLORADD_AZUL_CLARO', '#AFC6DA', {
      material: 'MOLETOM',
    });
    const r = look(
      montarLook(
        [...armarioSemBlusa, casacoAzul],
        intencao({
          incluir: [{ categoria: 'MOLETOM', cor: { familia: 'AZUL', tom: null }, material: null }],
        }),
        { aleatorio: () => 0 },
      ),
    );
    assert.ok(r.pecas.some((p) => p.id === casacoAzul.id));
  });

  it('concorda a cor com o nome: casaco é masculino, regata é feminino', () => {
    const casaco = peca('JAQUETA', 'Branco', 'COLORADD_BRANCO', '#F2F2F2', {
      material: 'MOLETOM',
    });
    const r = look(
      montarLook(
        [...armarioSemBlusa, casaco],
        intencao({
          incluir: [
            { categoria: 'JAQUETA', cor: null, material: null },
            { categoria: 'CAMISETA', cor: { familia: 'BRANCO', tom: null }, material: null },
          ],
        }),
        { aleatorio: () => 0 },
      ),
    );
    assert.match(r.descricao, /Casaco de moletom Branco/);
    assert.match(r.descricao, /Regata Branca/);
  });
});
