import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateItemGroupDto } from './create-item-group.dto';

export class UpdateItemGroupDto extends PartialType(
  OmitType(CreateItemGroupDto, ['createdBy'] as const),
) {
  updatedBy?: number;
}
