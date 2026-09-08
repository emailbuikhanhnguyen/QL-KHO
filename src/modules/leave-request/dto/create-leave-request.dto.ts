import { IsEnum, IsNotEmpty, IsString, IsDateString, MaxLength } from 'class-validator';
import { LeaveType } from '@prisma/client';

export class CreateLeaveRequestDto {
  @IsEnum(LeaveType)
  leaveType: LeaveType;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  reason: string;
}
