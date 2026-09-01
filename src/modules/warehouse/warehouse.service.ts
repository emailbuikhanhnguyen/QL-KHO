import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { buildPagination } from '../../common/pagination.util';

@Injectable()
export class WarehouseService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateWarehouseDto) {
    await this.assertCodeIsFree(dto.code);
    return this.prisma.warehouse.create({ data: dto });
  }

  async findAll(query: PaginationQueryDto) {
    const { skip, take, page, limit } = buildPagination(query.page, query.limit);
    const where: Prisma.WarehouseWhereInput = {
      deletedAt: null,
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
      this.prisma.warehouse.findMany({ where, skip, take, orderBy: { id: 'asc' } }),
      this.prisma.warehouse.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: number) {
    const found = await this.prisma.warehouse.findFirst({ where: { id, deletedAt: null } });
    if (!found) throw new NotFoundException(`Warehouse #${id} not found`);
    return found;
  }

  async update(id: number, dto: UpdateWarehouseDto) {
    await this.findOne(id);
    if (dto.code) await this.assertCodeIsFree(dto.code, id);
    return this.prisma.warehouse.update({ where: { id }, data: dto });
  }

  async remove(id: number, updatedBy?: number) {
    await this.findOne(id);
    return this.prisma.warehouse.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy },
    });
  }

  private async assertCodeIsFree(code: string, excludeId?: number) {
    const existing = await this.prisma.warehouse.findFirst({
      where: { code, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (existing) throw new ConflictException(`Ma kho '${code}' da ton tai`);
  }
}
