import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateDepartmentDto) {
    await this.assertCodeIsFree(dto.code);
    return this.prisma.department.create({ data: dto });
  }

  async findAll() {
    return this.prisma.department.findMany({
      where: { deletedAt: null },
      orderBy: { id: 'asc' },
    });
  }

  async findOne(id: number) {
    const found = await this.prisma.department.findFirst({ where: { id, deletedAt: null } });
    if (!found) throw new NotFoundException(`Department #${id} not found`);
    return found;
  }

  async update(id: number, dto: UpdateDepartmentDto) {
    await this.findOne(id);
    if (dto.code) await this.assertCodeIsFree(dto.code, id);
    return this.prisma.department.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.department.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  private async assertCodeIsFree(code: string, excludeId?: number) {
    const existing = await this.prisma.department.findFirst({
      where: { code, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (existing) throw new ConflictException(`Ma phong ban '${code}' da ton tai`);
  }
}
