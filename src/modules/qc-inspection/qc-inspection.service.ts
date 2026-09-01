import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { QcInspectionStatus, QcStatus, Role, Prisma } from '@prisma/client';
import * as fs from 'fs';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateQcInspectionDto, ALLOWED_QC_RESULTS } from './dto/create-qc-inspection.dto';
import { UpdateQcInspectionDto } from './dto/update-qc-inspection.dto';
import { RejectQcInspectionDto } from './dto/reject-qc-inspection.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { buildPagination } from '../../common/pagination.util';

export interface RequestUser {
  id: number;
  role: Role;
  departmentId: number;
}

@Injectable()
export class QcInspectionService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------
  // CREATE — tao phieu kiem moi o trang thai DRAFT
  // -------------------------------------------------------------------
  async create(dto: CreateQcInspectionDto, currentUser: RequestUser) {
    const lot = await this.assertLotExists(dto.lotId);
    if (dto.result) this.assertResultIsValid(dto.result);

    const created = await this.prisma.qcInspection.create({
      data: {
        lotId: dto.lotId,
        inspectorId: currentUser.id,
        result: dto.result,
        notes: dto.notes,
        status: QcInspectionStatus.DRAFT,
        createdBy: currentUser.id,
      },
      include: { images: true },
    });

    // Danh dau Lot dang duoc kiem (IN_PROGRESS) neu con o trang thai PENDING,
    // de phan anh dung thuc te "da bat dau kiem, chua co ket qua".
    if (lot.qcStatus === QcStatus.PENDING) {
      await this.prisma.lot.update({
        where: { id: dto.lotId },
        data: { qcStatus: QcStatus.IN_PROGRESS },
      });
    }

    return created;
  }

  // -------------------------------------------------------------------
  // READ
  // -------------------------------------------------------------------
  async findAll(query: PaginationQueryDto & { lotId?: number; status?: QcInspectionStatus }) {
    const { skip, take, page, limit } = buildPagination(query.page, query.limit);
    const where: Prisma.QcInspectionWhereInput = {
      deletedAt: null,
      ...(query.lotId ? { lotId: Number(query.lotId) } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.qcInspection.findMany({
        where,
        skip,
        take,
        orderBy: { id: 'desc' },
        include: { images: true },
      }),
      this.prisma.qcInspection.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: number) {
    const found = await this.prisma.qcInspection.findFirst({
      where: { id, deletedAt: null },
      include: { images: true, lot: { include: { item: true } } },
    });
    if (!found) throw new NotFoundException(`QcInspection #${id} not found`);
    return found;
  }

  // -------------------------------------------------------------------
  // UPDATE — chi cho phep khi con DRAFT
  // -------------------------------------------------------------------
  async update(id: number, dto: UpdateQcInspectionDto, currentUser: RequestUser) {
    const current = await this.findOne(id);
    this.assertStatus(current, [QcInspectionStatus.DRAFT], 'chinh sua');
    if (dto.result) this.assertResultIsValid(dto.result);

    return this.prisma.qcInspection.update({
      where: { id },
      data: {
        result: dto.result,
        notes: dto.notes,
        updatedBy: currentUser.id,
      },
      include: { images: true },
    });
  }

  // -------------------------------------------------------------------
  // IMAGE UPLOAD — chi them/xoa anh khi phieu con DRAFT
  // -------------------------------------------------------------------
  async addImage(
    id: number,
    file: { path: string; originalname: string },
    currentUser: RequestUser,
  ) {
    const current = await this.findOne(id);
    this.assertStatus(current, [QcInspectionStatus.DRAFT], 'them anh');

    return this.prisma.qcInspectionImage.create({
      data: {
        qcInspectionId: id,
        filePath: file.path,
        originalFileName: file.originalname,
        uploadedBy: currentUser.id,
      },
    });
  }

  async removeImage(imageId: number, currentUser: RequestUser) {
    const image = await this.prisma.qcInspectionImage.findFirst({ where: { id: imageId } });
    if (!image) throw new NotFoundException(`QcInspectionImage #${imageId} not found`);

    const inspection = await this.findOne(image.qcInspectionId);
    this.assertStatus(inspection, [QcInspectionStatus.DRAFT], 'xoa anh');

    await this.prisma.qcInspectionImage.delete({ where: { id: imageId } });

    // Xoa file vat ly tren dia, khong chan loi neu file da bi mat truoc do
    fs.unlink(image.filePath, () => {
      /* bo qua loi neu file khong con ton tai */
    });

    return { deleted: true };
  }

  async getImageById(imageId: number) {
    const image = await this.prisma.qcInspectionImage.findFirst({ where: { id: imageId } });
    if (!image) throw new NotFoundException(`QcInspectionImage #${imageId} not found`);
    return image;
  }

  // -------------------------------------------------------------------
  // SUBMIT — DRAFT -> PENDING_APPROVAL
  // Bat buoc: phai co ket qua + it nhat 1 anh.
  // -------------------------------------------------------------------
  async submit(id: number, currentUser: RequestUser) {
    const current = await this.findOne(id);
    this.assertStatus(current, [QcInspectionStatus.DRAFT], 'gui duyet');

    if (!current.result) {
      throw new BadRequestException('Phai chon ket qua kiem tra truoc khi gui duyet');
    }
    if (current.images.length === 0) {
      throw new BadRequestException('Phai co it nhat 1 anh chup phieu kiem hang truoc khi gui duyet');
    }

    return this.prisma.qcInspection.update({
      where: { id },
      data: {
        status: QcInspectionStatus.PENDING_APPROVAL,
        submittedAt: new Date(),
        updatedBy: currentUser.id,
      },
    });
  }

  // -------------------------------------------------------------------
  // APPROVE — PENDING_APPROVAL -> APPROVED
  // Cap nhat Lot.qcStatus that su theo ket qua da duyet.
  // -------------------------------------------------------------------
  async approve(id: number, currentUser: RequestUser) {
    const current = await this.findOne(id);
    this.assertStatus(current, [QcInspectionStatus.PENDING_APPROVAL], 'duyet');
    this.assertApproverRole(currentUser);

    return this.prisma.$transaction(async (tx) => {
      await tx.lot.update({
        where: { id: current.lotId },
        data: { qcStatus: current.result! },
      });

      return tx.qcInspection.update({
        where: { id },
        data: {
          status: QcInspectionStatus.APPROVED,
          approvedAt: new Date(),
          approvedBy: currentUser.id,
        },
        include: { images: true },
      });
    });
  }

  // -------------------------------------------------------------------
  // REJECT — PENDING_APPROVAL -> REJECTED (tu choi quy trinh, VD anh mo)
  // -------------------------------------------------------------------
  async reject(id: number, dto: RejectQcInspectionDto, currentUser: RequestUser) {
    const current = await this.findOne(id);
    this.assertStatus(current, [QcInspectionStatus.PENDING_APPROVAL], 'tu choi');
    this.assertApproverRole(currentUser);

    return this.prisma.qcInspection.update({
      where: { id },
      data: {
        status: QcInspectionStatus.REJECTED,
        rejectedReason: dto.reason,
      },
    });
  }

  // -------------------------------------------------------------------
  // REOPEN — REJECTED -> DRAFT
  // -------------------------------------------------------------------
  async reopen(id: number, currentUser: RequestUser) {
    const current = await this.findOne(id);
    this.assertStatus(current, [QcInspectionStatus.REJECTED], 'mo lai');

    return this.prisma.qcInspection.update({
      where: { id },
      data: {
        status: QcInspectionStatus.DRAFT,
        rejectedReason: null,
        updatedBy: currentUser.id,
      },
    });
  }

  // -------------------------------------------------------------------
  // DELETE — chi cho phep khi con DRAFT, don luon file anh
  // -------------------------------------------------------------------
  async remove(id: number, currentUser: RequestUser) {
    const current = await this.findOne(id);
    this.assertStatus(current, [QcInspectionStatus.DRAFT], 'xoa');

    for (const image of current.images) {
      fs.unlink(image.filePath, () => {});
    }

    return this.prisma.qcInspection.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: currentUser.id },
    });
  }

  // =====================================================================
  // Helpers
  // =====================================================================

  private assertStatus(
    inspection: { status: QcInspectionStatus },
    allowed: QcInspectionStatus[],
    action: string,
  ) {
    if (!allowed.includes(inspection.status)) {
      throw new ConflictException(
        `Khong the ${action} phieu dang o trang thai '${inspection.status}'`,
      );
    }
  }

  private assertApproverRole(currentUser: RequestUser) {
    if (currentUser.role !== Role.QC_MANAGER && currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Chi QC Manager hoac Admin moi duoc duyet phieu kiem hang');
    }
  }

  private assertResultIsValid(result: QcStatus) {
    if (!ALLOWED_QC_RESULTS.includes(result)) {
      throw new BadRequestException(
        `Ket qua QC chi duoc la mot trong: ${ALLOWED_QC_RESULTS.join(', ')}`,
      );
    }
  }

  private async assertLotExists(lotId: number) {
    const lot = await this.prisma.lot.findFirst({ where: { id: lotId, deletedAt: null } });
    if (!lot) throw new BadRequestException(`Lot #${lotId} khong ton tai`);
    return lot;
  }
}
