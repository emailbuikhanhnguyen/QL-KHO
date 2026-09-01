import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateIssueRequestLineDto } from './create-issue-request-line.dto';

export class CreateIssueRequestDto {
  @IsInt()
  warehouseId: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Phieu xuat phai co it nhat 1 dong hang' })
  @ValidateNested({ each: true })
  @Type(() => CreateIssueRequestLineDto)
  lines: CreateIssueRequestLineDto[];
}
