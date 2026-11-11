import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  avisoDeArCondicionado,
  comprimentoPedido,
  falaDeAtividadeFisica,
  falaDeChuva,
  falaDeFrioForte,
  horarioDoEvento,
  lugarFechado,
  ocasiaoDoTexto,
  pedeConforto,
  pecasParaRemover,
  periodoDoEvento,
} from '../../src/looks/conversa';
import { fazFrioForte } from '../../src/looks/clima';
import { Intencao } from '../../src/looks/interpretar-pedido';
import { montarLook, PecaMotor, ResultadoMotor } from '../../src/looks/motor';
import { nomeDaPeca } from '../../src/looks/nome-da-peca';
import { formamConjunto, temConjunto } from '../../src/looks/conjunto';
import { compatibilidade, eAlfaiataria, notaDeOcasiao } from '../../src/looks/ocasioes';

// Testes da Sophia em 06/11/2026, relatados em 10/11: o look "Passeio no
// shopping" veio com a camiseta dry-fit da Nike, uma calça de alfaiataria
// salva como "casual de viscose" e tênis de treino; o "Dia de descanso", com
// uma polo de trabalho, uma calça cargo estampada e tênis de treino.

let proximoId = 0;

function peca(categoria: PecaMotor['categoria'], extras: Partial<PecaMotor> = {}): PecaMotor {
  return {
    id: `t${++proximoId}`,
    categoria,
    corNome: 'Preto',
    colorAddSymbol: 'COLORADD_PRETO',
    hex: '#151515',
    estilo: 'CASUAL',
    estampa: 'LISO',
    ocasioes: ['DIA_A_DIA'],
    aquecimento: 'MEDIO',
    material: 'MALHA',
    manga: 'CURTA',
    decotada: false,
    cano: null,
    salto: null,
    curta: null,
    alfaiataria: false,
    colarinho: false,
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

// Armário parecido com o da Sophia.
const camisetaNike = peca('CAMISETA', {
  estilo: 'ESPORTIVO',
  material: 'POLIAMIDA',
  ocasioes: ['ACADEMIA'],
});
const tenisDeTreino = peca('TENIS', {
  estilo: 'ESPORTIVO',
  material: 'POLIAMIDA',
  ocasioes: ['ACADEMIA'],
  manga: null,
});
const leggingDeTreino = peca('CALCA', {
  estilo: 'ESPORTIVO',
  material: 'POLIAMIDA',
  ocasioes: ['ACADEMIA'],
  manga: null,
});
const calcaDeAlfaiatariaViscose = peca('CALCA', {
  material: 'VISCOSE',
  alfaiataria: true,
  ocasioes: ['DIA_A_DIA', 'TRABALHO'],
  manga: null,
});
const polo = peca('CAMISETA', {
  estilo: 'BASICO',
  colarinho: true,
  ocasioes: ['DIA_A_DIA', 'TRABALHO'],
});
const calcaCargo = peca('CALCA', { material: null, estampa: 'ESTAMPADO', manga: null });
const camisetaBasica = peca('CAMISETA', {
  corNome: 'Branco',
  colorAddSymbol: 'COLORADD_BRANCO',
  hex: '#F2F2F2',
});
const camisetaCinza = peca('CAMISETA', {
  corNome: 'Cinza Claro',
  colorAddSymbol: 'COLORADD_CINZA_CLARO',
  hex: '#BBBBBB',
});
const calcaJeans = peca('CALCA', {
  material: 'JEANS',
  corNome: 'Azul',
  colorAddSymbol: 'COLORADD_AZUL',
  hex: '#3B5B85',
  manga: null,
});
const calcaDeMoletom = peca('CALCA', {
  material: 'MOLETOM',
  ocasioes: ['DIA_A_DIA', 'CASA'],
  manga: null,
  corNome: 'Cinza Claro',
  colorAddSymbol: 'COLORADD_CINZA_CLARO',
  hex: '#BBBBBB',
});
const shortDePijama = peca('SHORT', { material: 'MALHA', ocasioes: ['CASA'], manga: null });
const regataDePijama = peca('CAMISETA', { manga: 'SEM_MANGA', decotada: true, ocasioes: ['CASA'] });
const blusaDecotada = peca('BLUSA', { material: 'VISCOSE', decotada: true });
const tenisCasual = peca('TENIS', {
  material: 'COURO',
  corNome: 'Branco',
  colorAddSymbol: 'COLORADD_BRANCO',
  hex: '#F5F5F5',
  manga: null,
});
const chinelo = peca('CHINELO', { material: null, ocasioes: ['CASA', 'PRAIA'], manga: null });

const armario = [
  camisetaNike,
  tenisDeTreino,
  leggingDeTreino,
  calcaDeAlfaiatariaViscose,
  polo,
  calcaCargo,
  camisetaBasica,
  camisetaCinza,
  calcaJeans,
  calcaDeMoletom,
  shortDePijama,
  regataDePijama,
  blusaDecotada,
  tenisCasual,
];

const ids = (r: ResultadoMotor) => (r.status === 'LOOK' ? r.pecas.map((p) => p.id) : []);

describe('roupa de treino só na atividade física', () => {
  it('fica fora do passeio e de casa, e entra na academia', () => {
    assert.equal(compatibilidade(camisetaNike, 'DIA_A_DIA'), 'PROIBIDA');
    assert.equal(compatibilidade(tenisDeTreino, 'DIA_A_DIA'), 'PROIBIDA');
    assert.equal(compatibilidade(camisetaNike, 'CASA'), 'PROIBIDA');
    assert.equal(compatibilidade(camisetaNike, 'ACADEMIA'), 'ADEQUADA');
  });

  it('o look de shopping nunca traz peça de treino', () => {
    for (let i = 0; i < 40; i++) {
      const r = montarLook(armario, intencao({ ocasiao: 'DIA_A_DIA' }));
      assert.equal(r.status, 'LOOK');
      for (const id of ids(r)) {
        assert.ok(![camisetaNike.id, tenisDeTreino.id, leggingDeTreino.id].includes(id));
      }
    }
  });

  it('a camiseta de treino pedida pelo nome não vai com a calça de alfaiataria', () => {
    for (let i = 0; i < 20; i++) {
      const r = montarLook(
        armario,
        intencao({ incluir: [{ categoria: 'CAMISETA', cor: null, material: 'POLIAMIDA' }] }),
      );
      assert.ok(ids(r).includes(camisetaNike.id));
      assert.ok(!ids(r).includes(calcaDeAlfaiatariaViscose.id));
    }
  });
});

describe('alfaiataria é o corte, não a fibra', () => {
  it('o campo novo manda; sem ele, vale o tecido antigo', () => {
    assert.equal(eAlfaiataria({ material: 'VISCOSE', alfaiataria: true }), true);
    assert.equal(eAlfaiataria({ material: 'ALFAIATARIA', alfaiataria: false }), false);
    assert.equal(eAlfaiataria({ material: 'ALFAIATARIA', alfaiataria: null }), true);
    assert.equal(eAlfaiataria({ material: 'VISCOSE' }), false);
  });

  it('no trabalho, a calça de alfaiataria de viscose vale mais que a de viscose', () => {
    const deViscose = { ...calcaDeAlfaiatariaViscose, alfaiataria: false };
    assert.ok(
      notaDeOcasiao(calcaDeAlfaiatariaViscose, 'TRABALHO') > notaDeOcasiao(deViscose, 'TRABALHO'),
    );
  });

  it('o nome é "Calça de alfaiataria", sem a fibra', () => {
    assert.equal(nomeDaPeca(calcaDeAlfaiatariaViscose), 'Calça de alfaiataria');
    // Calça cargo salva com o tecido ALFAIATARIA antes de 10/11/2026.
    assert.equal(
      nomeDaPeca({ categoria: 'CALCA', material: 'ALFAIATARIA', alfaiataria: false }),
      'Calça',
    );
    assert.equal(
      nomeDaPeca({ categoria: 'BLAZER', material: 'VISCOSE', alfaiataria: true }),
      'Blazer',
    );
  });

  it('a camiseta com colarinho é a camisa polo', () => {
    assert.equal(nomeDaPeca(polo), 'Camisa polo');
    assert.equal(nomeDaPeca({ ...polo, manga: 'LONGA' }), 'Camisa polo manga longa');
  });
});

describe('ficar em casa', () => {
  it('sem colarinho, decote, tecido desconhecido, jeans ou calçado de rua', () => {
    assert.equal(compatibilidade(polo, 'CASA'), 'PROIBIDA');
    assert.equal(compatibilidade(blusaDecotada, 'CASA'), 'PROIBIDA');
    assert.equal(compatibilidade(calcaCargo, 'CASA'), 'PROIBIDA');
    assert.equal(compatibilidade(calcaJeans, 'CASA'), 'PROIBIDA');
    assert.equal(compatibilidade(calcaDeAlfaiatariaViscose, 'CASA'), 'PROIBIDA');
    assert.equal(compatibilidade(tenisCasual, 'CASA'), 'PROIBIDA');
  });

  it('moletom, malha e pijama entram (a regata do pijama mesmo com alcinha)', () => {
    assert.equal(compatibilidade(calcaDeMoletom, 'CASA'), 'ADEQUADA');
    assert.equal(compatibilidade(camisetaBasica, 'CASA'), 'ACEITAVEL');
    assert.equal(compatibilidade(regataDePijama, 'CASA'), 'ADEQUADA');
    assert.equal(compatibilidade(chinelo, 'CASA'), 'ADEQUADA');
    const casacoDeMoletom = peca('JAQUETA', { material: 'MOLETOM' });
    const jaquetaJeans = peca('JAQUETA', { material: 'JEANS' });
    assert.equal(compatibilidade(casacoDeMoletom, 'CASA'), 'ACEITAVEL');
    assert.equal(compatibilidade(jaquetaJeans, 'CASA'), 'PROIBIDA');
  });

  it('o look de descanso sai macio e, sem chinelo, sem calçado', () => {
    for (let i = 0; i < 20; i++) {
      const r = montarLook(armario, intencao({ ocasiao: 'CASA' }));
      assert.equal(r.status, 'LOOK');
      if (r.status !== 'LOOK') return;
      for (const id of ids(r)) {
        assert.ok(
          [
            camisetaBasica.id,
            camisetaCinza.id,
            calcaDeMoletom.id,
            shortDePijama.id,
            regataDePijama.id,
          ].includes(id),
          `peça fora de casa: ${id}`,
        );
      }
      assert.ok(r.avisos.some((a) => /chinelo, pantufa ou pé descalço/.test(a)));
    }
  });

  it('soft só em casa', () => {
    const pijamaDeSoft = peca('CALCA', { material: 'SOFT', ocasioes: ['DIA_A_DIA', 'CASA'] });
    assert.equal(compatibilidade(pijamaDeSoft, 'DIA_A_DIA'), 'PROIBIDA');
    assert.equal(compatibilidade(pijamaDeSoft, 'CASA'), 'ADEQUADA');
  });
});

describe('festa de dia ou à noite', () => {
  const blusaPrateada = peca('BLUSA', {
    colorAddSymbol: 'COLORADD_PRATEADO',
    material: 'CETIM',
    ocasioes: ['FESTA'],
  });
  const blusaDeLinho = peca('BLUSA', { material: 'LINHO', ocasioes: ['FESTA'] });

  it('de dia, o brilho perde e o linho ganha; à noite, o contrário', () => {
    const dia = { periodo: 'DIA' as const };
    const noite = { periodo: 'NOITE' as const };
    assert.ok(
      notaDeOcasiao(blusaDeLinho, 'FESTA', dia) > notaDeOcasiao(blusaPrateada, 'FESTA', dia),
    );
    assert.ok(
      notaDeOcasiao(blusaPrateada, 'FESTA', noite) > notaDeOcasiao(blusaDeLinho, 'FESTA', noite),
    );
  });
});

describe('chuva', () => {
  it('com chuva, o tênis ganha da sandália', () => {
    const sandalia = peca('SANDALIA', {
      material: 'COURO',
      manga: null,
      corNome: 'Branco',
      colorAddSymbol: 'COLORADD_BRANCO',
      hex: '#F5F5F5',
    });
    const pecas = [
      camisetaBasica,
      camisetaCinza,
      calcaJeans,
      calcaDeMoletom,
      tenisCasual,
      sandalia,
      ...armario.slice(0, 1),
    ];
    // Completa o mínimo de 5 de cima e 5 de baixo.
    const extras = [
      peca('CAMISETA'),
      peca('CAMISETA'),
      peca('CAMISETA'),
      peca('CALCA', { material: 'JEANS', manga: null }),
      peca('CALCA', { material: 'JEANS', manga: null }),
      peca('SHORT', { material: 'JEANS', manga: null }),
    ];
    // Desempate fixo: sem chuva, a sandália empata com o tênis.
    const opcoes = { aleatorio: () => 0.5 };
    const r = montarLook([...pecas, ...extras], intencao({ ocasiao: 'DIA_A_DIA' }), {
      ...opcoes,
      chuva: true,
    });
    assert.equal(r.status, 'LOOK');
    assert.ok(!ids(r).includes(sandalia.id));
  });
});

describe('conversa: atividade, período, lugar e chuva', () => {
  it('reconhece atividade física', () => {
    for (const texto of [
      'vou correr no parque',
      'look pra trilha',
      'quero andar de bicicleta',
      'aula de pilates',
    ]) {
      assert.ok(falaDeAtividadeFisica(texto), texto);
    }
    for (const texto of ['passear no shopping', 'look para trabalhar', 'festa de aniversário']) {
      assert.ok(!falaDeAtividadeFisica(texto), texto);
    }
  });

  it('lê se o evento é de dia ou à noite, e não confunde "amanhã" nem "dia a dia"', () => {
    assert.equal(periodoDoEvento('casamento de dia no sábado', []), 'DIA');
    assert.equal(periodoDoEvento('festa à noite', []), 'NOITE');
    assert.equal(periodoDoEvento('almoço de aniversário', []), 'DIA');
    assert.equal(periodoDoEvento('jantar da empresa', []), 'NOITE');
    assert.equal(periodoDoEvento('festa amanhã', []), null);
    assert.equal(periodoDoEvento('festa no dia 15', []), null);
    assert.equal(
      periodoDoEvento('à noite', [{ autor: 'usuario', texto: 'tenho uma festa sábado' }]),
      'NOITE',
    );
    assert.equal(
      periodoDoEvento('quero outro', [{ autor: 'usuario', texto: 'festa de tarde' }]),
      'DIA',
    );
  });

  it('acha o lugar fechado e escreve o aviso do ar-condicionado', () => {
    assert.equal(lugarFechado('vou passear no shopping'), 'shopping');
    assert.equal(lugarFechado('vou ao parque'), null);
    assert.match(avisoDeArCondicionado('shopping'), /^No shopping, o ar-condicionado/);
  });

  it('entende quando a pessoa diz que vai chover', () => {
    assert.ok(falaDeChuva('vai chover amanhã, quero um look'));
    assert.ok(!falaDeChuva('não vai chover'));
  });
});

// Look de cinema de 10/11/2026: body cinza escuro + calça jeans + tênis, com
// o colete azul claro de alfaiataria por cima, como "camada leve".
describe('colete e conjuntos', () => {
  const coleteAzul = peca('COLETE', {
    estilo: 'SOCIAL',
    material: 'LINHO',
    alfaiataria: true,
    manga: 'SEM_MANGA',
    ocasioes: ['DIA_A_DIA', 'TRABALHO'],
    corNome: 'Azul Claro',
    colorAddSymbol: 'COLORADD_AZUL_CLARO',
    hex: '#8DB3E2',
  });
  const calcaAzulDeAlfaiataria = peca('CALCA', {
    material: 'VISCOSE',
    alfaiataria: true,
    manga: null,
    ocasioes: ['DIA_A_DIA', 'TRABALHO'],
    corNome: 'Azul Claro',
    colorAddSymbol: 'COLORADD_AZUL_CLARO',
    hex: '#8DB3E2',
  });
  const bodyCinza = peca('BODY', {
    material: 'POLIAMIDA',
    manga: 'LONGA',
    ocasioes: ['DIA_A_DIA', 'TRABALHO'],
    corNome: 'Cinza Escuro',
    colorAddSymbol: 'COLORADD_CINZA_ESCURO',
    hex: '#4A4A4A',
  });
  const armarioDoCinema = [...armario, coleteAzul, calcaAzulDeAlfaiataria, bodyCinza];

  it('o colete de alfaiataria fica fora do passeio e nunca entra como agasalho', () => {
    assert.equal(compatibilidade(coleteAzul, 'DIA_A_DIA'), 'PROIBIDA');
    for (let i = 0; i < 30; i++) {
      const r = montarLook(
        armarioDoCinema,
        intencao({ ocasiao: 'DIA_A_DIA', aquecimento: 'MEDIO' }),
        {
          camadaLeve: true,
        },
      );
      assert.ok(!ids(r).includes(coleteAzul.id));
    }
  });

  it('no trabalho, o colete vai por cima só do body', () => {
    for (let i = 0; i < 30; i++) {
      const r = montarLook(
        armarioDoCinema,
        intencao({ ocasiao: 'TRABALHO', aquecimento: 'MEDIO' }),
      );
      if (r.status !== 'LOOK') continue;
      const camada = r.pecas.find((p) => p.papel === 'SOBREPOSICAO');
      if (camada?.id === coleteAzul.id) assert.ok(ids(r).includes(bodyCinza.id));
    }
  });

  it('reconhece o conjunto pela cor, pelo tecido (ou alfaiataria) e pela estampa', () => {
    assert.ok(formamConjunto(coleteAzul, calcaAzulDeAlfaiataria));
    // Outra cor ou outro tom: não.
    assert.ok(
      !formamConjunto(coleteAzul, { ...calcaAzulDeAlfaiataria, colorAddSymbol: 'COLORADD_AZUL' }),
    );
    // Mesma cor, sem alfaiataria e tecido diferente: não.
    assert.ok(!formamConjunto(coleteAzul, { ...calcaAzulDeAlfaiataria, alfaiataria: false }));
    // Camiseta básica preta com calça de malha preta é coincidência.
    const camisetaPreta = peca('CAMISETA', { estilo: 'CASUAL', material: 'MALHA' });
    const calcaPretaDeMalha = peca('CALCA', { material: 'MALHA', manga: null });
    assert.ok(!formamConjunto(camisetaPreta, calcaPretaDeMalha));
    // Corset e saia de couro pretos: conjunto.
    const corset = peca('CORSET', { material: 'COURO', manga: 'SEM_MANGA' });
    const saiaDeCouro = peca('SAIA', { material: 'COURO', manga: null });
    assert.ok(formamConjunto(corset, saiaDeCouro));
    assert.ok(temConjunto([corset, saiaDeCouro, tenisCasual]));
  });

  it('no trabalho, o conjunto aparece com mais frequência que sem o bônus', () => {
    let comConjunto = 0;
    for (let i = 0; i < 200; i++) {
      const r = montarLook(
        armarioDoCinema,
        intencao({ ocasiao: 'TRABALHO', aquecimento: 'MEDIO' }),
      );
      const escolhidas = ids(r);
      if (escolhidas.includes(coleteAzul.id) && escolhidas.includes(calcaAzulDeAlfaiataria.id)) {
        comConjunto++;
      }
    }
    assert.ok(comConjunto > 0, 'o conjunto nunca saiu');
  });
});

describe('horário do evento', () => {
  const nome = (texto: string) => horarioDoEvento(texto, [])?.nome ?? null;

  it('lê manhã, tarde, noite e as combinações', () => {
    assert.equal(nome('trabalho amanhã de manhã'), 'De manhã');
    assert.equal(nome('almoço de família'), 'À tarde');
    assert.equal(nome('sábado tarde'), 'À tarde');
    assert.equal(nome('jantar sexta'), 'À noite');
    assert.equal(nome('casamento de dia'), 'Durante o dia');
    assert.equal(nome('da tarde até a noite'), 'Da tarde à noite');
    assert.deepEqual(horarioDoEvento('festa à noite', []), {
      partes: ['NOITE'],
      inicio: 18,
      fim: 24,
      nome: 'À noite',
    });
  });

  it('não confunde "amanhã", "mais tarde", "boa noite" nem "dia a dia"', () => {
    assert.equal(nome('trabalho amanhã'), null);
    assert.equal(nome('vou sair mais tarde'), null);
    assert.equal(nome('boa noite! look pro trabalho'), null);
    assert.equal(nome('look do dia a dia'), null);
  });

  it('"agora" é a parte do dia de agora, no horário do Brasil', () => {
    // 15h UTC = 12h em Brasília.
    const meioDia = new Date('2026-11-10T15:00:00Z');
    assert.equal(horarioDoEvento('vou sair agora', [], meioDia)?.nome, 'À tarde');
  });
});

// Cinema à noite com 16 a 18 °C (10/11/2026): veio saia + top + agasalho.
describe('perna de fora no fresco e equilíbrio do look', () => {
  const minissaia = peca('SAIA', { material: 'VISCOSE', curta: true, manga: null });
  const top = peca('TOP', { material: 'POLIAMIDA', manga: 'SEM_MANGA' });
  const cropped = peca('CROPPED', { material: 'MALHA', manga: 'CURTA' });
  const armarioCurto = [...armario, minissaia, top, cropped];
  const comMinissaiaETop = (r: ResultadoMotor) =>
    ids(r).includes(minissaia.id) && (ids(r).includes(top.id) || ids(r).includes(cropped.id));

  it('no fresco, a minissaia perde para a calça', () => {
    for (let i = 0; i < 30; i++) {
      const r = montarLook(armarioCurto, intencao({ ocasiao: 'DIA_A_DIA', aquecimento: 'MEDIO' }), {
        camadaLeve: true,
      });
      assert.ok(!ids(r).includes(minissaia.id));
    }
  });

  it('no passeio, top ou cropped não vai com minissaia', () => {
    for (let i = 0; i < 40; i++) {
      const r = montarLook(
        armarioCurto,
        intencao({
          ocasiao: 'DIA_A_DIA',
          aquecimento: 'MEDIO',
          incluir: [{ categoria: 'SAIA', cor: null, material: null }],
        }),
      );
      assert.ok(!comMinissaiaETop(r));
    }
  });

  it('no calor e na festa, pode mostrar as duas partes', () => {
    const pedidos = [
      intencao({
        ocasiao: 'DIA_A_DIA',
        aquecimento: 'LEVE',
        incluir: [
          { categoria: 'SAIA', cor: null, material: null },
          { categoria: 'TOP', cor: null, material: null },
        ],
      }),
      intencao({
        ocasiao: 'FESTA',
        incluir: [
          { categoria: 'SAIA', cor: null, material: null },
          { categoria: 'TOP', cor: null, material: null },
        ],
      }),
    ];
    for (const pedido of pedidos) {
      const r = montarLook(armarioCurto, pedido);
      assert.equal(r.status, 'LOOK');
    }
  });
});

describe('ocasião dita no texto', () => {
  it('reconhece a ocasião sem acento e sem confundir palavras parecidas', () => {
    assert.equal(ocasiaoDoTexto('trabalho amanhã'), 'TRABALHO');
    assert.equal(ocasiaoDoTexto('tenho reunião às 10'), 'TRABALHO');
    assert.equal(ocasiaoDoTexto('aniversário da minha mãe'), 'FESTA');
    assert.equal(ocasiaoDoTexto('vou ficar em casa'), 'CASA');
    assert.equal(ocasiaoDoTexto('passear no shopping'), 'DIA_A_DIA');
    assert.equal(ocasiaoDoTexto('casamento sábado'), 'FESTA');
    assert.equal(ocasiaoDoTexto('tenho um evento amanhã'), null);
  });
});

// "Look confortável para uma viagem de carro longa" (10/11/2026): veio cropped
// de couro, calça de couro de alfaiataria e casaco de tricô, e o conjunto de
// moletom ficou de fora.
describe('pedido de conforto', () => {
  const azulClaro = {
    corNome: 'Azul Claro',
    colorAddSymbol: 'COLORADD_AZUL_CLARO',
    hex: '#8DB3E2',
  };
  const casacoDeMoletom = peca('JAQUETA', {
    material: 'MOLETOM',
    estampa: 'LOGO',
    aquecimento: 'QUENTE',
    manga: 'LONGA',
    ...azulClaro,
  });
  const calcaDeMoletom = peca('CALCA', {
    material: 'MOLETOM',
    aquecimento: 'QUENTE',
    manga: null,
    ...azulClaro,
  });
  const croppedDeCouro = peca('CROPPED', { material: 'COURO' });
  const calcaDeCouro = peca('CALCA', { material: 'COURO', alfaiataria: true, manga: null });
  const armarioDaViagem = [
    ...armario,
    casacoDeMoletom,
    calcaDeMoletom,
    croppedDeCouro,
    calcaDeCouro,
  ];

  it('vem o conjunto de moletom, sem couro nem alfaiataria', () => {
    for (let i = 0; i < 20; i++) {
      const r = montarLook(
        armarioDaViagem,
        intencao({ ocasiao: 'DIA_A_DIA', aquecimento: 'MEDIO' }),
        {
          camadaLeve: true,
          conforto: true,
        },
      );
      const escolhidas = ids(r);
      assert.ok(escolhidas.includes(casacoDeMoletom.id) && escolhidas.includes(calcaDeMoletom.id));
      for (const id of [croppedDeCouro.id, calcaDeCouro.id, calcaDeAlfaiatariaViscose.id]) {
        assert.ok(!escolhidas.includes(id));
      }
    }
  });

  it('o casaco com logo e a calça lisa da mesma cor e tecido são conjunto', () => {
    assert.ok(formamConjunto(casacoDeMoletom, calcaDeMoletom));
  });

  it('a calça de couro com corte de alfaiataria se chama "Calça de couro"', () => {
    assert.equal(nomeDaPeca(calcaDeCouro), 'Calça de couro');
  });

  it('reconhece o pedido de conforto e a viagem', () => {
    assert.ok(pedeConforto('Look confortável para uma viagem de carro longa'));
    assert.ok(pedeConforto('vou pegar a estrada amanhã'));
    assert.ok(!pedeConforto('look pra trabalhar'));
    assert.equal(ocasiaoDoTexto('viagem de carro'), 'DIA_A_DIA');
  });
});

// "Look para trabalhar, mas quero usar meu colete" (10/11/2026): veio um
// colete como blusa e outro por cima.
describe('pedido de um colete', () => {
  const colete = (cor: string, simbolo: string) =>
    peca('COLETE', {
      estilo: 'SOCIAL',
      material: 'ALFAIATARIA',
      alfaiataria: true,
      manga: 'SEM_MANGA',
      ocasioes: ['DIA_A_DIA', 'TRABALHO'],
      corNome: cor,
      colorAddSymbol: simbolo,
    });
  const coletes = [
    colete('Branco', 'COLORADD_BRANCO'),
    colete('Preto', 'COLORADD_PRETO'),
    colete('Castanho Claro', 'COLORADD_CASTANHO_CLARO'),
  ];
  const body = peca('BODY', {
    material: 'POLIAMIDA',
    manga: 'LONGA',
    ocasioes: ['DIA_A_DIA', 'TRABALHO'],
  });
  const sapato = peca('SAPATO', { material: 'COURO', manga: null, ocasioes: ['TRABALHO'] });

  it('vem um colete só, como blusa ou por cima do body', () => {
    for (let i = 0; i < 40; i++) {
      const r = montarLook(
        [...armario, ...coletes, body, sapato],
        intencao({
          ocasiao: 'TRABALHO',
          incluir: [{ categoria: 'COLETE', cor: null, material: null }],
        }),
      );
      assert.equal(r.status, 'LOOK');
      const escolhidas = ids(r);
      assert.equal(escolhidas.filter((id) => coletes.some((c) => c.id === id)).length, 1);
    }
  });

  it('"meu colete" não vai por cima de camisa; pedindo a camisa também, vai', () => {
    const camisa = peca('CAMISA', {
      estilo: 'SOCIAL',
      material: 'VISCOSE',
      manga: 'LONGA',
      ocasioes: ['TRABALHO'],
    });
    const pecas = [...armario, ...coletes, body, sapato, camisa];
    const soColete = intencao({
      ocasiao: 'TRABALHO',
      incluir: [{ categoria: 'COLETE', cor: null, material: null }],
    });
    for (let i = 0; i < 30; i++) {
      assert.ok(!ids(montarLook(pecas, soColete)).includes(camisa.id));
    }
    const comCamisa = intencao({
      ocasiao: 'TRABALHO',
      incluir: [
        { categoria: 'COLETE', cor: null, material: null },
        { categoria: 'CAMISA', cor: null, material: null },
      ],
    });
    const r = montarLook(pecas, comCamisa);
    assert.equal(r.status, 'LOOK');
    assert.ok(ids(r).includes(camisa.id));
  });
});

// "Jantar romântico hoje à noite", 16 a 19 °C (10/11/2026): veio camiseta
// básica com logo + jaqueta grossa + jeans estampado + tênis.
describe('jantar romântico e casaco grosso', () => {
  const camisetaComLogo = peca('CAMISETA', { estilo: 'BASICO', estampa: 'LOGO' });
  const blusaElegante = peca('BLUSA', { estilo: 'ELEGANTE', material: 'CETIM', manga: 'LONGA' });
  const saiaMidi = peca('SAIA', { material: 'VISCOSE', curta: false, manga: null });
  const sapatoDeSalto = peca('SAPATO', {
    estilo: 'ELEGANTE',
    material: 'COURO',
    salto: true,
    manga: null,
  });
  const jaquetaGrossa = peca('JAQUETA', {
    material: 'CETIM',
    aquecimento: 'QUENTE',
    manga: 'LONGA',
  });
  const casacoLeve = peca('JAQUETA', { material: 'MALHA', aquecimento: 'MEDIO', manga: 'LONGA' });
  const pecas = [
    ...armario,
    camisetaComLogo,
    blusaElegante,
    saiaMidi,
    sapatoDeSalto,
    jaquetaGrossa,
    casacoLeve,
  ];
  const jantar = intencao({ ocasiao: 'DIA_A_DIA', formalidade: 'MEDIA', aquecimento: 'MEDIO' });

  it('vem peça arrumada e sapato, sem camiseta com logo nem tênis', () => {
    for (let i = 0; i < 30; i++) {
      const r = montarLook(pecas, jantar, { encontro: true, camadaLeve: true });
      const escolhidas = ids(r);
      assert.ok(!escolhidas.includes(camisetaComLogo.id));
      assert.ok(!escolhidas.includes(tenisCasual.id));
      assert.ok(escolhidas.includes(sapatoDeSalto.id));
    }
  });

  it('no ameno, o casaco leve ganha do grosso', () => {
    for (let i = 0; i < 30; i++) {
      const r = montarLook(pecas, jantar, { encontro: true, camadaLeve: true });
      assert.ok(!ids(r).includes(jaquetaGrossa.id));
    }
  });
});

// Casaco pesado só com 13 °C ou menos (pedido da Sophia, 10/11/2026).
describe('casaco pesado', () => {
  const puffer = peca('JAQUETA', {
    material: 'CETIM',
    aquecimento: 'QUENTE',
    manga: 'LONGA',
    casacoPesado: true,
  });
  const jaquetaDeCouro = peca('JAQUETA', {
    material: 'COURO',
    aquecimento: 'QUENTE',
    manga: 'LONGA',
    casacoPesado: false,
  });
  const pecas = [...armario, puffer, jaquetaDeCouro];
  const camada = (r: ResultadoMotor) =>
    r.status === 'LOOK' ? r.pecas.find((p) => p.papel === 'SOBREPOSICAO')?.id : undefined;

  it('fora do frio forte, o puffer não entra; a jaqueta de couro sim', () => {
    for (const aquecimento of ['MEDIO', 'QUENTE'] as const) {
      for (let i = 0; i < 30; i++) {
        const r = montarLook(pecas, intencao({ ocasiao: 'DIA_A_DIA', aquecimento }), {
          camadaLeve: true,
        });
        assert.notEqual(camada(r), puffer.id, aquecimento);
      }
    }
  });

  it('com frio forte, o puffer é o casaco preferido', () => {
    let comPuffer = 0;
    for (let i = 0; i < 40; i++) {
      const r = montarLook(pecas, intencao({ ocasiao: 'DIA_A_DIA', aquecimento: 'QUENTE' }), {
        frioForte: true,
      });
      if (camada(r) === puffer.id) comPuffer++;
    }
    assert.ok(comPuffer > 20, `puffer em ${comPuffer}/40`);
  });

  it('pedido pelo nome, entra em qualquer clima', () => {
    const r = montarLook(
      pecas,
      intencao({
        ocasiao: 'DIA_A_DIA',
        aquecimento: 'MEDIO',
        incluir: [{ categoria: 'JAQUETA', cor: null, material: 'CETIM' }],
      }),
    );
    assert.equal(camada(r), puffer.id);
  });

  it('frio forte: 13 °C ou menos na média, ou "muito frio" na mensagem', () => {
    const dia = { diasAPartirDeHoje: 0, minima: 8, maxima: 18, chanceDeChuva: null };
    assert.ok(fazFrioForte(dia));
    assert.ok(!fazFrioForte({ ...dia, minima: 10, maxima: 20 }));
    assert.ok(
      !fazFrioForte({
        ...dia,
        horario: { nome: 'À tarde', minima: 15, maxima: 18, chanceDeChuva: null },
      }),
    );
    assert.ok(falaDeFrioForte('vai fazer muito frio amanhã'));
    assert.ok(!falaDeFrioForte('tá um friozinho'));
  });
});

// Suéter separado do moletom (10/11/2026).
describe('suéter', () => {
  const sueter = peca('SUETER', {
    material: 'TRICO',
    estampa: 'LISTRADO',
    aquecimento: 'QUENTE',
    manga: 'LONGA',
  });

  it('se chama "Suéter" e é peça de cima', () => {
    assert.equal(nomeDaPeca(sueter), 'Suéter');
    const r = montarLook(
      [...armario, sueter],
      intencao({
        aquecimento: 'QUENTE',
        incluir: [{ categoria: 'SUETER', cor: null, material: null }],
      }),
    );
    assert.equal(r.status, 'LOOK');
    if (r.status === 'LOOK') {
      assert.ok(
        r.pecas.some((p) => p.id === sueter.id && ['SUPERIOR', 'SOBREPOSICAO'].includes(p.papel)),
      );
    }
  });

  it('"meu suéter" e "pulôver" são suéter', () => {
    assert.deepEqual(pecasParaRemover('tira o suéter'), ['SUETER']);
    assert.deepEqual(pecasParaRemover('não quero o pulôver'), ['SUETER']);
  });
});

// "Troque a saia, quero uma mais curta" (10/11/2026): veio outra saia longa.
describe('comprimento da saia', () => {
  const blusa = peca('BLUSA', { material: 'VISCOSE', manga: 'LONGA' });
  const saiaLonga = peca('SAIA', { material: 'VISCOSE', curta: false, manga: null });
  const outraLonga = peca('SAIA', { material: 'CETIM', curta: false, manga: null });
  const saiaCurta = peca('SAIA', { material: 'COURO', curta: true, manga: null });
  const pecas = [...armario, blusa, saiaLonga, outraLonga, saiaCurta];

  it('lê curta e longa, sem confundir com manga ou cano', () => {
    assert.equal(comprimentoPedido('troque a saia, quero uma mais curta'), 'CURTA');
    assert.equal(comprimentoPedido('quero uma minissaia'), 'CURTA');
    assert.equal(comprimentoPedido('vestido longo'), 'LONGA');
    assert.equal(comprimentoPedido('saia midi'), 'LONGA');
    assert.equal(comprimentoPedido('blusa de manga longa'), null);
    assert.equal(comprimentoPedido('bota de cano curto'), null);
  });

  it('na troca, vem a saia curta', () => {
    for (let i = 0; i < 20; i++) {
      const r = montarLook(
        pecas,
        intencao({
          trocar: ['BAIXO'],
          incluir: [{ categoria: 'SAIA', cor: null, material: null }],
        }),
        { pecasAnteriores: [blusa.id, saiaLonga.id, tenisCasual.id], comprimento: 'CURTA' },
      );
      assert.ok(ids(r).includes(saiaCurta.id));
      assert.ok(!ids(r).includes(outraLonga.id));
    }
  });

  it('sem saia do comprimento pedido, avisa qual faltou', () => {
    const r = montarLook(
      [...armario, blusa, saiaLonga, outraLonga],
      intencao({ trocar: ['BAIXO'], incluir: [{ categoria: 'SAIA', cor: null, material: null }] }),
      { pecasAnteriores: [blusa.id, saiaLonga.id, tenisCasual.id], comprimento: 'CURTA' },
    );
    const avisos = r.status === 'POUCAS_PECAS' ? [] : r.avisos;
    assert.ok(
      avisos.some((a) => a.startsWith('Não achei saia curta')),
      avisos.join(' | '),
    );
  });
});
