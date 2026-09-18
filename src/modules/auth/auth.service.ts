import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { BulkImportRowResult, BulkImportSummary } from './dto/bulk-import-result.dto';
import { Role } from '@prisma/client';

const SALT_ROUNDS = 10;
const VALID_ROLES = Object.values(Role);

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

  // ===========================================================================
  // IMPORT HANG LOAT tu file Excel — them 17/09/2026, dieu kien can truoc
  // khi mo rong cho cap quan ly (Sub-leader/Leader/Supervisor/Head
  // department) theo mốc 30/9 Sep Thanh dat ra. KHONG the tao tay tung
  // tai khoan cho vai chuc nguoi.
  //
  // Xu ly 2 LUOT de KHONG phu thuoc thu tu dong trong file:
  //   Luot 1: tao TAT CA user (chua gan reportsToId).
  //   Luot 2: gan reportsToId dua vao cot "Email cap tren" — luc nay moi
  //   nguoi da ton tai (bat ke thu tu xuat hien trong file), tai dung
  //   DUNG ham setReportsTo() da co (da kiem tra vong lap tu truoc).
  //
  // 1 dong loi KHONG lam dung toan bo — ghi nhan loi roi tiep tuc dong
  // sau, tra ve bao cao day du cuoi cung.
  // ===========================================================================
  async bulkImportUsers(fileBuffer: Buffer): Promise<BulkImportSummary> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as any);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException('File Excel khong co sheet nao.');
    }

    const results: BulkImportRowResult[] = [];
    // Luu tam de dung o LUOT 2 — map tu email (viet thuong) sang id user
    // VUA tao trong lan import nay (khong query lai DB nhieu lan).
    const createdUserIds = new Map<string, number>();
    // Email cap tren khai bao cho tung dong — de xu ly o LUOT 2.
    const pendingReportsTo: { email: string; managerEmail: string; rowNum: number }[] = [];

    // ---------- LUOT 1: tao user ----------
    for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
      const row = sheet.getRow(rowNum);
      const email = String(row.getCell(1).text || '').trim().toLowerCase();
      const fullName = String(row.getCell(2).text || '').trim();
      const roleRaw = String(row.getCell(3).text || '').trim().toUpperCase();
      const departmentIdRaw = String(row.getCell(4).text || '').trim();
      const managerEmail = String(row.getCell(5).text || '').trim().toLowerCase();

      // Dong trong hoan toan (het du lieu) — bo qua, khong tinh la loi.
      if (!email && !fullName && !roleRaw && !departmentIdRaw) continue;

      try {
        if (!email || !fullName || !roleRaw || !departmentIdRaw) {
          throw new Error('Thieu thong tin bat buoc (Email/Ho ten/Vai tro/Ma phong ban).');
        }
        if (!(VALID_ROLES as string[]).includes(roleRaw)) {
          throw new Error(`Vai tro "${roleRaw}" khong hop le. Cac vai tro hop le: ${VALID_ROLES.join(', ')}.`);
        }
        const departmentId = Number(departmentIdRaw);
        if (!Number.isInteger(departmentId)) {
          throw new Error(`Ma phong ban "${departmentIdRaw}" khong phai so nguyen.`);
        }

        const existing = await this.prisma.user.findFirst({ where: { email, deletedAt: null } });
        if (existing) {
          throw new Error(`Email da ton tai trong he thong (id=${existing.id}) — KHONG tao lai, cung KHONG cap nhat.`);
        }
        const department = await this.prisma.department.findFirst({ where: { id: departmentId, deletedAt: null } });
        if (!department) {
          throw new Error(`Phong ban #${departmentId} khong ton tai.`);
        }

        // Sinh mat khau tam ngau nhien — KHONG dat 1 mat khau chung cho
        // moi nguoi (ai cung doan duoc thi mat het y nghia bao mat).
        const tempPassword = this.generateTempPassword();
        const passwordHash = await bcrypt.hash(tempPassword, SALT_ROUNDS);

        const user = await this.prisma.user.create({
          data: { email, passwordHash, fullName, role: roleRaw as Role, departmentId },
        });

        createdUserIds.set(email, user.id);
        if (managerEmail) {
          pendingReportsTo.push({ email, managerEmail, rowNum });
        }

        results.push({ row: rowNum, email, success: true, tempPassword });
      } catch (err: any) {
        results.push({ row: rowNum, email: email || '(trong)', success: false, error: err.message });
      }
    }

    // ---------- LUOT 2: gan cap tren (Email cap tren) ----------
    for (const { email, managerEmail, rowNum } of pendingReportsTo) {
      const userId = createdUserIds.get(email);
      if (!userId) continue; // dong nay da loi o luot 1, khong co user de gan

      // Cap tren co the la nguoi MOI tao trong CHINH file nay, hoac da
      // ton tai TU TRUOC trong he thong — kiem tra ca 2 nguon.
      const managerId = createdUserIds.get(managerEmail) ?? (await this.prisma.user.findFirst({ where: { email: managerEmail, deletedAt: null } }))?.id;

      if (!managerId) {
        // Sua lai ket qua dong nay: user VAN duoc tao thanh cong, nhung
        // ghi ro KHONG gan duoc cap tren, de Admin tu xu ly sau.
        const r = results.find((x) => x.row === rowNum);
        if (r) r.error = `Da tao tai khoan, nhung KHONG tim thay cap tren "${managerEmail}" (chua ton tai va khong co trong file).`;
        continue;
      }

      try {
        await this.setReportsTo(userId, managerId);
      } catch (err: any) {
        const r = results.find((x) => x.row === rowNum);
        if (r) r.error = `Da tao tai khoan, nhung gan cap tren loi: ${err.message}`;
      }
    }

    return {
      totalRows: results.length,
      successCount: results.filter((r) => r.success).length,
      errorCount: results.filter((r) => !r.success).length,
      results,
    };
  }

  private generateTempPassword(): string {
    // 10 ky tu, du manh cho mat khau tam (nguoi dung nen doi ngay lan
    // dau dang nhap — xem ghi chu trong README ve gioi han hien tai).
    return crypto.randomBytes(8).toString('base64').replace(/[+/=]/g, '').slice(0, 10) + '@1';
  }
}
