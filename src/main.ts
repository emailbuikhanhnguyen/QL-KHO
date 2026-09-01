import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { I18nExceptionFilter } from './common/filters/i18n-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  // Dich thong bao loi da duoc gan tag { key, params } sang dung ngon ngu
  // client yeu cau (header Accept-Language: vi|en|zh). Cac loi khac
  // (VD: tu ValidationPipe) khong bi anh huong.
  app.useGlobalFilters(new I18nExceptionFilter());
  app.setGlobalPrefix('api');

  // Swagger UI — dung de demo va test API truc tiep tren trinh duyet,
  // khong can Postman/curl. Bam nut "Authorize" o goc tren ben phai,
  // dan vao accessToken lay tu POST /api/auth/login la goi thu duoc
  // moi endpoint can dang nhap.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Kho NPL API')
    .setDescription(
      'API He thong Quan ly Kho NPL (nguyen phu lieu nganh may). ' +
        'De test endpoint can dang nhap: goi POST /auth/login truoc, ' +
        'copy accessToken, bam nut Authorize o goc tren ben phai va dan vao.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token', // ten dinh danh, phai khop voi @ApiBearerAuth('access-token') o cac controller
    )
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`NPL Warehouse backend running on port ${port}`);
  // eslint-disable-next-line no-console
  console.log(`Swagger UI: http://localhost:${port}/api/docs`);
}
bootstrap();
