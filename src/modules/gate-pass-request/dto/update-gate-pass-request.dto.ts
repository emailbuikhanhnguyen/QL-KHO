import { PartialType } from '@nestjs/mapped-types';
import { CreateGatePassRequestDto } from './create-gate-pass-request.dto';

// Chi cho sua khi con DRAFT (kiem tra o service)
export class UpdateGatePassRequestDto extends PartialType(CreateGatePassRequestDto) {}
