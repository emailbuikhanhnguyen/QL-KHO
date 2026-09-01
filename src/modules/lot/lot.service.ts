import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, QcStatus } from '@prisma/client';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateLotDto } from './dto/create-lot.dto';
import { UpdateLotDto } from './dto/update-lot.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { buildPagination } from '../../common/pagination.util';

@Injectable()
export class LotService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateLotDto) {
    await this.assertItemExists(dto.itemId);
    await this.assertSupplierExists(dto.supplierId);
    await this.assertLotCodeIsFree(dto.itemId, dto.lotCode);

    return this.prisma.lot.create({
      data: {
        ...dto,
        manufactureDate: dto.manufactureDate ? new Date(dto.manufactureDate) : undefined,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
        qcStatus: dto.qcStatus ?? QcStatus.PENDING,
      },
    });
  }

  async findAll(
    query: PaginationQueryDto & { itemId?: number; supplierId?: number; qcStatus?: QcStatus },
  ) {
    const { skip, take, page, limit } = buildPagination(query.page, query.limit);
    const where: Prisma.LotWhereInput = {
      deletedAt: null,
      ...(query.itemId ? { itemId: Number(query.itemId) } : {}),
      ...(query.supplierId ? { supplierId: Number(query.supplierId) } : {}),
      ...(query.qcStatus ? { qcStatus: query.qcStatus } : {}),
      ...(query.search ? { lotCode: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.lot.findMany({ where, skip, take, orderBy: { id: 'asc' } }),
      this.prisma.lot.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: number) {
    const found = await this.prisma.lot.findFirst({ where: { id, deletedAt: null } });
    if (!found) throw new NotFoundException(`Lot #${id} not found`);
    return found;
  }

  async update(id: number, dto: UpdateLotDto) {
    const current = await this.findOne(id);

    if (dto.itemId) await this.assertItemExists(dto.itemId);
    if (dto.supplierId) await this.assertSupplierExists(dto.supplierId);
    if (dto.lotCode) {
      await this.assertLotCodeIsFree(dto.itemId ?? current.itemId, dto.lotCode, id);
    }

    return this.prisma.lot.update({
      where: { id },
      data: {
        ...dto,
        manufactureDate: dto.manufactureDate ? new Date(dto.manufactureDate) : undefined,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
      },
    });
  }

  async remove(id: number, updatedBy?: number) {
    await this.findOne(id);
    return this.prisma.lot.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy },
    });
  }

  private async assertItemExists(itemId: number) {
    const item = await this.prisma.item.findFirst({ where: { id: itemId, deletedAt: null } });
    if (!item) throw new BadRequestException(`Item #${itemId} khong ton tai`);
  }

  private async assertSupplierExists(supplierId: number) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, deletedAt: null },
    });
    if (!supplier) throw new BadRequestException(`Supplier #${supplierId} khong ton tai`);
  }

  // Sinh anh QR (PNG) ma hoa "KHO-LOT-{id}" cho 1 lo hang cu the.
  async generateQrCodePng(lotId: number): Promise<Buffer> {
    await this.findOne(lotId); // nem NotFoundException neu lo khong ton tai
    const content = `KHO-LOT-${lotId}`;
    return QRCode.toBuffer(content, { type: 'png', width: 300, margin: 2 });
  }

  private async assertLotCodeIsFree(itemId: number, lotCode: string, excludeId?: number) {
    const existing = await this.prisma.lot.findFirst({
      where: {
        itemId,
        lotCode,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (existing) throw new ConflictException(`Ma lo '${lotCode}' da ton tai cho vat tu nay`);
  }
}
