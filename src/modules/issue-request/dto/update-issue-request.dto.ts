import { PartialType } from '@nestjs/mapped-types';
import { CreateIssueRequestDto } from './create-issue-request.dto';

// Chi duoc goi khi phieu con DRAFT (kiem tra trong service).
export class UpdateIssueRequestDto extends PartialType(CreateIssueRequestDto) {}
