import { Module } from '@nestjs/common';
import { VehicleBookingRequestController } from './vehicle-booking-request.controller';
import { VehicleBookingRequestService } from './vehicle-booking-request.service';

@Module({
  controllers: [VehicleBookingRequestController],
  providers: [VehicleBookingRequestService],
})
export class VehicleBookingRequestModule {}
