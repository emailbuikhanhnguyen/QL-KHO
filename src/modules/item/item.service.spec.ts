import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ItemService } from './item.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ItemService', () => {
  let service: ItemService;
  let prisma: {
    item: Record<string, jest.Mock>;
    itemGroup: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };

  const baseItem = {
    id: 1,
    code: 'VT001',
    name: 'Vai kaki',
    unit: 'met',
    itemGroupId: 1,
    minStock: 10,
    maxStock: 100,
    isActive: true,
    deletedAt: null,
  };

  beforeEach(async () => {
    prisma = {
      item: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      itemGroup: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ItemService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<ItemService>(ItemService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('tao item thanh cong khi du lieu hop le', async () => {
      prisma.itemGroup.findFirst.mockResolvedValue({ id: 1 });
      prisma.item.findFirst.mockResolvedValue(null); // code chua ton tai
      prisma.item.create.mockResolvedValue(baseItem);

      const dto = {
        code: 'VT001',
        name: 'Vai kaki',
        unit: 'met',
        itemGroupId: 1,
        minStock: 10,
        maxStock: 100,
      };

      const result = await service.create(dto as any);
      expect(result).toEqual(baseItem);
      expect(prisma.item.create).toHaveBeenCalledWith({ data: dto });
    });

    it('nem BadRequestException khi minStock > maxStock', async () => {
      const dto = {
        code: 'VT002',
        name: 'Vai kaki',
        unit: 'met',
        itemGroupId: 1,
        minStock: 200,
        maxStock: 100,
      };

      await expect(service.create(dto as any)).rejects.toThrow(BadRequestException);
      expect(prisma.item.create).not.toHaveBeenCalled();
    });

    it('nem BadRequestException khi itemGroupId khong ton tai', async () => {
      prisma.itemGroup.findFirst.mockResolvedValue(null);

      const dto = {
        code: 'VT003',
        name: 'Vai kaki',
        unit: 'met',
        itemGroupId: 999,
        minStock: 1,
        maxStock: 10,
      };

      await expect(service.create(dto as any)).rejects.toThrow(BadRequestException);
    });

    it('nem ConflictException khi ma vat tu da ton tai', async () => {
      prisma.itemGroup.findFirst.mockResolvedValue({ id: 1 });
      prisma.item.findFirst.mockResolvedValue(baseItem); // trung ma

      const dto = {
        code: 'VT001',
        name: 'Vai kaki',
        unit: 'met',
        itemGroupId: 1,
        minStock: 1,
        maxStock: 10,
      };

      await expect(service.create(dto as any)).rejects.toThrow(ConflictException);
    });
  });

  describe('findOne', () => {
    it('tra ve item khi ton tai va chua bi xoa mem', async () => {
      prisma.item.findFirst.mockResolvedValue(baseItem);
      const result = await service.findOne(1);
      expect(result).toEqual(baseItem);
      expect(prisma.item.findFirst).toHaveBeenCalledWith({
        where: { id: 1, deletedAt: null },
      });
    });

    it('nem NotFoundException khi khong tim thay', async () => {
      prisma.item.findFirst.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('phan trang dung theo page/limit va tra ve total', async () => {
      prisma.$transaction.mockResolvedValue([[baseItem], 1]);

      const result = await service.findAll({ page: 2, limit: 10 } as any);

      expect(result).toEqual({ data: [baseItem], total: 1, page: 2, limit: 10 });
    });
  });

  describe('remove', () => {
    it('soft delete: chi set deletedAt, khong xoa cung', async () => {
      prisma.item.findFirst.mockResolvedValue(baseItem);
      prisma.item.update.mockResolvedValue({ ...baseItem, deletedAt: new Date() });

      await service.remove(1, 42);

      expect(prisma.item.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { deletedAt: expect.any(Date), updatedBy: 42 },
      });
    });
  });
});
