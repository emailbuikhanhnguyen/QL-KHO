import { IsNotEmpty, IsOptional, IsString, IsDateString, MaxLength } from 'class-validator';

export class CreateGuestRegistrationDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  visitorFullName: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(30)
  idNumber: string; // CCCD hoac Passport

  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  companyName: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  purpose?: string;

  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @IsNotEmpty()
  @IsDateString()
  endDate: string;
}
