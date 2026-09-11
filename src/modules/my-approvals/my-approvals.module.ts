import { Module } from '@nestjs/common';
import { MyApprovalsController } from './my-approvals.controller';
import { MyApprovalsService } from './my-approvals.service';

@Module({
  controllers: [MyApprovalsController],
  providers: [MyApprovalsService],
})
export class MyApprovalsModule {}
