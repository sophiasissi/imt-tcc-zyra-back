import { Aquecimento, Cano, Categoria, Estilo, Material, Ocasiao, Peca } from '@prisma/client';

import { Formalidade, PAPEL_DA_CATEGORIA } from './taxonomia';

/**
 * Se uma peça serve para a ocasião pedida.
 *
 * - ADEQUADA: a análise marcou a peça para essa ocasião.
 * - ACEITAVEL: não foi marcada, mas é uma escolha razoável (ex.: peça de dia a
 *   dia numa festa). Entra no look sem aviso.
 * - PROIBIDA: nunca entra (ex.: calça jeans na academia, chinelo na festa).
 *
 * A análise quase nunca marca FESTA, e às vezes não marca TRABALHO; por isso
 * as peças de dia a dia são aceitáveis nessas ocasiões.
 *
 * Regras revisadas em 23/10/2026 a partir de guias de dress code e de tecidos
 * para treino (as fontes estão no CLAUDE.md):
 * - trabalho: nada curto, decotado, transparente ou de festa (cropped, top, short, saia
 *   casual, brilho, cetim fora da blusa, couro fora da camada e do calçado,
 *   moletom, veludo, soft). Alfaiataria primeiro; jeans é aceitável. Pedido
 *   formal: só alfaiataria e peças sociais, com sapato.
 * - festa: brilho, cetim, couro e veludo primeiro; nada esportivo ou de casa.
 * - academia: tecido sintético que seca rápido (poliamida); malha de algodão
 *   só se não houver outra; moletom só no frio; tênis esportivo.
 * - bota (05/11/2026): pelo cano, veja NOTA_DA_BOTA; nenhuma bota no trabalho
 *   (pedido da Sophia).
 * - salto (05/11/2026): fora do passeio do dia a dia; no motor (`temSalto`).
 * - 10/11/2026: roupa de treino só na atividade física (`eDeTreino`);
 *   alfaiataria pelo corte, de qualquer fibra (`eAlfaiataria`); em casa, só
 *   tecido macio e nada estruturado (`compatibilidadeEmCasa`); soft só em
 *   casa; festa de dia com tecido leve e pouco brilho (`NOTA_DA_FESTA_DE_DIA`).
 * A peça sem manga no trabalho e o clima dependem do look inteiro e ficam no motor.
 */
export type Compatibilidade = 'ADEQUADA' | 'ACEITAVEL' | 'PROIBIDA';

type PecaOcasiao = Pick<
  Peca,
  | 'categoria'
  | 'estilo'
  | 'ocasioes'
  | 'aquecimento'
  | 'material'
  | 'manga'
  | 'estampa'
  | 'colorAddSymbol'
  | 'decotada'
  | 'curta'
  | 'cano'
  | 'salto'
> &
  // Opcionais: as peças analisadas antes de 10/11/2026 (e os testes antigos) não têm.
  Partial<Pick<Peca, 'alfaiataria' | 'colarinho'>>;

/** Festa de dia (casamento ao ar livre, almoço) ou à noite (balada, jantar). */
export type Periodo = 'DIA' | 'NOITE';

/** O que mais do pedido muda as regras da ocasião. */
export type ContextoOcasiao = {
  formalidade?: Formalidade | null;
  aquecimento?: Aquecimento | null;
  periodo?: Periodo | null;
};

const FORMAIS: Estilo[] = ['SOCIAL', 'ELEGANTE'];

/**
 * Corte de alfaiataria (vinco, cós estruturado, bolso faca), de qualquer
 * fibra. Alfaiataria é o corte, não o tecido (10/11/2026): a calça de
 * alfaiataria de viscose da Sophia estava salva como "casual de viscose" e saiu
 * num look de shopping com camiseta de treino. Sem o campo (peça analisada
 * antes de 10/11/2026), vale o material ALFAIATARIA; com ele, o campo manda
 * (a calça cargo de sarja da Sophia estava com o tecido ALFAIATARIA).
 */
export function eAlfaiataria(peca: Pick<Peca, 'material'> & Partial<Pick<Peca, 'alfaiataria'>>) {
  if (typeof peca.alfaiataria === 'boolean') return peca.alfaiataria;
  return peca.material === 'ALFAIATARIA';
}

