import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateStorageLocationDto } from './create-storage-location.dto';

export class UpdateStorageLocationDto extends PartialType(
  OmitType(CreateStorageLocationDto, ['createdBy'] as const),
) {
  updatedBy?: number;
}
