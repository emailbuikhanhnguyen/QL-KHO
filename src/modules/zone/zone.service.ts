import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { buildPagination } from '../../common/pagination.util';

@Injectable()
export class ZoneService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateZoneDto) {
    await this.assertWarehouseExists(dto.warehouseId);
    await this.assertCodeIsFree(dto.warehouseId, dto.code);
    return this.prisma.zone.create({ data: dto });
  }

  async findAll(query: PaginationQueryDto & { warehouseId?: number }) {
    const { skip, take, page, limit } = buildPagination(query.page, query.limit);
    const where: Prisma.ZoneWhereInput = {
      deletedAt: null,
      ...(query.warehouseId ? { warehouseId: Number(query.warehouseId) } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.zone.findMany({ where, skip, take, orderBy: { id: 'asc' } }),
      this.prisma.zone.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: number) {
    const found = await this.prisma.zone.findFirst({ where: { id, deletedAt: null } });
    if (!found) throw new NotFoundException(`Zone #${id} not found`);
    return found;
  }

  async update(id: number, dto: UpdateZoneDto) {
    const current = await this.findOne(id);
    if (dto.warehouseId) await this.assertWarehouseExists(dto.warehouseId);
    if (dto.code) {
      await this.assertCodeIsFree(dto.warehouseId ?? current.warehouseId, dto.code, id);
    }
    return this.prisma.zone.update({ where: { id }, data: dto });
  }

  async remove(id: number, updatedBy?: number) {
    await this.findOne(id);
    return this.prisma.zone.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy },
    });
  }

  private async assertWarehouseExists(warehouseId: number) {
    const wh = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, deletedAt: null },
    });
    if (!wh) throw new BadRequestException(`Warehouse #${warehouseId} khong ton tai`);
  }

  private async assertCodeIsFree(warehouseId: number, code: string, excludeId?: number) {
    const existing = await this.prisma.zone.findFirst({
      where: {
        warehouseId,
        code,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (existing) throw new ConflictException(`Ma khu vuc '${code}' da ton tai trong kho nay`);
  }
}