/**
 * Roupa de treino (10/11/2026, pedido da Sophia): a camiseta dry-fit, o short
 * de corrida e o tênis de treino são para suar, e só vão para a atividade
 * física (academia, corrida, trilha, parque). Fora dela, nunca: nem no
 * passeio, nem em casa.
 */
const eDeTreino = (peca: PecaOcasiao) => peca.estilo === 'ESPORTIVO';

/**
 * Colete de alfaiataria ou social: compõe o look de trabalho (e de festa, como
 * o colete de cetim com a saia de cetim). No passeio, não (10/11/2026: o colete
 * azul de alfaiataria saiu num look de cinema). O colete casual (jeans,
 * puffer) continua no dia a dia.
 */
const coleteDeTrabalho = (peca: PecaOcasiao) =>
  peca.categoria === 'COLETE' &&
  (eAlfaiataria(peca) || (peca.estilo !== null && FORMAIS.includes(peca.estilo)));

/**
 * Chinelo, babuche e afins. A categoria CHINELO sempre conta; antes dela existir
 * (20/10/2026), o chinelo era salvo como sapato e só se reconhecia pelas
 * ocasiões: calçado marcado para casa ou praia, e não para trabalho ou festa.
 */
function eCalcadoDeCasaOuPraia(peca: PecaOcasiao) {
  if (peca.categoria === 'CHINELO') return true;
  return (
    PAPEL_DA_CATEGORIA[peca.categoria] === 'CALCADO' &&
    peca.ocasioes.some((o) => o === 'CASA' || o === 'PRAIA') &&
    !peca.ocasioes.some((o) => o === 'TRABALHO' || o === 'FESTA')
  );
}

const PROIBIDAS_NA_ACADEMIA: Categoria[] = [
  'CAMISA',
  'CORSET',
  'BLAZER',
  'COLETE',
  'SAIA',
  'VESTIDO',
  'SAPATO',
  'BOTA',
  'SANDALIA',
  'CHINELO',
];

// Curtas demais (ou de noite, como o corset) para o escritório.
const PROIBIDAS_NO_TRABALHO: Categoria[] = ['SHORT', 'CROPPED', 'TOP', 'CORSET'];

// Tecidos de casa, de academia ou de noite, que não vão para o escritório.
const PROIBIDOS_NO_TRABALHO: Material[] = ['SOFT', 'MOLETOM', 'VELUDO'];

/**
 * Bota pelo cano (lista da Sophia, 05/11/2026):
 * - curto (chelsea, coturno, bota de salto): a mais versátil; dia a dia,
 *   trabalho (com alfaiataria) e passeio;
 * - médio (western, texana, coturno de cano médio): festival, show e rodeio,
 *   e looks casuais; não é de escritório;
 * - longo (montaria, social de salto fino): frio, trabalho formal, jantar e
 *   reunião;
 * - over the knee: balada e festa à noite no inverno; nunca no trabalho.
 * Nenhuma bota vai para a academia, a praia ou ficar em casa. Bota sem cano
 * gravado não ganha nem perde pontos.
 */
const NOTA_DA_BOTA: Partial<Record<Ocasiao, Partial<Record<Cano, number>>>> = {
  FESTA: { MEDIO: 1, LONGO: 0.5, ACIMA_DO_JOELHO: 1.5 },
  DIA_A_DIA: { CURTO: 0.5, MEDIO: 0.5, ACIMA_DO_JOELHO: -1 },
};

/**
 * Calçado de salto. Sem a informação (peça analisada antes de 05/11/2026), o
 * sapato ou a sandália social ou elegante conta como salto (scarpin); a bota
 * sem a informação, não.
 */
export function temSalto(peca: Pick<Peca, 'categoria' | 'estilo' | 'salto'>) {
  if (!['SAPATO', 'SANDALIA', 'BOTA'].includes(peca.categoria)) return false;
  if (peca.salto !== null) return peca.salto;
  return peca.categoria !== 'BOTA' && peca.estilo !== null && FORMAIS.includes(peca.estilo);
}

/** Dourado e prateado: brilho, que é de festa. */
const eMetalizada = (peca: PecaOcasiao) => /_(DOURADO|PRATEADO)$/.test(peca.colorAddSymbol);

/**
 * Peças que ficam bem no trabalho em tecido de festa: blusa de cetim (a
 * "blusa de seda" clássica), e couro na jaqueta e no calçado. Calça, saia e
 * vestido de cetim ou de couro são de noite.
 */
