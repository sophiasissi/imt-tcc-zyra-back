import { Cano, Categoria, Manga, Material } from '@prisma/client';

export const NOME_CATEGORIA: Record<Categoria, string> = {
  CAMISETA: 'Camiseta',
  CAMISA: 'Camisa',
  BLUSA: 'Blusa',
  CROPPED: 'Cropped',
  TOP: 'Top',
  BODY: 'Body',
  CORSET: 'Corset',
  MOLETOM: 'Moletom',
  SUETER: 'Suéter',
  JAQUETA: 'Jaqueta',
  BLAZER: 'Blazer',
  COLETE: 'Colete',
  CALCA: 'Calça',
  SHORT: 'Short',
  SAIA: 'Saia',
  VESTIDO: 'Vestido',
  TENIS: 'Tênis',
  SAPATO: 'Sapato',
  BOTA: 'Bota',
  SANDALIA: 'Sandália',
  CHINELO: 'Chinelo',
};

export const NOME_MATERIAL: Record<Material, string> = {
  JEANS: 'jeans',
  COURO: 'couro',
  MOLETOM: 'moletom',
  MALHA: 'malha',
  POLIAMIDA: 'poliamida',
  TRICO: 'tricô',
  SOFT: 'soft',
  LINHO: 'linho',
  ALFAIATARIA: 'alfaiataria',
  CETIM: 'cetim',
  VISCOSE: 'viscose',
  VELUDO: 'veludo',
};

// Nas peças de baixo o tecido é o que diferencia uma da outra ("calça jeans",
// "calça de moletom"). Nas outras, só jeans e couro entram no nome ("jaqueta
// jeans", "jaqueta de couro"): "blusa de viscose" só alonga o texto.
const MATERIAL_SEMPRE_NO_NOME: Categoria[] = ['CALCA', 'SHORT', 'SAIA'];
const MATERIAL_SEMPRE_NA_PECA: Material[] = ['JEANS', 'COURO'];

// Jaqueta de tecido macio é casaco: "casaco de moletom", "casaco de tricô".
// Jeans e couro continuam jaqueta.
const MATERIAIS_DE_CASACO: Material[] = ['MOLETOM', 'TRICO', 'SOFT', 'MALHA', 'VELUDO'];

// "Bota cano longo de couro", "Bota over the knee": é o cano que diferencia
// uma bota da outra, e o motor escolhe por ele.
export const NOME_CANO: Record<Cano, string> = {
  CURTO: 'cano curto',
  MEDIO: 'cano médio',
  LONGO: 'cano longo',
  ACIMA_DO_JOELHO: 'over the knee',
};

// Manga curta é o comum e não entra no nome. O top nunca tem manga.
const COM_MANGA_NO_NOME: Categoria[] = [
  'CAMISETA',
  'CAMISA',
  'BLUSA',
  'CROPPED',
  'BODY',
  'VESTIDO',
];

// Peças que levam "de alfaiataria" no nome. Pelas lojas ("Calça Alfaiataria
// Pantalona", "Saia de alfaiataria"), o corte é o que identifica a peça, e a
// fibra (viscose, poliéster) fica na etiqueta: "calça de viscose de
// alfaiataria" não é como se chama uma peça (pesquisa de 10/11/2026). No
// blazer, o corte já está no nome.
const ALFAIATARIA_NO_NOME: Categoria[] = ['CALCA', 'SHORT', 'SAIA', 'VESTIDO', 'COLETE'];

function comMaterial(nome: string, material: Material) {
  // "Calça jeans", mas "calça de moletom".
  return material === 'JEANS' ? `${nome} jeans` : `${nome} de ${NOME_MATERIAL[material]}`;
}

/**
 * Nome da peça como a pessoa diria: "Calça jeans", "Calça de moletom",
 * "Camiseta manga longa", "Regata", "Body manga longa", "Jaqueta de couro",
 * "Casaco de moletom", "Calça de alfaiataria", "Camisa polo".
 */
export function nomeDaPeca(peca: {
  categoria: Categoria;
  material?: Material | null;
  manga?: Manga | null;
  cano?: Cano | null;
  alfaiataria?: boolean | null;
  colarinho?: boolean | null;
}) {
  const { categoria, manga, cano } = peca;
  const alfaiataria =
    typeof peca.alfaiataria === 'boolean' ? peca.alfaiataria : peca.material === 'ALFAIATARIA';
  // O corte de alfaiataria toma o lugar da fibra no nome; sem o corte, o
  // tecido ALFAIATARIA antigo (calça cargo) não entra.
  // Couro e jeans identificam a peça mais que o corte: a calça de couro
  // sintético com pregas é "Calça de couro", e não "de alfaiataria" (10/11/2026).
  const fibraMarcante = peca.material && MATERIAL_SEMPRE_NA_PECA.includes(peca.material);
  const material =
    alfaiataria && ALFAIATARIA_NO_NOME.includes(categoria) && !fibraMarcante
      ? 'ALFAIATARIA'
      : peca.material === 'ALFAIATARIA'
        ? null
        : peca.material;

  // Camiseta com colarinho é a polo.
  if (categoria === 'CAMISETA' && peca.colarinho === true) {
    return manga === 'LONGA' ? 'Camisa polo manga longa' : 'Camisa polo';
  }

  if (categoria === 'CAMISETA' && manga === 'SEM_MANGA') {
    return material && MATERIAL_SEMPRE_NA_PECA.includes(material)
      ? comMaterial('Regata', material)
      : 'Regata';
  }

  if (categoria === 'JAQUETA' && material && MATERIAIS_DE_CASACO.includes(material)) {
    return comMaterial('Casaco', material);
  }

  let nome = NOME_CATEGORIA[categoria];
  if (categoria === 'BOTA' && cano) nome += ` ${NOME_CANO[cano]}`;

  const materialNoNome =
    material &&
    // "Moletom de moletom" não diz nada.
    !(categoria === 'MOLETOM' && material === 'MOLETOM') &&
    (MATERIAL_SEMPRE_NO_NOME.includes(categoria) ||
      MATERIAL_SEMPRE_NA_PECA.includes(material) ||
      (material === 'ALFAIATARIA' && ALFAIATARIA_NO_NOME.includes(categoria)));
  if (materialNoNome) nome = comMaterial(nome, material);

  if (COM_MANGA_NO_NOME.includes(categoria)) {
    if (manga === 'LONGA') nome += ' manga longa';
    if (manga === 'SEM_MANGA') nome += ' sem manga';
  }

  return nome;
}
