import { IsInt, IsOptional, IsString } from 'class-validator';

export class StartStocktakeDto {
  @IsInt()
  warehouseId: number;

  @IsOptional()
  @IsString()
  note?: string;
}
