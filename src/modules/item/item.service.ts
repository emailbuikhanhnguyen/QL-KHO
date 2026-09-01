import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { buildPagination } from '../../common/pagination.util';

@Injectable()
export class ItemService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateItemDto) {
    this.assertStockRange(dto.minStock, dto.maxStock);
    await this.assertItemGroupExists(dto.itemGroupId);
    await this.assertCodeIsFree(dto.code);
    return this.prisma.item.create({ data: dto });
  }

  async findAll(query: PaginationQueryDto & { itemGroupId?: number; isActive?: string }) {
    const { skip, take, page, limit } = buildPagination(query.page, query.limit);
    const where: Prisma.ItemWhereInput = {
      deletedAt: null,
      ...(query.itemGroupId ? { itemGroupId: Number(query.itemGroupId) } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive === 'true' } : {}),
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
      this.prisma.item.findMany({ where, skip, take, orderBy: { id: 'asc' } }),
      this.prisma.item.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: number) {
    const found = await this.prisma.item.findFirst({ where: { id, deletedAt: null } });
    if (!found) throw new NotFoundException(`Item #${id} not found`);
    return found;
  }

  async update(id: number, dto: UpdateItemDto) {
    const current = await this.findOne(id);
    const minStock = dto.minStock ?? Number(current.minStock);
    const maxStock = dto.maxStock ?? Number(current.maxStock);
    this.assertStockRange(minStock, maxStock);

    if (dto.itemGroupId) await this.assertItemGroupExists(dto.itemGroupId);
    if (dto.code) await this.assertCodeIsFree(dto.code, id);

    return this.prisma.item.update({ where: { id }, data: dto });
  }

  async remove(id: number, updatedBy?: number) {
    await this.findOne(id);
    return this.prisma.item.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy },
    });
  }

  private assertStockRange(minStock: number, maxStock: number) {
    if (Number(minStock) > Number(maxStock)) {
      throw new BadRequestException('Dinh muc ton toi thieu khong duoc lon hon dinh muc ton toi da');
    }
  }

  private async assertItemGroupExists(itemGroupId: number) {
    const group = await this.prisma.itemGroup.findFirst({
      where: { id: itemGroupId, deletedAt: null },
    });
    if (!group) throw new BadRequestException(`ItemGroup #${itemGroupId} khong ton tai`);
  }

  private async assertCodeIsFree(code: string, excludeId?: number) {
    const existing = await this.prisma.item.findFirst({
      where: { code, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (existing) throw new ConflictException(`Ma vat tu '${code}' da ton tai`);
  }
}
