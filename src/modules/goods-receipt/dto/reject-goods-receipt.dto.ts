import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectGoodsReceiptDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  reason: string;
}
