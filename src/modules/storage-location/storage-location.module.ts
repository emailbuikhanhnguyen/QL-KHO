import { Module } from '@nestjs/common';
import { StorageLocationService } from './storage-location.service';
import { StorageLocationController } from './storage-location.controller';

@Module({
  controllers: [StorageLocationController],
  providers: [StorageLocationService],
  exports: [StorageLocationService],
})
export class StorageLocationModule {}
