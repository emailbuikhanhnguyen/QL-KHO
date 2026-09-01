import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateGoodsReceiptLineDto } from './create-goods-receipt-line.dto';

export class CreateGoodsReceiptDto {
  @IsInt()
  warehouseId: number;

  @IsInt()
  supplierId: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  poNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  packingListNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Phieu nhap phai co it nhat 1 dong hang' })
  @ValidateNested({ each: true })
  @Type(() => CreateGoodsReceiptLineDto)
  lines: CreateGoodsReceiptLineDto[];

  @IsOptional()
  createdBy?: number;
}
