import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateRackDto } from './create-rack.dto';

export class UpdateRackDto extends PartialType(
  OmitType(CreateRackDto, ['createdBy'] as const),
) {
  updatedBy?: number;
}
