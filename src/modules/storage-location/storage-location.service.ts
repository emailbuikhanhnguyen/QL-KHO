import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStorageLocationDto } from './dto/create-storage-location.dto';
import { UpdateStorageLocationDto } from './dto/update-storage-location.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { buildPagination } from '../../common/pagination.util';

@Injectable()
export class StorageLocationService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateStorageLocationDto) {
    await this.assertRackExists(dto.rackId);
    await this.assertCodeIsFree(dto.rackId, dto.code);
    return this.prisma.storageLocation.create({ data: dto });
  }

  async findAll(query: PaginationQueryDto & { rackId?: number }) {
    const { skip, take, page, limit } = buildPagination(query.page, query.limit);
    const where: Prisma.StorageLocationWhereInput = {
      deletedAt: null,
      ...(query.rackId ? { rackId: Number(query.rackId) } : {}),
      ...(query.search ? { code: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.storageLocation.findMany({ where, skip, take, orderBy: { id: 'asc' } }),
      this.prisma.storageLocation.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: number) {
    const found = await this.prisma.storageLocation.findFirst({ where: { id, deletedAt: null } });
    if (!found) throw new NotFoundException(`StorageLocation #${id} not found`);
    return found;
  }

  async update(id: number, dto: UpdateStorageLocationDto) {
    const current = await this.findOne(id);
    if (dto.rackId) await this.assertRackExists(dto.rackId);
    if (dto.code) {
      await this.assertCodeIsFree(dto.rackId ?? current.rackId, dto.code, id);
    }
    return this.prisma.storageLocation.update({ where: { id }, data: dto });
  }

  async remove(id: number, updatedBy?: number) {
    await this.findOne(id);
    return this.prisma.storageLocation.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy },
    });
  }

  private async assertRackExists(rackId: number) {
    const rack = await this.prisma.rack.findFirst({ where: { id: rackId, deletedAt: null } });
    if (!rack) throw new BadRequestException(`Rack #${rackId} khong ton tai`);
  }

  private async assertCodeIsFree(rackId: number, code: string, excludeId?: number) {
    const existing = await this.prisma.storageLocation.findFirst({
      where: { rackId, code, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (existing) throw new ConflictException(`Ma vi tri '${code}' da ton tai trong ke nay`);
  }
}
