import { IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min, MaxLength } from 'class-validator';

export class CreateGoodsReceiptLineDto {
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

  @IsNumber()
  @Min(0.001, { message: 'So luong phai lon hon 0' })
  quantity: number;

  @IsOptional()
  @IsInt()
  storageLocationId?: number;
}
