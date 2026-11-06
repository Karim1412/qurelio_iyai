import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService }                    from '@nestjs/config';
import * as Minio                           from 'minio';
import type { Readable }                    from 'stream';

/**
 * Two MinIO clients (same pattern as auth avatar storage):
 * - Internal: Docker hostname `minio` for put/get/delete inside the network.
 * - Presign: Browser-reachable host (MINIO_PUBLIC_URL) for presignedGetObject only.
 * Do not rewrite hosts on URLs: SigV4 includes the host.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly internal: Minio.Client;
  private readonly presign: Minio.Client;
  private bucket: string;

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
      `Document storage: internal ${internalEnd}:${internalPort}, presigned URLs ${pub.endPoint}:${pub.port}`,
    );
  }

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
        this.logger.log(`Bucket '${this.bucket}' created`);
      }
    } catch (e) {
      this.logger.error(`MinIO init failed: ${e.message}`);
    }
  }

  /**
   * Build storage key with product folder structure
   * NEW: If productId is provided, organize as: companyId/products/productName/type/filename
   * OLD: companyId/type/filename (for company-wide docs like ISO norms)
   */
  buildKey(companyId: string, type: string, filename: string, productName?: string, productId?: string): string {
    if (productName && productId) {
      // Product doc: company-xyz/products/Widget_A/PRODUCT_DOC/1712580000000-spec.pdf
      const sanitizedProductName = productName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
      return `${companyId}/products/${sanitizedProductName}/${type}/${Date.now()}-${filename}`;
    }
    // Company-wide doc: company-xyz/ISO_NORM/1712580000000-norm.pdf
    return `${companyId}/${type}/${Date.now()}-${filename}`;
  }

  async upload(key: string, buffer: Buffer, mimeType: string): Promise<void> {
    await this.internal.putObject(this.bucket, key, buffer, buffer.length, { 'Content-Type': mimeType });
  }

  async download(key: string): Promise<Buffer> {
    const stream = await this.internal.getObject(this.bucket, key);
    return new Promise((res, rej) => {
      const chunks: Buffer[] = [];
      stream.on('data',  (c) => chunks.push(c));
      stream.on('end',   () => res(Buffer.concat(chunks)));
      stream.on('error', rej);
    });
  }

  /**
   * Presigned GET (browser must reach MINIO_PUBLIC_URL). Prefer {@link getObjectStream} for downloads
   * to avoid Docker/host signing issues.
   */
  async presignedUrl(key: string, expiry = 3600): Promise<string> {
    return this.presign.presignedGetObject(this.bucket, key, expiry);
  }

  /** Stream object bytes via internal endpoint (gateway / app download, no browser MinIO URL). */
  async getObjectStream(key: string): Promise<Readable> {
    return this.internal.getObject(this.bucket, key);
  }

  async delete(key: string): Promise<void> {
    await this.internal.removeObject(this.bucket, key);
  }
}
