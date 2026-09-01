import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateLotDto } from './create-lot.dto';

export class UpdateLotDto extends PartialType(
  OmitType(CreateLotDto, ['createdBy'] as const),
) {
  updatedBy?: number;
}
