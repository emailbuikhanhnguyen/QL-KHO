import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateWarehouseDto } from './create-warehouse.dto';

export class UpdateWarehouseDto extends PartialType(
  OmitType(CreateWarehouseDto, ['createdBy'] as const),
) {
  updatedBy?: number;
}