function tecidoDeFestaNoTrabalho(peca: PecaOcasiao) {
  const papel = PAPEL_DA_CATEGORIA[peca.categoria];
  if (peca.material === 'CETIM') return papel !== 'SUPERIOR';
  if (peca.material === 'COURO') return papel !== 'SOBREPOSICAO' && papel !== 'CALCADO';
  return false;
}

/**
 * Saia e vestido no trabalho: só com o comprimento conferido pela análise
 * (`curta` = false, do joelho para baixo). A minissaia de alfaiataria entrou
 * num look de trabalho em 23/10/2026; na dúvida (peça antiga, sem a
 * informação), fica de fora. A saia ainda precisa ser de alfaiataria ou social.
 */
function saiaOuVestidoDeTrabalho(peca: PecaOcasiao) {
  if (peca.curta !== false) return false;
  if (peca.categoria === 'VESTIDO') return true;
  return eAlfaiataria(peca) || (peca.estilo !== null && FORMAIS.includes(peca.estilo));
}

/**
 * Trabalho com pedido formal: só alfaiataria e peças sociais. Em cima, camisa
 * ou blusa social; embaixo e por cima, alfaiataria; nos pés, sapato.
 */
function serveNoTrabalhoFormal(peca: PecaOcasiao) {
  const social = peca.estilo !== null && FORMAIS.includes(peca.estilo);
  switch (PAPEL_DA_CATEGORIA[peca.categoria]) {
    case 'SUPERIOR':
      // Body ou blusa com manga (longa ou curta), lisos e sem decote, por
      // baixo da alfaiataria. Malha de camiseta não.
      return (
        peca.categoria === 'CAMISA' ||
        social ||
        ((peca.manga === 'LONGA' || peca.manga === 'CURTA') &&
          peca.estampa === 'LISO' &&
          peca.decotada !== true &&
          peca.material !== 'MALHA')
      );
    case 'SOBREPOSICAO':
      return peca.categoria === 'BLAZER' || eAlfaiataria(peca);
    case 'INFERIOR':
    case 'PECA_UNICA':
      return eAlfaiataria(peca) || peca.estilo === 'SOCIAL';
    case 'CALCADO':
      return peca.categoria === 'SAPATO' || (peca.categoria === 'SANDALIA' && social);
  }
}

// Soft é tecido de pijama e pelúcia: só em casa (10/11/2026; antes também
// entrava no dia a dia).
const SO_PARA_CASA: Material[] = ['SOFT'];

/**
 * Ficar em casa (10/11/2026, pedido da Sophia): o look "Dia de descanso" veio
 * com uma polo de trabalho, uma calça estampada de sair e tênis de treino.
 * Pelos guias de homewear, em casa vale o tecido macio e a peça folgada:
 * moletom, malha, soft, tricô, viscose e linho; nada estruturado (camisa,
 * colarinho, alfaiataria, jeans, couro), nada decotado e nada de calçado de
 * rua. O tecido desconhecido também fica de fora, a não ser que a análise
 * tenha marcado a peça para casa (pijama).
 */
const MATERIAIS_DE_CASA: Material[] = [
  'MOLETOM',
  'MALHA',
  'SOFT',
  'TRICO',
  'VISCOSE',
  'LINHO',
  'POLIAMIDA',
];
// Por cima, em casa, só agasalho macio (casaco de moletom, cardigã de tricô).
const AGASALHOS_DE_CASA: Material[] = ['MOLETOM', 'SOFT', 'TRICO', 'MALHA'];
const FORA_DE_CASA: Categoria[] = ['CAMISA', 'BLAZER', 'COLETE', 'CORSET'];
// Pijama: a análise grava só CASA. A regata de alcinha do pijama conta como
// decotada (alça fina) e mesmo assim é roupa de ficar em casa.
const ePijama = (peca: PecaOcasiao) => peca.ocasioes.length === 1 && peca.ocasioes[0] === 'CASA';

