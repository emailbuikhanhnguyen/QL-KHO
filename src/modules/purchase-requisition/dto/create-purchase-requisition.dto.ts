import { IsArray, IsNotEmpty, IsString, MaxLength, ArrayMinSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PurchaseRequisitionLineDto } from './purchase-requisition-line.dto';

export class CreatePurchaseRequisitionDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  reason: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Phai co it nhat 1 dong vat tu' })
  @ValidateNested({ each: true })
  @Type(() => PurchaseRequisitionLineDto)
  lines: PurchaseRequisitionLineDto[];
}
