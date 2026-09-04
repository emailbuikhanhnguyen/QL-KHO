import { Module } from '@nestjs/common';
import { DisposalRequestController } from './disposal-request.controller';
import { DisposalRequestService } from './disposal-request.service';

@Module({
  controllers: [DisposalRequestController],
  providers: [DisposalRequestService],
})
export class DisposalRequestModule {}
