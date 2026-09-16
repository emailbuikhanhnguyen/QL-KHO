import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CheckInGuestDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
