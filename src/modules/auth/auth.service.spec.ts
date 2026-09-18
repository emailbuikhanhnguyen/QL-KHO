import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as ExcelJS from 'exceljs';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: Record<string, jest.Mock>;
    department: Record<string, jest.Mock>;
  };
  let jwtService: { signAsync: jest.Mock };

  const fakeDepartment = { id: 1, code: 'RM_WAREHOUSE', name: 'Kho NPL' };
  const fakeUser = {
    id: 1,
    email: 'a@congty.com',
    passwordHash: 'hashed-pw',
    fullName: 'Nguyen Van A',
    role: Role.WAREHOUSE_STAFF,
    departmentId: 1,
    isActive: true,
    department: fakeDepartment,
  };

  beforeEach(async () => {
    prisma = {
      user: { findFirst: jest.fn(), create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      department: { findFirst: jest.fn() },
    };
    jwtService = { signAsync: jest.fn().mockResolvedValue('fake.jwt.token') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('tao user moi thanh cong, tra ve khong co passwordHash', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.department.findFirst.mockResolvedValue(fakeDepartment);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-pw');
      prisma.user.create.mockResolvedValue(fakeUser);

      const result = await service.register({
        email: 'a@congty.com',
        password: 'Password123',
        fullName: 'Nguyen Van A',
        role: Role.WAREHOUSE_STAFF,
        departmentId: 1,
      });

      expect(result).not.toHaveProperty('passwordHash');
      expect(bcrypt.hash).toHaveBeenCalledWith('Password123', 10);
    });

    it('nem ConflictException khi email da ton tai', async () => {
      prisma.user.findFirst.mockResolvedValue(fakeUser);

      await expect(
        service.register({
          email: 'a@congty.com',
          password: 'Password123',
          fullName: 'Nguyen Van A',
          role: Role.WAREHOUSE_STAFF,
          departmentId: 1,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('nem BadRequestException khi departmentId khong ton tai', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.department.findFirst.mockResolvedValue(null);

      await expect(
        service.register({
          email: 'b@congty.com',
          password: 'Password123',
          fullName: 'Nguyen Van B',
          role: Role.WAREHOUSE_STAFF,
          departmentId: 999,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('login', () => {
    it('dang nhap thanh cong, tra ve accessToken va user (khong co passwordHash)', async () => {
      prisma.user.findFirst.mockResolvedValue(fakeUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({ email: 'a@congty.com', password: 'Password123' });

      expect(result.accessToken).toBe('fake.jwt.token');
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ sub: fakeUser.id, role: fakeUser.role }),
      );
    });

    it('nem UnauthorizedException khi email khong ton tai', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.login({ email: 'khong-ton-tai@congty.com', password: 'x' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('nem UnauthorizedException khi sai mat khau', async () => {
      prisma.user.findFirst.mockResolvedValue(fakeUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: 'a@congty.com', password: 'sai-mat-khau' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('nem UnauthorizedException khi tai khoan bi khoa (isActive = false)', async () => {
      prisma.user.findFirst.mockResolvedValue({ ...fakeUser, isActive: false });

      await expect(
        service.login({ email: 'a@congty.com', password: 'Password123' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('bulkImportUsers — import hang loat tu file Excel (co Ma nhan vien)', () => {
    // Tao 1 file Excel THAT (dung dung thu vien exceljs, khong mock) —
    // chi mock tang Prisma. THU TU COT MOI (18/09/2026): Ma nhan vien,
    // Email (tuy chon), Ho ten, Vai tro, Ma phong ban, Email cap tren.
    async function buildExcelBuffer(rows: string[][]): Promise<Buffer> {
      const wb = new ExcelJS.Workbook();
      const sheet = wb.addWorksheet('Sheet1');
      sheet.addRow(['Ma NV', 'Email', 'Ho ten', 'Vai tro', 'Ma phong ban', 'Email cap tren']); // dong tieu de
      for (const r of rows) sheet.addRow(r);
      return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
    }

    beforeEach(() => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-pw');
      prisma.department.findFirst.mockResolvedValue(fakeDepartment);
    });

    it('tao thanh cong nhieu dong hop le, tra ve dung tempPassword cho moi dong', async () => {
      prisma.user.findFirst.mockResolvedValue(null); // khong co ma NV/email nao trung
      let nextId = 10;
      prisma.user.create.mockImplementation((args: any) => Promise.resolve({ id: nextId++, ...args.data }));

      const buffer = await buildExcelBuffer([
        ['SI001', 'nv1@sec.com', 'Nguyen Van 1', 'REQUESTER', '1', ''],
        ['SI002', 'nv2@sec.com', 'Nguyen Van 2', 'REQUESTER', '1', ''],
      ]);

      const result = await service.bulkImportUsers(buffer);

      expect(result.totalRows).toBe(2);
      expect(result.successCount).toBe(2);
      expect(result.errorCount).toBe(0);
      expect(result.results[0].tempPassword).toBeDefined();
      expect(result.results[0].tempPassword).not.toBe(result.results[1].tempPassword); // moi nguoi 1 mat khau khac nhau
    });

    it('TU SINH email tu Ma nhan vien khi cot Email de trong (khop file nhan su that, khong co Email)', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockImplementation((args: any) => Promise.resolve({ id: 15, ...args.data }));

      const buffer = await buildExcelBuffer([['SI24000004', '', 'Le Nhat Thanh', 'BOD', '1', '']]);
      const result = await service.bulkImportUsers(buffer);

      expect(result.results[0].success).toBe(true);
      expect(result.results[0].email).toBe('si24000004@sec.com');
      const createArg = prisma.user.create.mock.calls[0][0];
      expect(createArg.data.employeeCode).toBe('SI24000004');
    });

    it('1 dong loi (Ma nhan vien da ton tai) KHONG lam dung toan bo — dong con lai van thanh cong', async () => {
      prisma.user.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(where.employeeCode === 'SI_TRUNG' ? { id: 999 } : null),
      );
      prisma.user.create.mockImplementation((args: any) => Promise.resolve({ id: 20, ...args.data }));

      const buffer = await buildExcelBuffer([
        ['SI_TRUNG', 'trung@sec.com', 'Nguoi Trung', 'REQUESTER', '1', ''],
        ['SI_MOI', 'moi@sec.com', 'Nguoi Moi', 'REQUESTER', '1', ''],
      ]);

      const result = await service.bulkImportUsers(buffer);

      expect(result.successCount).toBe(1);
      expect(result.errorCount).toBe(1);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toContain('da ton tai');
      expect(result.results[1].success).toBe(true);
    });

    it('bao loi ro rang khi Vai tro khong hop le', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      const buffer = await buildExcelBuffer([['SI001', 'a@sec.com', 'A', 'VAI_TRO_BAY_DAT', '1', '']]);
      const result = await service.bulkImportUsers(buffer);

      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toContain('khong hop le');
    });

    it('bao loi ro rang khi thieu Ma nhan vien (bat buoc, khac ban truoc)', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      const buffer = await buildExcelBuffer([['', 'a@sec.com', 'A', 'REQUESTER', '1', '']]);
      const result = await service.bulkImportUsers(buffer);

      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toContain('Thieu thong tin bat buoc');
    });

    it('gan dung reportsToId khi "Email cap tren" la nguoi MOI tao trong CUNG file (khong phu thuoc thu tu dong)', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      let nextId = 30;
      prisma.user.create.mockImplementation((args: any) => Promise.resolve({ id: nextId++, ...args.data }));
      prisma.user.findUnique.mockResolvedValue({ reportsToId: null }); // dung cho kiem tra vong lap trong setReportsTo
      prisma.user.update.mockImplementation((args: any) => Promise.resolve({ id: args.where.id, ...args.data }));

      // Dong 1: nhan vien, cap tren la "head@sec.com" — NGUOI NAY nam O
      // DONG SAU trong file (chua ton tai luc xu ly dong 1 o luot 1).
      const buffer = await buildExcelBuffer([
        ['SI_NV', 'nv@sec.com', 'Nhan Vien', 'REQUESTER', '1', 'head@sec.com'],
        ['SI_HEAD', 'head@sec.com', 'Truong Bo Phan', 'DEPT_HEAD', '1', ''],
      ]);

      const result = await service.bulkImportUsers(buffer);

      expect(result.successCount).toBe(2);
      // setReportsTo goi toi user.update — xac nhan DA gan dung cap tren
      // cho nhan vien (id=30) toi truong bo phan (id=31).
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 30 }, data: { reportsToId: 31 } }),
      );
    });

    it('van tao duoc tai khoan neu "Email cap tren" khong ton tai — chi bao loi rieng phan gan cap tren', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockImplementation((args: any) => Promise.resolve({ id: 40, ...args.data }));

      const buffer = await buildExcelBuffer([['SI_NV', 'nv@sec.com', 'A', 'REQUESTER', '1', 'khong-ton-tai@sec.com']]);
      const result = await service.bulkImportUsers(buffer);

      expect(result.results[0].success).toBe(true); // tai khoan VAN duoc tao
      expect(result.results[0].error).toContain('KHONG tim thay cap tren');
    });

    it('bo qua dong trong hoan toan, khong tinh la loi', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 50 });

      const buffer = await buildExcelBuffer([
        ['SI001', 'a@sec.com', 'A', 'REQUESTER', '1', ''],
        ['', '', '', '', '', ''], // dong trong — vi du do thao tac excel de lai
      ]);
      const result = await service.bulkImportUsers(buffer);

      expect(result.totalRows).toBe(1); // dong trong KHONG duoc tinh
    });
  });
});
