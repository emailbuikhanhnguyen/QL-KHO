import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectOvertimeRequestDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  reason: string;
}
