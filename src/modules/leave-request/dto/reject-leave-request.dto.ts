import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectLeaveRequestDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  reason: string;
}
