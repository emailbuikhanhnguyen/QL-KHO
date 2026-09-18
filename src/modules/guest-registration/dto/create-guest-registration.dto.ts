import { IsNotEmpty, IsOptional, IsString, IsDateString, MaxLength, IsArray, ArrayMinSize, ArrayMaxSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { GuestVisitorDto } from './guest-visitor.dto';

export class CreateGuestRegistrationDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  companyName: string;

  // 2 truong nay khop dung mau giay that — thong tin lien he PHIA NCC,
  // KHAC voi nguoi cua cong ty minh dung ra dang ky (requestedBy).
  @IsOptional()
  @IsString()
  @MaxLength(100)
  contactPersonName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  contactPersonPhone?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(300)
  purpose: string; // "Noi dung cong viec/Scope of Work" — bat buoc theo dung mau giay

  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @IsNotEmpty()
  @IsDateString()
  endDate: string;

  // Danh sach nguoi vao cong — mau giay cho phep toi da 10 nguoi/phieu.
  @IsArray()
  @ArrayMinSize(1, { message: 'Phai co it nhat 1 nguoi trong danh sach' })
  @ArrayMaxSize(10, { message: 'Toi da 10 nguoi trong 1 phieu (dung theo mau giay)' })
  @ValidateNested({ each: true })
  @Type(() => GuestVisitorDto)
  visitors: GuestVisitorDto[];
}
