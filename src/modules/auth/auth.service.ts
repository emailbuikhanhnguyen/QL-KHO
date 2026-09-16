import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const SALT_ROUNDS = 10;

export interface JwtPayload {
  sub: number; // userId
  email: string;
  role: string;
  departmentId: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
    });
    if (existing) throw new ConflictException(`Email '${dto.email}' da duoc dang ky`);

    const department = await this.prisma.department.findFirst({
      where: { id: dto.departmentId, deletedAt: null },
    });
    if (!department) throw new BadRequestException(`Department #${dto.departmentId} khong ton tai`);

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
        role: dto.role,
        departmentId: dto.departmentId,
      },
    });

    return this.sanitizeUser(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
      include: { department: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Email hoac mat khau khong dung');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Email hoac mat khau khong dung');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: this.sanitizeUser(user),
    };
  }

  async validateUserById(userId: number) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { department: true },
    });
    if (!user || !user.isActive) return null;
    return this.sanitizeUser(user);
  }

  private sanitizeUser(user: any) {
    const { passwordHash, ...safe } = user;
    return safe;
  }

  // Them 04/09/2026 (SEC ERP) — can danh sach nhan vien de chon nhieu
  // nguoi tham gia trong Module Tang ca. Khong tra ve passwordHash.
  async findUsers(departmentId?: number) {
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ...(departmentId ? { departmentId } : {}),
      },
      orderBy: { fullName: 'asc' },
    });
    return users.map((u) => this.sanitizeUser(u));
  }

  // Them 14/09/2026 — Admin cau hinh "cap tren truc tiep" cho tung nhan
  // vien, phuc vu SO DO TO CHUC THAT ma Module Ho so dien tu can dung.
  // Kiem tra vong lap NGAY LUC GAN (khong doi den luc Gui duyet moi phat
  // hien) — an toan hon, bao loi som cho Admin thay vi de nhan vien gap
  // loi luc dang can gui gap.
  async setReportsTo(userId: number, reportsToId: number | null) {
    if (userId === reportsToId) {
      throw new BadRequestException({ key: 'ORG_CHART_CYCLE_DETECTED' });
    }

    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new NotFoundException({ key: 'ENTITY_NOT_FOUND', params: { entity: 'User', id: userId } });

    if (reportsToId !== null) {
      const manager = await this.prisma.user.findUnique({ where: { id: reportsToId } });
      if (!manager) throw new NotFoundException({ key: 'ENTITY_NOT_FOUND', params: { entity: 'User', id: reportsToId } });

      // Di theo chuoi reportsToId cua "manager" duoc chi dinh — neu gap
      // lai userId ban dau, nghia la gan vao se tao vong lap (VD: A hien
      // dang bao cao cho B, gio lai gan B bao cao cho A).
      let currentId: number | null = reportsToId;
      const visited = new Set<number>([userId]);
      while (currentId !== null) {
        if (visited.has(currentId)) {
          throw new BadRequestException({ key: 'ORG_CHART_CYCLE_DETECTED' });
        }
        visited.add(currentId);
        const node = await this.prisma.user.findUnique({ where: { id: currentId }, select: { reportsToId: true } });
        currentId = node?.reportsToId ?? null;
      }
    }

    const updated = await this.prisma.user.update({ where: { id: userId }, data: { reportsToId } });
    return this.sanitizeUser(updated);
  }
}
