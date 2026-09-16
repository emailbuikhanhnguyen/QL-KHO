import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveElectronicDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  comment?: string;
}
