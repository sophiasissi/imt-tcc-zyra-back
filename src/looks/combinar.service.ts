import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { fotosDaPeca } from '../pecas/fotos-da-peca';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { sugerirCombinacoes } from './combinar';
import { CombinarDto } from './dto/combinar.dto';
import { PAPEL_DA_CATEGORIA } from './taxonomia';

@Injectable()
export class CombinarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  /**
   * Até duas peças do armário que combinam com a peça fotografada, para a tela
   * que aparece antes do cadastro. Sem IA e sem custo.
   */
  async combinar(cognitoSub: string, dto: CombinarDto) {
    const usuario = await this.prisma.usuario.findUnique({ where: { cognitoSub } });

    if (!usuario) {
      throw new NotFoundException(
        'Não encontramos um cadastro no ZYRA para este usuário. Faça seu cadastro para continuar.',
      );
    }

    const pecas = await this.prisma.peca.findMany({ where: { usuarioId: usuario.id } });

    let resultado: ReturnType<typeof sugerirCombinacoes>;
    try {
      resultado = sugerirCombinacoes(pecas, dto, { excluir: dto.excluir });
    } catch {
      // Símbolo ColorADD que não existe (o DTO só confere o formato).
      throw new BadRequestException('Cor da peça inválida.');
    }

    if (resultado.status !== 'OK') {
      return resultado;
    }

    const porId = new Map(pecas.map((p) => [p.id, p]));
    const sugestoes = await Promise.all(
      resultado.sugestoes.map(async ({ pecaId, motivo }) => {
        const { imagemS3Key, imagemMiniS3Key, ...dados } = porId.get(pecaId)!;
        return {
          motivo,
          peca: {
            ...dados,
            papel: PAPEL_DA_CATEGORIA[dados.categoria],
            ...(await fotosDaPeca(this.s3, { imagemS3Key, imagemMiniS3Key })),
          },
        };
      }),
    );

    return { status: 'OK' as const, sugestoes };
  }
}
