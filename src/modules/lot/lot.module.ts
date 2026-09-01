import { Module } from '@nestjs/common';
import { LotService } from './lot.service';
import { LotController } from './lot.controller';

@Module({
  controllers: [LotController],
  providers: [LotService],
  exports: [LotService],
})
export class LotModule {}
