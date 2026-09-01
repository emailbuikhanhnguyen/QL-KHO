import { IsEmail, IsEnum, IsInt, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { Role } from '@prisma/client';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8, { message: 'Mat khau phai co it nhat 8 ky tu' })
  password: string;

  @IsNotEmpty()
  @IsString()
  fullName: string;

  @IsEnum(Role)
  role: Role;

  @IsInt()
  departmentId: number;
}
