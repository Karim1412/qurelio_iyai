import { NestFactory }    from '@nestjs/core';
import { Logger }          from '@nestjs/common';
import { AppModule }       from './app.module';
import helmet              from 'helmet';

async function bootstrap() {
  const logger = new Logger('Gateway');
  const app    = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.use(helmet());
  const defaultUi = ['http://localhost:3001', 'http://127.0.0.1:3001'];
  const fromEnv = process.env.FRONTEND_URL?.trim();
  const origins = fromEnv ? [...defaultUi, fromEnv] : defaultUi;

  app.enableCors({
    origin:      origins,
    credentials: true,
    methods:     ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`API Gateway → http://localhost:${port}/api`);
}
bootstrap();
