import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Intencao } from '../../src/looks/interpretar-pedido';
import { montarLook, PecaMotor, ResultadoMotor } from '../../src/looks/motor';
import { compatibilidade, notaDeOcasiao } from '../../src/looks/ocasioes';

// Regras de 23/10/2026: tecido e decote por ocasião, clima e cobertura dos braços.
// O armário imita o da Sophia, que testou o chat com roupas femininas.

let proximoId = 0;

function peca(
  categoria: PecaMotor['categoria'],
  corNome: string,
  colorAddSymbol: string,
  hex: string,
  extras: Partial<PecaMotor> = {},
): PecaMotor {
  return {
    id: `r${++proximoId}`,
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
    decotada: null,
    cano: null,
    salto: null,
    curta: null,
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

const PRETO = ['Preto', 'COLORADD_PRETO', '#151515'] as const;
const BRANCO = ['Branco', 'COLORADD_BRANCO', '#F2F2F2'] as const;

// A blusa do erro de 23/10: chiffon com decote em V e babado, marcada para trabalho.
const blusaDecotada = peca('BLUSA', ...PRETO, {
  estilo: 'ELEGANTE',
  ocasioes: ['DIA_A_DIA', 'FESTA', 'TRABALHO'],
  aquecimento: 'LEVE',
  material: 'VISCOSE',
  manga: 'CURTA',
  decotada: true,
});
const blusaSemManga = peca('BLUSA', 'Azul Escuro', 'COLORADD_AZUL_ESCURO', '#1F2A44', {
  estilo: 'ELEGANTE',
  ocasioes: ['DIA_A_DIA', 'TRABALHO'],
  material: 'ALFAIATARIA',
  manga: 'SEM_MANGA',
});
const blusaManguinha = peca('BLUSA', ...BRANCO, {
  estilo: 'BASICO',
  ocasioes: ['DIA_A_DIA', 'TRABALHO'],
  aquecimento: 'LEVE',
  material: 'MALHA',
  manga: 'CURTA',
});
const blusaPrateada = peca('BLUSA', 'Prateado', 'COLORADD_PRATEADO', '#7B7A76', {
  estilo: 'ELEGANTE',
  ocasioes: ['DIA_A_DIA', 'FESTA'],
  aquecimento: 'LEVE',
  material: 'CETIM',
  manga: 'SEM_MANGA',
});
const croppedBranco = peca('CROPPED', ...BRANCO, {
  ocasioes: ['DIA_A_DIA', 'TRABALHO'],
  material: 'MALHA',
  manga: 'LONGA',
});
const topTreino = peca('TOP', ...PRETO, {
  estilo: 'ESPORTIVO',
  ocasioes: ['ACADEMIA'],
  aquecimento: 'LEVE',
  material: 'POLIAMIDA',
  manga: 'SEM_MANGA',
});
const bodyBasico = peca('BODY', ...BRANCO, {
  estilo: 'BASICO',
  ocasioes: ['DIA_A_DIA', 'ACADEMIA'],
  aquecimento: 'LEVE',
  material: 'POLIAMIDA',
  manga: 'CURTA',
});
const colete = peca('COLETE', 'Cinza Escuro', 'COLORADD_CINZA_ESCURO', '#3A3A3A', {
  estilo: 'SOCIAL',
  ocasioes: ['DIA_A_DIA', 'TRABALHO'],
  aquecimento: 'QUENTE',
  material: 'ALFAIATARIA',
  manga: 'SEM_MANGA',
});
const blazer = peca('BLAZER', ...PRETO, {
  estilo: 'SOCIAL',
  ocasioes: ['TRABALHO'],
  material: 'ALFAIATARIA',
  manga: 'LONGA',
});
const calcaAlfaiataria = peca('CALCA', ...BRANCO, {
  estilo: 'SOCIAL',
  ocasioes: ['DIA_A_DIA', 'TRABALHO'],
  material: 'ALFAIATARIA',
});
const jeans = peca('CALCA', 'Azul', 'COLORADD_AZUL', '#3B5B8C', {
  ocasioes: ['DIA_A_DIA', 'TRABALHO'],
  material: 'JEANS',
});
const leggingTreino = peca('CALCA', ...PRETO, {
  estilo: 'ESPORTIVO',
  ocasioes: ['ACADEMIA'],
  material: 'POLIAMIDA',
});
const saiaViscose = peca('SAIA', ...BRANCO, {
  ocasioes: ['DIA_A_DIA', 'PRAIA'],
  aquecimento: 'LEVE',
  material: 'VISCOSE',
});
const shortJeans = peca('SHORT', 'Azul Escuro', 'COLORADD_AZUL_ESCURO', '#22304A', {
  aquecimento: 'LEVE',
  material: 'JEANS',
});
const scarpin = peca('SAPATO', ...PRETO, {
  estilo: 'ELEGANTE',
  ocasioes: ['TRABALHO', 'FESTA'],
  material: 'COURO',
});
const tenisCouro = peca('TENIS', ...BRANCO, {
  ocasioes: ['DIA_A_DIA', 'TRABALHO'],
  material: 'COURO',
});
const tenisTreino = peca('TENIS', ...PRETO, {
  estilo: 'ESPORTIVO',
  ocasioes: ['ACADEMIA'],
  material: 'POLIAMIDA',
});

const armario = [
  blusaDecotada,
  blusaSemManga,
  blusaManguinha,
  blusaPrateada,
  croppedBranco,
  topTreino,
  bodyBasico,
  colete,
  blazer,
  calcaAlfaiataria,
  jeans,
  leggingTreino,
  saiaViscose,
  shortJeans,
  scarpin,
  tenisCouro,
  tenisTreino,
];

function pecasDe(resultado: ResultadoMotor, base = armario) {
  assert.equal(resultado.status, 'LOOK', JSON.stringify(resultado));
  if (resultado.status !== 'LOOK') return [];
  return resultado.pecas.map((p) => ({ ...base.find((a) => a.id === p.id)!, papel: p.papel }));
}

/** Roda o motor com várias sementes do sorteio, para a regra valer em todos os looks possíveis. */
function emTodosOsSorteios(
  base: PecaMotor[],
  pedido: Intencao,
  regra: (look: ReturnType<typeof pecasDe>) => void,
) {
  for (let i = 0; i < 10; i++)
    regra(pecasDe(montarLook(base, pedido, { aleatorio: () => i / 10 }), base));
}

const temCamadaComManga = (look: ReturnType<typeof pecasDe>) =>
  look.some((p) => p.papel === 'SOBREPOSICAO' && p.manga !== 'SEM_MANGA');

describe('trabalho', () => {
  it('proíbe peça decotada, curta, de festa ou de casa', () => {
    const proibidas = [
      blusaDecotada,
      croppedBranco,
      topTreino,
      shortJeans,
      saiaViscose,
      blusaPrateada,
      peca('CALCA', ...PRETO, { material: 'CETIM', ocasioes: ['FESTA'] }),
      peca('SAIA', ...PRETO, { material: 'COURO', ocasioes: ['DIA_A_DIA'] }),
      peca('MOLETOM', ...PRETO, { material: 'MOLETOM', ocasioes: ['DIA_A_DIA', 'TRABALHO'] }),
    ];
    for (const p of proibidas) {
      assert.equal(compatibilidade(p, 'TRABALHO'), 'PROIBIDA', `${p.categoria} ${p.material}`);
    }
  });

  it('aceita alfaiataria, jeans, blusa de cetim, saia de alfaiataria e jaqueta de couro', () => {
    const aceitas = [
      calcaAlfaiataria,
      jeans,
      peca('BLUSA', ...BRANCO, { material: 'CETIM', estilo: 'SOCIAL', ocasioes: ['TRABALHO'] }),
      peca('SAIA', ...PRETO, { material: 'ALFAIATARIA', ocasioes: ['DIA_A_DIA'], curta: false }),
      peca('JAQUETA', ...PRETO, { material: 'COURO', ocasioes: ['DIA_A_DIA'] }),
    ];
    for (const p of aceitas) {
      assert.notEqual(compatibilidade(p, 'TRABALHO'), 'PROIBIDA', `${p.categoria} ${p.material}`);
    }
  });

  it('pedido formal: só alfaiataria e social, com sapato', () => {
    const formal = { formalidade: 'ALTA' } as const;
    assert.equal(compatibilidade(jeans, 'TRABALHO', formal), 'PROIBIDA');
    assert.equal(compatibilidade(tenisCouro, 'TRABALHO', formal), 'PROIBIDA');
    assert.equal(compatibilidade(blusaManguinha, 'TRABALHO', formal), 'PROIBIDA');
    assert.notEqual(compatibilidade(calcaAlfaiataria, 'TRABALHO', formal), 'PROIBIDA');
    assert.notEqual(compatibilidade(scarpin, 'TRABALHO', formal), 'PROIBIDA');
    assert.notEqual(compatibilidade(blazer, 'TRABALHO', formal), 'PROIBIDA');

    emTodosOsSorteios(armario, intencao({ ocasiao: 'TRABALHO', formalidade: 'ALTA' }), (look) => {
      assert.ok(look.every((p) => p.material !== 'JEANS' && p.categoria !== 'TENIS'));
    });
  });

  it('nunca usa a blusa decotada, e a sem manga só vai com camada de manga (o colete não cobre)', () => {
    emTodosOsSorteios(armario, intencao({ ocasiao: 'TRABALHO' }), (look) => {
      assert.ok(!look.some((p) => p.id === blusaDecotada.id));
      if (look.some((p) => p.id === blusaSemManga.id)) assert.ok(temCamadaComManga(look));
    });

    // Sem blazer, a blusa sem manga sai do trabalho de vez.
    const semBlazer = armario.filter((p) => p !== blazer);
    emTodosOsSorteios(semBlazer, intencao({ ocasiao: 'TRABALHO' }), (look) => {
      assert.ok(!look.some((p) => p.id === blusaSemManga.id));
    });
  });
});

describe('trabalho: colete e saia (bug de 23/10/2026)', () => {
  // "Quero um look para trabalhar" saiu com dois coletes (um salvo como blusa,
  // outro como jaqueta) e a minissaia de alfaiataria.
  const coleteBranco = peca('COLETE', ...BRANCO, {
    estilo: 'SOCIAL',
    ocasioes: ['DIA_A_DIA', 'TRABALHO'],
    material: 'ALFAIATARIA',
    manga: 'SEM_MANGA',
  });
  const minissaia = peca('SAIA', ...PRETO, {
    estilo: 'SOCIAL',
    ocasioes: ['DIA_A_DIA', 'TRABALHO', 'FESTA'],
    material: 'ALFAIATARIA',
    curta: true,
  });
  const saiaMidi = peca('SAIA', ...PRETO, {
    estilo: 'SOCIAL',
    ocasioes: ['TRABALHO'],
    material: 'ALFAIATARIA',
    curta: false,
  });
  const base = [...armario, coleteBranco, minissaia];

  it('minissaia e saia sem comprimento conhecido ficam fora; a midi entra', () => {
    assert.equal(compatibilidade(minissaia, 'TRABALHO'), 'PROIBIDA');
    assert.equal(compatibilidade({ ...minissaia, curta: null }, 'TRABALHO'), 'PROIBIDA');
    assert.notEqual(compatibilidade(saiaMidi, 'TRABALHO'), 'PROIBIDA');
    assert.equal(
      compatibilidade({ ...saiaMidi, categoria: 'VESTIDO', curta: true }, 'TRABALHO'),
      'PROIBIDA',
    );
  });

  it('nunca usa dois coletes, nem a minissaia', () => {
    for (const extras of [{}, { aquecimento: 'QUENTE' }, { formalidade: 'ALTA' }] as const) {
      emTodosOsSorteios(base, intencao({ ocasiao: 'TRABALHO', ...extras }), (look) => {
        assert.ok(look.filter((p) => p.categoria === 'COLETE').length <= 1);
        assert.ok(!look.some((p) => p.id === minissaia.id));
      });
    }
  });

  it('o colete não cobre a blusa sem manga', () => {
    const soColete = base.filter((p) => p !== blazer);
    emTodosOsSorteios(soColete, intencao({ ocasiao: 'TRABALHO' }), (look) => {
      if (look.some((p) => p.id === blusaSemManga.id)) assert.ok(temCamadaComManga(look));
    });
  });
});

describe('frio', () => {
  it('nunca usa short, e manga curta ou sem manga só com camada de manga', () => {
    for (const ocasiao of [null, 'DIA_A_DIA', 'TRABALHO', 'FESTA'] as const) {
      emTodosOsSorteios(armario, intencao({ ocasiao, aquecimento: 'QUENTE' }), (look) => {
        assert.ok(!look.some((p) => p.categoria === 'SHORT'), `short em ${ocasiao}`);
        const bracoDeFora = look.some(
          (p) => p.papel === 'SUPERIOR' && (p.manga === 'CURTA' || p.manga === 'SEM_MANGA'),
        );
        if (bracoDeFora) assert.ok(temCamadaComManga(look), `braço de fora em ${ocasiao}`);
      });
    }
  });

  it('o short pedido pelo usuário ainda entra', () => {
    const pedido = intencao({
      aquecimento: 'QUENTE',
      incluir: [{ categoria: 'SHORT', cor: null, material: null }],
    });
    assert.ok(pecasDe(montarLook(armario, pedido)).some((p) => p.id === shortJeans.id));
  });
});

describe('academia', () => {
  it('só tecido de treino: nada de viscose, alfaiataria, jeans ou body de sair', () => {
    for (const p of [blusaSemManga, calcaAlfaiataria, jeans, bodyBasico, saiaViscose, tenisCouro]) {
      assert.equal(compatibilidade(p, 'ACADEMIA'), 'PROIBIDA', `${p.categoria} ${p.material}`);
    }
    emTodosOsSorteios(armario, intencao({ ocasiao: 'ACADEMIA' }), (look) => {
      assert.ok(look.every((p) => p.material === 'POLIAMIDA' || p.material === 'MALHA'));
    });
  });

  it('moletom só no frio', () => {
    const casacoMoletom = peca('JAQUETA', ...PRETO, { material: 'MOLETOM', manga: 'LONGA' });
    assert.equal(compatibilidade(casacoMoletom, 'ACADEMIA'), 'PROIBIDA');
    assert.equal(
      compatibilidade(casacoMoletom, 'ACADEMIA', { aquecimento: 'QUENTE' }),
      'ACEITAVEL',
    );
  });

  it('prefere poliamida à malha de algodão', () => {
    const camisetaAlgodao = peca('CAMISETA', ...BRANCO, {
      estilo: 'ESPORTIVO',
      ocasioes: ['ACADEMIA'],
      material: 'MALHA',
      manga: 'CURTA',
    });
    const camisetaPoliamida = {
      ...camisetaAlgodao,
      id: 'poliamida',
      material: 'POLIAMIDA' as const,
    };
    assert.ok(
      notaDeOcasiao(camisetaPoliamida, 'ACADEMIA') > notaDeOcasiao(camisetaAlgodao, 'ACADEMIA'),
    );
  });
});

describe('festa', () => {
  it('prefere brilho e cetim, e a peça prateada não quebra o motor', () => {
    emTodosOsSorteios(armario, intencao({ ocasiao: 'FESTA', aquecimento: 'LEVE' }), (look) => {
      assert.ok(look.some((p) => p.id === blusaPrateada.id || p.id === blusaDecotada.id));
    });
  });
});

describe('troca de uma parte do look', () => {
  // Bug de 23/10/2026: top prateado + saia preta + salto; "não quero salto"
  // trocou o salto por tênis e acrescentou uma jaqueta de couro marrom.
  const saiaPreta = peca('SAIA', ...PRETO, {
    estilo: 'BASICO',
    ocasioes: ['DIA_A_DIA', 'TRABALHO', 'FESTA'],
    material: 'ALFAIATARIA',
  });
  const jaquetaMarrom = peca('JAQUETA', 'Castanho', 'COLORADD_CASTANHO', '#6B4226', {
    ocasioes: ['DIA_A_DIA', 'TRABALHO'],
    aquecimento: 'QUENTE',
    material: 'COURO',
    manga: 'LONGA',
  });
  const base = [...armario, saiaPreta, jaquetaMarrom];
  const anterior = [blusaPrateada.id, saiaPreta.id, scarpin.id];

  for (const [contexto, extras] of [
    ['no frio', { aquecimento: 'QUENTE' }],
    ['em pedido formal', { formalidade: 'ALTA' }],
  ] as const) {
    it(`"não quero salto" ${contexto} troca só o calçado, sem acrescentar camada`, () => {
      const pedido = intencao({
        ocasiao: 'FESTA',
        evitarCategorias: ['SAPATO'],
        trocar: ['CALCADO'],
        ...extras,
      });
      for (let i = 0; i < 10; i++) {
        const look = pecasDe(
          montarLook(base, pedido, { pecasAnteriores: anterior, aleatorio: () => i / 10 }),
          base,
        );
        assert.deepEqual(
          look.filter((p) => p.papel !== 'CALCADO').map((p) => p.id),
          [blusaPrateada.id, saiaPreta.id],
        );
        assert.equal(look.find((p) => p.papel === 'CALCADO')?.categoria, 'TENIS');
      }
    });
  }

  it('a camada do look anterior continua quando só o calçado muda', () => {
    const pedido = intencao({ ocasiao: 'FESTA', trocar: ['CALCADO'], aquecimento: 'QUENTE' });
    const look = pecasDe(
      montarLook(base, pedido, { pecasAnteriores: [...anterior, jaquetaMarrom.id] }),
      base,
    );
    assert.ok(look.some((p) => p.id === jaquetaMarrom.id));
  });
});

describe('trabalho: colete por cima de body', () => {
  // Preto: com colete cinza, calça branca e scarpin preto, fecha em 3 cores.
  const bodyManguinha = peca('BODY', ...PRETO, {
    estilo: 'BASICO',
    ocasioes: ['DIA_A_DIA', 'TRABALHO'],
    material: 'POLIAMIDA',
    manga: 'CURTA',
  });

  it('no formal, body liso de manga curta vale como peça de cima', () => {
    assert.notEqual(
      compatibilidade(bodyManguinha, 'TRABALHO', { formalidade: 'ALTA' }),
      'PROIBIDA',
    );
  });

  // Pedido da Sophia (05/11/2026): no trabalho, "colete e calça" ou "camisa e
  // calça"; o colete não precisa de camisa embaixo e não sai toda vez.
  const camisaBranca = peca('CAMISA', ...BRANCO, {
    estilo: 'SOCIAL',
    ocasioes: ['TRABALHO'],
    material: 'ALFAIATARIA',
    manga: 'LONGA',
  });
  const base = [...armario.filter((p) => p !== blazer), bodyManguinha, camisaBranca];
  const looksDeTrabalho = () =>
    Array.from({ length: 20 }, (_, i) =>
      pecasDe(
        montarLook(base, intencao({ ocasiao: 'TRABALHO' }), { aleatorio: () => i / 20 }),
        base,
      ),
    );

  it('o colete sai sozinho, como blusa: colete + calça', () => {
    const sozinho = looksDeTrabalho().filter(
      (look) =>
        look.some((p) => p.id === colete.id && p.papel === 'SUPERIOR') &&
        !look.some((p) => p.id !== colete.id && p.papel === 'SUPERIOR'),
    );
    assert.ok(sozinho.length > 0, 'nenhum look com o colete sozinho');
  });

  it('o colete nunca vai por cima de camisa ou blusa (só de body)', () => {
    for (const look of looksDeTrabalho()) {
      const coleteCamada = look.some((p) => p.id === colete.id && p.papel === 'SOBREPOSICAO');
      if (coleteCamada)
        assert.ok(
          look.some((p) => p.categoria === 'BODY'),
          JSON.stringify(look),
        );
    }
  });

  it('nem todo look de trabalho tem colete', () => {
    const semColete = looksDeTrabalho().filter((look) => !look.some((p) => p.id === colete.id));
    assert.ok(semColete.length > 0);
  });
});

describe('look de uma cor e regra das 3 cores (23/10/2026)', () => {
  const AZUL_CLARO = ['Azul Claro', 'COLORADD_AZUL_CLARO', '#9CC3E6'] as const;
  const casacoMoletomAzul = peca('JAQUETA', ...AZUL_CLARO, {
    aquecimento: 'QUENTE',
    material: 'MOLETOM',
    manga: 'LONGA',
  });
  const calcaMoletomAzul = peca('CALCA', ...AZUL_CLARO, {
    aquecimento: 'QUENTE',
    material: 'MOLETOM',
  });
  const camisetaAzulClara = peca('CAMISETA', ...AZUL_CLARO, { material: 'MALHA', manga: 'CURTA' });
  const calcaAzulEscura = peca('CALCA', 'Azul Escuro', 'COLORADD_AZUL_ESCURO', '#1F2A44');
  const camisetaVerde = peca('CAMISETA', 'Verde', 'COLORADD_VERDE', '#3A7D44', { manga: 'CURTA' });
  const tenisAmarelo = peca('TENIS', 'Amarelo', 'COLORADD_AMARELO', '#E8C547');
  const base = [
    ...armario,
    casacoMoletomAzul,
    calcaMoletomAzul,
    camisetaAzulClara,
    calcaAzulEscura,
    camisetaVerde,
    tenisAmarelo,
  ];
  const corDe = (p: PecaMotor) => p.colorAddSymbol;

  it('"look azul claro": exatamente duas peças do mesmo tom, sem terceira azul, resto neutro', () => {
    const pedido = intencao({ umaCor: true, corDoLook: { familia: 'AZUL', tom: 'CLARO' } });
    emTodosOsSorteios(base, pedido, (look) => {
      const azuisClaras = look.filter((p) => corDe(p) === 'COLORADD_AZUL_CLARO');
      assert.equal(azuisClaras.length, 2, look.map((p) => p.corNome).join(', '));
      assert.ok(azuisClaras.every((p) => p.papel !== 'CALCADO'));
      const resto = look.filter((p) => !azuisClaras.includes(p));
      assert.ok(
        resto.every((p) => !corDe(p).includes('AZUL')),
        'nenhuma outra peça azul',
      );
      assert.ok(
        resto.every((p) => /PRETO|BRANCO|CINZA|CASTANHO/.test(corDe(p))),
        'o resto é neutro',
      );
    });
  });

  it('"conjunto de moletom" junta casaco e calça de moletom da mesma cor', () => {
    const pedido = intencao({
      umaCor: true,
      incluir: [{ categoria: null, cor: null, material: 'MOLETOM' }],
    });
    emTodosOsSorteios(base, pedido, (look) => {
      assert.ok(look.some((p) => p.id === casacoMoletomAzul.id));
      assert.ok(look.some((p) => p.id === calcaMoletomAzul.id));
    });
  });

  it('sem duas peças do mesmo tom, avisa em vez de montar outro look', () => {
    const r = montarLook(
      base,
      intencao({ umaCor: true, corDoLook: { familia: 'VERMELHO', tom: null } }),
    );
    assert.equal(r.status, 'SEM_LOOK');
    assert.match(r.status === 'SEM_LOOK' ? r.mensagem : '', /duas peças do mesmo tom de vermelho/);
  });

  it('nenhum look comum passa de 3 cores quando dá para evitar', () => {
    for (const ocasiao of [null, 'DIA_A_DIA', 'FESTA'] as const) {
      emTodosOsSorteios(base, intencao({ ocasiao }), (look) => {
        const familias = new Set(
          look.map((p) => corDe(p).replace(/^COLORADD_|_(CLARO|ESCURO)$/g, '')),
        );
        assert.ok(familias.size <= 3, look.map((p) => p.corNome).join(', '));
      });
    }
  });
});
