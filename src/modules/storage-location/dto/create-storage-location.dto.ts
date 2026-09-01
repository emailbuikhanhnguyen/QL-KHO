import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min, MaxLength } from 'class-validator';

export class CreateStorageLocationDto {
  @IsInt()
  rackId: number;

  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  code: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxCapacity?: number;

  @IsOptional()
  createdBy?: number;
}
