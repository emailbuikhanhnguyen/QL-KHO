import { Module } from '@nestjs/common';
import { IssueRequestService } from './issue-request.service';
import { IssueRequestController } from './issue-request.controller';

@Module({
  controllers: [IssueRequestController],
  providers: [IssueRequestService],
  exports: [IssueRequestService],
})
export class IssueRequestModule {}
