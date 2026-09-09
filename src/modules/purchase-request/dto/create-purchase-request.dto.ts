import { IsArray, IsInt, ArrayMinSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PurchaseRequestLineDto } from './purchase-request-line.dto';

export class CreatePurchaseRequestDto {
  @IsInt()
  purchaseRequisitionId: number;

  @IsArray()
  @ArrayMinSize(1, { message: 'Phai co it nhat 1 dong vat tu' })
  @ValidateNested({ each: true })
  @Type(() => PurchaseRequestLineDto)
  lines: PurchaseRequestLineDto[];
}
