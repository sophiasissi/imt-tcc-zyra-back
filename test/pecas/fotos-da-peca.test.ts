import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import sharp from 'sharp';

import { chaveDaMiniatura, fotosDaPeca, gerarMiniatura } from '../../src/pecas/fotos-da-peca';
import { S3Service } from '../../src/storage/s3.service';

const s3 = {
  getReadUrl: async (key: string) => `https://s3.exemplo/${key}`,
} as unknown as S3Service;

describe('miniatura da peça', () => {
  it('reduz para no máximo 480 px, em WebP, mantendo a transparência', async () => {
    const foto = await sharp({
      create: {
        width: 3000,
        height: 4000,
        channels: 4,
        background: { r: 200, g: 0, b: 0, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();

    const mini = await sharp(await gerarMiniatura(foto)).metadata();

    assert.equal(mini.format, 'webp');
    assert.equal(mini.width, 360);
    assert.equal(mini.height, 480);
    assert.equal(mini.hasAlpha, true);
  });

  it('não aumenta foto pequena', async () => {
    const foto = await sharp({
      create: { width: 200, height: 100, channels: 3, background: '#336699' },
    })
      .jpeg()
      .toBuffer();
    const mini = await sharp(await gerarMiniatura(foto)).metadata();
    assert.equal(mini.width, 200);
  });

  it('a chave da miniatura fica ao lado da foto', () => {
    assert.equal(
      chaveDaMiniatura('usuarios/u1/roupas/abc.jpg'),
      'usuarios/u1/roupas/abc-mini.webp',
    );
    assert.equal(
      chaveDaMiniatura('usuarios/u1/roupas/abc.webp'),
      'usuarios/u1/roupas/abc-mini.webp',
    );
  });

  it('sem miniatura, o card usa a foto inteira', async () => {
    const fotos = await fotosDaPeca(s3, { imagemS3Key: 'a.jpg', imagemMiniS3Key: null });
    assert.deepEqual(fotos, {
      imagemUrl: 'https://s3.exemplo/a.jpg',
      imagemMiniUrl: 'https://s3.exemplo/a.jpg',
    });

    const comMini = await fotosDaPeca(s3, { imagemS3Key: 'a.jpg', imagemMiniS3Key: 'a-mini.webp' });
    assert.equal(comMini.imagemMiniUrl, 'https://s3.exemplo/a-mini.webp');
  });
});
