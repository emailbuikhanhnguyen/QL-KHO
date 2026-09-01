import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateItemGroupDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  code: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  createdBy?: number;
}
