import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import {
  IssueRequestStatus,
  QcStatus,
  StockMovementType,
  Role,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { assertNoActiveStocktakeLock } from '../../common/stocktake-lock.util';
import { CreateIssueRequestDto } from './dto/create-issue-request.dto';
import { UpdateIssueRequestDto } from './dto/update-issue-request.dto';
import { RejectIssueRequestDto } from './dto/reject-issue-request.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { buildPagination } from '../../common/pagination.util';

export interface RequestUser {
  id: number;
  role: Role;
  departmentId: number;
}

// Cac trang thai QC ma Lot duoc phep dung de xuat kho — hang chua qua QC
// (PENDING/IN_PROGRESS), khong dat (FAILED) hoac dang cho xu ly
// (PENDING_DISPOSITION) deu KHONG duoc xuat.
const ISSUABLE_QC_STATUSES: QcStatus[] = [QcStatus.PASSED, QcStatus.PARTIALLY_PASSED];

@Injectable()
export class IssueRequestService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------
  // CREATE — bat ky user nao da dang nhap deu tao duoc (DRAFT)
  // -------------------------------------------------------------------
  async create(dto: CreateIssueRequestDto, currentUser: RequestUser) {
    await this.assertWarehouseExists(dto.warehouseId);
    await this.assertItemsExist(dto.lines.map((l) => l.itemId));

    const created = await this.prisma.issueRequest.create({
      data: {
        code: 'TEMP',
        warehouseId: dto.warehouseId,
        requesterId: currentUser.id,
        departmentId: currentUser.departmentId,
        reason: dto.reason,
        status: IssueRequestStatus.DRAFT,
        createdBy: currentUser.id,
        lines: {
          create: dto.lines.map((line) => ({
            itemId: line.itemId,
            requestedQuantity: line.requestedQuantity,
            note: line.note,
          })),
        },
      },
      include: { lines: true },
    });

    const code = this.buildCode(created.id);
    return this.prisma.issueRequest.update({
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
      warehouseId?: number;
      status?: IssueRequestStatus;
      requesterId?: number;
    },
  ) {
    const { skip, take, page, limit } = buildPagination(query.page, query.limit);
    const where: Prisma.IssueRequestWhereInput = {
      deletedAt: null,
      ...(query.warehouseId ? { warehouseId: Number(query.warehouseId) } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.requesterId ? { requesterId: Number(query.requesterId) } : {}),
      ...(query.search ? { code: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.issueRequest.findMany({
        where,
        skip,
        take,
        orderBy: { id: 'desc' },
        include: { lines: true },
      }),
      this.prisma.issueRequest.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: number) {
    const found = await this.prisma.issueRequest.findFirst({
      where: { id, deletedAt: null },
      include: { lines: { include: { item: true } } },
    });
    if (!found) throw new NotFoundException(`IssueRequest #${id} not found`);
    return found;
  }

  // -------------------------------------------------------------------
  // UPDATE — chi khi DRAFT, chi nguoi tao (hoac ADMIN)
  // -------------------------------------------------------------------
  async update(id: number, dto: UpdateIssueRequestDto, currentUser: RequestUser) {
    const current = await this.findOne(id);
    this.assertStatus(current, [IssueRequestStatus.DRAFT], 'chinh sua');
    this.assertIsOwnerOrAdmin(current, currentUser);

    if (dto.warehouseId) await this.assertWarehouseExists(dto.warehouseId);
    if (dto.lines) await this.assertItemsExist(dto.lines.map((l) => l.itemId));

    return this.prisma.$transaction(async (tx) => {
      if (dto.lines) {
        await tx.issueRequestLine.deleteMany({ where: { issueRequestId: id } });
      }

      return tx.issueRequest.update({
        where: { id },
        data: {
          warehouseId: dto.warehouseId,
          reason: dto.reason,
          updatedBy: currentUser.id,
          ...(dto.lines
            ? {
                lines: {
                  create: dto.lines.map((line) => ({
                    itemId: line.itemId,
                    requestedQuantity: line.requestedQuantity,
                    note: line.note,
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
  // SUBMIT — DRAFT -> PENDING_HEAD_APPROVAL
  // -------------------------------------------------------------------
  async submit(id: number, currentUser: RequestUser) {
    const current = await this.findOne(id);
    this.assertStatus(current, [IssueRequestStatus.DRAFT], 'gui duyet');
    this.assertIsOwnerOrAdmin(current, currentUser);

    if (current.lines.length === 0) {
      throw new BadRequestException('Khong the gui duyet phieu khong co dong hang nao');
    }

    return this.prisma.issueRequest.update({
      where: { id },
      data: {
        status: IssueRequestStatus.PENDING_HEAD_APPROVAL,
        submittedAt: new Date(),
        updatedBy: currentUser.id,
      },
    });
  }

  // -------------------------------------------------------------------
  // APPROVE CAP 1 — Truong bo phan cua NGUOI YEU CAU duyet
  // PENDING_HEAD_APPROVAL -> PENDING_BOD_APPROVAL
  // -------------------------------------------------------------------
  async approveByHead(id: number, currentUser: RequestUser) {
    const current = await this.findOne(id);
    this.assertStatus(current, [IssueRequestStatus.PENDING_HEAD_APPROVAL], 'duyet (cap truong bo phan)');

    if (currentUser.role !== Role.ADMIN) {
      if (currentUser.role !== Role.DEPT_HEAD) {
        throw new ForbiddenException('Chi Truong bo phan hoac Admin moi duoc duyet cap nay');
      }
      if (currentUser.departmentId !== current.departmentId) {
        throw new ForbiddenException('Ban chi duoc duyet phieu cua phong ban minh quan ly');
      }
    }

    return this.prisma.issueRequest.update({
      where: { id },
      data: {
        status: IssueRequestStatus.PENDING_BOD_APPROVAL,
        headApprovedAt: new Date(),
        headApprovedBy: currentUser.id,
      },
    });
  }

  // -------------------------------------------------------------------
  // APPROVE CAP 2 — BOD duyet cuoi cung
  // PENDING_BOD_APPROVAL -> APPROVED
  // -------------------------------------------------------------------
  async approveByBod(id: number, currentUser: RequestUser) {
    const current = await this.findOne(id);
    this.assertStatus(current, [IssueRequestStatus.PENDING_BOD_APPROVAL], 'duyet (cap BOD)');

    if (currentUser.role !== Role.ADMIN && currentUser.role !== Role.BOD) {
      throw new ForbiddenException('Chi BOD hoac Admin moi duoc duyet cap nay');
    }

    return this.prisma.issueRequest.update({
      where: { id },
      data: {
        status: IssueRequestStatus.APPROVED,
        bodApprovedAt: new Date(),
        bodApprovedBy: currentUser.id,
      },
    });
  }

  // -------------------------------------------------------------------
  // REJECT — tu choi o bat ky cap duyet nao dang cho xu ly
  // -------------------------------------------------------------------
  async reject(id: number, dto: RejectIssueRequestDto, currentUser: RequestUser) {
    const current = await this.findOne(id);

    if (current.status === IssueRequestStatus.PENDING_HEAD_APPROVAL) {
      if (
        currentUser.role !== Role.ADMIN &&
        !(currentUser.role === Role.DEPT_HEAD && currentUser.departmentId === current.departmentId)
      ) {
        throw new ForbiddenException('Chi Truong bo phan cua phong ban nay hoac Admin moi tu choi duoc');
      }
    } else if (current.status === IssueRequestStatus.PENDING_BOD_APPROVAL) {
      if (currentUser.role !== Role.ADMIN && currentUser.role !== Role.BOD) {
        throw new ForbiddenException('Chi BOD hoac Admin moi tu choi duoc o cap nay');
      }
    } else {
      throw new ConflictException(
        `Khong the tu choi phieu dang o trang thai '${current.status}'`,
      );
    }

    return this.prisma.issueRequest.update({
      where: { id },
      data: { status: IssueRequestStatus.REJECTED, rejectedReason: dto.reason },
    });
  }

  // -------------------------------------------------------------------
  // REOPEN — REJECTED -> DRAFT
  // -------------------------------------------------------------------
  async reopen(id: number, currentUser: RequestUser) {
    const current = await this.findOne(id);
    this.assertStatus(current, [IssueRequestStatus.REJECTED], 'mo lai');
    this.assertIsOwnerOrAdmin(current, currentUser);

    return this.prisma.issueRequest.update({
      where: { id },
      data: {
        status: IssueRequestStatus.DRAFT,
        rejectedReason: null,
        headApprovedAt: null,
        headApprovedBy: null,
        bodApprovedAt: null,
        bodApprovedBy: null,
        updatedBy: currentUser.id,
      },
    });
  }

  // -------------------------------------------------------------------
  // ISSUE — APPROVED -> ISSUED. Thu kho thuc xuat.
  // Tu dong phan bo theo FEFO tren cac Lot da PASSED/PARTIALLY_PASSED QC.
  // Neu ton kha dung khong du, van xuat phan con lai (partial issue).
  // -------------------------------------------------------------------
  async issue(id: number, currentUser: RequestUser) {
    const current = await this.findOne(id);
    this.assertStatus(current, [IssueRequestStatus.APPROVED], 'xuat kho');

    if (currentUser.role !== Role.ADMIN) {
      if (currentUser.role !== Role.WAREHOUSE_STAFF) {
        throw new ForbiddenException('Chi thu kho hoac Admin moi duoc thuc xuat');
      }
      await this.assertUserBelongsToWarehouseDept(current.warehouseId, currentUser);
    }

    return this.prisma.$transaction(async (tx) => {
      await assertNoActiveStocktakeLock(tx, current.warehouseId);

      for (const line of current.lines) {
        const issuedForThisLine = await this.allocateFefoAndIssue(
          tx,
          line.itemId,
          current.warehouseId,
          this.toSafeNumber(line.requestedQuantity),
          current.id,
          currentUser.id,
        );

        await tx.issueRequestLine.update({
          where: { id: line.id },
          data: { issuedQuantity: issuedForThisLine },
        });
      }

      return tx.issueRequest.update({
        where: { id },
        data: {
          status: IssueRequestStatus.ISSUED,
          issuedAt: new Date(),
          issuedBy: currentUser.id,
        },
        include: { lines: true },
      });
    });
  }

  // -------------------------------------------------------------------
  // DELETE — chi DRAFT, chi nguoi tao/ADMIN
  // -------------------------------------------------------------------
  async remove(id: number, currentUser: RequestUser) {
    const current = await this.findOne(id);
    this.assertStatus(current, [IssueRequestStatus.DRAFT], 'xoa');
    this.assertIsOwnerOrAdmin(current, currentUser);

    return this.prisma.issueRequest.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: currentUser.id },
    });
  }

  // =====================================================================
  // Helpers
  // =====================================================================

  private buildCode(id: number): string {
    const year = new Date().getFullYear();
    return `ISS-${year}-${String(id).padStart(6, '0')}`;
  }

  private assertStatus(
    request: { status: IssueRequestStatus },
    allowed: IssueRequestStatus[],
    action: string,
  ) {
    if (!allowed.includes(request.status)) {
      throw new ConflictException(
        `Khong the ${action} phieu dang o trang thai '${request.status}'`,
      );
    }
  }

  private assertIsOwnerOrAdmin(request: { requesterId: number }, currentUser: RequestUser) {
    if (currentUser.role === Role.ADMIN) return;
    if (request.requesterId !== currentUser.id) {
      throw new ForbiddenException('Ban chi duoc thao tac tren phieu do chinh minh tao');
    }
  }

  private async assertUserBelongsToWarehouseDept(warehouseId: number, currentUser: RequestUser) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, deletedAt: null },
    });
    if (!warehouse?.departmentId) return; // chua gan phong ban -> khong chan

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

  private async assertItemsExist(itemIds: number[]) {
    for (const itemId of itemIds) {
      const item = await this.prisma.item.findFirst({ where: { id: itemId, deletedAt: null } });
      if (!item) throw new BadRequestException(`Item #${itemId} khong ton tai`);
    }
  }

  // Phan bo FEFO: uu tien xuat tu Lot het han som nhat truoc. Tra ve tong so
  // luong THAT SU xuat duoc (co the < requestedQuantity neu khong du ton —
  // day la hanh vi partial issue duoc chap nhan theo yeu cau nghiep vu).
  private async allocateFefoAndIssue(
    tx: Prisma.TransactionClient,
    itemId: number,
    warehouseId: number,
    requestedQuantity: number,
    issueRequestId: number,
    currentUserId: number,
  ): Promise<number> {
    const eligibleLots = await tx.lot.findMany({
      where: {
        itemId,
        deletedAt: null,
        qcStatus: { in: ISSUABLE_QC_STATUSES },
      },
      orderBy: [{ expiryDate: 'asc' }, { manufactureDate: 'asc' }, { id: 'asc' }],
    });

    let remaining = requestedQuantity;
    let totalIssued = 0;

    for (const lot of eligibleLots) {
      if (remaining <= 0) break;

      // QUAN TRONG: tinh ton kha dung CUA LO NAY TRONG DUNG KHO dang xuat —
      // khong tinh gop toan he thong. Neu khong, sau khi co Dieu chuyen kho,
      // 1 lo co the co ton o nhieu kho khac nhau va se bi tinh nham.
      const availableInLot = await this.getLotAvailableQuantityInWarehouse(tx, lot.id, warehouseId);
      if (availableInLot <= 0) continue;

      const takeFromThisLot = Math.min(availableInLot, remaining);

      await tx.stockLedgerEntry.create({
        data: {
          lotId: lot.id,
          itemId,
          warehouseId,
          movementType: StockMovementType.ISSUE,
          quantity: -takeFromThisLot, // am — tru ton
          referenceType: 'ISSUE_REQUEST',
          referenceId: issueRequestId,
          createdBy: currentUserId,
        },
      });

      remaining -= takeFromThisLot;
      totalIssued += takeFromThisLot;
    }

    return totalIssued; // < requestedQuantity neu khong du ton — partial issue
  }

  private async getLotAvailableQuantity(
    tx: Prisma.TransactionClient,
    lotId: number,
  ): Promise<number> {
    const result = await tx.stockLedgerEntry.aggregate({
      where: { lotId },
      _sum: { quantity: true },
    });
    return this.toSafeNumber(result._sum.quantity);
  }

  // Ban theo dung 1 kho cu the — dung khi can biet chinh xac lo nay con
  // bao nhieu O TRONG KHO DANG XET, khong tinh gop cac kho khac.
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

  // Ep kieu Decimal (tu Prisma) sang number an toan — di qua toString() truoc
  // thay vi dua vao Number() coercion truc tiep tren object Decimal, tranh
  // rui ro sai lech tuy phien ban thu vien decimal.js ben trong Prisma.
  private toSafeNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    return Number(String(value));
  }
}
