import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { buildPagination } from '../../common/pagination.util';

@Injectable()
export class SupplierService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSupplierDto) {
    await this.assertCodeIsFree(dto.code);
    return this.prisma.supplier.create({ data: dto });
  }

  async findAll(query: PaginationQueryDto) {
    const { skip, take, page, limit } = buildPagination(query.page, query.limit);
    const where: Prisma.SupplierWhereInput = {
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
      this.prisma.supplier.findMany({ where, skip, take, orderBy: { id: 'asc' } }),
      this.prisma.supplier.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: number) {
    const found = await this.prisma.supplier.findFirst({ where: { id, deletedAt: null } });
    if (!found) throw new NotFoundException(`Supplier #${id} not found`);
    return found;
  }

  async update(id: number, dto: UpdateSupplierDto) {
    await this.findOne(id);
    if (dto.code) await this.assertCodeIsFree(dto.code, id);
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }

  async remove(id: number, updatedBy?: number) {
    await this.findOne(id);
    return this.prisma.supplier.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy },
    });
  }

  private async assertCodeIsFree(code: string, excludeId?: number) {
    const existing = await this.prisma.supplier.findFirst({
      where: { code, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (existing) throw new ConflictException(`Ma nha cung cap '${code}' da ton tai`);
  }
}
