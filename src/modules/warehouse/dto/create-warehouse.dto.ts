import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateWarehouseDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  code: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  createdBy?: number;
}
