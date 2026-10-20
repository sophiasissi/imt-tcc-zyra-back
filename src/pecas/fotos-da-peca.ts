import { Peca } from '@prisma/client';
import sharp from 'sharp';

import { S3Service } from '../storage/s3.service';

/**
 * Miniatura da foto da peça, para os cards do armário, da galeria e do chat.
 *
 * Em 20/10/2026, as 41 peças do armário do Gustavo somavam 52 MB (fotos de
 * 4032 px, ~1,3 MB cada) e levavam 23 s para carregar; em miniatura de 480 px
 * ficaram com ~30 KB cada (1,2 MB no total). A foto inteira só é baixada ao
 * ampliar a peça.
 */
const LADO_DA_MINIATURA = 480;
const QUALIDADE_DA_MINIATURA = 80;

/** Miniatura em WebP (mantém a transparência das peças sem fundo). */
export function gerarMiniatura(foto: Buffer) {
  return (
    sharp(foto)
      // Gira conforme o EXIF: a foto do celular pode vir "deitada".
      .rotate()
      .resize({
        width: LADO_DA_MINIATURA,
        height: LADO_DA_MINIATURA,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: QUALIDADE_DA_MINIATURA })
      .toBuffer()
  );
}

/** Chave da miniatura no S3, ao lado da foto: ".../roupas/<id>-mini.webp". */
export function chaveDaMiniatura(imagemS3Key: string) {
  return imagemS3Key.replace(/\.[^./]+$/, '') + '-mini.webp';
}

export type FotosDaPeca = {
  /** Foto inteira, para a peça ampliada. */
  imagemUrl: string;
  /** Miniatura para os cards; é a própria foto inteira nas peças sem miniatura. */
  imagemMiniUrl: string;
};

/** URLs assinadas das fotos da peça, sem expor as chaves do S3. */
export async function fotosDaPeca(
  s3: S3Service,
  peca: Pick<Peca, 'imagemS3Key' | 'imagemMiniS3Key'>,
): Promise<FotosDaPeca> {
  const [imagemUrl, imagemMiniUrl] = await Promise.all([
    s3.getReadUrl(peca.imagemS3Key),
    peca.imagemMiniS3Key ? s3.getReadUrl(peca.imagemMiniS3Key) : null,
  ]);

  return { imagemUrl, imagemMiniUrl: imagemMiniUrl ?? imagemUrl };
}
