import { IsInt, IsNotEmpty, IsNumber, IsString, Min, MaxLength } from 'class-validator';

export class CreateDisposalRequestDto {
  @IsInt()
  lotId: number;

  @IsInt()
  warehouseId: number;

  @IsNumber()
  @Min(0.001, { message: 'So luong huy phai lon hon 0' })
  quantity: number;

  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  reason: string;
}
