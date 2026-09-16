import { Module } from '@nestjs/common';
import { ElectronicDocumentController } from './electronic-document.controller';
import { ElectronicDocumentService } from './electronic-document.service';
import { NotificationModule } from '../../common/notification/notification.module';

@Module({
  imports: [NotificationModule],
  controllers: [ElectronicDocumentController],
  providers: [ElectronicDocumentService],
  exports: [ElectronicDocumentService], // them 14/09/2026 — de MyApprovalsModule dung duoc
})
export class ElectronicDocumentModule {}
