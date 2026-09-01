import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateItemGroupDto } from './dto/create-item-group.dto';
import { UpdateItemGroupDto } from './dto/update-item-group.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { buildPagination } from '../../common/pagination.util';

@Injectable()
export class ItemGroupService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateItemGroupDto) {
    await this.assertCodeIsFree(dto.code);
    return this.prisma.itemGroup.create({ data: dto });
  }

  async findAll(query: PaginationQueryDto) {
    const { skip, take, page, limit } = buildPagination(query.page, query.limit);
    const where: Prisma.ItemGroupWhereInput = {
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
      this.prisma.itemGroup.findMany({ where, skip, take, orderBy: { id: 'asc' } }),
      this.prisma.itemGroup.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: number) {
    const found = await this.prisma.itemGroup.findFirst({ where: { id, deletedAt: null } });
    if (!found) throw new NotFoundException(`ItemGroup #${id} not found`);
    return found;
  }

  async update(id: number, dto: UpdateItemGroupDto) {
    await this.findOne(id);
    if (dto.code) await this.assertCodeIsFree(dto.code, id);
    return this.prisma.itemGroup.update({ where: { id }, data: dto });
  }

  async remove(id: number, updatedBy?: number) {
    await this.findOne(id);
    return this.prisma.itemGroup.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy },
    });
  }

  private async assertCodeIsFree(code: string, excludeId?: number) {
    const existing = await this.prisma.itemGroup.findFirst({
      where: { code, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (existing) throw new ConflictException(`Ma nhom vat tu '${code}' da ton tai`);
  }
}
