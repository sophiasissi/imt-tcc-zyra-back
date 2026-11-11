import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Categoria, Ocasiao, Peca } from '@prisma/client';
import OpenAI from 'openai';

import { FotosDaPeca, fotosDaPeca } from '../pecas/fotos-da-peca';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import {
  aquecimentoDaPrevisao,
  CHANCE_DE_CHUVA_AVISO,
  fazFrioForte,
  chanceDeChuvaDoLook,
  Horario,
  pedeCamadaLeve,
  ClimaService,
  descreverPrevisao,
  DIAS_DE_PREVISAO,
  hojeNoBrasil,
  Localizacao,
} from './clima';
import {
  alternativasDoPedido,
  avisoDeArCondicionado,
  comprimentoPedido,
  entenderRespostaCurta,
  falaDeAtividadeFisica,
  falaDeChuva,
  falaDeFrioForte,
  falaDeCor,
  falaDeBalada,
  pedeSalto,
  falaDeEncontro,
  horarioDaOcasiao,
  horarioDoEvento,
  jaPerguntouQuando,
  lugarFechado,
  ocasiaoDoTexto,
  pedeParaAcrescentar,
  pecasParaRemover,
  pedeConforto,
  pedidoAntesDaPergunta,
  PERGUNTA_PERIODO_DO_DIA,
  PERGUNTA_QUANDO,
  perguntaDoLook,
  RESPOSTA_NAO_SALVAR,
  RESPOSTA_JA_SALVO,
  RESPOSTA_SALVO,
  RESPOSTA_SEM_LOOK_PARA_SALVAR,
} from './conversa';
import { lerSimbolo } from './cor';
import { diaDaConversa, diasAte } from './dia-do-evento';
import { SugerirLookDto } from './dto/sugerir-look.dto';
import { Intencao, interpretarPedido, MensagemHistorico } from './interpretar-pedido';
import { LooksSalvosService } from './looks-salvos.service';
import { contarParaMinimo, mensagemPoucasPecas, montarLook, NOMES_FEMININOS } from './motor';
import { nomeDaPeca } from './nome-da-peca';
import { Papel, papeisNoLook } from './taxonomia';

/** Peças que, pedidas com um look na tela, vão por cima dele. */
const CATEGORIAS_DE_AGASALHO: Categoria[] = ['BLUSA', 'MOLETOM', 'SUETER', 'JAQUETA', 'BLAZER'];

export type RespostaLook =
  | { tipo: 'POUCAS_PECAS'; mensagem: string; faltamSuperiores: number; faltamInferiores: number }
  | { tipo: 'PERGUNTA' | 'FORA_DE_ESCOPO' | 'CONVERSA'; mensagem: string }
  /**
   * jaEstavaSalvo: as mesmas peças já estavam na galeria; o look só voltou
   * para o topo. O app mostra um pop-up avisando (pedido da Sophia, 10/11/2026).
   */
  | { tipo: 'SALVO'; mensagem: string; lookId: string; jaEstavaSalvo: boolean }
  | { tipo: 'SEM_LOOK'; mensagem: string; avisos: string[] }
  | {
      tipo: 'LOOK';
      mensagem: string;
      /** De onde veio o clima do look ("Considerei a previsão para amanhã..."). */
      clima: string | null;
      avisos: string[];
      /** Pergunta curta para o fim da resposta: ocasião, clima ou salvar. */
      pergunta: string;
      /** Ocasião entendida no pedido; o app guarda para quando o look for salvo. */
      ocasiao: Ocasiao | null;
      pecas: (Omit<Peca, 'imagemS3Key' | 'imagemMiniS3Key'> & FotosDaPeca & { papel: Papel })[];
    };

const FORA_DE_ESCOPO =
  'Eu só consigo montar looks com as peças do seu armário. Me conta para onde você vai ou como quer se vestir.';

const PERGUNTA_PADRAO = 'Para onde você vai? Assim eu monto o look certo.';

