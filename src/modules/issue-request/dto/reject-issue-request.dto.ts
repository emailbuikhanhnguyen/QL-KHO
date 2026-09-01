import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectIssueRequestDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  reason: string;
}