function compatibilidadeEmCasa(peca: PecaOcasiao): Compatibilidade {
  const marcada = peca.ocasioes.includes('CASA');
  if (PAPEL_DA_CATEGORIA[peca.categoria] === 'CALCADO') {
    // Chinelo, pantufa, babuche; sem eles, o look sai sem calçado.
    if (!eCalcadoDeCasaOuPraia(peca)) return 'PROIBIDA';
    return marcada ? 'ADEQUADA' : 'ACEITAVEL';
  }
  if (
    eDeTreino(peca) ||
    FORA_DE_CASA.includes(peca.categoria) ||
    peca.colarinho === true ||
    (peca.decotada === true && !ePijama(peca)) ||
    eAlfaiataria(peca) ||
    peca.material === 'JEANS' ||
    peca.material === 'COURO' ||
    (peca.estilo !== null && FORMAIS.includes(peca.estilo)) ||
    (PAPEL_DA_CATEGORIA[peca.categoria] === 'SOBREPOSICAO' && !temMaterial(peca, AGASALHOS_DE_CASA))
  ) {
    return 'PROIBIDA';
  }
  if (marcada) return 'ADEQUADA';
  return temMaterial(peca, MATERIAIS_DE_CASA) ? 'ACEITAVEL' : 'PROIBIDA';
}

// Tecidos que servem para treinar: o sintético (poliamida, que seca rápido) e
// a malha de algodão, que encharca mas ainda é comum. O moletom só no frio.
const MATERIAIS_DA_ACADEMIA: Material[] = ['POLIAMIDA', 'MALHA'];

// Peças que existem em versão de treino (body e cropped fitness, jaqueta
// corta-vento) e em versão de sair: na academia, só a de treino.
const SO_ESPORTIVAS_NA_ACADEMIA: Categoria[] = ['BLUSA', 'BODY', 'CROPPED', 'JAQUETA'];

function serveNaAcademia(peca: PecaOcasiao, aquecimento: Aquecimento | null | undefined) {
  if (PROIBIDAS_NA_ACADEMIA.includes(peca.categoria)) return false;
  if (peca.estilo && FORMAIS.includes(peca.estilo)) return false;

  const esportiva = peca.estilo === 'ESPORTIVO';
  // O casaco de moletom vale como agasalho de treino no frio.
  const agasalho = peca.categoria === 'JAQUETA' && peca.material === 'MOLETOM';
  if (SO_ESPORTIVAS_NA_ACADEMIA.includes(peca.categoria) && !esportiva && !agasalho) return false;
  // Tênis de couro é de passeio, não de treino.
  if (peca.categoria === 'TENIS') return esportiva || peca.material !== 'COURO';

  if (peca.material === null) return esportiva;
  if (peca.material === 'MOLETOM') return aquecimento === 'QUENTE';
  return MATERIAIS_DA_ACADEMIA.includes(peca.material);
}

/**
 * Corset pelo tecido (lista da Sophia, 28/10/2026, com os eventos em que cada
 * um é usado):
 * - couro, com brilho ou transparência: balada, festa e show;
 * - renda, bordado ou jeans: festa country;
 * - veludo, cetim ou renda: encontro e jantar;
 * - alfaiataria: coquetel e festa de dia;
 * - jeans: dia a dia, por cima de camiseta ou camisa;
 * - tecido nobre (cetim, veludo, alfaiataria): casamento e festa formal.
 * Não está em nenhum evento de trabalho, academia, praia ou casa.
 */
const CORSET_DE_FESTA_FORMAL: Material[] = ['CETIM', 'VELUDO', 'ALFAIATARIA'];
const NOTA_DO_CORSET: Partial<Record<Ocasiao, Partial<Record<Material, number>>>> = {
  FESTA: { COURO: 1, CETIM: 1, VELUDO: 1, ALFAIATARIA: 0.5, JEANS: -0.5 },
  DIA_A_DIA: { JEANS: 1.5, MALHA: 0.5, COURO: -1, CETIM: -1.5, VELUDO: -1.5 },
};

// Tecidos quentes demais para a praia.
const PROIBIDOS_NA_PRAIA: Material[] = ['COURO', 'MOLETOM', 'TRICO', 'SOFT', 'VELUDO'];

const temMaterial = (peca: PecaOcasiao, materiais: Material[]) =>
  peca.material !== null && materiais.includes(peca.material);

