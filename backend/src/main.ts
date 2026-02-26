// ============================================================
// PIK — Persistent Identity Kernel
// Application Bootstrap
// Place at: src/main.ts
// ============================================================

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const logger = new Logger('PIK');
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-PIK-API-Key'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  const port = parseInt(process.env.PORT ?? '8080', 10);
  await app.listen(port);

  logger.log('');
  logger.log('PIK — Persistent Identity Kernel');
  logger.log(`API running at    http://localhost:${port}`);
  logger.log(`Dashboard at      http://localhost:${port}/`);
  logger.log(`Environment       ${process.env.NODE_ENV || 'development'}`);
  logger.log('');
  logger.log('Press Ctrl+C to stop.');
}

bootstrap();
