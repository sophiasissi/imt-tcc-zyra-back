/**
 * Gera a miniatura (e, com --sem-fundo, a versão sem fundo) das peças
 * cadastradas antes de existirem.
 *
 * Uso:
 *   npm run gerar:miniaturas                         # só mostra o que faria
 *   npm run gerar:miniaturas -- --executar           # gera as miniaturas
 *   npm run gerar:miniaturas -- --executar --sem-fundo
 *   npm run gerar:miniaturas -- --desfazer logs/miniaturas-<data>.json [--peca <id>]
 *
 * --sem-fundo manda cada foto para o /remove-background da visão (ela precisa
 * estar rodando) e passa a peça a usar a versão recortada. Nada é apagado: a
 * foto original continua no S3, e logs/miniaturas-<data>.json guarda a chave
 * antiga de cada peça, para desfazer se for preciso. Peça que a visão não
 * conseguir recortar fica com a foto original.
 *
 * --desfazer volta as peças do registro (ou só a de --peca) para a foto de
 * antes, com uma miniatura feita dela. Os arquivos sem fundo ficam no S3.
 */
import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';

import { chaveDaMiniatura, gerarMiniatura } from '../src/pecas/fotos-da-peca';
import { PrismaService } from '../src/prisma/prisma.service';
import { S3Service } from '../src/storage/s3.service';

const executar = process.argv.includes('--executar');
const semFundo = process.argv.includes('--sem-fundo');
const argumento = (nome: string) => {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

type Registro = {
  pecaId: string;
  imagemS3KeyAntiga: string;
  imagemS3KeyNova: string;
  imagemMiniS3Key: string;
  fundoRemovido: boolean;
};

async function baixar(s3: S3Client, bucket: string, key: string) {
  const resposta = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return Buffer.from(await resposta.Body!.transformToByteArray());
}

/** Peça sem fundo pela visão, ou null se ela não conseguir recortar. */
async function removerFundo(visao: string, foto: Buffer) {
  const formulario = new FormData();
  formulario.append('file', new Blob([new Uint8Array(foto)]), 'peca.jpg');

  const resposta = await fetch(`${visao}/remove-background`, {
    method: 'POST',
    body: formulario,
    signal: AbortSignal.timeout(60_000),
  });
  if (!resposta.ok) return null;
  return Buffer.from(await resposta.arrayBuffer());
}

async function main() {
  const config = new ConfigService();
  const prisma = new PrismaService(config);
  const s3 = new S3Service(config);
  const cliente = new S3Client({
    region: config.getOrThrow<string>('AWS_REGION'),
    useDualstackEndpoint: true,
  });
  const bucket = config.getOrThrow<string>('S3_BUCKET');
  const visao = config.getOrThrow<string>('VISION_API_URL');

  const registroParaDesfazer = argumento('--desfazer');
  if (registroParaDesfazer) {
    await desfazer(registroParaDesfazer, argumento('--peca'), { prisma, s3, cliente, bucket });
    await prisma.$disconnect();
    return;
  }

  const pecas = await prisma.peca.findMany({
    where: { imagemMiniS3Key: null },
    orderBy: { criadoEm: 'asc' },
  });

  console.log(
    `${pecas.length} peça(s) sem miniatura.` +
      (executar ? '' : ' Nada foi alterado: rode com --executar para gerar.'),
  );
  if (!executar || !pecas.length) {
    await prisma.$disconnect();
    return;
  }

  mkdirSync('logs', { recursive: true });
  const arquivoDeRegistro = `logs/miniaturas-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const registros: Registro[] = [];
  let falhas = 0;

  for (const [i, peca] of pecas.entries()) {
    const rotulo = `[${i + 1}/${pecas.length}] ${peca.categoria} ${peca.corNome}`;

    try {
      const original = await baixar(cliente, bucket, peca.imagemS3Key);

      // Peça que já veio sem fundo do app (WebP) não passa de novo pela visão.
      const recortada =
        semFundo && !peca.imagemS3Key.endsWith('.webp')
          ? await removerFundo(visao, original)
          : null;

      const imagemS3Key = recortada
        ? `usuarios/${peca.usuarioId}/roupas/${randomUUID()}.webp`
        : peca.imagemS3Key;
      if (recortada) await s3.upload(imagemS3Key, recortada, 'image/webp');

      const imagemMiniS3Key = chaveDaMiniatura(imagemS3Key);
      await s3.upload(imagemMiniS3Key, await gerarMiniatura(recortada ?? original), 'image/webp');

      await prisma.peca.update({ where: { id: peca.id }, data: { imagemS3Key, imagemMiniS3Key } });

      registros.push({
        pecaId: peca.id,
        imagemS3KeyAntiga: peca.imagemS3Key,
        imagemS3KeyNova: imagemS3Key,
        imagemMiniS3Key,
        fundoRemovido: Boolean(recortada),
      });
      // Gravado a cada peça: se o script parar no meio, o registro está em dia.
      writeFileSync(arquivoDeRegistro, JSON.stringify(registros, null, 2));

      console.log(
        `${rotulo}: ok${semFundo ? (recortada ? ', sem fundo' : ', com o fundo original') : ''}`,
      );
    } catch (error) {
      falhas++;
      console.error(`${rotulo}: falhou (${error instanceof Error ? error.message : error})`);
    }
  }

  console.log(
    `\n${registros.length} peça(s) atualizada(s), ${falhas} falha(s). Registro: ${arquivoDeRegistro}`,
  );
  await prisma.$disconnect();
}

async function desfazer(
  arquivo: string,
  pecaId: string | undefined,
  {
    prisma,
    s3,
    cliente,
    bucket,
  }: { prisma: PrismaService; s3: S3Service; cliente: S3Client; bucket: string },
) {
  const registros = (JSON.parse(readFileSync(arquivo, 'utf8')) as Registro[]).filter(
    (r) => r.fundoRemovido && (!pecaId || r.pecaId === pecaId),
  );
  console.log(`${registros.length} peça(s) para voltar à foto original.`);

  for (const registro of registros) {
    try {
      const original = await baixar(cliente, bucket, registro.imagemS3KeyAntiga);
      const imagemMiniS3Key = chaveDaMiniatura(registro.imagemS3KeyAntiga);
      await s3.upload(imagemMiniS3Key, await gerarMiniatura(original), 'image/webp');
      await prisma.peca.update({
        where: { id: registro.pecaId },
        data: { imagemS3Key: registro.imagemS3KeyAntiga, imagemMiniS3Key },
      });
      console.log(`${registro.pecaId}: voltou para a foto original`);
    } catch (error) {
      console.error(
        `${registro.pecaId}: falhou (${error instanceof Error ? error.message : error})`,
      );
    }
  }
}

void main();
