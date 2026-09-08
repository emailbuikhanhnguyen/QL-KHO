import { IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength, Matches } from 'class-validator';

export class CreateGatePassRequestDto {
  @IsDateString()
  passDate: string;

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'timeOut phai dang HH:mm' })
  timeOut: string;

  // Tuy chon — truong hop ra ngoai va KHONG quay lai trong ngay (VD: ve som han).
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'timeIn phai dang HH:mm' })
  timeIn?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  purpose: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  relatedPeople?: string;
}
