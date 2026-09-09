import { IsDateString, IsInt, IsNotEmpty, IsString, Min, MaxLength, Matches } from 'class-validator';

export class CreateVehicleBookingRequestDto {
  @IsDateString()
  useDate: string;

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'startTime phai dang HH:mm' })
  startTime: string;

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'endTime phai dang HH:mm' })
  endTime: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  departure: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  destination: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  purpose: string;

  @IsInt()
  @Min(1, { message: 'So nguoi phai lon hon 0' })
  numberOfPeople: number;
}
