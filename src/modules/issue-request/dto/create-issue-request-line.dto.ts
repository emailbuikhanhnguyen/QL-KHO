import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateIssueRequestLineDto {
  @IsInt()
  itemId: number;

  @IsNumber()
  @Min(0.001, { message: 'So luong yeu cau phai lon hon 0' })
  requestedQuantity: number;

  @IsOptional()
  @IsString()
  note?: string;
}
