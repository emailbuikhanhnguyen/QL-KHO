import { IsInt, IsOptional } from 'class-validator';

export class SetReportsToDto {
  // null = xoa cap tren (dinh cao nhat, VD Giam doc khong bao cao ai ca)
  @IsOptional()
  @IsInt()
  reportsToId?: number | null;
}
