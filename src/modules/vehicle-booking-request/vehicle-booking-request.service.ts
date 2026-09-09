import { Injectable, BadRequestException, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateVehicleBookingRequestDto } from './dto/create-vehicle-booking-request.dto';
import { UpdateVehicleBookingRequestDto } from './dto/update-vehicle-booking-request.dto';
import { RejectVehicleBookingRequestDto } from './dto/reject-vehicle-booking-request.dto';
import { VehicleBookingStatus, Prisma, Role } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { buildPagination } from '../../common/pagination.util';

export interface RequestUser {
  id: number;
  role: Role;
  departmentId: number;
}

@Injectable()
export class VehicleBookingRequestService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateVehicleBookingRequestDto, currentUser: RequestUser) {
    if (dto.startTime >= dto.endTime) {
      throw new BadRequestException({ key: 'INVALID_TIME_RANGE' });
    }

    const code = await this.generateCode();

    return this.prisma.vehicleBookingRequest.create({
      data: {
        code,
        requestedBy: currentUser.id,
        departmentId: currentUser.departmentId,
        useDate: new Date(dto.useDate),
        startTime: dto.startTime,
        endTime: dto.endTime,
        departure: dto.departure,
        destination: dto.destination,
        purpose: dto.purpose,
        numberOfPeople: dto.numberOfPeople,
        status: VehicleBookingStatus.DRAFT,
        createdBy: currentUser.id,
      },
    });
  }

  async findAll(query: PaginationQueryDto & { status?: VehicleBookingStatus; departmentId?: number }) {
    const { skip, take, page, limit } = buildPagination(query.page, query.limit);
    const where: Prisma.VehicleBookingRequestWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.vehicleBookingRequest.findMany({ where, skip, take, orderBy: { id: 'desc' }, include: { department: true } }),
      this.prisma.vehicleBookingRequest.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: number) {
    const found = await this.prisma.vehicleBookingRequest.findUnique({ where: { id }, include: { department: true } });
    if (!found) throw new NotFoundException({ key: 'ENTITY_NOT_FOUND', params: { entity: 'VehicleBookingRequest', id } });
    return found;
  }

  async update(id: number, dto: UpdateVehicleBookingRequestDto, currentUser: RequestUser) {
    const vb = await this.findOne(id);
    this.assertStatus(vb, [VehicleBookingStatus.DRAFT], 'chinh sua');
    this.assertOwner(vb, currentUser);

    if (dto.startTime || dto.endTime) {
      const start = dto.startTime ?? vb.startTime;
      const end = dto.endTime ?? vb.endTime;
      if (start >= end) throw new BadRequestException({ key: 'INVALID_TIME_RANGE' });
    }

    return this.prisma.vehicleBookingRequest.update({
      where: { id },
      data: {
        ...(dto.useDate ? { useDate: new Date(dto.useDate) } : {}),
        ...(dto.startTime ? { startTime: dto.startTime } : {}),
        ...(dto.endTime ? { endTime: dto.endTime } : {}),
        ...(dto.departure ? { departure: dto.departure } : {}),
        ...(dto.destination ? { destination: dto.destination } : {}),
        ...(dto.purpose ? { purpose: dto.purpose } : {}),
        ...(dto.numberOfPeople !== undefined ? { numberOfPeople: dto.numberOfPeople } : {}),
        updatedBy: currentUser.id,
      },
    });
  }

  async remove(id: number, currentUser: RequestUser) {
    const vb = await this.findOne(id);
    this.assertStatus(vb, [VehicleBookingStatus.DRAFT], 'xoa');
    this.assertOwner(vb, currentUser);
    return this.prisma.vehicleBookingRequest.delete({ where: { id } });
  }

  async submit(id: number, currentUser: RequestUser) {
    const vb = await this.findOne(id);
    this.assertStatus(vb, [VehicleBookingStatus.DRAFT], 'gui duyet');
    this.assertOwner(vb, currentUser);

    return this.prisma.vehicleBookingRequest.update({
      where: { id },
      data: { status: VehicleBookingStatus.PENDING_MANAGER_APPROVAL, submittedAt: new Date(), updatedBy: currentUser.id },
    });
  }

  async cancel(id: number, currentUser: RequestUser) {
    const vb = await this.findOne(id);
    this.assertStatus(
      vb,
      [VehicleBookingStatus.DRAFT, VehicleBookingStatus.PENDING_MANAGER_APPROVAL, VehicleBookingStatus.PENDING_ADMIN_APPROVAL],
      'huy',
    );
    this.assertOwner(vb, currentUser);

    return this.prisma.vehicleBookingRequest.update({
      where: { id },
      data: { status: VehicleBookingStatus.CANCELLED, cancelledAt: new Date(), updatedBy: currentUser.id },
    });
  }

  async approveManager(id: number, currentUser: RequestUser) {
    const vb = await this.findOne(id);
    this.assertStatus(vb, [VehicleBookingStatus.PENDING_MANAGER_APPROVAL], 'duyet quan ly');

    if (currentUser.role !== Role.ADMIN && vb.departmentId !== currentUser.departmentId) {
      throw new ForbiddenException({ key: 'NOT_IN_YOUR_DEPARTMENT' });
    }

    // Them 09/09/2026 — vay lo hong Separation of Duties (SoD), xem giai
    // thich chi tiet trong leave-request.service.ts.
    if (currentUser.role !== Role.ADMIN && vb.requestedBy === currentUser.id) {
      throw new ForbiddenException({ key: 'CANNOT_APPROVE_OWN_REQUEST' });
    }

    return this.prisma.vehicleBookingRequest.update({
      where: { id },
      data: {
        status: VehicleBookingStatus.PENDING_ADMIN_APPROVAL,
        managerApprovedBy: currentUser.id,
        managerApprovedAt: new Date(),
        updatedBy: currentUser.id,
      },
    });
  }

  // Cap duyet cuoi la ADMIN (dieu phoi xe) — KHAC 3 module truoc dung HR.
  async approveAdmin(id: number, currentUser: RequestUser) {
    const vb = await this.findOne(id);
    this.assertStatus(vb, [VehicleBookingStatus.PENDING_ADMIN_APPROVAL], 'duyet dieu phoi xe');

    return this.prisma.vehicleBookingRequest.update({
      where: { id },
      data: {
        status: VehicleBookingStatus.APPROVED,
        adminApprovedBy: currentUser.id,
        adminApprovedAt: new Date(),
        updatedBy: currentUser.id,
      },
    });
  }

  async reject(id: number, dto: RejectVehicleBookingRequestDto, currentUser: RequestUser) {
    const vb = await this.findOne(id);
    this.assertStatus(
      vb,
      [VehicleBookingStatus.PENDING_MANAGER_APPROVAL, VehicleBookingStatus.PENDING_ADMIN_APPROVAL],
      'tu choi',
    );

    if (
      vb.status === VehicleBookingStatus.PENDING_MANAGER_APPROVAL &&
      currentUser.role !== Role.ADMIN &&
      vb.departmentId !== currentUser.departmentId
    ) {
      throw new ForbiddenException({ key: 'NOT_IN_YOUR_DEPARTMENT' });
    }

    return this.prisma.vehicleBookingRequest.update({
      where: { id },
      data: {
        status: VehicleBookingStatus.REJECTED,
        rejectedBy: currentUser.id,
        rejectedAt: new Date(),
        rejectionReason: dto.reason,
        updatedBy: currentUser.id,
      },
    });
  }

  private assertOwner(vb: { requestedBy: number }, currentUser: RequestUser) {
    if (currentUser.role !== Role.ADMIN && vb.requestedBy !== currentUser.id) {
      throw new ForbiddenException({ key: 'ONLY_OWNER_CAN_MODIFY' });
    }
  }

  private assertStatus(vb: { status: VehicleBookingStatus }, allowed: VehicleBookingStatus[], action: string) {
    if (!allowed.includes(vb.status)) {
      throw new ConflictException({ key: 'INVALID_STATUS_TRANSITION', params: { action, status: vb.status } });
    }
  }

  private async generateCode(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.vehicleBookingRequest.count({ where: { code: { startsWith: `VB-${year}-` } } });
    const seq = String(count + 1).padStart(6, '0');
    return `VB-${year}-${seq}`;
  }
}
