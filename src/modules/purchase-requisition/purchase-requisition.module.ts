import { Module } from '@nestjs/common';
import { PurchaseRequisitionController } from './purchase-requisition.controller';
import { PurchaseRequisitionService } from './purchase-requisition.service';
import { NotificationModule } from '../../common/notification/notification.module';

@Module({
  imports: [NotificationModule],
  controllers: [PurchaseRequisitionController],
  providers: [PurchaseRequisitionService],
})
export class PurchaseRequisitionModule {}
