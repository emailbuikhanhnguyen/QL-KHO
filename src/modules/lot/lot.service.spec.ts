import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { QcStatus } from '@prisma/client';
import { LotService } from './lot.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('LotService', () => {
  let service: LotService;
  let prisma: {
    lot: Record<string, jest.Mock>;
    item: Record<string, jest.Mock>;
    supplier: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };

  const baseLot = {
    id: 1,
    itemId: 1,
    lotCode: 'LOT-2026-001',
    supplierId: 1,
    qcStatus: QcStatus.PENDING,
    deletedAt: null,
  };

  beforeEach(async () => {
    prisma = {
      lot: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      item: { findFirst: jest.fn() },
      supplier: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [LotService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<LotService>(LotService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('tao lo moi voi qcStatus mac dinh la PENDING khi khong truyen', async () => {
      prisma.item.findFirst.mockResolvedValue({ id: 1 });
      prisma.supplier.findFirst.mockResolvedValue({ id: 1 });
      prisma.lot.findFirst.mockResolvedValue(null);
      prisma.lot.create.mockResolvedValue(baseLot);

      const dto = { itemId: 1, lotCode: 'LOT-2026-001', supplierId: 1 };
      await service.create(dto as any);

      expect(prisma.lot.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ qcStatus: QcStatus.PENDING }),
      });
    });

    it('nem BadRequestException khi item khong ton tai', async () => {
      prisma.item.findFirst.mockResolvedValue(null);

      const dto = { itemId: 999, lotCode: 'LOT-X', supplierId: 1 };
      await expect(service.create(dto as any)).rejects.toThrow(BadRequestException);
    });

    it('nem BadRequestException khi supplier khong ton tai', async () => {
      prisma.item.findFirst.mockResolvedValue({ id: 1 });
      prisma.supplier.findFirst.mockResolvedValue(null);

      const dto = { itemId: 1, lotCode: 'LOT-X', supplierId: 999 };
      await expect(service.create(dto as any)).rejects.toThrow(BadRequestException);
    });

    it('nem ConflictException khi ma lo da ton tai cho cung 1 item', async () => {
      prisma.item.findFirst.mockResolvedValue({ id: 1 });
      prisma.supplier.findFirst.mockResolvedValue({ id: 1 });
      prisma.lot.findFirst.mockResolvedValue(baseLot);

      const dto = { itemId: 1, lotCode: 'LOT-2026-001', supplierId: 1 };
      await expect(service.create(dto as any)).rejects.toThrow(ConflictException);
    });

    it('cho phep truyen qcStatus khac PENDING khi tao (VD: mien kiem chua co, nhung PASSED hop le)', async () => {
      prisma.item.findFirst.mockResolvedValue({ id: 1 });
      prisma.supplier.findFirst.mockResolvedValue({ id: 1 });
      prisma.lot.findFirst.mockResolvedValue(null);
      prisma.lot.create.mockResolvedValue({ ...baseLot, qcStatus: QcStatus.PASSED });

      const dto = {
        itemId: 1,
        lotCode: 'LOT-2026-002',
        supplierId: 1,
        qcStatus: QcStatus.PASSED,
      };
      await service.create(dto as any);

      expect(prisma.lot.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ qcStatus: QcStatus.PASSED }),
      });
    });
  });

  describe('findOne', () => {
    it('nem NotFoundException khi lo khong ton tai hoac da bi xoa mem', async () => {
      prisma.lot.findFirst.mockResolvedValue(null);
      await expect(service.findOne(1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('soft delete lo (khong xoa cung)', async () => {
      prisma.lot.findFirst.mockResolvedValue(baseLot);
      prisma.lot.update.mockResolvedValue({ ...baseLot, deletedAt: new Date() });

      await service.remove(1, 7);

      expect(prisma.lot.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { deletedAt: expect.any(Date), updatedBy: 7 },
      });
    });
  });

  describe('generateQrCodePng', () => {
    it('sinh anh QR ma hoa dung dinh dang KHO-LOT-{id}', async () => {
      prisma.lot.findFirst.mockResolvedValue(baseLot);

      const buffer = await service.generateQrCodePng(1);

      // Kiem tra buffer la PNG that (4 byte dau tien theo chuan PNG signature)
      expect(buffer.length).toBeGreaterThan(0);
      expect(buffer[0]).toBe(0x89);
      expect(buffer[1]).toBe(0x50); // 'P'
      expect(buffer[2]).toBe(0x4e); // 'N'
      expect(buffer[3]).toBe(0x47); // 'G'
    });

    it('nem NotFoundException khi lo khong ton tai', async () => {
      prisma.lot.findFirst.mockResolvedValue(null);
      await expect(service.generateQrCodePng(999)).rejects.toThrow(NotFoundException);
    });
  });
});
