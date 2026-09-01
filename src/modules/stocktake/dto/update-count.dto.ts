import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateCountDto {
  @IsNumber()
  @Min(0, { message: 'So luong dem khong duoc am' })
  countedQuantity: number;

  @IsOptional()
  @IsString()
  note?: string;
}
