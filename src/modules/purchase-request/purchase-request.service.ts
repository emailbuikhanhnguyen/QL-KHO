import { Injectable, BadRequestException, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../../common/notification/notification.service';
import { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';
import { UpdatePurchaseRequestDto } from './dto/update-purchase-request.dto';
import { ApproveManagerPurchaseRequestDto } from './dto/approve-manager-purchase-request.dto';
import { RejectPurchaseRequestDto } from './dto/reject-purchase-request.dto';
import { PurchaseRequestStatus, PurchaseRequisitionStatus, Prisma, Role } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { buildPagination } from '../../common/pagination.util';

export interface RequestUser {
  id: number;
  role: Role;
  departmentId: number;
}

const BOD_EMAIL_THRESHOLD_USD = 2000;

@Injectable()
export class PurchaseRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notification: NotificationService,
  ) {}

  private calcLines(lines: { itemName: string; quantity: number; unit: string; unitPriceUsd: number }[]) {
    return lines.map((l) => ({
      itemName: l.itemName,
      quantity: l.quantity,
      unit: l.unit,
      unitPriceUsd: l.unitPriceUsd,
      lineTotalUsd: l.quantity * l.unitPriceUsd,
    }));
  }

  private sumTotal(lines: { lineTotalUsd: number }[]) {
    return lines.reduce((sum, l) => sum + l.lineTotalUsd, 0);
  }

  async create(dto: CreatePurchaseRequestDto, currentUser: RequestUser) {
    const requisition = await this.prisma.purchaseRequisition.findUnique({ where: { id: dto.purchaseRequisitionId } });
    if (!requisition) {
      throw new BadRequestException({ key: 'ENTITY_NOT_FOUND', params: { entity: 'PurchaseRequisition', id: dto.purchaseRequisitionId } });
    }
    if (requisition.status !== PurchaseRequisitionStatus.APPROVED) {
      throw new BadRequestException({ key: 'REQUISITION_NOT_APPROVED' });
    }

    const preparedLines = this.calcLines(dto.lines);
    const totalAmountUsd = this.sumTotal(preparedLines);
    const code = await this.generateCode();

    return this.prisma.purchaseRequest.create({
      data: {
        code,
        purchaseRequisitionId: dto.purchaseRequisitionId,
        createdBy: currentUser.id,
        totalAmountUsd,
        status: PurchaseRequestStatus.DRAFT,
        lines: { create: preparedLines },
      },
      include: { lines: true, purchaseRequisition: true },
    });
  }

  async findAll(query: PaginationQueryDto & { status?: PurchaseRequestStatus }) {
    const { skip, take, page, limit } = buildPagination(query.page, query.limit);
    const where: Prisma.PurchaseRequestWhereInput = { ...(query.status ? { status: query.status } : {}) };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.purchaseRequest.findMany({
        where,
        skip,
        take,
        orderBy: { id: 'desc' },
        include: { lines: true, purchaseRequisition: { include: { department: true } } },
      }),
      this.prisma.purchaseRequest.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: number) {
    const found = await this.prisma.purchaseRequest.findUnique({
      where: { id },
      include: { lines: true, purchaseRequisition: { include: { department: true } } },
    });
    if (!found) throw new NotFoundException({ key: 'ENTITY_NOT_FOUND', params: { entity: 'PurchaseRequest', id } });
    return found;
  }

  async update(id: number, dto: UpdatePurchaseRequestDto, currentUser: RequestUser) {
    const pr = await this.findOne(id);
    this.assertStatus(pr, [PurchaseRequestStatus.DRAFT], 'chinh sua');
    this.assertOwner(pr, currentUser);

    const preparedLines = this.calcLines(dto.lines);
    const totalAmountUsd = this.sumTotal(preparedLines);

    return this.prisma.$transaction(async (tx) => {
      await tx.purchaseRequestLine.deleteMany({ where: { purchaseRequestId: id } });
      return tx.purchaseRequest.update({
        where: { id },
        data: { totalAmountUsd, updatedBy: currentUser.id, lines: { create: preparedLines } },
        include: { lines: true },
      });
    });
  }

  async remove(id: number, currentUser: RequestUser) {
    const pr = await this.findOne(id);
    this.assertStatus(pr, [PurchaseRequestStatus.DRAFT], 'xoa');
    this.assertOwner(pr, currentUser);
    return this.prisma.purchaseRequest.delete({ where: { id } });
  }

  async submit(id: number, currentUser: RequestUser) {
    const pr = await this.findOne(id);
    this.assertStatus(pr, [PurchaseRequestStatus.DRAFT], 'gui duyet');
    this.assertOwner(pr, currentUser);

    const updated = await this.prisma.purchaseRequest.update({
      where: { id },
      data: { status: PurchaseRequestStatus.PENDING_MANAGER_APPROVAL, submittedAt: new Date(), updatedBy: currentUser.id },
    });

    const emails = await this.notification.getEmailsByRoleInDepartment(Role.DEPT_HEAD, pr.purchaseRequisition.departmentId);
    await this.notification.sendToEmails(
      emails,
      `[SEC ERP] PR có giá ${pr.code} cần bạn duyệt`,
      `<p>PR có giá <b>${pr.code}</b> (tổng ${pr.totalAmountUsd} USD) đang chờ bạn duyệt.</p>`,
    );

    return updated;
  }

  async cancel(id: number, currentUser: RequestUser) {
    const pr = await this.findOne(id);
    this.assertStatus(
      pr,
      [PurchaseRequestStatus.DRAFT, PurchaseRequestStatus.PENDING_MANAGER_APPROVAL, PurchaseRequestStatus.PENDING_ACCOUNTANT_APPROVAL],
      'huy',
    );
    this.assertOwner(pr, currentUser);

    return this.prisma.purchaseRequest.update({
      where: { id },
      data: { status: PurchaseRequestStatus.CANCELLED, cancelledAt: new Date(), updatedBy: currentUser.id },
    });
  }

  async approveManager(id: number, dto: ApproveManagerPurchaseRequestDto, currentUser: RequestUser) {
    const pr = await this.findOne(id);
    this.assertStatus(pr, [PurchaseRequestStatus.PENDING_MANAGER_APPROVAL], 'duyet quan ly');

    if (currentUser.role !== Role.ADMIN && pr.purchaseRequisition.departmentId !== currentUser.departmentId) {
      throw new ForbiddenException({ key: 'NOT_IN_YOUR_DEPARTMENT' });
    }
    if (currentUser.role !== Role.ADMIN && pr.createdBy === currentUser.id) {
      throw new ForbiddenException({ key: 'CANNOT_APPROVE_OWN_REQUEST' });
    }

    // Vuot nguong 2000 USD: bat buoc xac nhan da gui mail xin BOD approve
    // TRUOC (ngoai he thong) — khong phai 1 buoc duyet he thong rieng.
    const exceedsThreshold = Number(pr.totalAmountUsd) > BOD_EMAIL_THRESHOLD_USD;
    if (exceedsThreshold && !dto.confirmedEmailToBod) {
      throw new BadRequestException({ key: 'MUST_CONFIRM_EMAIL_TO_BOD' });
    }

    const updated = await this.prisma.purchaseRequest.update({
      where: { id },
      data: {
        status: PurchaseRequestStatus.PENDING_ACCOUNTANT_APPROVAL,
        managerApprovedBy: currentUser.id,
        managerApprovedAt: new Date(),
        ...(exceedsThreshold ? { managerConfirmedBodEmailAt: new Date() } : {}),
        updatedBy: currentUser.id,
      },
    });

    const emails = await this.notification.getEmailsByRole(Role.ACCOUNTANT);
    await this.notification.sendToEmails(
      emails,
      `[SEC ERP] PR có giá ${pr.code} cần bạn duyệt`,
      `<p>PR có giá <b>${pr.code}</b> (tổng ${pr.totalAmountUsd} USD) đã qua Trưởng bộ phận, đang chờ Kế toán duyệt.</p>`,
    );

    return updated;
  }

  async approveAccountant(id: number, currentUser: RequestUser) {
    const pr = await this.findOne(id);
    this.assertStatus(pr, [PurchaseRequestStatus.PENDING_ACCOUNTANT_APPROVAL], 'duyet ke toan');
    if (currentUser.role !== Role.ADMIN && pr.createdBy === currentUser.id) {
      throw new ForbiddenException({ key: 'CANNOT_APPROVE_OWN_REQUEST' });
    }

    const updated = await this.prisma.purchaseRequest.update({
      where: { id },
      data: {
        status: PurchaseRequestStatus.APPROVED,
        accountantApprovedBy: currentUser.id,
        accountantApprovedAt: new Date(),
        updatedBy: currentUser.id,
      },
    });

    const purchaserUser = await this.prisma.user.findUnique({ where: { id: pr.createdBy } });
    if (purchaserUser) {
      await this.notification.sendToEmails(
        [purchaserUser.email],
        `[SEC ERP] PR có giá ${pr.code} đã được duyệt xong`,
        `<p>PR có giá <b>${pr.code}</b> đã được duyệt xong. Có thể tiến hành liên hệ nhà cung cấp.</p>`,
      );
    }

    return updated;
  }

  async reject(id: number, dto: RejectPurchaseRequestDto, currentUser: RequestUser) {
    const pr = await this.findOne(id);
    this.assertStatus(
      pr,
      [PurchaseRequestStatus.PENDING_MANAGER_APPROVAL, PurchaseRequestStatus.PENDING_ACCOUNTANT_APPROVAL],
      'tu choi',
    );

    if (
      pr.status === PurchaseRequestStatus.PENDING_MANAGER_APPROVAL &&
      currentUser.role !== Role.ADMIN &&
      pr.purchaseRequisition.departmentId !== currentUser.departmentId
    ) {
      throw new ForbiddenException({ key: 'NOT_IN_YOUR_DEPARTMENT' });
    }

    return this.prisma.purchaseRequest.update({
      where: { id },
      data: {
        status: PurchaseRequestStatus.REJECTED,
        rejectedBy: currentUser.id,
        rejectedAt: new Date(),
        rejectionReason: dto.reason,
        updatedBy: currentUser.id,
      },
    });
  }

  private assertOwner(pr: { createdBy: number }, currentUser: RequestUser) {
    if (currentUser.role !== Role.ADMIN && pr.createdBy !== currentUser.id) {
      throw new ForbiddenException({ key: 'ONLY_OWNER_CAN_MODIFY' });
    }
  }

  private assertStatus(pr: { status: PurchaseRequestStatus }, allowed: PurchaseRequestStatus[], action: string) {
    if (!allowed.includes(pr.status)) {
      throw new ConflictException({ key: 'INVALID_STATUS_TRANSITION', params: { action, status: pr.status } });
    }
  }

  private async generateCode(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.purchaseRequest.count({ where: { code: { startsWith: `PR-${year}-` } } });
    const seq = String(count + 1).padStart(6, '0');
    return `PR-${year}-${seq}`;
  }
}
