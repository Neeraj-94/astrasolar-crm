import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());

  // Versioned API surface (BUILD-PLAN §9).
  app.setGlobalPrefix('api/v1');

  // Never trust client input — validate + strip unknown props everywhere.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // CORS locked to the Netlify web origin; credentials for httpOnly cookies.
  app.enableCors({
    origin: (process.env.WEB_ORIGIN || 'http://localhost:3000').split(','),
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('AstraSolar CRM API')
    .setDescription('Role-based operational + analytical CRM for solar/battery.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, doc);

  const port = Number(process.env.PORT) || 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on :${port} (docs at /api/docs)`);
}

bootstrap();
