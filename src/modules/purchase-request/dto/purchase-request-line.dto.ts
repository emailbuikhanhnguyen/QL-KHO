import { IsNotEmpty, IsNumber, IsString, Min, MaxLength } from 'class-validator';

export class PurchaseRequestLineDto {
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

  @IsNumber()
  @Min(0, { message: 'Don gia khong duoc am' })
  unitPriceUsd: number;
}
