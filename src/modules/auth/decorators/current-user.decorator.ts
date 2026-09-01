import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Vi du dung: findAll(@CurrentUser() user: RequestUser)
export const CurrentUser = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
