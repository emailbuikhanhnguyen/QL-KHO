import { IsOptional, IsBoolean } from 'class-validator';

// Chi bat buoc = true neu totalAmountUsd > 2000 USD (kiem tra o service)
// — xac nhan da gui mail NGOAI HE THONG xin BOD approve truoc.
export class ApproveManagerPurchaseRequestDto {
  @IsOptional()
  @IsBoolean()
  confirmedEmailToBod?: boolean;
}
