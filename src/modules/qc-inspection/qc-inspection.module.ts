import { Module } from '@nestjs/common';
import { QcInspectionService } from './qc-inspection.service';
import { QcInspectionController } from './qc-inspection.controller';

@Module({
  controllers: [QcInspectionController],
  providers: [QcInspectionService],
  exports: [QcInspectionService],
})
export class QcInspectionModule {}
