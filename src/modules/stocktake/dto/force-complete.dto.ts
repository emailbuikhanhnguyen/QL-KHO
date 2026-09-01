import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ForceCompleteDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  reason: string;
}
