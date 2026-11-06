import { NestFactory }    from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule }     from './app.module';

async function bootstrap() {
  const logger = new Logger('DocumentService');
  const token = (process.env.DOCUMENT_INTERNAL_TOKEN ?? '').trim();
  const ragOn = (process.env.RAG_INGEST_ENABLED ?? 'true').toLowerCase() !== 'false';
  if (ragOn && !token) {
    logger.warn(
      'DOCUMENT_INTERNAL_TOKEN is empty: rag-service cannot PATCH /documents/internal/extraction; documents may stay PROCESSING.',
    );
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  /** RAG internal PATCH sends extractedText + large extractedStructured (ISO clause bodies); default ~100kb is too small. */
  app.useBodyParser('json', { limit: process.env.JSON_BODY_LIMIT || '25mb' });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: process.env.FRONTEND_URL || 'http://localhost:3001', credentials: true });
  const port = process.env.PORT || 3003;
  await app.listen(port);
  logger.log(`Document Service → http://localhost:${port}/api`);
}
bootstrap();
