import { Module } from '@nestjs/common';
import { ItemGroupService } from './item-group.service';
import { ItemGroupController } from './item-group.controller';

@Module({
  controllers: [ItemGroupController],
  providers: [ItemGroupService],
  exports: [ItemGroupService],
})
export class ItemGroupModule {}