export function compatibilidade(
  peca: PecaOcasiao,
  ocasiao: Ocasiao | null,
  contexto: ContextoOcasiao = {},
): Compatibilidade {
  if (!ocasiao) return 'ACEITAVEL';

  // Soft (pijama, pelúcia) só em casa.
  if (ocasiao !== 'CASA' && temMaterial(peca, SO_PARA_CASA)) return 'PROIBIDA';

  const marcada = peca.ocasioes.includes(ocasiao);
  const semOcasiao = peca.ocasioes.length === 0;
  const diaADia = peca.ocasioes.includes('DIA_A_DIA') || semOcasiao;

  switch (ocasiao) {
    case 'ACADEMIA':
      if (!serveNaAcademia(peca, contexto.aquecimento)) return 'PROIBIDA';
      if (marcada) return 'ADEQUADA';
      // No frio, o moletom de sair também serve para ir e voltar do treino.
      return peca.estilo === 'ESPORTIVO' ||
        (peca.material === 'MOLETOM' && contexto.aquecimento === 'QUENTE')
        ? 'ACEITAVEL'
        : 'PROIBIDA';

    case 'TRABALHO':
      if (
        PROIBIDAS_NO_TRABALHO.includes(peca.categoria) ||
        peca.decotada === true ||
        temMaterial(peca, PROIBIDOS_NO_TRABALHO) ||
        tecidoDeFestaNoTrabalho(peca) ||
        eMetalizada(peca) ||
        ((peca.categoria === 'SAIA' || peca.categoria === 'VESTIDO') &&
          !saiaOuVestidoDeTrabalho(peca)) ||
        peca.estilo === 'ESPORTIVO' ||
        eCalcadoDeCasaOuPraia(peca) ||
        // Bota não vai para o trabalho (pedido da Sophia, 05/11/2026).
        peca.categoria === 'BOTA' ||
        (contexto.formalidade === 'ALTA' && !serveNoTrabalhoFormal(peca))
      ) {
        return 'PROIBIDA';
      }
      if (marcada) return 'ADEQUADA';
      return diaADia ? 'ACEITAVEL' : 'PROIBIDA';

    case 'FESTA':
      if (
        // Short não vai para festa (decisão de 20/10/2026).
        peca.categoria === 'SHORT' ||
        peca.estilo === 'ESPORTIVO' ||
        // Moletom é de casa e de dia a dia, mesmo na festa mais simples.
        peca.material === 'MOLETOM' ||
        eCalcadoDeCasaOuPraia(peca) ||
        // Casamento e festa formal: só o corset de tecido nobre.
        (peca.categoria === 'CORSET' &&
          contexto.formalidade === 'ALTA' &&
          !temMaterial(peca, CORSET_DE_FESTA_FORMAL) &&
          !eAlfaiataria(peca))
      ) {
        return 'PROIBIDA';
      }
      if (marcada) return 'ADEQUADA';
      return diaADia || peca.ocasioes.includes('TRABALHO') ? 'ACEITAVEL' : 'PROIBIDA';

    case 'PRAIA':
      if (
        temMaterial(peca, PROIBIDOS_NA_PRAIA) ||
        peca.categoria === 'BLAZER' ||
        coleteDeTrabalho(peca) ||
        peca.categoria === 'CORSET' ||
        peca.categoria === 'BOTA' ||
        peca.estilo === 'SOCIAL' ||
        peca.aquecimento === 'QUENTE'
      ) {
        return 'PROIBIDA';
      }
      if (marcada) return 'ADEQUADA';
      return diaADia ? 'ACEITAVEL' : 'PROIBIDA';

    case 'CASA':
      return compatibilidadeEmCasa(peca);

    case 'DIA_A_DIA':
      // Passeio, shopping, faculdade: roupa de treino não (a atividade física
      // vira ACADEMIA no chat).
      if (eDeTreino(peca) || coleteDeTrabalho(peca)) return 'PROIBIDA';
      return marcada ? 'ADEQUADA' : 'ACEITAVEL';
  }
}

// Quanto cada tecido soma (ou tira) na ocasião, entre as peças permitidas.
const NOTA_DO_MATERIAL: Partial<Record<Ocasiao, Partial<Record<Material, number>>>> = {
  TRABALHO: { ALFAIATARIA: 1.5, LINHO: 0.5, VISCOSE: 0.5, CETIM: 0.5, MALHA: -0.5 },
  FESTA: { CETIM: 1.5, COURO: 1.5, VELUDO: 1.5, VISCOSE: 0.5, MALHA: -0.5, LINHO: -0.5 },
  ACADEMIA: { POLIAMIDA: 1, MALHA: -0.5 },
  // Em casa, o mais macio primeiro.
  CASA: { MOLETOM: 1, SOFT: 1, MALHA: 0.5 },
};

