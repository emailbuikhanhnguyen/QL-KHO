import { IsArray, ArrayMinSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PurchaseRequestLineDto } from './purchase-request-line.dto';

// Chi cho sua khi con DRAFT (kiem tra o service) — khong cho doi
// purchaseRequisitionId (gan chat voi 1 Requisition tu luc tao).
export class UpdatePurchaseRequestDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Phai co it nhat 1 dong vat tu' })
  @ValidateNested({ each: true })
  @Type(() => PurchaseRequestLineDto)
  lines: PurchaseRequestLineDto[];
}
