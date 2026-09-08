import { Module } from '@nestjs/common';
import { LeaveRequestController } from './leave-request.controller';
import { LeaveRequestService } from './leave-request.service';

@Module({
  controllers: [LeaveRequestController],
  providers: [LeaveRequestService],
})
export class LeaveRequestModule {}
