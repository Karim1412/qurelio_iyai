import { NestFactory }    from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule }     from './app.module';

async function bootstrap() {
  const logger = new Logger('EvaluationService');
  const app    = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: process.env.FRONTEND_URL || 'http://localhost:3001', credentials: true });
  const port = process.env.PORT || 3005;
  await app.listen(port);
  logger.log(`Evaluation Service → http://localhost:${port}/api`);
}
bootstrap();
