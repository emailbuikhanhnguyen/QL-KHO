import { Module } from '@nestjs/common';
import { GatePassRequestController } from './gate-pass-request.controller';
import { GatePassRequestService } from './gate-pass-request.service';

@Module({
  controllers: [GatePassRequestController],
  providers: [GatePassRequestService],
})
export class GatePassRequestModule {}
