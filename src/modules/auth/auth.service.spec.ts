import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
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
      user: { findFirst: jest.fn(), create: jest.fn() },
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
});
