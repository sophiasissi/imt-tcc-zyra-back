/**
 * Completa as peças cadastradas antes de 23/10/2026 com o que a análise
 * passou a dizer nesse dia:
 * - `decotada`: decote, costas abertas, ombro de fora ou transparência
 *   (peças de cima, camadas e vestidos);
 * - `curta`: saia ou vestido acima do meio da coxa;
 * - categoria COLETE: o colete era salvo como blusa ou jaqueta e entrava
 *   duas vezes no mesmo look;
 * - categoria CORSET (28/10/2026): o corset era salvo como colete ou blusa.
 *   Ao virar corset, a peça recebe também as ocasiões da análise nova, que
 *   dependem do tecido (o de couro vai para festa). O caminho inverso também:
 *   o corset sem amarração, colchetes ou barbatanas (como o top tomara que
 *   caia salvo em 28/10) volta para a categoria que a análise der.
 * - categoria BOTA e o cano (05/11/2026): a bota era salva como sapato. Os
 *   sapatos são reanalisados, e a bota sem cano gravado recebe o cano.
 * - `alfaiataria` e `colarinho` (10/11/2026): o corte de alfaiataria, de
 *   qualquer fibra (a calça de alfaiataria de viscose estava "casual de
 *   viscose"), e a gola de camisa (a polo estava como camiseta básica).
 * - `casacoPesado` (10/11/2026): puffer, parka e sobretudo, nas jaquetas e
 *   blazers.
 * - categoria SUETER (10/11/2026): o suéter de tricô salvo como moletom.
 * Sem isso, o motor não sabe que a blusa decotada e a minissaia não vão para
 * o trabalho.
 *
 * Uso:
 *   npm run reanalisar:pecas                # só mostra o que faria
 *   npm run reanalisar:pecas -- --executar  # reanalisa e grava
 *
 * Cada peça passa de novo pelo /analyze-clothing da visão (que precisa estar
 * rodando, na versão que devolve `revealing` e `mini`): é uma chamada à
 * OpenAI por peça. Só esses campos mudam; a cor e as ocasiões ficam como
 * estão (menos no corset), e a categoria só muda para COLETE ou CORSET.
 */
import 'dotenv/config';

import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { Categoria, Peca, Prisma } from '@prisma/client';

import { PAPEL_DA_CATEGORIA } from '../src/looks/taxonomia';
import { VisionService } from '../src/pecas/vision.service';
import { PrismaService } from '../src/prisma/prisma.service';

const executar = process.argv.includes('--executar');

const CONTENT_TYPE: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const CATEGORIAS_COM_DECOTE = (Object.keys(PAPEL_DA_CATEGORIA) as Categoria[]).filter((c) =>
  ['SUPERIOR', 'SOBREPOSICAO', 'PECA_UNICA'].includes(PAPEL_DA_CATEGORIA[c]),
);
const CATEGORIAS_COM_COMPRIMENTO: Categoria[] = ['SAIA', 'VESTIDO'];
// Onde os coletes antigos foram parar: blusa ou jaqueta sem manga (ou sem
// manga gravada).
const TALVEZ_COLETE: Categoria[] = ['BLUSA', 'JAQUETA'];

const precisaDeDecote = (p: Peca) =>
  p.decotada === null && CATEGORIAS_COM_DECOTE.includes(p.categoria);
const precisaDeComprimento = (p: Peca) =>
  p.curta === null && CATEGORIAS_COM_COMPRIMENTO.includes(p.categoria);
const podeSerColete = (p: Peca) =>
  TALVEZ_COLETE.includes(p.categoria) && (p.manga === null || p.manga === 'SEM_MANGA');
// Onde os corsets foram parar. Só os sem manga, para não reanalisar todas as
// blusas do armário (uma chamada à OpenAI por peça).
const TALVEZ_CORSET: Categoria[] = ['BLUSA', 'COLETE', 'CROPPED', 'TOP', 'CORSET'];
const podeSerCorset = (p: Peca) =>
  TALVEZ_CORSET.includes(p.categoria) && (p.manga === null || p.manga === 'SEM_MANGA');
// Calçados que podem ter salto e ainda não têm essa informação (05/11/2026).
const precisaDeSalto = (p: Peca) =>
  p.salto === null && ['SAPATO', 'SANDALIA', 'BOTA'].includes(p.categoria);
// Peças que podem ter corte de alfaiataria ou colarinho (10/11/2026), como
// no taxonomy.py da visão. A camisa já ganhou colarinho na migration.
const CATEGORIAS_COM_ALFAIATARIA: Categoria[] = [
  'CALCA',
  'SHORT',
  'SAIA',
  'VESTIDO',
  'BLAZER',
  'COLETE',
  'JAQUETA',
];
const CATEGORIAS_COM_COLARINHO: Categoria[] = ['CAMISETA', 'BLUSA', 'BODY', 'CROPPED', 'VESTIDO'];
const precisaDeAlfaiataria = (p: Peca) =>
  p.alfaiataria === null && CATEGORIAS_COM_ALFAIATARIA.includes(p.categoria);
const precisaDeColarinho = (p: Peca) =>
  p.colarinho === null && CATEGORIAS_COM_COLARINHO.includes(p.categoria);
// Suéter (10/11/2026): moletons que a análise nova reconhece como suéter de
// tricô ou lã. São poucos; todos passam pela análise.
const podeSerSueter = (p: Peca) => p.categoria === 'MOLETOM';
// Casaco pesado (10/11/2026): jaquetas e blazers ainda sem a informação.
const precisaDePeso = (p: Peca) =>
  p.casacoPesado === null && (p.categoria === 'JAQUETA' || p.categoria === 'BLAZER');
