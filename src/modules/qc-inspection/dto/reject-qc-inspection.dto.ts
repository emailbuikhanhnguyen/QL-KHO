import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectQcInspectionDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  reason: string;
}
