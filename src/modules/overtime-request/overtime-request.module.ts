import { Module } from '@nestjs/common';
import { OvertimeRequestController } from './overtime-request.controller';
import { OvertimeRequestService } from './overtime-request.service';

@Module({
  controllers: [OvertimeRequestController],
  providers: [OvertimeRequestService],
})
export class OvertimeRequestModule {}
