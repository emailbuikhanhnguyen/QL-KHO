import { Module } from '@nestjs/common';
import { WarehouseTransferService } from './warehouse-transfer.service';
import { WarehouseTransferController } from './warehouse-transfer.controller';

@Module({
  controllers: [WarehouseTransferController],
  providers: [WarehouseTransferService],
  exports: [WarehouseTransferService],
})
export class WarehouseTransferModule {}
