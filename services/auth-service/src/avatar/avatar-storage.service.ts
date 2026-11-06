import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

/**
 * Uses two MinIO clients:
 * - Internal: Docker hostname `minio` (or MINIO_ENDPOINT) for put/remove, works inside the network.
 * - Presign: Browser-reachable host (MINIO_PUBLIC_URL or localhost + MINIO_PORT) for presignedGetObject only.
 *
 * Do NOT string-replace hosts on presigned URLs: SigV4 includes the host; replacing breaks the signature.
 */
@Injectable()
export class AvatarStorageService implements OnModuleInit {
  private readonly logger = new Logger(AvatarStorageService.name);
  private readonly bucket: string;
  /** Upload / delete: always use service-to-service endpoint */
  private readonly internal: Minio.Client;
  /** Presigned GET URLs: must use the same Host the user’s browser will use */
  private readonly presign: Minio.Client;

  constructor(private cfg: ConfigService) {
    this.bucket = this.cfg.get('MINIO_BUCKET', 'qurelio-docs');
    const accessKey = this.cfg.get('MINIO_ACCESS_KEY');
    const secretKey = this.cfg.get('MINIO_SECRET_KEY');
    const useSSL = this.cfg.get('MINIO_USE_SSL', 'false') === 'true';

    const internalEnd = this.cfg.get('MINIO_ENDPOINT', 'localhost');
    const internalPort = Number(this.cfg.get('MINIO_PORT', 9000));

    this.internal = new Minio.Client({
      endPoint: internalEnd,
      port: internalPort,
      useSSL,
      accessKey,
      secretKey,
    });

    const pub = this.parsePublicMinioEndpoint();
    this.presign = new Minio.Client({
      endPoint: pub.endPoint,
      port: pub.port,
      useSSL: pub.useSSL,
      accessKey,
      secretKey,
    });

    this.logger.log(
      `Avatar storage: internal ${internalEnd}:${internalPort}, presign URLs ${pub.endPoint}:${pub.port}`,
    );
  }

  /**
   * Host/port the browser uses to load images (must match presigned signature).
   */
  private parsePublicMinioEndpoint(): { endPoint: string; port: number; useSSL: boolean } {
    const raw = (this.cfg.get('MINIO_PUBLIC_URL', '') || '').trim();
    if (raw) {
      try {
        const u = new URL(raw);
        const useSSL = u.protocol === 'https:';
        let port = u.port ? parseInt(u.port, 10) : useSSL ? 443 : 80;
        if (!u.port && (port === 80 || port === 443)) {
          port = Number(this.cfg.get('MINIO_PORT', 9000));
        }
        return { endPoint: u.hostname, port, useSSL };
      } catch {
        this.logger.warn(`MINIO_PUBLIC_URL invalid (${raw}), falling back to localhost`);
      }
    }
    const useSSL = this.cfg.get('MINIO_USE_SSL', 'false') === 'true';
    return {
      endPoint: 'localhost',
      port: Number(this.cfg.get('MINIO_PORT', 9000)),
      useSSL,
    };
  }

  async onModuleInit() {
    try {
      const exists = await this.internal.bucketExists(this.bucket);
      if (!exists) {
        await this.internal.makeBucket(this.bucket, 'us-east-1');
        this.logger.log(`MinIO bucket '${this.bucket}' ready for avatars`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`MinIO avatar bucket check failed: ${msg}`);
    }
  }

  async upload(key: string, buffer: Buffer, mimeType: string): Promise<void> {
    await this.internal.putObject(this.bucket, key, buffer, buffer.length, { 'Content-Type': mimeType });
  }

  async remove(key: string): Promise<void> {
    await this.internal.removeObject(this.bucket, key);
  }

  async presignedGetUrl(key: string, expirySec = 604800): Promise<string> {
    return this.presign.presignedGetObject(this.bucket, key, expirySec);
  }

  /** Load bytes from MinIO (used for JWT-protected avatar HTTP GET). */
  async getObjectBuffer(key: string): Promise<Buffer> {
    const stream = await this.internal.getObject(this.bucket, key);
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
}
