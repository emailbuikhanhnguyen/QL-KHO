import { PartialType } from '@nestjs/mapped-types';
import { CreateWarehouseTransferDto } from './create-warehouse-transfer.dto';

// Chi duoc goi khi phieu con DRAFT (kiem tra trong service).
export class UpdateWarehouseTransferDto extends PartialType(CreateWarehouseTransferDto) {}
