import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { escolherCorSecundaria } from '../../src/pecas/pecas.service';
import { AnaliseRoupa, CorDaPeca } from '../../src/pecas/vision.service';

const azulEscuro: CorDaPeca = {
  corNome: 'Azul Escuro',
  hex: '#1F2A44',
  colorAddSymbol: 'COLORADD_AZUL_ESCURO',
  corSecundariaNome: null,
  hexSecundario: null,
  colorAddSymbolSecundario: null,
};

const comPixelBranco: CorDaPeca = {
  ...azulEscuro,
  corSecundariaNome: 'Branco',
  hexSecundario: '#F0F0F0',
  colorAddSymbolSecundario: 'COLORADD_BRANCO',
};

function analise(extras: Partial<AnaliseRoupa>): AnaliseRoupa {
  return {
    category: 'CAMISA',
    style: 'CASUAL',
    pattern: 'LISTRADO',
    warmth: 'MEDIO',
    material: null,
    occasions: ['DIA_A_DIA'],
    ...extras,
  };
}

const brancoDaIa = { colorName: 'Branco', hex: '#E8E8E8', colorAddSymbol: 'COLORADD_BRANCO' };

describe('cor secundária no cadastro', () => {
  it('usa a cor secundária da IA', () => {
    const cor = escolherCorSecundaria(azulEscuro, analise({ secondaryColor: brancoDaIa }));
    assert.equal(cor.colorAddSymbolSecundario, 'COLORADD_BRANCO');
    assert.equal(cor.hexSecundario, '#E8E8E8');
  });

  it('peça lisa fica sem cor secundária, mesmo com leitura de pixels', () => {
    const cor = escolherCorSecundaria(
      comPixelBranco,
      analise({ pattern: 'LISO', secondaryColor: brancoDaIa }),
    );
    assert.equal(cor.colorAddSymbolSecundario, null);
    assert.equal(cor.corSecundariaNome, null);
  });

  it('ignora a IA quando ela repete a cor principal', () => {
    const repetida = {
      colorName: 'Azul Escuro',
      hex: '#1F2A44',
      colorAddSymbol: 'COLORADD_AZUL_ESCURO',
    };
    const cor = escolherCorSecundaria(azulEscuro, analise({ secondaryColor: repetida }));
    assert.equal(cor.colorAddSymbolSecundario, null);
  });

  it('sem cor da IA, mantém a leitura de pixels', () => {
    const cor = escolherCorSecundaria(comPixelBranco, analise({ secondaryColor: null }));
    assert.equal(cor.colorAddSymbolSecundario, 'COLORADD_BRANCO');
  });
});
