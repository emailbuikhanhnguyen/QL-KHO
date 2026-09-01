import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateWarehouseTransferLineDto } from './create-warehouse-transfer-line.dto';

export class CreateWarehouseTransferDto {
  @IsInt()
  sourceWarehouseId: number;

  @IsInt()
  destWarehouseId: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Phieu dieu chuyen phai co it nhat 1 dong hang' })
  @ValidateNested({ each: true })
  @Type(() => CreateWarehouseTransferLineDto)
  lines: CreateWarehouseTransferLineDto[];
}
