import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { QcStatus } from '@prisma/client';

export class CreateLotDto {
  @IsInt()
  itemId: number;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  lotCode: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  size?: string;

  @IsOptional()
  @IsDateString()
  manufactureDate?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsInt()
  supplierId: number;

  @IsOptional()
  @IsEnum(QcStatus)
  qcStatus?: QcStatus;

  @IsOptional()
  createdBy?: number;
}
