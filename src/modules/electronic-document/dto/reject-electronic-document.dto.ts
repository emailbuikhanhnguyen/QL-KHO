import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectElectronicDocumentDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  reason: string;
}
