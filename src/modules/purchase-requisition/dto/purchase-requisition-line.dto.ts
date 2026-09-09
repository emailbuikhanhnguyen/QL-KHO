import { IsNotEmpty, IsNumber, IsOptional, IsString, Min, MaxLength } from 'class-validator';

export class PurchaseRequisitionLineDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  itemName: string;

  @IsNumber()
  @Min(0.001, { message: 'So luong phai lon hon 0' })
  quantity: number;

  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  unit: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
