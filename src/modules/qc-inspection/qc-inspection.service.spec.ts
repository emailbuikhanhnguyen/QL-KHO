import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { QcInspectionStatus, QcStatus, Role } from '@prisma/client';
import { QcInspectionService } from './qc-inspection.service';
import { PrismaService } from '../../prisma/prisma.service';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  unlink: jest.fn((_path: string, cb: () => void) => cb()),
}));

describe('QcInspectionService', () => {
  let service: QcInspectionService;
  let prisma: any;

  const warehouseStaff = { id: 100, role: Role.WAREHOUSE_STAFF, departmentId: 1 };
  const qcManager = { id: 200, role: Role.QC_MANAGER, departmentId: 1 };

  const lotPending = { id: 1, qcStatus: QcStatus.PENDING, deletedAt: null };

  const draftInspectionNoImage = {
    id: 1,
    lotId: 1,
    status: QcInspectionStatus.DRAFT,
    result: null,
    images: [],
    deletedAt: null,
  };

  const draftInspectionReady = {
    ...draftInspectionNoImage,
    result: QcStatus.PASSED,
    images: [{ id: 10, filePath: '/tmp/fake.jpg' }],
  };

  beforeEach(async () => {
    prisma = {
      qcInspection: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      qcInspectionImage: { create: jest.fn(), delete: jest.fn(), findFirst: jest.fn() },
      lot: { findFirst: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(async (arg: any) => {
        if (Array.isArray(arg)) return Promise.all(arg);
        return arg(prisma);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [QcInspectionService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<QcInspectionService>(QcInspectionService);
    jest.clearAllMocks();
    prisma.$transaction = jest.fn(async (arg: any) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      return arg(prisma);
    });
  });

  describe('create', () => {
    it('tao phieu DRAFT thanh cong, tu chuyen Lot sang IN_PROGRESS neu dang PENDING', async () => {
      prisma.lot.findFirst.mockResolvedValue(lotPending);
      prisma.qcInspection.create.mockResolvedValue(draftInspectionNoImage);
      prisma.lot.update.mockResolvedValue({});

      await service.create({ lotId: 1 } as any, warehouseStaff);

      expect(prisma.lot.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { qcStatus: QcStatus.IN_PROGRESS },
      });
    });

    it('khong dong Lot sang IN_PROGRESS neu Lot da khong con PENDING', async () => {
      prisma.lot.findFirst.mockResolvedValue({ ...lotPending, qcStatus: QcStatus.IN_PROGRESS });
      prisma.qcInspection.create.mockResolvedValue(draftInspectionNoImage);

      await service.create({ lotId: 1 } as any, warehouseStaff);

      expect(prisma.lot.update).not.toHaveBeenCalled();
    });

    it('nem BadRequestException khi Lot khong ton tai', async () => {
      prisma.lot.findFirst.mockResolvedValue(null);

      await expect(service.create({ lotId: 999 } as any, warehouseStaff)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('nem BadRequestException khi truyen result khong hop le (VD: PENDING_DISPOSITION)', async () => {
      prisma.lot.findFirst.mockResolvedValue(lotPending);

      await expect(
        service.create(
          { lotId: 1, result: QcStatus.PENDING_DISPOSITION } as any,
          warehouseStaff,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('submit', () => {
    it('nem BadRequestException khi chua co ket qua', async () => {
      prisma.qcInspection.findFirst.mockResolvedValue({
        ...draftInspectionNoImage,
        images: [{ id: 10, filePath: '/tmp/fake.jpg' }], // co anh nhung chua co result
      });

      await expect(service.submit(1, warehouseStaff)).rejects.toThrow(BadRequestException);
    });

    it('nem BadRequestException khi chua co anh nao', async () => {
      prisma.qcInspection.findFirst.mockResolvedValue({
        ...draftInspectionNoImage,
        result: QcStatus.PASSED, // co result nhung chua co anh
        images: [],
      });

      await expect(service.submit(1, warehouseStaff)).rejects.toThrow(BadRequestException);
    });

    it('gui duyet thanh cong khi da co du ket qua va anh', async () => {
      prisma.qcInspection.findFirst.mockResolvedValue(draftInspectionReady);
      prisma.qcInspection.update.mockResolvedValue({
        ...draftInspectionReady,
        status: QcInspectionStatus.PENDING_APPROVAL,
      });

      const result = await service.submit(1, warehouseStaff);
      expect(result.status).toBe(QcInspectionStatus.PENDING_APPROVAL);
    });
  });

  describe('approve', () => {
    const pendingInspection = { ...draftInspectionReady, status: QcInspectionStatus.PENDING_APPROVAL };

    it('duyet thanh cong: cap nhat Lot.qcStatus theo dung result da duyet', async () => {
      prisma.qcInspection.findFirst.mockResolvedValue(pendingInspection);
      prisma.lot.update.mockResolvedValue({});
      prisma.qcInspection.update.mockResolvedValue({
        ...pendingInspection,
        status: QcInspectionStatus.APPROVED,
      });

      const result = await service.approve(1, qcManager);

      expect(prisma.lot.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { qcStatus: QcStatus.PASSED },
      });
      expect(result.status).toBe(QcInspectionStatus.APPROVED);
    });

    it('nem ForbiddenException khi WAREHOUSE_STAFF co gang duyet', async () => {
      prisma.qcInspection.findFirst.mockResolvedValue(pendingInspection);

      await expect(service.approve(1, warehouseStaff)).rejects.toThrow(ForbiddenException);
    });

    it('nem ConflictException khi phieu khong o PENDING_APPROVAL', async () => {
      prisma.qcInspection.findFirst.mockResolvedValue(draftInspectionReady); // van DRAFT

      await expect(service.approve(1, qcManager)).rejects.toThrow(ConflictException);
    });
  });

  describe('reject / reopen', () => {
    it('tu choi thanh cong kem ly do', async () => {
      const pending = { ...draftInspectionReady, status: QcInspectionStatus.PENDING_APPROVAL };
      prisma.qcInspection.findFirst.mockResolvedValue(pending);
      prisma.qcInspection.update.mockResolvedValue({
        ...pending,
        status: QcInspectionStatus.REJECTED,
        rejectedReason: 'Anh mo, chup lai',
      });

      const result = await service.reject(1, { reason: 'Anh mo, chup lai' }, qcManager);
      expect(result.status).toBe(QcInspectionStatus.REJECTED);
    });

    it('mo lai REJECTED -> DRAFT thanh cong', async () => {
      const rejected = {
        ...draftInspectionReady,
        status: QcInspectionStatus.REJECTED,
        rejectedReason: 'Anh mo',
      };
      prisma.qcInspection.findFirst.mockResolvedValue(rejected);
      prisma.qcInspection.update.mockResolvedValue({
        ...rejected,
        status: QcInspectionStatus.DRAFT,
        rejectedReason: null,
      });

      const result = await service.reopen(1, warehouseStaff);
      expect(result.status).toBe(QcInspectionStatus.DRAFT);
      expect(result.rejectedReason).toBeNull();
    });
  });

  describe('addImage / removeImage', () => {
    it('them anh thanh cong khi phieu con DRAFT', async () => {
      prisma.qcInspection.findFirst.mockResolvedValue(draftInspectionNoImage);
      prisma.qcInspectionImage.create.mockResolvedValue({ id: 1, filePath: '/tmp/a.jpg' });

      await service.addImage(
        1,
        { path: '/tmp/a.jpg', originalname: 'a.jpg' },
        warehouseStaff,
      );

      expect(prisma.qcInspectionImage.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ qcInspectionId: 1 }) }),
      );
    });

    it('nem ConflictException khi them anh vao phieu da APPROVED', async () => {
      prisma.qcInspection.findFirst.mockResolvedValue({
        ...draftInspectionReady,
        status: QcInspectionStatus.APPROVED,
      });

      await expect(
        service.addImage(1, { path: '/tmp/a.jpg', originalname: 'a.jpg' }, warehouseStaff),
      ).rejects.toThrow(ConflictException);
    });

    it('xoa anh thanh cong khi phieu con DRAFT', async () => {
      prisma.qcInspectionImage.findFirst.mockResolvedValue({
        id: 10,
        qcInspectionId: 1,
        filePath: '/tmp/fake.jpg',
      });
      prisma.qcInspection.findFirst.mockResolvedValue(draftInspectionReady);
      prisma.qcInspectionImage.delete.mockResolvedValue({});

      const result = await service.removeImage(10, warehouseStaff);
      expect(result).toEqual({ deleted: true });
    });
  });
});