/**
 * Festa de dia (casamento ao ar livre, almoço, chá): tecido leve e pouco
 * brilho. Pelos guias de casamento, paetê, cetim e veludo são da noite; de
 * dia, chiffon, linho, viscose e renda leve. À noite vale NOTA_DO_MATERIAL.
 */
const NOTA_DA_FESTA_DE_DIA: Partial<Record<Material, number>> = {
  LINHO: 1,
  VISCOSE: 1,
  CETIM: 0,
  COURO: -0.5,
  VELUDO: -1.5,
  MALHA: -0.5,
};

function notaDoMaterial(peca: PecaOcasiao, ocasiao: Ocasiao, contexto: ContextoOcasiao) {
  const tabela =
    ocasiao === 'FESTA' && contexto.periodo === 'DIA'
      ? NOTA_DA_FESTA_DE_DIA
      : NOTA_DO_MATERIAL[ocasiao];
  // O tecido ALFAIATARIA antigo vale pelo corte: sem ele (calça cargo), não conta.
  const fibra = peca.material === 'ALFAIATARIA' ? null : peca.material;
  let nota = fibra ? (tabela?.[fibra] ?? 0) : 0;
  // O corte de alfaiataria soma junto com a fibra (a calça de alfaiataria de
  // viscose soma os dois no trabalho).
  if (eAlfaiataria(peca)) nota += NOTA_DO_MATERIAL[ocasiao]?.ALFAIATARIA ?? 0;
  return nota;
}

/**
 * Nota da peça para a ocasião. Em trabalho e festa, entre as aceitáveis,
 * as mais arrumadas vêm primeiro (camisa > camiseta lisa > camiseta com logo).
 */
export function notaDeOcasiao(
  peca: PecaOcasiao,
  ocasiao: Ocasiao | null,
  contexto: ContextoOcasiao = {},
) {
  if (!ocasiao) return 0;

  const compat = compatibilidade(peca, ocasiao, contexto);
  let nota = compat === 'ADEQUADA' ? 2 : 0.5;

  if (ocasiao === 'TRABALHO' || ocasiao === 'FESTA') {
    if (peca.categoria === 'CAMISA' || peca.categoria === 'BLAZER') nota += 1;
    if (peca.estilo && FORMAIS.includes(peca.estilo)) nota += 1;
    if (peca.estampa === 'LOGO') nota -= 0.5;
  }

  nota += notaDoMaterial(peca, ocasiao, contexto);
  if (peca.categoria === 'CORSET' && peca.material) {
    nota += NOTA_DO_CORSET[ocasiao]?.[peca.material] ?? 0;
  }
  if (peca.categoria === 'BOTA' && peca.cano) {
    nota += NOTA_DA_BOTA[ocasiao]?.[peca.cano] ?? 0;
  }
  // Brilho e decote são da festa à noite; de dia, o brilho pesa contra.
  const festaDeDia = ocasiao === 'FESTA' && contexto.periodo === 'DIA';
  if (ocasiao === 'FESTA' && eMetalizada(peca)) nota += festaDeDia ? -1 : 1.5;
  if (ocasiao === 'FESTA' && !festaDeDia && peca.decotada) nota += 1;
  if (ocasiao === 'ACADEMIA' && peca.estilo === 'ESPORTIVO') nota += 1.5;

  // Peça social no dia a dia é permitida, mas não é a primeira escolha.
  if (ocasiao === 'DIA_A_DIA' && compat === 'ACEITAVEL') {
    if (peca.estilo && FORMAIS.includes(peca.estilo)) nota -= 1;
  }

  return nota;
}

/** O que cadastrar quando faltam peças para a ocasião. */
export const SUGESTAO_DE_CADASTRO: Record<Ocasiao, string> = {
  ACADEMIA: 'Cadastre roupas de treino, como top, camiseta esportiva, short ou legging.',
  TRABALHO: 'Cadastre peças como camisa, calça ou sapato fechado.',
  FESTA: 'Cadastre peças mais arrumadas, como camisa, calça ou vestido.',
  PRAIA: 'Cadastre peças leves, como short, camiseta ou vestido.',
  DIA_A_DIA: 'Cadastre mais peças do seu dia a dia.',
  CASA: 'Cadastre peças confortáveis para ficar em casa, como moletom, pijama ou camiseta de malha.',
};
