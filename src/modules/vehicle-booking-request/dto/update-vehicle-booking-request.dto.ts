import { PartialType } from '@nestjs/mapped-types';
import { CreateVehicleBookingRequestDto } from './create-vehicle-booking-request.dto';

// Chi cho sua khi con DRAFT (kiem tra o service)
export class UpdateVehicleBookingRequestDto extends PartialType(CreateVehicleBookingRequestDto) {}
