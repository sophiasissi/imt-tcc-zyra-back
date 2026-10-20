import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { coresDaPeca } from '../../src/pecas/cor-da-peca';

describe('coresDaPeca', () => {
  // Calça azul bebê sob luz amarela: os pixels saem quase cinza.
  const lida = { corNome: 'Branco', hex: '#BFC3BC', colorAddSymbol: 'COLORADD_BRANCO' };

  it('usa o nome e o símbolo da análise, e o hex medido na foto', () => {
    const cores = coresDaPeca(lida, {
      primaryColor: {
        colorName: 'Azul Claro',
        hex: '#039CED',
        colorAddSymbol: 'COLORADD_AZUL_CLARO',
      },
      secondaryColor: null,
    });

    assert.deepEqual(cores, {
      corNome: 'Azul Claro',
      colorAddSymbol: 'COLORADD_AZUL_CLARO',
      hex: '#BFC3BC',
      corSecundariaNome: null,
      hexSecundario: null,
      colorAddSymbolSecundario: null,
    });
  });

  it('guarda a cor secundária da análise', () => {
    const cores = coresDaPeca(lida, {
      primaryColor: { colorName: 'Branco', hex: '#FFFFFF', colorAddSymbol: 'COLORADD_BRANCO' },
      secondaryColor: { colorName: 'Preto', hex: '#000000', colorAddSymbol: 'COLORADD_PRETO' },
    });

    assert.equal(cores.corSecundariaNome, 'Preto');
    assert.equal(cores.hexSecundario, '#000000');
    assert.equal(cores.colorAddSymbolSecundario, 'COLORADD_PRETO');
  });

  it('sem cor na análise, fica a leitura por pixels', () => {
    const cores = coresDaPeca(lida, { primaryColor: null, secondaryColor: null });

    assert.equal(cores.corNome, 'Branco');
    assert.equal(cores.colorAddSymbol, 'COLORADD_BRANCO');
    assert.equal(cores.colorAddSymbolSecundario, null);
  });
});
