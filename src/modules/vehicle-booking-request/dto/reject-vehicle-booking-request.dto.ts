import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectVehicleBookingRequestDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  reason: string;
}
