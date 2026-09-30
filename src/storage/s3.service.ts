import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// O bucket e privado: o app nunca recebe um link permanente, so URLs assinadas
// que expiram. Uma hora cobre com folga uma sessao de uso do closet.
const URL_EXPIRA_EM_SEGUNDOS = 60 * 60;

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(configService: ConfigService) {
    // As credenciais (AWS_ACCESS_KEY_ID e AWS_SECRET_ACCESS_KEY) sao lidas do
    // ambiente pelo proprio SDK, sem passar por aqui.
    this.client = new S3Client({ region: configService.getOrThrow<string>('AWS_REGION') });
    this.bucket = configService.getOrThrow<string>('S3_BUCKET');
  }

  async upload(key: string, body: Buffer, contentType: string) {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    } catch (error) {
      this.logger.error(`Falha ao enviar ${key} para o S3`, error);

      throw new ServiceUnavailableException(
        'Não foi possível guardar a foto da peça agora. Tente novamente.',
      );
    }
  }

  getReadUrl(key: string) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: URL_EXPIRA_EM_SEGUNDOS,
    });
  }

  /**
   * Apaga o arquivo sem derrubar quem chamou. Usado na limpeza: um arquivo
   * orfao no bucket e ruim, mas nao pode impedir a exclusao da peca nem
   * esconder o erro original de um cadastro que falhou.
   */
  async deleteQuietly(key: string) {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      this.logger.warn(`Nao foi possivel apagar ${key} do S3`, error);
    }
  }
}
