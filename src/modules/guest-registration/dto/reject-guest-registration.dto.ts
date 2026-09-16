import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectGuestRegistrationDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  reason: string;
}
