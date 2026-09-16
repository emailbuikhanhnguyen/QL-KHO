import { Module } from '@nestjs/common';
import { MyApprovalsController } from './my-approvals.controller';
import { MyApprovalsService } from './my-approvals.service';
import { ElectronicDocumentModule } from '../electronic-document/electronic-document.module';

@Module({
  imports: [ElectronicDocumentModule], // them 14/09/2026 — de goi ElectronicDocumentService.findPendingForUser
  controllers: [MyApprovalsController],
  providers: [MyApprovalsService],
})
export class MyApprovalsModule {}
