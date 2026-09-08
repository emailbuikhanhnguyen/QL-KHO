import { Injectable, BadRequestException, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGatePassRequestDto } from './dto/create-gate-pass-request.dto';
import { UpdateGatePassRequestDto } from './dto/update-gate-pass-request.dto';
import { RejectGatePassRequestDto } from './dto/reject-gate-pass-request.dto';
import { GatePassRequestStatus, Prisma, Role } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { buildPagination } from '../../common/pagination.util';

export interface RequestUser {
  id: number;
  role: Role;
  departmentId: number;
}

@Injectable()
export class GatePassRequestService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateGatePassRequestDto, currentUser: RequestUser) {
    this.assertTimeRange(dto.timeOut, dto.timeIn);

    const code = await this.generateCode();

    return this.prisma.gatePassRequest.create({
      data: {
        code,
        requestedBy: currentUser.id,
        departmentId: currentUser.departmentId,
        passDate: new Date(dto.passDate),
        timeOut: dto.timeOut,
        timeIn: dto.timeIn,
        purpose: dto.purpose,
        relatedPeople: dto.relatedPeople,
        status: GatePassRequestStatus.DRAFT,
        createdBy: currentUser.id,
      },
    });
  }

  async findAll(query: PaginationQueryDto & { status?: GatePassRequestStatus; departmentId?: number }) {
    const { skip, take, page, limit } = buildPagination(query.page, query.limit);
    const where: Prisma.GatePassRequestWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.gatePassRequest.findMany({ where, skip, take, orderBy: { id: 'desc' }, include: { department: true } }),
      this.prisma.gatePassRequest.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: number) {
    const found = await this.prisma.gatePassRequest.findUnique({ where: { id }, include: { department: true } });
    if (!found) throw new NotFoundException({ key: 'ENTITY_NOT_FOUND', params: { entity: 'GatePassRequest', id } });
    return found;
  }

  async update(id: number, dto: UpdateGatePassRequestDto, currentUser: RequestUser) {
    const gp = await this.findOne(id);
    this.assertStatus(gp, [GatePassRequestStatus.DRAFT], 'chinh sua');
    this.assertOwner(gp, currentUser);

    if (dto.timeOut || dto.timeIn) {
      this.assertTimeRange(dto.timeOut ?? gp.timeOut, dto.timeIn ?? gp.timeIn ?? undefined);
    }

    return this.prisma.gatePassRequest.update({
      where: { id },
      data: {
        ...(dto.passDate ? { passDate: new Date(dto.passDate) } : {}),
        ...(dto.timeOut ? { timeOut: dto.timeOut } : {}),
        ...(dto.timeIn !== undefined ? { timeIn: dto.timeIn } : {}),
        ...(dto.purpose ? { purpose: dto.purpose } : {}),
        ...(dto.relatedPeople !== undefined ? { relatedPeople: dto.relatedPeople } : {}),
        updatedBy: currentUser.id,
      },
    });
  }

  async remove(id: number, currentUser: RequestUser) {
    const gp = await this.findOne(id);
    this.assertStatus(gp, [GatePassRequestStatus.DRAFT], 'xoa');
    this.assertOwner(gp, currentUser);
    return this.prisma.gatePassRequest.delete({ where: { id } });
  }

  async submit(id: number, currentUser: RequestUser) {
    const gp = await this.findOne(id);
    this.assertStatus(gp, [GatePassRequestStatus.DRAFT], 'gui duyet');
    this.assertOwner(gp, currentUser);

    return this.prisma.gatePassRequest.update({
      where: { id },
      data: { status: GatePassRequestStatus.PENDING_MANAGER_APPROVAL, submittedAt: new Date(), updatedBy: currentUser.id },
    });
  }

  async cancel(id: number, currentUser: RequestUser) {
    const gp = await this.findOne(id);
    this.assertStatus(
      gp,
      [GatePassRequestStatus.DRAFT, GatePassRequestStatus.PENDING_MANAGER_APPROVAL, GatePassRequestStatus.PENDING_HR_APPROVAL],
      'huy',
    );
    this.assertOwner(gp, currentUser);

    return this.prisma.gatePassRequest.update({
      where: { id },
      data: { status: GatePassRequestStatus.CANCELLED, cancelledAt: new Date(), updatedBy: currentUser.id },
    });
  }

  async approveManager(id: number, currentUser: RequestUser) {
    const gp = await this.findOne(id);
    this.assertStatus(gp, [GatePassRequestStatus.PENDING_MANAGER_APPROVAL], 'duyet quan ly');

    if (currentUser.role !== Role.ADMIN && gp.departmentId !== currentUser.departmentId) {
      throw new ForbiddenException({ key: 'NOT_IN_YOUR_DEPARTMENT' });
    }

    return this.prisma.gatePassRequest.update({
      where: { id },
      data: {
        status: GatePassRequestStatus.PENDING_HR_APPROVAL,
        managerApprovedBy: currentUser.id,
        managerApprovedAt: new Date(),
        updatedBy: currentUser.id,
      },
    });
  }

  async approveHr(id: number, currentUser: RequestUser) {
    const gp = await this.findOne(id);
    this.assertStatus(gp, [GatePassRequestStatus.PENDING_HR_APPROVAL], 'duyet HR');

    return this.prisma.gatePassRequest.update({
      where: { id },
      data: {
        status: GatePassRequestStatus.APPROVED,
        hrApprovedBy: currentUser.id,
        hrApprovedAt: new Date(),
        updatedBy: currentUser.id,
      },
    });
  }

  async reject(id: number, dto: RejectGatePassRequestDto, currentUser: RequestUser) {
    const gp = await this.findOne(id);
    this.assertStatus(
      gp,
      [GatePassRequestStatus.PENDING_MANAGER_APPROVAL, GatePassRequestStatus.PENDING_HR_APPROVAL],
      'tu choi',
    );

    if (
      gp.status === GatePassRequestStatus.PENDING_MANAGER_APPROVAL &&
      currentUser.role !== Role.ADMIN &&
      gp.departmentId !== currentUser.departmentId
    ) {
      throw new ForbiddenException({ key: 'NOT_IN_YOUR_DEPARTMENT' });
    }

    return this.prisma.gatePassRequest.update({
      where: { id },
      data: {
        status: GatePassRequestStatus.REJECTED,
        rejectedBy: currentUser.id,
        rejectedAt: new Date(),
        rejectionReason: dto.reason,
        updatedBy: currentUser.id,
      },
    });
  }

  private assertOwner(gp: { requestedBy: number }, currentUser: RequestUser) {
    if (currentUser.role !== Role.ADMIN && gp.requestedBy !== currentUser.id) {
      throw new ForbiddenException({ key: 'ONLY_OWNER_CAN_MODIFY' });
    }
  }

  private assertStatus(gp: { status: GatePassRequestStatus }, allowed: GatePassRequestStatus[], action: string) {
    if (!allowed.includes(gp.status)) {
      throw new ConflictException({ key: 'INVALID_STATUS_TRANSITION', params: { action, status: gp.status } });
    }
  }

  // timeIn la TUY CHON (truong hop ra ngoai khong quay lai) — chi kiem tra
  // thu tu gio khi CA HAI deu co mat.
  private assertTimeRange(timeOut: string, timeIn?: string) {
    if (timeIn && timeOut >= timeIn) {
      throw new BadRequestException({ key: 'INVALID_TIME_RANGE' });
    }
  }

  private async generateCode(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.gatePassRequest.count({ where: { code: { startsWith: `GP-${year}-` } } });
    const seq = String(count + 1).padStart(6, '0');
    return `GP-${year}-${seq}`;
  }
}
