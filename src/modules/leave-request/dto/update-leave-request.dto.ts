import { PartialType } from '@nestjs/mapped-types';
import { CreateLeaveRequestDto } from './create-leave-request.dto';

// Chi cho sua khi con DRAFT (kiem tra o service)
export class UpdateLeaveRequestDto extends PartialType(CreateLeaveRequestDto) {}
