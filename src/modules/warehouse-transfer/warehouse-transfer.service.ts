import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import {
  WarehouseTransferStatus,
  StockMovementType,
  Role,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { assertNoActiveStocktakeLock } from '../../common/stocktake-lock.util';
import { CreateWarehouseTransferDto } from './dto/create-warehouse-transfer.dto';
import { UpdateWarehouseTransferDto } from './dto/update-warehouse-transfer.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { buildPagination } from '../../common/pagination.util';

export interface RequestUser {
  id: number;
  role: Role;
  departmentId: number;
}

const IN_TRANSIT_WAREHOUSE_CODE = 'IN_TRANSIT';

@Injectable()
export class WarehouseTransferService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------
  // CREATE
  // -------------------------------------------------------------------
  async create(dto: CreateWarehouseTransferDto, currentUser: RequestUser) {
    if (dto.sourceWarehouseId === dto.destWarehouseId) {
      throw new BadRequestException('Kho nguon va kho dich phai khac nhau');
    }
    await this.assertWarehouseExists(dto.sourceWarehouseId);
    await this.assertWarehouseExists(dto.destWarehouseId);
    await this.assertUserBelongsToWarehouseDept(dto.sourceWarehouseId, currentUser);
    await this.assertLotsExist(dto.lines.map((l) => l.lotId));

    const created = await this.prisma.warehouseTransfer.create({
      data: {
        code: 'TEMP',
        sourceWarehouseId: dto.sourceWarehouseId,
        destWarehouseId: dto.destWarehouseId,
        reason: dto.reason,
        status: WarehouseTransferStatus.DRAFT,
        createdBy: currentUser.id,
        lines: {
          create: dto.lines.map((line) => ({ lotId: line.lotId, quantity: line.quantity })),
        },
      },
      include: { lines: true },
    });

    const code = this.buildCode(created.id);
    return this.prisma.warehouseTransfer.update({
      where: { id: created.id },
      data: { code },
      include: { lines: true },
    });
  }

  // -------------------------------------------------------------------
  // READ
  // -------------------------------------------------------------------
  async findAll(
    query: PaginationQueryDto & {
      sourceWarehouseId?: number;
      destWarehouseId?: number;
      status?: WarehouseTransferStatus;
    },
  ) {
    const { skip, take, page, limit } = buildPagination(query.page, query.limit);
    const where: Prisma.WarehouseTransferWhereInput = {
      deletedAt: null,
      ...(query.sourceWarehouseId ? { sourceWarehouseId: Number(query.sourceWarehouseId) } : {}),
      ...(query.destWarehouseId ? { destWarehouseId: Number(query.destWarehouseId) } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { code: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.warehouseTransfer.findMany({
        where,
        skip,
        take,
        orderBy: { id: 'desc' },
        include: { lines: true },
      }),
      this.prisma.warehouseTransfer.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: number) {
    const found = await this.prisma.warehouseTransfer.findFirst({
      where: { id, deletedAt: null },
      include: { lines: { include: { lot: { include: { item: true } } } } },
    });
    if (!found) throw new NotFoundException(`WarehouseTransfer #${id} not found`);
    return found;
  }

  // -------------------------------------------------------------------
  // UPDATE — chi khi DRAFT
  // -------------------------------------------------------------------
  async update(id: number, dto: UpdateWarehouseTransferDto, currentUser: RequestUser) {
    const current = await this.findOne(id);
    this.assertStatus(current, [WarehouseTransferStatus.DRAFT], 'chinh sua');
    await this.assertUserBelongsToWarehouseDept(dto.sourceWarehouseId ?? current.sourceWarehouseId, currentUser);

    if (dto.sourceWarehouseId || dto.destWarehouseId) {
      const src = dto.sourceWarehouseId ?? current.sourceWarehouseId;
      const dst = dto.destWarehouseId ?? current.destWarehouseId;
      if (src === dst) throw new BadRequestException('Kho nguon va kho dich phai khac nhau');
    }
    if (dto.lines) await this.assertLotsExist(dto.lines.map((l) => l.lotId));

    return this.prisma.$transaction(async (tx) => {
      if (dto.lines) {
        await tx.warehouseTransferLine.deleteMany({ where: { warehouseTransferId: id } });
      }
      return tx.warehouseTransfer.update({
        where: { id },
        data: {
          sourceWarehouseId: dto.sourceWarehouseId,
          destWarehouseId: dto.destWarehouseId,
          reason: dto.reason,
          updatedBy: currentUser.id,
          ...(dto.lines
            ? { lines: { create: dto.lines.map((l) => ({ lotId: l.lotId, quantity: l.quantity })) } }
            : {}),
        },
        include: { lines: true },
      });
    });
  }

  // -------------------------------------------------------------------
  // SHIP — DRAFT -> SHIPPED. Kho nguon xac nhan xuat, hang vao trung chuyen.
  // -------------------------------------------------------------------
  async ship(id: number, currentUser: RequestUser) {
    const current = await this.findOne(id);
    this.assertStatus(current, [WarehouseTransferStatus.DRAFT], 'xuat kho nguon');

    if (currentUser.role !== Role.ADMIN) {
      if (currentUser.role !== Role.WAREHOUSE_STAFF) {
        throw new ForbiddenException('Chi thu kho hoac Admin moi duoc xac nhan xuat');
      }
      await this.assertUserBelongsToWarehouseDept(current.sourceWarehouseId, currentUser);
    }

    if (current.lines.length === 0) {
      throw new BadRequestException('Phieu khong co dong hang nao');
    }

    const inTransitWarehouse = await this.getInTransitWarehouseOrThrow();

    return this.prisma.$transaction(async (tx) => {
      await assertNoActiveStocktakeLock(tx, current.sourceWarehouseId);

      for (const line of current.lines) {
        const available = await this.getLotAvailableQuantityInWarehouse(
          tx,
          line.lotId,
          current.sourceWarehouseId,
        );
        const requested = this.toSafeNumber(line.quantity);
        if (available < requested) {
          throw new BadRequestException(
            `Lot #${line.lotId} khong du ton trong kho nguon (con ${available}, can ${requested})`,
          );
        }

        const lot = await tx.lot.findUniqueOrThrow({ where: { id: line.lotId } });

        await tx.stockLedgerEntry.create({
          data: {
            lotId: line.lotId,
            itemId: lot.itemId,
            warehouseId: current.sourceWarehouseId,
            movementType: StockMovementType.TRANSFER_OUT,
            quantity: -requested,
            referenceType: 'WAREHOUSE_TRANSFER',
            referenceId: current.id,
            createdBy: currentUser.id,
          },
        });
        await tx.stockLedgerEntry.create({
          data: {
            lotId: line.lotId,
            itemId: lot.itemId,
            warehouseId: inTransitWarehouse.id,
            movementType: StockMovementType.TRANSFER_IN,
            quantity: requested,
            referenceType: 'WAREHOUSE_TRANSFER',
            referenceId: current.id,
            createdBy: currentUser.id,
          },
        });
      }

      return tx.warehouseTransfer.update({
        where: { id },
        data: {
          status: WarehouseTransferStatus.SHIPPED,
          shippedAt: new Date(),
          shippedBy: currentUser.id,
        },
        include: { lines: true },
      });
    });
  }

  // -------------------------------------------------------------------
  // RECEIVE — SHIPPED -> RECEIVED. Kho dich xac nhan da nhan hang.
  // -------------------------------------------------------------------
  async receive(id: number, currentUser: RequestUser) {
    const current = await this.findOne(id);
    this.assertStatus(current, [WarehouseTransferStatus.SHIPPED], 'xac nhan nhan hang');

    if (currentUser.role !== Role.ADMIN) {
      if (currentUser.role !== Role.WAREHOUSE_STAFF) {
        throw new ForbiddenException('Chi thu kho hoac Admin moi duoc xac nhan nhan hang');
      }
      await this.assertUserBelongsToWarehouseDept(current.destWarehouseId, currentUser);
    }

    const inTransitWarehouse = await this.getInTransitWarehouseOrThrow();

    return this.prisma.$transaction(async (tx) => {
      await assertNoActiveStocktakeLock(tx, current.destWarehouseId);

      for (const line of current.lines) {
        const requested = this.toSafeNumber(line.quantity);
        const lot = await tx.lot.findUniqueOrThrow({ where: { id: line.lotId } });

        await tx.stockLedgerEntry.create({
          data: {
            lotId: line.lotId,
            itemId: lot.itemId,
            warehouseId: inTransitWarehouse.id,
            movementType: StockMovementType.TRANSFER_OUT,
            quantity: -requested,
            referenceType: 'WAREHOUSE_TRANSFER',
            referenceId: current.id,
            createdBy: currentUser.id,
          },
        });
        await tx.stockLedgerEntry.create({
          data: {
            lotId: line.lotId,
            itemId: lot.itemId,
            warehouseId: current.destWarehouseId,
            movementType: StockMovementType.TRANSFER_IN,
            quantity: requested,
            referenceType: 'WAREHOUSE_TRANSFER',
            referenceId: current.id,
            createdBy: currentUser.id,
          },
        });
      }

      return tx.warehouseTransfer.update({
        where: { id },
        data: {
          status: WarehouseTransferStatus.RECEIVED,
          receivedAt: new Date(),
          receivedBy: currentUser.id,
        },
        include: { lines: true },
      });
    });
  }

  // -------------------------------------------------------------------
  // CANCEL / DELETE — chi khi DRAFT
  // -------------------------------------------------------------------
  async remove(id: number, currentUser: RequestUser) {
    const current = await this.findOne(id);
    this.assertStatus(current, [WarehouseTransferStatus.DRAFT], 'xoa');
    await this.assertUserBelongsToWarehouseDept(current.sourceWarehouseId, currentUser);

    return this.prisma.warehouseTransfer.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: currentUser.id },
    });
  }

  // =====================================================================
  // Helpers
  // =====================================================================

  private buildCode(id: number): string {
    const year = new Date().getFullYear();
    return `TRF-${year}-${String(id).padStart(6, '0')}`;
  }

  private assertStatus(
    transfer: { status: WarehouseTransferStatus },
    allowed: WarehouseTransferStatus[],
    action: string,
  ) {
    if (!allowed.includes(transfer.status)) {
      throw new ConflictException(
        `Khong the ${action} phieu dang o trang thai '${transfer.status}'`,
      );
    }
  }

  private async assertUserBelongsToWarehouseDept(warehouseId: number, currentUser: RequestUser) {
    if (currentUser.role === Role.ADMIN) return;
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, deletedAt: null },
    });
    if (!warehouse?.departmentId) return;
    if (warehouse.departmentId !== currentUser.departmentId) {
      throw new ForbiddenException('Ban khong thuoc phong ban quan ly kho nay');
    }
  }

  private async assertWarehouseExists(warehouseId: number) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, deletedAt: null },
    });
    if (!warehouse) throw new BadRequestException(`Warehouse #${warehouseId} khong ton tai`);
  }

  private async assertLotsExist(lotIds: number[]) {
    for (const lotId of lotIds) {
      const lot = await this.prisma.lot.findFirst({ where: { id: lotId, deletedAt: null } });
      if (!lot) throw new BadRequestException(`Lot #${lotId} khong ton tai`);
    }
  }

  private async getInTransitWarehouseOrThrow() {
    const wh = await this.prisma.warehouse.findFirst({
      where: { code: IN_TRANSIT_WAREHOUSE_CODE, deletedAt: null },
    });
    if (!wh) {
      throw new BadRequestException(
        `Chua co kho trung chuyen (code '${IN_TRANSIT_WAREHOUSE_CODE}'). Chay lai 'npm run prisma:seed'.`,
      );
    }
    return wh;
  }

  private async getLotAvailableQuantityInWarehouse(
    tx: Prisma.TransactionClient,
    lotId: number,
    warehouseId: number,
  ): Promise<number> {
    const result = await tx.stockLedgerEntry.aggregate({
      where: { lotId, warehouseId },
      _sum: { quantity: true },
    });
    return this.toSafeNumber(result._sum.quantity);
  }

  private toSafeNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    return Number(String(value));
  }
}
