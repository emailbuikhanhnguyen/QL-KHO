import { Injectable, BadRequestException, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../../common/notification/notification.service';
import { CreatePurchaseRequisitionDto } from './dto/create-purchase-requisition.dto';
import { RejectPurchaseRequisitionDto } from './dto/reject-purchase-requisition.dto';
import { PurchaseRequisitionStatus, Prisma, Role } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { buildPagination } from '../../common/pagination.util';

export interface RequestUser {
  id: number;
  role: Role;
  departmentId: number;
}

@Injectable()
export class PurchaseRequisitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notification: NotificationService,
  ) {}

  async create(dto: CreatePurchaseRequisitionDto, currentUser: RequestUser) {
    const code = await this.generateCode();

    return this.prisma.purchaseRequisition.create({
      data: {
        code,
        requestedBy: currentUser.id,
        departmentId: currentUser.departmentId,
        reason: dto.reason,
        status: PurchaseRequisitionStatus.DRAFT,
        createdBy: currentUser.id,
        lines: { create: dto.lines.map((l) => ({ itemName: l.itemName, quantity: l.quantity, unit: l.unit, note: l.note })) },
      },
      include: { lines: true },
    });
  }

  async findAll(query: PaginationQueryDto & { status?: PurchaseRequisitionStatus; departmentId?: number }) {
    const { skip, take, page, limit } = buildPagination(query.page, query.limit);
    const where: Prisma.PurchaseRequisitionWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.purchaseRequisition.findMany({
        where,
        skip,
        take,
        orderBy: { id: 'desc' },
        include: { department: true, lines: true },
      }),
      this.prisma.purchaseRequisition.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: number) {
    const found = await this.prisma.purchaseRequisition.findUnique({
      where: { id },
      include: { department: true, lines: true },
    });
    if (!found) throw new NotFoundException({ key: 'ENTITY_NOT_FOUND', params: { entity: 'PurchaseRequisition', id } });
    return found;
  }

  // Danh sach ten vat tu da tung dung truoc do — de goi y tu dong o
  // frontend (khong rang buoc phai chon dung, chi la goi y tien loi).
  async getItemNameSuggestions(): Promise<string[]> {
    const lines = await this.prisma.purchaseRequisitionLine.findMany({
      select: { itemName: true },
      distinct: ['itemName'],
      take: 200,
    });
    return lines.map((l) => l.itemName);
  }

  async update(id: number, dto: CreatePurchaseRequisitionDto, currentUser: RequestUser) {
    const pq = await this.findOne(id);
    this.assertStatus(pq, [PurchaseRequisitionStatus.DRAFT], 'chinh sua');
    this.assertOwner(pq, currentUser);

    return this.prisma.$transaction(async (tx) => {
      await tx.purchaseRequisitionLine.deleteMany({ where: { purchaseRequisitionId: id } });
      return tx.purchaseRequisition.update({
        where: { id },
        data: {
          reason: dto.reason,
          updatedBy: currentUser.id,
          lines: { create: dto.lines.map((l) => ({ itemName: l.itemName, quantity: l.quantity, unit: l.unit, note: l.note })) },
        },
        include: { lines: true },
      });
    });
  }

  async remove(id: number, currentUser: RequestUser) {
    const pq = await this.findOne(id);
    this.assertStatus(pq, [PurchaseRequisitionStatus.DRAFT], 'xoa');
    this.assertOwner(pq, currentUser);
    return this.prisma.purchaseRequisition.delete({ where: { id } });
  }

  async submit(id: number, currentUser: RequestUser) {
    const pq = await this.findOne(id);
    this.assertStatus(pq, [PurchaseRequisitionStatus.DRAFT], 'gui duyet');
    this.assertOwner(pq, currentUser);

    const updated = await this.prisma.purchaseRequisition.update({
      where: { id },
      data: { status: PurchaseRequisitionStatus.PENDING_MANAGER_APPROVAL, submittedAt: new Date(), updatedBy: currentUser.id },
    });

    const emails = await this.notification.getEmailsByRoleInDepartment(Role.DEPT_HEAD, pq.departmentId);
    await this.notification.sendToEmails(
      emails,
      `[SEC ERP] Yêu cầu mua hàng ${pq.code} cần bạn duyệt`,
      `<p>Có yêu cầu mua hàng mới <b>${pq.code}</b> (lý do: ${pq.reason}) đang chờ bạn duyệt.</p>`,
    );

    return updated;
  }

  async cancel(id: number, currentUser: RequestUser) {
    const pq = await this.findOne(id);
    this.assertStatus(
      pq,
      [PurchaseRequisitionStatus.DRAFT, PurchaseRequisitionStatus.PENDING_MANAGER_APPROVAL, PurchaseRequisitionStatus.PENDING_BOD_APPROVAL],
      'huy',
    );
    this.assertOwner(pq, currentUser);

    return this.prisma.purchaseRequisition.update({
      where: { id },
      data: { status: PurchaseRequisitionStatus.CANCELLED, cancelledAt: new Date(), updatedBy: currentUser.id },
    });
  }

  async approveManager(id: number, currentUser: RequestUser) {
    const pq = await this.findOne(id);
    this.assertStatus(pq, [PurchaseRequisitionStatus.PENDING_MANAGER_APPROVAL], 'duyet quan ly');

    if (currentUser.role !== Role.ADMIN && pq.departmentId !== currentUser.departmentId) {
      throw new ForbiddenException({ key: 'NOT_IN_YOUR_DEPARTMENT' });
    }
    if (currentUser.role !== Role.ADMIN && pq.requestedBy === currentUser.id) {
      throw new ForbiddenException({ key: 'CANNOT_APPROVE_OWN_REQUEST' });
    }

    const updated = await this.prisma.purchaseRequisition.update({
      where: { id },
      data: {
        status: PurchaseRequisitionStatus.PENDING_BOD_APPROVAL,
        managerApprovedBy: currentUser.id,
        managerApprovedAt: new Date(),
        updatedBy: currentUser.id,
      },
    });

    const emails = await this.notification.getEmailsByRole(Role.BOD);
    await this.notification.sendToEmails(
      emails,
      `[SEC ERP] Yêu cầu mua hàng ${pq.code} cần bạn duyệt`,
      `<p>Yêu cầu mua hàng <b>${pq.code}</b> đã qua Trưởng bộ phận, đang chờ bạn duyệt.</p>`,
    );

    return updated;
  }

  async approveBod(id: number, currentUser: RequestUser) {
    const pq = await this.findOne(id);
    this.assertStatus(pq, [PurchaseRequisitionStatus.PENDING_BOD_APPROVAL], 'duyet BOD');
    if (currentUser.role !== Role.ADMIN && pq.requestedBy === currentUser.id) {
      throw new ForbiddenException({ key: 'CANNOT_APPROVE_OWN_REQUEST' });
    }

    const updated = await this.prisma.purchaseRequisition.update({
      where: { id },
      data: {
        status: PurchaseRequisitionStatus.APPROVED,
        bodApprovedBy: currentUser.id,
        bodApprovedAt: new Date(),
        updatedBy: currentUser.id,
      },
    });

    const emails = await this.notification.getEmailsByRole(Role.PURCHASER);
    await this.notification.sendToEmails(
      emails,
      `[SEC ERP] Yêu cầu mua hàng ${pq.code} đã được duyệt — cần làm PR có giá`,
      `<p>Yêu cầu mua hàng <b>${pq.code}</b> đã được BOD duyệt. Vui lòng tạo PR có giá tương ứng.</p>`,
    );

    return updated;
  }

  async reject(id: number, dto: RejectPurchaseRequisitionDto, currentUser: RequestUser) {
    const pq = await this.findOne(id);
    this.assertStatus(
      pq,
      [PurchaseRequisitionStatus.PENDING_MANAGER_APPROVAL, PurchaseRequisitionStatus.PENDING_BOD_APPROVAL],
      'tu choi',
    );

    if (
      pq.status === PurchaseRequisitionStatus.PENDING_MANAGER_APPROVAL &&
      currentUser.role !== Role.ADMIN &&
      pq.departmentId !== currentUser.departmentId
    ) {
      throw new ForbiddenException({ key: 'NOT_IN_YOUR_DEPARTMENT' });
    }

    return this.prisma.purchaseRequisition.update({
      where: { id },
      data: {
        status: PurchaseRequisitionStatus.REJECTED,
        rejectedBy: currentUser.id,
        rejectedAt: new Date(),
        rejectionReason: dto.reason,
        updatedBy: currentUser.id,
      },
    });
  }

  private assertOwner(pq: { requestedBy: number }, currentUser: RequestUser) {
    if (currentUser.role !== Role.ADMIN && pq.requestedBy !== currentUser.id) {
      throw new ForbiddenException({ key: 'ONLY_OWNER_CAN_MODIFY' });
    }
  }

  private assertStatus(pq: { status: PurchaseRequisitionStatus }, allowed: PurchaseRequisitionStatus[], action: string) {
    if (!allowed.includes(pq.status)) {
      throw new ConflictException({ key: 'INVALID_STATUS_TRANSITION', params: { action, status: pq.status } });
    }
  }

  private async generateCode(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.purchaseRequisition.count({ where: { code: { startsWith: `PRQ-${year}-` } } });
    const seq = String(count + 1).padStart(6, '0');
    return `PRQ-${year}-${seq}`;
  }
}
