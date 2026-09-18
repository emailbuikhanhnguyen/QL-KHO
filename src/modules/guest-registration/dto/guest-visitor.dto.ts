import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class GuestVisitorDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  fullName: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(30)
  idNumber: string; // CCCD hoac Passport

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