@Injectable()
export class LooksService {
  private readonly logger = new Logger(LooksService.name);
  private openai: OpenAI | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly config: ConfigService,
    private readonly clima: ClimaService,
    private readonly looksSalvos: LooksSalvosService,
  ) {}

  /**
   * Fluxo do chat:
   *   1. confere se o armário tem o mínimo de peças (sem gastar tokens);
   *   2. a IA transforma a mensagem em filtros (única chamada paga);
   *   3. o motor escolhe as peças e monta o texto, sem IA.
   *
   * "Sim" depois de "Quer salvar esse look?" é resolvido sem a IA.
   */
  async sugerir(cognitoSub: string, dto: SugerirLookDto): Promise<RespostaLook> {
    const usuario = await this.prisma.usuario.findUnique({ where: { cognitoSub } });

    if (!usuario) {
      throw new NotFoundException(
        'Não encontramos um cadastro no ZYRA para este usuário. Faça seu cadastro para continuar.',
      );
    }

    const pecas = await this.prisma.peca.findMany({ where: { usuarioId: usuario.id } });

    const { faltamSuperiores, faltamInferiores } = contarParaMinimo(pecas);
    if (faltamSuperiores || faltamInferiores) {
      return {
        tipo: 'POUCAS_PECAS',
        mensagem: mensagemPoucasPecas(faltamSuperiores, faltamInferiores),
        faltamSuperiores,
        faltamInferiores,
      };
    }

    const historico = dto.historico ?? [];
    const respostaCurta = entenderRespostaCurta(dto.mensagem, historico);

    if (respostaCurta === 'SALVAR') {
      return this.salvarLookMostrado(cognitoSub, dto);
    }

    if (respostaCurta === 'NAO_SALVAR') {
      return { tipo: 'CONVERSA', mensagem: RESPOSTA_NAO_SALVAR };
    }

    // "Tira a jaqueta": sai do look da tela, sem outra peça no lugar e sem IA.
    const remocao = await this.removerDoLook(pecas, dto, historico);
    if (remocao) return remocao;

    // Resposta à pergunta do horário ("sábado à noite"): vale junto com o
    // pedido de antes ("look pra festa"). Assim a IA e as regras do texto
    // (balada, atividade, lugar) leem as duas coisas.
    const pedidoAnterior = pedidoAntesDaPergunta(historico);
    const pedido = pedidoAnterior ? `${pedidoAnterior}. ${dto.mensagem}` : dto.mensagem;

    let intencao = await this.interpretar(pedido, historico);

    // Ocasião dita com todas as letras ("trabalho amanhã") e a IA sem ocasião:
    // vale a do texto, sem a pergunta que a IA escreveu ("Qual o tipo de
    // trabalho?"). O tipo de trabalho não muda o look.
    const ocasiaoDita = ocasiaoDoTexto(pedido);
    if (!intencao.ocasiao && ocasiaoDita && intencao.tipo !== 'FORA_DE_ESCOPO') {
      intencao = { ...intencao, tipo: 'LOOK', ocasiao: ocasiaoDita, pergunta: null };
    }

    // "Quero uma blusa também" com um look na tela: acrescenta a camada e
    // mantém o resto, em vez de montar outro look com a blusa no lugar.
    const agasalhoPedido = intencao.incluir.some(
      (p) => p.categoria && CATEGORIAS_DE_AGASALHO.includes(p.categoria),
    );
    if (
      dto.pecasAnteriores?.length &&
      !intencao.trocar.length &&
      agasalhoPedido &&
      pedeParaAcrescentar(dto.mensagem)
    ) {
      intencao = { ...intencao, trocar: ['CAMADA'] };
    }

    // A IA às vezes copia a cor do look da tela para a peça pedida ("quero um
    // moletom também", depois de uma camiseta cinza, virava "moletom cinza").
    // Cor que a mensagem não cita e que é de uma peça da tela sai do pedido.
    if (dto.pecasAnteriores?.length && !falaDeCor(dto.mensagem)) {
      const anteriores = new Set(dto.pecasAnteriores);
      const coresDaTela = new Set(
        pecas.filter((p) => anteriores.has(p.id)).map((p) => lerSimbolo(p.colorAddSymbol).familia),
      );
      intencao = {
        ...intencao,
        incluir: intencao.incluir.map((pedido) =>
          pedido.cor && coresDaTela.has(pedido.cor.familia) ? { ...pedido, cor: null } : pedido,
        ),
      };
    }

    // Date: casual arrumado. A IA às vezes marca como festa ("encontro à
    // noite") e quase nunca dá formalidade, e aí a camisa social entrava.
    const encontro =
      falaDeEncontro(pedido) ||
      (historico.some((m) => m.autor === 'usuario' && falaDeEncontro(m.texto)) &&
        (!intencao.ocasiao || intencao.ocasiao === 'DIA_A_DIA' || intencao.ocasiao === 'FESTA'));
    if (encontro) {
      intencao = {
        ...intencao,
        ocasiao: !intencao.ocasiao || intencao.ocasiao === 'FESTA' ? 'DIA_A_DIA' : intencao.ocasiao,
        formalidade: intencao.formalidade ?? 'MEDIA',
      };
    }

    // Balada: pela mensagem ou, numa troca ("troca a blusa"), pela conversa.
    const balada =
      !encontro &&
      (falaDeBalada(pedido) ||
        (historico.some((m) => m.autor === 'usuario' && falaDeBalada(m.texto)) &&
          (!intencao.ocasiao || intencao.ocasiao === 'FESTA')));
    if (balada && !intencao.ocasiao) {
      intencao = { ...intencao, ocasiao: 'FESTA' };
    }

    // Atividade física (correr, trilha, parque): a pessoa vai suar, e só aí
    // entra a roupa de treino. No motor, é a ocasião ACADEMIA (10/11/2026).
    if (
      !encontro &&
      falaDeAtividadeFisica(pedido) &&
      intencao.ocasiao !== 'PRAIA' &&
      intencao.tipo !== 'FORA_DE_ESCOPO'
    ) {
      intencao = { ...intencao, tipo: 'LOOK', ocasiao: 'ACADEMIA' };
    }

    // Horário do evento (manhã, tarde, noite): a previsão das horas do evento,
    // e na festa, se é de dia ou à noite. Balada sem horário dito é à noite.
    // O dito pela pessoa vale mais; senão, o que a ocasião já diz (trabalho é
    // o expediente inteiro, praia é de dia, balada é à noite).
    const horario =
      horarioDoEvento(pedido, historico) ??
      horarioDaOcasiao(intencao.ocasiao) ??
      (balada ? { partes: ['NOITE' as const], inicio: 18, fim: 24, nome: 'À noite' } : null);
    const periodo = horario ? (horario.partes.includes('NOITE') ? 'NOITE' : 'DIA') : null;
    intencao = { ...intencao, periodo };

    if (intencao.tipo === 'ESCLARECER') {
      return { tipo: 'PERGUNTA', mensagem: intencao.pergunta ?? PERGUNTA_PADRAO };
    }

    if (intencao.tipo === 'FORA_DE_ESCOPO') {
      return { tipo: 'FORA_DE_ESCOPO', mensagem: FORA_DE_ESCOPO };
    }

    // Sem o horário, pergunta antes de montar (pedido da Sophia, 10/11/2026):
    // de manhã, à tarde e à noite o clima muda, e a festa de dia não é a da
    // noite. Pergunta quando o horário muda o look: na festa, ou quando há
    // previsão do tempo (localização) e a pessoa não disse o clima. Não pergunta
    // para ficar em casa, numa troca de peça, com um look já na tela ou se já
    // perguntou nesta conversa (sem resposta, o look segue o dia inteiro).
    const horarioMudaOLook =
      intencao.ocasiao === 'FESTA' ||
      (Boolean(dto.localizacao) && intencao.aquecimento === null && intencao.ocasiao !== 'CASA');
    if (
      !horario &&
      horarioMudaOLook &&
      !intencao.trocar.length &&
      !dto.pecasAnteriores?.length &&
      !jaPerguntouQuando(historico)
    ) {
      // Com o dia já dito ("amanhã", "sábado"), pergunta só o período.
      const diaDito = diaDaConversa(pedido, historico) !== null;
      return { tipo: 'PERGUNTA', mensagem: diaDito ? PERGUNTA_PERIODO_DO_DIA : PERGUNTA_QUANDO };
    }

    // Clima: o que o usuário disse vale mais que a previsão.
    const {
      intencao: comClima,
      clima,
      avisoClima,
      camadaLeve,
      chuvaPrevista,
      frioForte,
    } = await this.aplicarPrevisao(
      intencao,
      diasAte(diaDaConversa(pedido, historico), hojeNoBrasil()),
      dto.localizacao,
      horario,
    );
    intencao = comClima;

    const chuva = chuvaPrevista || falaDeChuva(pedido);
    // Lugar fechado (shopping, cinema): o ar-condicionado esfria. No dia
    // ameno, a camada leve pode entrar; no calor, o look segue a previsão e
    // só vem o aviso, uma vez por conversa.
    const lugar = lugarFechado(pedido, historico);
    const avisoDoAr =
      lugar &&
      intencao.aquecimento === 'LEVE' &&
      !historico.some((m) => m.texto.includes('ar-condicionado'))
        ? avisoDeArCondicionado(lugar)
        : null;
    const avisosDoDia = [avisoClima, avisoDoAr].filter((a): a is string => Boolean(a));

    const resultado = montarLook(pecas, intencao, {
      pecasAnteriores: dto.pecasAnteriores,
      pecasRecentes: dto.pecasRecentes,
      ultimoUso: new Map(
        pecas.filter((p) => p.sugeridaEm).map((p) => [p.id, p.sugeridaEm!] as const),
      ),
      // A IA lê "moletom ou jaqueta" como as duas peças; o texto diz que é uma.
      alternativas: alternativasDoPedido(pedido, intencao.incluir),
      encontro,
      balada,
      pediuSalto: pedeSalto(pedido),
      // "Friozinho" dito pela pessoa (sem previsão) também pede a camada leve,
      // e também o dia ameno num lugar com ar-condicionado ou com chuva.
      camadaLeve:
        camadaLeve || (intencao.aquecimento === 'MEDIO' && (!clima || Boolean(lugar) || chuva)),
      chuva,
      // Casaco pesado só com 13 °C ou menos (ou "muito frio" dito pela pessoa).
      frioForte: frioForte || falaDeFrioForte(pedido),
      // "Quero uma saia mais curta": o comprimento da mensagem atual.
      comprimento: comprimentoPedido(dto.mensagem),
      // "Confortável", viagem: pelo pedido ou, numa troca, pela conversa.
      conforto: pedeConforto(pedido) || (intencao.trocar.length > 0 && pedeConforto('', historico)),
    });

    if (resultado.status !== 'LOOK') {
      return resultado.status === 'SEM_LOOK'
        ? {
            tipo: 'SEM_LOOK',
            mensagem: resultado.mensagem,
            avisos: [...avisosDoDia, ...resultado.avisos],
          }
        : {
            tipo: 'POUCAS_PECAS',
            mensagem: resultado.mensagem,
            faltamSuperiores: resultado.faltamSuperiores,
            faltamInferiores: resultado.faltamInferiores,
          };
    }

    await this.registrarUso(
      usuario.id,
      resultado.pecas.map((p) => p.id),
    );

    const pecasDoLook = await this.pecasDaResposta(pecas, resultado.pecas);

    // Acréscimo ("põe uma jaqueta"): todas as peças da tela continuam no look.
    const manteveOLook =
      Boolean(dto.pecasAnteriores?.length) &&
      dto.pecasAnteriores!.every((id) => resultado.pecas.some((p) => p.id === id));

    return {
      tipo: 'LOOK',
      // Numa troca, só o que mudou: repetir o look inteiro deixava a conversa
      // pesada.
      mensagem: resultado.descricaoDaTroca
        ? `${manteveOLook ? 'Acrescentei' : 'Troquei por'} ${resultado.descricaoDaTroca}.`
        : resultado.descricao,
      ocasiao: intencao.ocasiao,
      // A previsão só aparece quando muda (de hoje para sábado, por exemplo):
      // repetida em toda mensagem, ela só ocupa espaço.
      clima: clima && !historico.some((m) => m.texto.includes(clima)) ? clima : null,
      avisos: [...avisosDoDia, ...resultado.avisos],
      pergunta: perguntaDoLook({
        temOcasiao: intencao.ocasiao !== null,
        temClima: intencao.aquecimento !== null,
        historico,
      }),
      pecas: pecasDoLook,
    };
  }

  /** As peças do look como o app recebe: os dados, o papel e as fotos (URLs assinadas). */
  private pecasDaResposta(pecas: Peca[], doLook: { id: string; papel: Papel }[]) {
    const porId = new Map(pecas.map((p) => [p.id, p]));
    return Promise.all(
      doLook.map(async ({ id, papel }) => {
        const { imagemS3Key, imagemMiniS3Key, ...dados } = porId.get(id)!;
        return {
          ...dados,
          papel,
          ...(await fotosDaPeca(this.s3, { imagemS3Key, imagemMiniS3Key })),
        };
      }),
    );
  }

  /**
   * "Tira a jaqueta", "sem o tênis" com um look na tela (pedido da Sophia,
   * 10/11/2026: "remove a jaqueta" virou outra camisa no lugar). A peça sai e
   * nada entra no lugar; o resto do look fica igual. Fica em código, e não na
   * IA, que lia como troca. Tirar a única peça de cima ou a de baixo deixaria o
   * look incompleto: aí a Zyra explica e oferece a troca, sem trocar sozinha.
   * null quando a mensagem não é um pedido de remover (segue o fluxo normal).
   */
  private async removerDoLook(
    pecas: Peca[],
    dto: SugerirLookDto,
    historico: MensagemHistorico[],
  ): Promise<RespostaLook | null> {
    const naTela = dto.pecasAnteriores ?? [];
    const categorias = naTela.length ? pecasParaRemover(dto.mensagem) : null;
    if (!categorias) return null;

    const doLook = naTela
      .map((id) => pecas.find((p) => p.id === id))
      .filter((p): p is Peca => Boolean(p));
    const papeis = papeisNoLook(doLook);
    const sair = doLook.filter((p) => categorias.includes(p.categoria));

    if (!sair.length) {
      return { tipo: 'CONVERSA', mensagem: 'Esse look não tem essa peça. O que você quer mudar?' };
    }

    // "a jaqueta de couro", "o tênis".
    const comArtigo = (p: Peca) => {
      const nome = nomeDaPeca(p);
      const feminino = NOMES_FEMININOS.includes(nome.split(' ')[0]);
      return `${feminino ? 'a' : 'o'} ${nome.toLowerCase()}`;
    };
    const nomes = sair.map(comArtigo).join(' e ');
    const fica = doLook.filter((p) => !sair.includes(p));
    const papeisQueFicam = new Set(fica.map((p) => papeis.get(p.id)));
    const ficaSemCima = !papeisQueFicam.has('SUPERIOR') && !papeisQueFicam.has('PECA_UNICA');
    const ficaSemBaixo = !papeisQueFicam.has('INFERIOR') && !papeisQueFicam.has('PECA_UNICA');
    if (ficaSemCima || ficaSemBaixo) {
      return {
        tipo: 'CONVERSA',
        mensagem: `Sem ${nomes}, o look fica incompleto. Se quiser, eu troco por outra peça: é só pedir "troca ${nomes}".`,
      };
    }

    return {
      tipo: 'LOOK',
      mensagem: `Pronto, tirei ${nomes} do look.`,
      clima: null,
      avisos: [],
      pergunta: perguntaDoLook({ temOcasiao: true, temClima: true, historico }),
      ocasiao: dto.lookMostrado?.ocasiao ?? null,
      pecas: await this.pecasDaResposta(
        pecas,
        fica.map((p) => ({ id: p.id, papel: papeis.get(p.id)! })),
      ),
    };
  }

  /**
   * Se o usuário não falou do clima e mandou a localização, usa a previsão do
   * dia do evento (hoje, se ele não disse). Sem localização ou se a previsão
   * falhar, o look sai sem clima, como antes.
   */
  private async aplicarPrevisao(
    intencao: Intencao,
    dias: number | null,
    localizacao?: Localizacao,
    horario?: Horario | null,
  ) {
    const semClima = {
      intencao,
      clima: null,
      avisoClima: null,
      camadaLeve: false,
      chuvaPrevista: false,
      frioForte: false,
    };
    if (intencao.aquecimento || !localizacao || dias === null) return semClima;

    const hoje = hojeNoBrasil();

    const previsao = await this.clima.previsao(localizacao, dias, horario);

    if (!previsao) {
      // Só avisa quando o dia está fora do alcance; falha da consulta passa em silêncio.
      return dias >= DIAS_DE_PREVISAO
        ? { ...semClima, avisoClima: 'Ainda não tem previsão do tempo para esse dia.' }
        : semClima;
    }

    return {
      intencao: { ...intencao, aquecimento: aquecimentoDaPrevisao(previsao) },
      clima: descreverPrevisao(previsao, hoje),
      avisoClima: null,
      camadaLeve: pedeCamadaLeve(previsao),
      chuvaPrevista: chanceDeChuvaDoLook(previsao) >= CHANCE_DE_CHUVA_AVISO,
      frioForte: fazFrioForte(previsao),
    };
  }

  /**
   * Marca as peças do look mostrado como usadas agora: na próxima conversa, o
   * motor dá preferência a outras. SQL direto para não mexer em `atualizadoEm`,
   * que o app usa para saber se a peça mudou. Uma falha aqui não derruba o chat.
   */
  private async registrarUso(usuarioId: string, pecaIds: string[]) {
    try {
      await this.prisma.$executeRaw`
        UPDATE "Peca" SET "sugeridaEm" = NOW()
        WHERE "usuarioId" = ${usuarioId} AND id = ANY(${pecaIds}::text[])`;
    } catch (error) {
      this.logger.warn(`Não foi possível registrar o uso das peças: ${String(error)}`);
    }
  }

  /** "Sim" para "Quer salvar esse look?": salva as peças do look que está na tela. */
  private async salvarLookMostrado(cognitoSub: string, dto: SugerirLookDto): Promise<RespostaLook> {
    const pecaIds = dto.pecasAnteriores ?? [];

    if (!pecaIds.length) {
      return { tipo: 'CONVERSA', mensagem: RESPOSTA_SEM_LOOK_PARA_SALVAR };
    }

    try {
      // Mesmo nome e ocasião que o popup de saída do app usaria.
      const look = await this.looksSalvos.salvar(cognitoSub, {
        pecaIds,
        nome: dto.lookMostrado?.nome || undefined,
        ocasiao: dto.lookMostrado?.ocasiao,
        pedido: dto.lookMostrado?.pedido,
      });
      return {
        tipo: 'SALVO',
        mensagem: look.jaEstavaSalvo ? RESPOSTA_JA_SALVO : RESPOSTA_SALVO,
        lookId: look.id,
        jaEstavaSalvo: look.jaEstavaSalvo,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        return { tipo: 'CONVERSA', mensagem: error.message };
      }
      throw error;
    }
  }

  /** Separado para os testes trocarem a chamada à OpenAI por uma resposta fixa. */
  protected async interpretar(mensagem: string, historico: MensagemHistorico[]) {
    try {
      const { intencao } = await interpretarPedido(this.cliente(), mensagem, historico);
      return intencao;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException(
        'Não consegui entender o pedido agora. Tente de novo em instantes.',
      );
    }
  }

  /**
   * Criado na primeira mensagem, não na subida do servidor: sem a chave,
   * só o chat fica indisponível, e o resto da API continua no ar.
   */
  private cliente() {
    if (!this.openai) {
      const apiKey = this.config.get<string>('OPENAI_API_KEY');

      if (!apiKey) {
        throw new ServiceUnavailableException('O chat de looks está indisponível no momento.');
      }

      this.openai = new OpenAI({ apiKey });
    }

    return this.openai;
  }
}
