import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateQcInspectionDto } from './create-qc-inspection.dto';

export class UpdateQcInspectionDto extends PartialType(
  OmitType(CreateQcInspectionDto, ['createdBy', 'lotId'] as const),
) {
  updatedBy?: number;
}
