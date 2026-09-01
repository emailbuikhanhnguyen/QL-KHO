import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { QcStatus } from '@prisma/client';

// Ket qua khi tao/sua phieu chi duoc phep la 1 trong 3 gia tri nay —
// kiem tra chi tiet o service (khong dung enum QcStatus day du de tranh
// nham lan voi PENDING/IN_PROGRESS/PENDING_DISPOSITION, von khong phai
// ket qua QC truc tiep dat duoc).
export const ALLOWED_QC_RESULTS: QcStatus[] = [
  QcStatus.PASSED,
  QcStatus.FAILED,
  QcStatus.PARTIALLY_PASSED,
];

export class CreateQcInspectionDto {
  @IsInt()
  lotId: number;

  @IsOptional()
  @IsEnum(QcStatus)
  result?: QcStatus; // co the chua chon ngay khi tao, dien sau truoc khi submit

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  createdBy?: number;
}
