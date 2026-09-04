import { PartialType } from '@nestjs/mapped-types';
import { CreateDisposalRequestDto } from './create-disposal-request.dto';

// Chi cho sua khi con DRAFT (kiem tra o service) — dung PartialType de cho
// phep sua 1 phan (VD: chi doi ly do, giu nguyen so luong).
export class UpdateDisposalRequestDto extends PartialType(CreateDisposalRequestDto) {}
