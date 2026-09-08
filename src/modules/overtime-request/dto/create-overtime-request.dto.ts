import { IsArray, IsDateString, IsInt, IsNotEmpty, IsString, ArrayMinSize, MaxLength, Matches } from 'class-validator';

export class CreateOvertimeRequestDto {
  @IsDateString()
  otDate: string;

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'startTime phai dang HH:mm' })
  startTime: string;

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'endTime phai dang HH:mm' })
  endTime: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  reason: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Phai co it nhat 1 nhan vien tham gia tang ca' })
  @IsInt({ each: true })
  userIds: number[];
}
