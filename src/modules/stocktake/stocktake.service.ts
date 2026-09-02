import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import {
  StocktakeStatus,
  StockMovementType,
  Role,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StockLedgerService } from '../stock-ledger/stock-ledger.service';
import { StartStocktakeDto } from './dto/start-stocktake.dto';
import { UpdateCountDto } from './dto/update-count.dto';
import { ForceCompleteDto } from './dto/force-complete.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { buildPagination } from '../../common/pagination.util';

export interface RequestUser {
  id: number;
  role: Role;
  departmentId: number;
}

interface LineVarianceCheck {
  lineId: number;
  lotId: number;
  systemQuantity: number;
  countedQuantity: number;
  variance: number;
  variancePercent: number;
  withinTolerance: boolean;
}

@Injectable()
export class StocktakeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockLedgerService: StockLedgerService,
  ) {}

  // -------------------------------------------------------------------
  // START — tao Stocktake + StocktakeLock, chup nhanh ton hien tai theo lo
  // -------------------------------------------------------------------
  async start(dto: StartStocktakeDto, currentUser: RequestUser) {
    const warehouse = await this.assertWarehouseExists(dto.warehouseId);
    await this.assertUserBelongsToWarehouseDept(dto.warehouseId, currentUser);
    await this.assertNoExistingActiveStocktake(dto.warehouseId);

    // Chup nhanh toan bo ton hien tai theo tung lo trong kho nay (khong loc
    // theo khu vuc — kiem ke toan bo dung theo yeu cau nghiep vu).
    const currentBalances = await this.stockLedgerService.getBalanceByLot({
      warehouseId: dto.warehouseId,
      includeZero: false,
    });

    if (currentBalances.length === 0) {
      throw new BadRequestException({
        key: 'NO_STOCK_TO_COUNT',
        params: { warehouse: warehouse.name },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const stocktake = await tx.stocktake.create({
        data: {
          code: 'TEMP',
          warehouseId: dto.warehouseId,
          status: StocktakeStatus.IN_PROGRESS,
          startedBy: currentUser.id,
          note: dto.note,
          lines: {
            create: currentBalances.map((b) => ({
              lotId: b.lotId!,
              systemQuantity: b.balance,
            })),
          },
        },
        include: { lines: true },
      });

      await tx.stocktakeLock.create({
        data: {
          stocktakeId: stocktake.id,
          warehouseId: dto.warehouseId,
          lockedBy: currentUser.id,
        },
      });

      const code = this.buildCode(stocktake.id);
      return tx.stocktake.update({
        where: { id: stocktake.id },
        data: { code },
        include: { lines: true },
      });
    });
  }

  // -------------------------------------------------------------------
  // READ
  // -------------------------------------------------------------------
  async findAll(query: PaginationQueryDto & { warehouseId?: number; status?: StocktakeStatus }) {
    const { skip, take, page, limit } = buildPagination(query.page, query.limit);
    const where: Prisma.StocktakeWhereInput = {
      ...(query.warehouseId ? { warehouseId: Number(query.warehouseId) } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { code: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.stocktake.findMany({
        where,
        skip,
        take,
        orderBy: { id: 'desc' },
        include: { lines: true },
      }),
      this.prisma.stocktake.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: number) {
    const found = await this.prisma.stocktake.findFirst({
      where: { id },
      include: { lines: { include: { lot: { include: { item: true } } } } },
    });
    if (!found) throw new NotFoundException({ key: 'ENTITY_NOT_FOUND', params: { entity: 'Stocktake', id } });
    return found;
  }

  // -------------------------------------------------------------------
  // FIND LINE BY LOT — dung cho luong quet QR bang dien thoai. Tim dong
  // (StocktakeLine) tuong ung voi lo hang nay trong phien kiem ke DANG MO
  // (IN_PROGRESS) — moi kho chi co toi da 1 phien dang mo tai 1 thoi diem
  // (da rang buoc trong ham start()).
  // -------------------------------------------------------------------
  async findActiveLineByLot(lotId: number) {
    const line = await this.prisma.stocktakeLine.findFirst({
      where: {
        lotId,
        stocktake: { status: StocktakeStatus.IN_PROGRESS },
      },
      include: {
        lot: { include: { item: true } },
        stocktake: true,
      },
    });

    if (!line) {
      throw new NotFoundException({ key: 'LOT_NOT_IN_ACTIVE_STOCKTAKE' });
    }

    return line;
  }

  // -------------------------------------------------------------------
  // UPDATE COUNT — nhap so luong dem thuc te cho 1 dong
  // -------------------------------------------------------------------
  async updateCount(
    stocktakeId: number,
    lineId: number,
    dto: UpdateCountDto,
    currentUser: RequestUser,
  ) {
    const stocktake = await this.findOne(stocktakeId);
    this.assertStatus(stocktake, [StocktakeStatus.IN_PROGRESS], 'nhap so dem');
    await this.assertUserBelongsToWarehouseDept(stocktake.warehouseId, currentUser);

    const line = stocktake.lines.find((l) => l.id === lineId);
    if (!line) throw new NotFoundException({ key: 'ENTITY_NOT_FOUND', params: { entity: 'StocktakeLine', id: lineId } });

    return this.prisma.stocktakeLine.update({
      where: { id: lineId },
      data: {
        countedQuantity: dto.countedQuantity,
        note: dto.note,
        countedAt: new Date(),
        countedBy: currentUser.id,
      },
    });
  }

  // -------------------------------------------------------------------
  // COMPLETE — hoan tat, ghi dieu chinh ton kho. Chan neu vuot dung sai.
  // -------------------------------------------------------------------
  async complete(stocktakeId: number, currentUser: RequestUser) {
    return this.doComplete(stocktakeId, currentUser, false);
  }

  async forceComplete(stocktakeId: number, dto: ForceCompleteDto, currentUser: RequestUser) {
    if (currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException({ key: 'ONLY_ADMIN_CAN_FORCE_COMPLETE' });
    }
    return this.doComplete(stocktakeId, currentUser, true, dto.reason);
  }

  private async doComplete(
    stocktakeId: number,
    currentUser: RequestUser,
    force: boolean,
    forceReason?: string,
  ) {
    const stocktake = await this.findOne(stocktakeId);
    this.assertStatus(stocktake, [StocktakeStatus.IN_PROGRESS], 'hoan tat');
    if (!force) {
      await this.assertUserBelongsToWarehouseDept(stocktake.warehouseId, currentUser);
    }

    const uncounted = stocktake.lines.filter((l) => l.countedQuantity === null);
    if (uncounted.length > 0) {
      throw new BadRequestException({
        key: 'UNCOUNTED_LINES_REMAINING',
        params: { count: uncounted.length },
      });
    }

    const warehouse = await this.prisma.warehouse.findUniqueOrThrow({
      where: { id: stocktake.warehouseId },
    });
    const tolerancePercent = this.toSafeNumber(warehouse.stocktakeTolerancePercent);

    const checks: LineVarianceCheck[] = stocktake.lines.map((l) => {
      const systemQuantity = this.toSafeNumber(l.systemQuantity);
      const countedQuantity = this.toSafeNumber(l.countedQuantity);
      const variance = countedQuantity - systemQuantity;
      const variancePercent = this.computeVariancePercent(systemQuantity, countedQuantity);
      return {
        lineId: l.id,
        lotId: l.lotId,
        systemQuantity,
        countedQuantity,
        variance,
        variancePercent,
        withinTolerance: variancePercent <= tolerancePercent,
      };
    });

    if (!force) {
      const outOfTolerance = checks.filter((c) => !c.withinTolerance);
      if (outOfTolerance.length > 0) {
        throw new ConflictException({
          key: 'TOLERANCE_EXCEEDED',
          params: { count: outOfTolerance.length, tolerance: tolerancePercent },
          outOfTolerance: outOfTolerance.map((c) => ({
            lineId: c.lineId,
            lotId: c.lotId,
            systemQuantity: c.systemQuantity,
            countedQuantity: c.countedQuantity,
            variance: c.variance,
            variancePercent: Number(c.variancePercent.toFixed(2)),
          })),
        });
      }
    }

    return this.prisma.$transaction(async (tx) => {
      for (const check of checks) {
        await tx.stocktakeLine.update({
          where: { id: check.lineId },
          data: { variance: check.variance },
        });

        // Chi ghi dieu chinh ton kho neu thuc su co chenh lech
        if (check.variance !== 0) {
          const lot = await tx.lot.findUniqueOrThrow({ where: { id: check.lotId } });
          await tx.stockLedgerEntry.create({
            data: {
              lotId: check.lotId,
              itemId: lot.itemId,
              warehouseId: stocktake.warehouseId,
              movementType: StockMovementType.ADJUSTMENT,
              quantity: check.variance, // co dau san — dung cong hoac tru dung huong
              referenceType: 'STOCKTAKE',
              referenceId: stocktake.id,
              createdBy: currentUser.id,
              note: force ? `Ghi de dung sai: ${forceReason}` : undefined,
            },
          });
        }
      }

      await tx.stocktakeLock.update({
        where: { stocktakeId: stocktake.id },
        data: { releasedAt: new Date(), releasedBy: currentUser.id },
      });

      return tx.stocktake.update({
        where: { id: stocktakeId },
        data: {
          status: StocktakeStatus.COMPLETED,
          completedAt: new Date(),
          completedBy: currentUser.id,
          ...(force ? { forceCompletedReason: forceReason } : {}),
        },
        include: { lines: true },
      });
    });
  }

  // -------------------------------------------------------------------
  // CANCEL — huy kiem ke, KHONG ghi dieu chinh gi, mo khoa lai
  // -------------------------------------------------------------------
  async cancel(stocktakeId: number, currentUser: RequestUser) {
    const stocktake = await this.findOne(stocktakeId);
    this.assertStatus(stocktake, [StocktakeStatus.IN_PROGRESS], 'huy');
    await this.assertUserBelongsToWarehouseDept(stocktake.warehouseId, currentUser);

    return this.prisma.$transaction(async (tx) => {
      await tx.stocktakeLock.update({
        where: { stocktakeId: stocktake.id },
        data: { releasedAt: new Date(), releasedBy: currentUser.id },
      });

      return tx.stocktake.update({
        where: { id: stocktakeId },
        data: {
          status: StocktakeStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledBy: currentUser.id,
        },
      });
    });
  }

  // =====================================================================
  // Helpers
  // =====================================================================

  private buildCode(id: number): string {
    const year = new Date().getFullYear();
    return `STK-${year}-${String(id).padStart(6, '0')}`;
  }

  private assertStatus(
    stocktake: { status: StocktakeStatus },
    allowed: StocktakeStatus[],
    action: string,
  ) {
    if (!allowed.includes(stocktake.status)) {
      throw new ConflictException({
        key: 'INVALID_STATUS_TRANSITION',
        params: { action, status: stocktake.status },
      });
    }
  }

  private async assertUserBelongsToWarehouseDept(warehouseId: number, currentUser: RequestUser) {
    if (currentUser.role === Role.ADMIN) return;
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, deletedAt: null },
    });
    if (!warehouse?.departmentId) return;
    if (warehouse.departmentId !== currentUser.departmentId) {
      throw new ForbiddenException({ key: 'NOT_IN_YOUR_DEPARTMENT' });
    }
  }

  private async assertWarehouseExists(warehouseId: number) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, deletedAt: null },
    });
    if (!warehouse) throw new BadRequestException({ key: 'WAREHOUSE_NOT_FOUND', params: { id: warehouseId } });
    return warehouse;
  }

  private async assertNoExistingActiveStocktake(warehouseId: number) {
    const active = await this.prisma.stocktake.findFirst({
      where: { warehouseId, status: StocktakeStatus.IN_PROGRESS },
    });
    if (active) {
      throw new ConflictException({
        key: 'DUPLICATE_ACTIVE_STOCKTAKE',
        params: { code: active.code },
      });
    }
  }

  private computeVariancePercent(systemQuantity: number, countedQuantity: number): number {
    const variance = Math.abs(countedQuantity - systemQuantity);
    if (systemQuantity === 0) {
      return variance === 0 ? 0 : 100;
    }
    return (variance / systemQuantity) * 100;
  }

  private toSafeNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    return Number(String(value));
  }
}
