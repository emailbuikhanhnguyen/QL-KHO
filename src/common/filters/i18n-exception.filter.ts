import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { normalizeLang, translateMessage } from '../i18n/i18n.util';

// Bo loc loi toan cuc — bat MOI HttpException (bao gom cac exception co san
// cua NestJS nhu NotFoundException, BadRequestException...).
//
// Neu exception duoc nem ra dang { key, params } (quy uoc rieng cua du an
// nay — xem cac service da cap nhat), se tu dong dich message theo ngon
// ngu client yeu cau (header Accept-Language: vi|en|zh, mac dinh vi).
//
// Neu KHONG phai dang { key, params } (vi du: loi tu ValidationPipe tra ve
// mang chuoi, hoac exception cu chua kip chuyen sang co che nay), giu
// nguyen response nhu cu — dam bao khong lam hong bat ky loi nao khac.
@Catch(HttpException)
export class I18nExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception.getResponse();

    const lang = normalizeLang(request.headers['accept-language']);

    // Truong hop duoc gan tag { key, params } — dich lai message. Giu
    // nguyen moi truong PHU khac (VD: outOfTolerance) — chi thay the
    // rieng phan message, khong lam mat du lieu di kem.
    if (body && typeof body === 'object' && 'key' in (body as any)) {
      const { key, params, ...rest } = body as {
        key: string;
        params?: Record<string, string | number>;
        [extra: string]: unknown;
      };
      const translated = translateMessage(key, lang, params || {});
      return response.status(status).json({
        statusCode: status,
        message: translated,
        ...rest,
      });
    }

    // Cac truong hop khac — giu nguyen, khong dong tay vao
    return response.status(status).json(body);
  }
}
