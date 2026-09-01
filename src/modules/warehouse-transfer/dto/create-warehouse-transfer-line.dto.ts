import { IsInt, IsNumber, Min } from 'class-validator';

export class CreateWarehouseTransferLineDto {
  @IsInt()
  lotId: number;

  @IsNumber()
  @Min(0.001, { message: 'So luong phai lon hon 0' })
  quantity: number;
}
