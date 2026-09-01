import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateGoodsReceiptDto } from './create-goods-receipt.dto';

// Cap nhat: cho phep sua header + thay the toan bo danh sach dong hang.
// Chi duoc goi khi phieu dang o trang thai DRAFT (kiem tra trong service).
export class UpdateGoodsReceiptDto extends PartialType(
  OmitType(CreateGoodsReceiptDto, ['createdBy'] as const),
) {
  updatedBy?: number;
}
