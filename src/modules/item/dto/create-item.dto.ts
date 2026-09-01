import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min, MaxLength } from 'class-validator';

export class CreateItemDto {
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
  spec?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(20)
  unit: string;

  @IsInt()
  itemGroupId: number;

  @IsNumber()
  @Min(0)
  minStock: number;

  @IsNumber()
  @Min(0)
  maxStock: number;

  @IsOptional()
  isActive?: boolean;

  @IsOptional()
  createdBy?: number;
}
