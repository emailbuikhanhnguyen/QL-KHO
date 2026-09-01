import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { GoodsReceiptStatus, StockMovementType, Role, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { assertNoActiveStocktakeLock } from '../../common/stocktake-lock.util';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { UpdateGoodsReceiptDto } from './dto/update-goods-receipt.dto';
import { RejectGoodsReceiptDto } from './dto/reject-goods-receipt.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { buildPagination } from '../../common/pagination.util';

// Thong tin toi thieu tu request.user (xem AuthService.sanitizeUser) can dung
// trong service nay de kiem tra quyen theo phong ban.
export interface RequestUser {
  id: number;
  role: Role;
  departmentId: number;
}

@Injectable()
export class GoodsReceiptService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------
  // CREATE — tao phieu moi o trang thai DRAFT
  // -------------------------------------------------------------------
  async create(dto: CreateGoodsReceiptDto, currentUser: RequestUser) {
    await this.assertWarehouseExists(dto.warehouseId);
    await this.assertUserBelongsToWarehouseDept(dto.warehouseId, currentUser);
    await this.assertSupplierExists(dto.supplierId);
    await this.assertLinesValid(dto.lines);

    const created = await this.prisma.goodsReceipt.create({
      data: {
        code: 'TEMP', // se cap nhat lai ngay sau khi co id
        warehouseId: dto.warehouseId,
        supplierId: dto.supplierId,
        poNumber: dto.poNumber,
        packingListNumber: dto.packingListNumber,
        invoiceNumber: dto.invoiceNumber,
        note: dto.note,
        status: GoodsReceiptStatus.DRAFT,
        createdBy: currentUser.id,
        lines: {
          create: dto.lines.map((line) => ({
            itemId: line.itemId,
            lotCode: line.lotCode,
            color: line.color,
            size: line.size,
            manufactureDate: line.manufactureDate ? new Date(line.manufactureDate) : undefined,
            expiryDate: line.expiryDate ? new Date(line.expiryDate) : undefined,
            quantity: line.quantity,
            storageLocationId: line.storageLocationId,
          })),
        },
      },
      include: { lines: true },
    });

    // Sinh ma phieu dua tren id vua tao — dam bao duy nhat, dung de in phieu.
    const code = this.buildCode(created.id);
    return this.prisma.goodsReceipt.update({
      where: { id: created.id },
      data: { code },
      include: { lines: true },
    });
  }

  // -------------------------------------------------------------------
  // READ
  // -------------------------------------------------------------------
  async findAll(query: PaginationQueryDto & { warehouseId?: number; status?: GoodsReceiptStatus }) {
    const { skip, take, page, limit } = buildPagination(query.page, query.limit);
    const where: Prisma.GoodsReceiptWhereInput = {
      deletedAt: null,
      ...(query.warehouseId ? { warehouseId: Number(query.warehouseId) } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' } },
              { poNumber: { contains: query.search, mode: 'insensitive' } },
              { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.goodsReceipt.findMany({
        where,
        skip,
        take,
        orderBy: { id: 'desc' },
        include: { lines: true },
      }),
      this.prisma.goodsReceipt.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: number) {
    const found = await this.prisma.goodsReceipt.findFirst({
      where: { id, deletedAt: null },
      include: { lines: { include: { item: true, storageLocation: true, lot: true } } },
    });
    if (!found) throw new NotFoundException({ key: 'ENTITY_NOT_FOUND', params: { entity: 'GoodsReceipt', id } });
    return found;
  }

  // -------------------------------------------------------------------
  // UPDATE — chi cho phep khi con DRAFT, thay the toan bo danh sach dong
  // -------------------------------------------------------------------
  async update(id: number, dto: UpdateGoodsReceiptDto, currentUser: RequestUser) {
    const current = await this.findOne(id);
    this.assertStatus(current, [GoodsReceiptStatus.DRAFT], 'chinh sua');
    await this.assertUserBelongsToWarehouseDept(dto.warehouseId ?? current.warehouseId, currentUser);

    if (dto.warehouseId) await this.assertWarehouseExists(dto.warehouseId);
    if (dto.supplierId) await this.assertSupplierExists(dto.supplierId);
    if (dto.lines) await this.assertLinesValid(dto.lines);

    return this.prisma.$transaction(async (tx) => {
      if (dto.lines) {
        await tx.goodsReceiptLine.deleteMany({ where: { goodsReceiptId: id } });
      }

      return tx.goodsReceipt.update({
        where: { id },
        data: {
          warehouseId: dto.warehouseId,
          supplierId: dto.supplierId,
          poNumber: dto.poNumber,
          packingListNumber: dto.packingListNumber,
          invoiceNumber: dto.invoiceNumber,
          note: dto.note,
          updatedBy: currentUser.id,
          ...(dto.lines
            ? {
                lines: {
                  create: dto.lines.map((line) => ({
                    itemId: line.itemId,
                    lotCode: line.lotCode,
                    color: line.color,
                    size: line.size,
                    manufactureDate: line.manufactureDate ? new Date(line.manufactureDate) : undefined,
                    expiryDate: line.expiryDate ? new Date(line.expiryDate) : undefined,
                    quantity: line.quantity,
                    storageLocationId: line.storageLocationId,
                  })),
                },
              }
            : {}),
        },
        include: { lines: true },
      });
    });
  }

  // -------------------------------------------------------------------
  // SUBMIT — DRAFT -> PENDING_APPROVAL
  // -------------------------------------------------------------------
  async submit(id: number, currentUser: RequestUser) {
    const current = await this.findOne(id);
    this.assertStatus(current, [GoodsReceiptStatus.DRAFT], 'gui duyet');
    await this.assertUserBelongsToWarehouseDept(current.warehouseId, currentUser);

    if (current.lines.length === 0) {
      throw new BadRequestException({ key: 'NO_LINES_TO_SUBMIT' });
    }

    return this.prisma.goodsReceipt.update({
      where: { id },
      data: {
        status: GoodsReceiptStatus.PENDING_APPROVAL,
        submittedAt: new Date(),
        updatedBy: currentUser.id,
      },
    });
  }

  // -------------------------------------------------------------------
  // APPROVE — PENDING_APPROVAL -> CONFIRMED
  // Tao/cap nhat Lot + ghi StockLedgerEntry cho tung dong hang.
  // -------------------------------------------------------------------
  async approve(id: number, currentUser: RequestUser) {
    const current = await this.findOne(id);
    this.assertStatus(current, [GoodsReceiptStatus.PENDING_APPROVAL], 'duyet');
    this.assertApproverRole(currentUser);
    await this.assertUserBelongsToWarehouseDept(current.warehouseId, currentUser);

    return this.prisma.$transaction(async (tx) => {
      await assertNoActiveStocktakeLock(tx, current.warehouseId);

      for (const line of current.lines) {
        // Tim hoac tao Lot (unique theo itemId + lotCode)
        let lot = await tx.lot.findFirst({
          where: { itemId: line.itemId, lotCode: line.lotCode, deletedAt: null },
        });

        if (!lot) {
          lot = await tx.lot.create({
            data: {
              itemId: line.itemId,
              lotCode: line.lotCode,
              color: line.color,
              size: line.size,
              manufactureDate: line.manufactureDate,
              expiryDate: line.expiryDate,
              supplierId: current.supplierId,
              poNumber: current.poNumber,
              packingListNumber: current.packingListNumber,
              invoiceNumber: current.invoiceNumber,
              createdBy: currentUser.id,
            },
          });
        }

        await tx.goodsReceiptLine.update({
          where: { id: line.id },
          data: { lotId: lot.id },
        });

        await tx.stockLedgerEntry.create({
          data: {
            lotId: lot.id,
            itemId: line.itemId,
            warehouseId: current.warehouseId,
            storageLocationId: line.storageLocationId,
            movementType: StockMovementType.RECEIPT,
            quantity: line.quantity, // duong — cong ton
            referenceType: 'GOODS_RECEIPT',
            referenceId: current.id,
            createdBy: currentUser.id,
          },
        });
      }

      return tx.goodsReceipt.update({
        where: { id },
        data: {
          status: GoodsReceiptStatus.CONFIRMED,
          approvedAt: new Date(),
          approvedBy: currentUser.id,
        },
        include: { lines: true },
      });
    });
  }

  // -------------------------------------------------------------------
  // REJECT — PENDING_APPROVAL -> REJECTED
  // -------------------------------------------------------------------
  async reject(id: number, dto: RejectGoodsReceiptDto, currentUser: RequestUser) {
    const current = await this.findOne(id);
    this.assertStatus(current, [GoodsReceiptStatus.PENDING_APPROVAL], 'tu choi');
    this.assertApproverRole(currentUser);
    await this.assertUserBelongsToWarehouseDept(current.warehouseId, currentUser);

    return this.prisma.goodsReceipt.update({
      where: { id },
      data: {
        status: GoodsReceiptStatus.REJECTED,
        rejectedReason: dto.reason,
      },
    });
  }

  // -------------------------------------------------------------------
  // REOPEN — REJECTED -> DRAFT (de sua lai va gui duyet lai)
  // -------------------------------------------------------------------
  async reopen(id: number, currentUser: RequestUser) {
    const current = await this.findOne(id);
    this.assertStatus(current, [GoodsReceiptStatus.REJECTED], 'mo lai');
    await this.assertUserBelongsToWarehouseDept(current.warehouseId, currentUser);

    return this.prisma.goodsReceipt.update({
      where: { id },
      data: {
        status: GoodsReceiptStatus.DRAFT,
        rejectedReason: null,
        updatedBy: currentUser.id,
      },
    });
  }

  // -------------------------------------------------------------------
  // DELETE — chi cho phep soft delete khi con DRAFT
  // -------------------------------------------------------------------
  async remove(id: number, currentUser: RequestUser) {
    const current = await this.findOne(id);
    this.assertStatus(current, [GoodsReceiptStatus.DRAFT], 'xoa');
    await this.assertUserBelongsToWarehouseDept(current.warehouseId, currentUser);

    return this.prisma.goodsReceipt.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: currentUser.id },
    });
  }

  // =====================================================================
  // Helpers
  // =====================================================================

  private buildCode(id: number): string {
    const year = new Date().getFullYear();
    return `GRN-${year}-${String(id).padStart(6, '0')}`;
  }

  private assertStatus(
    receipt: { status: GoodsReceiptStatus },
    allowed: GoodsReceiptStatus[],
    action: string,
  ) {
    if (!allowed.includes(receipt.status)) {
      throw new ConflictException({
        key: 'INVALID_STATUS_TRANSITION',
        params: { action, status: receipt.status },
      });
    }
  }

  private assertApproverRole(currentUser: RequestUser) {
    if (currentUser.role !== Role.DEPT_HEAD && currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException({ key: 'ONLY_HEAD_OR_ADMIN_CAN_APPROVE_RECEIPT' });
    }
  }

  private async assertUserBelongsToWarehouseDept(warehouseId: number, currentUser: RequestUser) {
    if (currentUser.role === Role.ADMIN) return; // ADMIN bo qua kiem tra phong ban

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, deletedAt: null },
    });

    // Neu kho chua duoc gan phong ban quan ly, khong chan (tuong thich nguoc)
    if (!warehouse?.departmentId) return;

    if (warehouse.departmentId !== currentUser.departmentId) {
      throw new ForbiddenException({ key: 'NOT_IN_YOUR_DEPARTMENT' });
    }
  }

  private async assertWarehouseExists(warehouseId: number) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, deletedAt: null },
    });
    if (!warehouse) {
      throw new BadRequestException({ key: 'WAREHOUSE_NOT_FOUND', params: { id: warehouseId } });
    }
  }

  private async assertSupplierExists(supplierId: number) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, deletedAt: null },
    });
    if (!supplier) {
      throw new BadRequestException({ key: 'SUPPLIER_NOT_FOUND', params: { id: supplierId } });
    }
  }

  private async assertLinesValid(lines: { itemId: number; storageLocationId?: number }[]) {
    for (const line of lines) {
      const item = await this.prisma.item.findFirst({
        where: { id: line.itemId, deletedAt: null },
      });
      if (!item) {
        throw new BadRequestException({ key: 'ITEM_NOT_FOUND', params: { id: line.itemId } });
      }

      if (line.storageLocationId) {
        const loc = await this.prisma.storageLocation.findFirst({
          where: { id: line.storageLocationId, deletedAt: null },
        });
        if (!loc) {
          throw new BadRequestException({
            key: 'STORAGE_LOCATION_NOT_FOUND',
            params: { id: line.storageLocationId },
          });
        }
      }
    }
  }
}
