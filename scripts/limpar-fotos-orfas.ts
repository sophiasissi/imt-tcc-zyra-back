/**
 * Apaga do S3 as fotos que o gerar-miniaturas deixou para trás e que nenhuma
 * peça usa mais (a foto de antes do recorte, ou o recorte de uma peça que
 * voltou para a foto original).
 *
 * Uso:
 *   npm run limpar:fotos-orfas              # só lista o que apagaria
 *   npm run limpar:fotos-orfas -- --executar
 *
 * O bucket é compartilhado (cada pessoa do time tem o próprio banco local), por
 * isso NÃO se compara o bucket inteiro com este banco: isso apagaria as fotos
 * dos outros. Só entram os arquivos citados nos registros logs/miniaturas-*.json
 * desta máquina, e só os que nenhuma peça nem foto de perfil deste banco usa.
 */
import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';

import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';

import { chaveDaMiniatura } from '../src/pecas/fotos-da-peca';
import { PrismaService } from '../src/prisma/prisma.service';
import { S3Service } from '../src/storage/s3.service';

const executar = process.argv.includes('--executar');

type Registro = {
  imagemS3KeyAntiga: string;
  imagemS3KeyNova: string;
  imagemMiniS3Key: string;
};

/** Toda chave que o gerar-miniaturas criou ou deixou de usar nesta máquina. */
function chavesDosRegistros() {
  const arquivos = readdirSync('logs').filter((f) => /^miniaturas-.*\.json$/.test(f));
  const chaves = new Set<string>();

  for (const arquivo of arquivos) {
    for (const r of JSON.parse(readFileSync(`logs/${arquivo}`, 'utf8')) as Registro[]) {
      // A miniatura da foto antiga é criada pelo --desfazer.
      [
        r.imagemS3KeyAntiga,
        r.imagemS3KeyNova,
        r.imagemMiniS3Key,
        chaveDaMiniatura(r.imagemS3KeyAntiga),
      ].forEach((chave) => chaves.add(chave));
    }
  }

  return { chaves, arquivos };
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

  const { chaves, arquivos } = chavesDosRegistros();

  const [pecas, usuarios] = await Promise.all([
    prisma.peca.findMany({ select: { imagemS3Key: true, imagemMiniS3Key: true } }),
    prisma.usuario.findMany({ select: { fotoS3Key: true } }),
  ]);
  const emUso = new Set(
    [
      ...pecas.flatMap((p) => [p.imagemS3Key, p.imagemMiniS3Key]),
      ...usuarios.map((u) => u.fotoS3Key),
    ].filter((chave): chave is string => Boolean(chave)),
  );

  const existe = (Key: string) =>
    cliente.send(new HeadObjectCommand({ Bucket: bucket, Key })).then(
      () => true,
      () => false,
    );

  const orfas: string[] = [];
  for (const chave of chaves) {
    if (!emUso.has(chave) && (await existe(chave))) orfas.push(chave);
  }

  console.log(
    `${arquivos.length} registro(s), ${chaves.size} arquivo(s) citados, ${orfas.length} órfão(s) no S3.`,
  );
  orfas.forEach((chave) => console.log(`  - ${chave}`));

  if (!executar) {
    if (orfas.length) console.log('\nNada foi apagado: rode com --executar para apagar.');
    await prisma.$disconnect();
    return;
  }

  for (const chave of orfas) await s3.deleteQuietly(chave);
  console.log(`\n${orfas.length} arquivo(s) apagado(s).`);
  await prisma.$disconnect();
}

void main();
