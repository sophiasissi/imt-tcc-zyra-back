import { Categoria, Manga, Material } from '@prisma/client';

export const NOME_CATEGORIA: Record<Categoria, string> = {
  CAMISETA: 'Camiseta',
  CAMISA: 'Camisa',
  BLUSA: 'Blusa',
  CROPPED: 'Cropped',
  TOP: 'Top',
  BODY: 'Body',
  MOLETOM: 'Moletom',
  JAQUETA: 'Jaqueta',
  BLAZER: 'Blazer',
  CALCA: 'Calça',
  SHORT: 'Short',
  SAIA: 'Saia',
  VESTIDO: 'Vestido',
  TENIS: 'Tênis',
  SAPATO: 'Sapato',
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

// Manga curta é o comum e não entra no nome. O top nunca tem manga.
const COM_MANGA_NO_NOME: Categoria[] = [
  'CAMISETA',
  'CAMISA',
  'BLUSA',
  'CROPPED',
  'BODY',
  'VESTIDO',
];

function comMaterial(nome: string, material: Material) {
  // "Calça jeans", mas "calça de moletom".
  return material === 'JEANS' ? `${nome} jeans` : `${nome} de ${NOME_MATERIAL[material]}`;
}

/**
 * Nome da peça como a pessoa diria: "Calça jeans", "Calça de moletom",
 * "Camiseta manga longa", "Regata", "Body manga longa", "Jaqueta de couro",
 * "Casaco de moletom".
 */
export function nomeDaPeca(peca: {
  categoria: Categoria;
  material?: Material | null;
  manga?: Manga | null;
}) {
  const { categoria, material, manga } = peca;

  if (categoria === 'CAMISETA' && manga === 'SEM_MANGA') {
    return material && MATERIAL_SEMPRE_NA_PECA.includes(material)
      ? comMaterial('Regata', material)
      : 'Regata';
  }

  if (categoria === 'JAQUETA' && material && MATERIAIS_DE_CASACO.includes(material)) {
    return comMaterial('Casaco', material);
  }

  let nome = NOME_CATEGORIA[categoria];

  const materialNoNome =
    material &&
    // "Moletom de moletom" não diz nada.
    !(categoria === 'MOLETOM' && material === 'MOLETOM') &&
    (MATERIAL_SEMPRE_NO_NOME.includes(categoria) || MATERIAL_SEMPRE_NA_PECA.includes(material));
  if (materialNoNome) nome = comMaterial(nome, material);

  if (COM_MANGA_NO_NOME.includes(categoria)) {
    if (manga === 'LONGA') nome += ' manga longa';
    if (manga === 'SEM_MANGA') nome += ' sem manga';
  }

  return nome;
}
