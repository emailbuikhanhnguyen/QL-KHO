import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectDisposalRequestDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  reason: string;
}
