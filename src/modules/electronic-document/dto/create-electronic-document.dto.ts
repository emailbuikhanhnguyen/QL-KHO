import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

// File duoc xu ly rieng qua @UploadedFile() (multipart/form-data), khong
// nam trong DTO nay.
export class CreateElectronicDocumentDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  title: string;

  // Tu do, KHONG ep 1 danh sach loai co dinh — theo dung xac nhan cua Sep
  // (chua ro loai ho so cu the la gi). Co goi y tu dong o frontend theo
  // lich su da tung nhap, giong item mua hang.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;
}
