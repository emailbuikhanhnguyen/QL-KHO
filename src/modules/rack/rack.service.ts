import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRackDto } from './dto/create-rack.dto';
import { UpdateRackDto } from './dto/update-rack.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { buildPagination } from '../../common/pagination.util';

@Injectable()
export class RackService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRackDto) {
    await this.assertZoneExists(dto.zoneId);
    await this.assertCodeIsFree(dto.zoneId, dto.code);
    return this.prisma.rack.create({ data: dto });
  }

  async findAll(query: PaginationQueryDto & { zoneId?: number }) {
    const { skip, take, page, limit } = buildPagination(query.page, query.limit);
    const where: Prisma.RackWhereInput = {
      deletedAt: null,
      ...(query.zoneId ? { zoneId: Number(query.zoneId) } : {}),
      ...(query.search ? { code: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.rack.findMany({ where, skip, take, orderBy: { id: 'asc' } }),
      this.prisma.rack.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: number) {
    const found = await this.prisma.rack.findFirst({ where: { id, deletedAt: null } });
    if (!found) throw new NotFoundException(`Rack #${id} not found`);
    return found;
  }

  async update(id: number, dto: UpdateRackDto) {
    const current = await this.findOne(id);
    if (dto.zoneId) await this.assertZoneExists(dto.zoneId);
    if (dto.code) {
      await this.assertCodeIsFree(dto.zoneId ?? current.zoneId, dto.code, id);
    }
    return this.prisma.rack.update({ where: { id }, data: dto });
  }

  async remove(id: number, updatedBy?: number) {
    await this.findOne(id);
    return this.prisma.rack.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy },
    });
  }

  private async assertZoneExists(zoneId: number) {
    const zone = await this.prisma.zone.findFirst({ where: { id: zoneId, deletedAt: null } });
    if (!zone) throw new BadRequestException(`Zone #${zoneId} khong ton tai`);
  }

  private async assertCodeIsFree(zoneId: number, code: string, excludeId?: number) {
    const existing = await this.prisma.rack.findFirst({
      where: { zoneId, code, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (existing) throw new ConflictException(`Ma ke '${code}' da ton tai trong khu vuc nay`);
  }
}
