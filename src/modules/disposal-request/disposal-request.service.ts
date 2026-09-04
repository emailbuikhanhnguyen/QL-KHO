import { Injectable, BadRequestException, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDisposalRequestDto } from './dto/create-disposal-request.dto';
import { UpdateDisposalRequestDto } from './dto/update-disposal-request.dto';
import { RejectDisposalRequestDto } from './dto/reject-disposal-request.dto';
import { DisposalRequestStatus, QcStatus, StockMovementType, Prisma, Role } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { buildPagination } from '../../common/pagination.util';

// Moi service tu dinh nghia RequestUser cuc bo (dung convention da co trong
// du an — xem stocktake.service.ts, khong co file interface chung rieng).
export interface RequestUser {
  id: number;
  role: Role;
  departmentId: number;
}

@Injectable()
export class DisposalRequestService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateDisposalRequestDto, currentUser: RequestUser) {
    const lot = await this.prisma.lot.findUnique({ where: { id: dto.lotId } });
    if (!lot) throw new BadRequestException({ key: 'ENTITY_NOT_FOUND', params: { entity: 'Lot', id: dto.lotId } });

    // Chi duoc tao phieu huy cho lo dang FAILED — day la buoc dau tien cua
    // quy trinh xu ly hang loi, khong ap dung cho lo PASSED/PARTIALLY_PASSED.
    if (lot.qcStatus !== QcStatus.FAILED) {
      throw new BadRequestException({ key: 'LOT_NOT_FAILED' });
    }

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, deletedAt: null },
    });
    if (!warehouse) throw new BadRequestException({ key: 'WAREHOUSE_NOT_FOUND', params: { id: dto.warehouseId } });

    const available = await this.getLotAvailableQuantityInWarehouse(this.prisma, dto.lotId, dto.warehouseId);
    if (dto.quantity > available) {
      throw new BadRequestException({
        key: 'INSUFFICIENT_STOCK_FOR_DISPOSAL',
        params: { requested: dto.quantity, available },
      });
    }

    const code = await this.generateCode();

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.disposalRequest.create({
        data: {
          code,
          lotId: dto.lotId,
          warehouseId: dto.warehouseId,
          quantity: dto.quantity,
          reason: dto.reason,
          status: DisposalRequestStatus.DRAFT,
          requestedBy: currentUser.id,
          createdBy: currentUser.id,
        },
      });

      // Danh dau lo hang dang trong quy trinh xu ly — tranh bi dung nham
      // (VD: xuat kho) trong luc cho duyet phieu huy.
      await tx.lot.update({
        where: { id: dto.lotId },
        data: { qcStatus: QcStatus.PENDING_DISPOSITION, updatedBy: currentUser.id },
      });

      return created;
    });
  }

  async findAll(query: PaginationQueryDto & { status?: DisposalRequestStatus }) {
    const { skip, take, page, limit } = buildPagination(query.page, query.limit);
    const where: Prisma.DisposalRequestWhereInput = {
      ...(query.status ? { status: query.status } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.disposalRequest.findMany({
        where,
        skip,
        take,
        orderBy: { id: 'desc' },
        include: { lot: { include: { item: true } }, warehouse: true },
      }),
      this.prisma.disposalRequest.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: number) {
    const found = await this.prisma.disposalRequest.findUnique({
      where: { id },
      include: { lot: { include: { item: true } }, warehouse: true },
    });
    if (!found) throw new NotFoundException({ key: 'ENTITY_NOT_FOUND', params: { entity: 'DisposalRequest', id } });
    return found;
  }

  async update(id: number, dto: UpdateDisposalRequestDto, currentUser: RequestUser) {
    const dr = await this.findOne(id);
    this.assertStatus(dr, [DisposalRequestStatus.DRAFT], 'chinh sua');
    this.assertOwner(dr, currentUser);

    if (dto.quantity !== undefined) {
      const available = await this.getLotAvailableQuantityInWarehouse(this.prisma, dr.lotId, dr.warehouseId);
      if (dto.quantity > available) {
        throw new BadRequestException({
          key: 'INSUFFICIENT_STOCK_FOR_DISPOSAL',
          params: { requested: dto.quantity, available },
        });
      }
    }

    return this.prisma.disposalRequest.update({
      where: { id },
      data: { ...dto, updatedBy: currentUser.id },
    });
  }

  async remove(id: number, currentUser: RequestUser) {
    const dr = await this.findOne(id);
    this.assertStatus(dr, [DisposalRequestStatus.DRAFT], 'xoa');
    this.assertOwner(dr, currentUser);

    return this.prisma.$transaction(async (tx) => {
      await tx.disposalRequest.delete({ where: { id } });
      // Tra lo hang ve lai FAILED — huy bo tien trinh xu ly nay.
      await tx.lot.update({ where: { id: dr.lotId }, data: { qcStatus: QcStatus.FAILED, updatedBy: currentUser.id } });
    });
  }

  async submit(id: number, currentUser: RequestUser) {
    const dr = await this.findOne(id);
    this.assertStatus(dr, [DisposalRequestStatus.DRAFT], 'gui duyet');
    this.assertOwner(dr, currentUser);

    return this.prisma.disposalRequest.update({
      where: { id },
      data: {
        status: DisposalRequestStatus.PENDING_QA_APPROVAL,
        requestedAt: new Date(),
        updatedBy: currentUser.id,
      },
    });
  }

  async approveQa(id: number, currentUser: RequestUser) {
    const dr = await this.findOne(id);
    this.assertStatus(dr, [DisposalRequestStatus.PENDING_QA_APPROVAL], 'duyet QA');

    return this.prisma.disposalRequest.update({
      where: { id },
      data: {
        status: DisposalRequestStatus.PENDING_BOD_APPROVAL,
        qaApprovedBy: currentUser.id,
        qaApprovedAt: new Date(),
        updatedBy: currentUser.id,
      },
    });
  }

  async approveBod(id: number, currentUser: RequestUser) {
    const dr = await this.findOne(id);
    this.assertStatus(dr, [DisposalRequestStatus.PENDING_BOD_APPROVAL], 'duyet (cap BOD)');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.disposalRequest.update({
        where: { id },
        data: {
          status: DisposalRequestStatus.APPROVED,
          bodApprovedBy: currentUser.id,
          bodApprovedAt: new Date(),
          updatedBy: currentUser.id,
        },
      });

      await tx.stockLedgerEntry.create({
        data: {
          lotId: dr.lotId,
          itemId: dr.lot.itemId,
          warehouseId: dr.warehouseId,
          movementType: StockMovementType.ADJUSTMENT,
          quantity: -Number(dr.quantity), // am — tru ton kho vi da huy
          referenceType: 'DISPOSAL_REQUEST',
          referenceId: dr.id,
          createdBy: currentUser.id,
        },
      });

      await tx.lot.update({
        where: { id: dr.lotId },
        data: { qcStatus: QcStatus.DISPOSED, updatedBy: currentUser.id },
      });

      return updated;
    });
  }

  async reject(id: number, dto: RejectDisposalRequestDto, currentUser: RequestUser) {
    const dr = await this.findOne(id);
    this.assertStatus(
      dr,
      [DisposalRequestStatus.PENDING_QA_APPROVAL, DisposalRequestStatus.PENDING_BOD_APPROVAL],
      'tu choi',
    );

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.disposalRequest.update({
        where: { id },
        data: {
          status: DisposalRequestStatus.REJECTED,
          rejectedBy: currentUser.id,
          rejectedAt: new Date(),
          rejectionReason: dto.reason,
          updatedBy: currentUser.id,
        },
      });

      // Tra lo hang ve lai FAILED — co the tao phieu huy khac hoac xu ly
      // theo huong khac (VD: tra lai NCC).
      await tx.lot.update({ where: { id: dr.lotId }, data: { qcStatus: QcStatus.FAILED, updatedBy: currentUser.id } });

      return updated;
    });
  }

  private assertOwner(dr: { requestedBy: number }, currentUser: RequestUser) {
    if (currentUser.role !== Role.ADMIN && dr.requestedBy !== currentUser.id) {
      throw new ForbiddenException({ key: 'ONLY_OWNER_CAN_MODIFY' });
    }
  }

  private assertStatus(dr: { status: DisposalRequestStatus }, allowed: DisposalRequestStatus[], action: string) {
    if (!allowed.includes(dr.status)) {
      throw new ConflictException({ key: 'INVALID_STATUS_TRANSITION', params: { action, status: dr.status } });
    }
  }

  private async generateCode(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.disposalRequest.count({
      where: { code: { startsWith: `DSP-${year}-` } },
    });
    const seq = String(count + 1).padStart(6, '0');
    return `DSP-${year}-${seq}`;
  }

  private async getLotAvailableQuantityInWarehouse(
    tx: Prisma.TransactionClient | PrismaService,
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
