import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectPurchaseRequisitionDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  reason: string;
}
