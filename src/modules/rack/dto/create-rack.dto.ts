import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateRackDto {
  @IsInt()
  zoneId: number;

  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  code: string;

  @IsOptional()
  createdBy?: number;
}