// Onde as botas foram parar: sapato. E a bota sem o cano.
const podeSerBota = (p: Peca) => p.categoria === 'SAPATO' || (p.categoria === 'BOTA' && !p.cano);

async function main() {
  const config = new ConfigService();
  const prisma = new PrismaService(config);
  const visao = new VisionService(config);
  const s3 = new S3Client({
    region: config.getOrThrow<string>('AWS_REGION'),
    useDualstackEndpoint: true,
  });
  const bucket = config.getOrThrow<string>('S3_BUCKET');

  const pecas = (await prisma.peca.findMany({ orderBy: { criadoEm: 'asc' } })).filter(
    (p) =>
      precisaDeDecote(p) ||
      precisaDeComprimento(p) ||
      podeSerColete(p) ||
      podeSerCorset(p) ||
      podeSerBota(p) ||
      precisaDeSalto(p) ||
      precisaDeAlfaiataria(p) ||
      precisaDeColarinho(p) ||
      precisaDePeso(p) ||
      podeSerSueter(p),
  );

  console.log(
    `${pecas.length} peça(s) para reanalisar.` +
      (executar ? '' : ' Nada foi alterado: rode com --executar para reanalisar.'),
  );
  if (!executar || !pecas.length) {
    await prisma.$disconnect();
    return;
  }

  let alteradas = 0;
  let falhas = 0;

  for (const [i, peca] of pecas.entries()) {
    const rotulo = `[${i + 1}/${pecas.length}] ${peca.categoria} ${peca.corNome}`;

    try {
      const resposta = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: peca.imagemS3Key }),
      );
      const foto = Buffer.from(await resposta.Body!.transformToByteArray());
      const extensao = peca.imagemS3Key.split('.').pop()!.toLowerCase();

      const analise = await visao.analisarRoupa(foto, CONTENT_TYPE[extensao] ?? 'image/jpeg');
      if (typeof analise.revealing !== 'boolean' || typeof analise.mini !== 'boolean') {
        throw new Error('a visão não devolveu `revealing` e `mini`: reinicie-a com a versão nova');
      }
      if (precisaDeSalto(peca) && typeof analise.heel !== 'boolean') {
        throw new Error('a visão não devolveu `heel`: reinicie-a com a versão nova');
      }
      if (
        (precisaDeAlfaiataria(peca) || precisaDeColarinho(peca)) &&
        (typeof analise.tailored !== 'boolean' || typeof analise.collar !== 'boolean')
      ) {
        throw new Error('a visão não devolveu `tailored` e `collar`: reinicie-a com a versão nova');
      }
      if (precisaDePeso(peca) && typeof analise.heavyCoat !== 'boolean') {
        throw new Error('a visão não devolveu `heavyCoat`: reinicie-a com a versão nova');
      }
      if (podeSerBota(peca) && !('bootShaft' in analise)) {
        throw new Error('a visão não devolveu `bootShaft`: reinicie-a com a versão nova');
      }

      const dados: Prisma.PecaUpdateInput = {};
      if (podeSerColete(peca) && analise.category === 'COLETE') {
        dados.categoria = 'COLETE';
        dados.manga = 'SEM_MANGA';
      }
      const viraCorset = peca.categoria !== 'CORSET' && analise.category === 'CORSET';
      const deixaDeSerCorset = peca.categoria === 'CORSET' && analise.category !== 'CORSET';
      if (podeSerCorset(peca) && (viraCorset || deixaDeSerCorset)) {
        dados.categoria = analise.category;
        dados.ocasioes = analise.occasions;
      }
      if (podeSerBota(peca) && analise.category === 'BOTA') {
        if (peca.categoria !== 'BOTA') dados.categoria = 'BOTA';
        if (analise.bootShaft) dados.cano = analise.bootShaft;
      }
      if (precisaDeSalto(peca) && analise.heel !== undefined) dados.salto = analise.heel;
      if (precisaDeDecote(peca)) dados.decotada = analise.revealing;
      if (precisaDeComprimento(peca)) dados.curta = analise.mini;
      // A análise só marca o corte e a gola nas categorias certas; se ela
      // mudou a categoria da peça, o campo fica como a análise disse.
      if (precisaDeAlfaiataria(peca)) {
        dados.alfaiataria = analise.tailored === true;
        // Tecido ALFAIATARIA numa peça sem o corte (calça cargo de sarja):
        // fica o tecido da análise nova.
        if (!analise.tailored && peca.material === 'ALFAIATARIA') {
          dados.material = analise.material;
        }
      }
      if (precisaDeColarinho(peca)) dados.colarinho = analise.collar === true;
      if (precisaDePeso(peca)) dados.casacoPesado = analise.heavyCoat === true;
      if (podeSerSueter(peca) && analise.category === 'SUETER') {
        dados.categoria = 'SUETER';
        if (analise.material) dados.material = analise.material;
      }

      const mudancas = Object.entries(dados).map(([campo, valor]) => `${campo}=${valor}`);
      if (mudancas.length) {
        await prisma.peca.update({ where: { id: peca.id }, data: dados });
        alteradas++;
      }
      console.log(`${rotulo}: ${mudancas.join(', ') || 'sem mudança'}`);
    } catch (error) {
      falhas++;
      console.error(`${rotulo}: falhou (${error instanceof Error ? error.message : error})`);
    }
  }

  console.log(`Pronto: ${alteradas} peça(s) alterada(s), ${falhas} falha(s).`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
