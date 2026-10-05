/**
 * Rele as cores das pecas ja cadastradas com a leitura da peca inteira.
 *
 * As pecas antigas tem a cor do ponto da mira (que numa estampa pode ser a
 * estampa, e nao a peca) e nenhuma cor secundaria. So as pecas com estampa
 * sao relidas: numa peca lisa a mira e a peca inteira tem a mesma cor, e a
 * releitura so trocaria um tom limite (branco/cinza claro) por outro. Para
 * cada peca, baixa a foto do S3, le as cores pelo /detect-color?area=peca e
 * mostra o que mudaria.
 *
 * Com --ia, a cor secundaria vem da analise da IA, como no cadastro (uma
 * chamada paga por peca); so as cores mudam, o resto da peca fica igual.
 *
 * Por padrao nao grava nada; com --gravar, atualiza o banco.
 *
 *   npm run reler:cores                   # so mostra, sem custo
 *   npm run reler:cores -- --ia           # mostra, com a cor secundaria da IA
 *   npm run reler:cores -- --ia --gravar  # grava
 *
 * Precisa do servico de visao rodando em VISION_API_URL.
 */
import { existsSync } from 'node:fs';

import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import { escolherCorSecundaria } from '../src/pecas/pecas.service';
import { VisionService } from '../src/pecas/vision.service';

const descreverCor = (nome: string | null, simbolo: string | null) =>
  nome ? `${nome} (${simbolo})` : 'nenhuma';

async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');

  const gravar = process.argv.includes('--gravar');
  const comIa = process.argv.includes('--ia');
  const env = (nome: string) => {
    const valor = process.env[nome];
    if (!valor) throw new Error(`${nome} nao definida no .env`);
    return valor;
  };

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env('DATABASE_URL') }),
  });
  const s3 = new S3Client({ region: env('AWS_REGION') });
  const vision = new VisionService({
    getOrThrow: (nome: string) => env(nome),
  } as unknown as ConfigService);

  try {
    // Estampa nula tambem entra: so a peca que a IA disse ser lisa fica fora.
    const pecas = await prisma.peca.findMany({
      where: { OR: [{ estampa: null }, { estampa: { not: 'LISO' } }] },
      orderBy: { criadoEm: 'asc' },
    });
    let alteradas = 0;

    for (const peca of pecas) {
      const objeto = await s3.send(
        new GetObjectCommand({ Bucket: env('S3_BUCKET'), Key: peca.imagemS3Key }),
      );
      const foto = Buffer.from(await objeto.Body!.transformToByteArray());
      const contentType = objeto.ContentType ?? 'image/jpeg';
      const lida = await vision.detectarCor(foto, contentType);

      // A estampa gravada decide se a peca e lisa, como no cadastro.
      const nova = comIa
        ? escolherCorSecundaria(lida, {
            ...(await vision.analisarRoupa(foto, contentType)),
            pattern: peca.estampa,
          })
        : lida;

      const mudou =
        nova.colorAddSymbol !== peca.colorAddSymbol ||
        nova.colorAddSymbolSecundario !== peca.colorAddSymbolSecundario;

      console.log(`${peca.id} ${peca.categoria} ${peca.estampa ?? 'sem estampa'}`);
      console.log(
        `  principal:  ${descreverCor(peca.corNome, peca.colorAddSymbol)} -> ${descreverCor(nova.corNome, nova.colorAddSymbol)}`,
      );
      console.log(
        `  secundaria: ${descreverCor(peca.corSecundariaNome, peca.colorAddSymbolSecundario)} -> ${descreverCor(nova.corSecundariaNome, nova.colorAddSymbolSecundario)}`,
      );

      if (!mudou) continue;

      alteradas++;

      if (gravar) {
        await prisma.peca.update({ where: { id: peca.id }, data: nova });
      }
    }

    console.log(
      gravar
        ? `\n${alteradas} de ${pecas.length} peca(s) atualizada(s).`
        : `\n${alteradas} de ${pecas.length} peca(s) mudariam. Rode com --gravar para salvar.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
