import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Bat buoc dang nhap (Bearer token hop le) moi duoc goi API
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
