import { Injectable } from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service';

export interface BalanceFilter {
  itemId?: number;
  warehouseId?: number;
  includeZero?: boolean;
}

export interface TransactionFilter {
  itemId?: number;
  warehouseId?: number;
  lotId?: number;
  movementType?: StockMovementType;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class StockLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------
  // TON KHO HIEN TAI — gop theo Item + Warehouse (khong phan biet lo)
  // Day la cach xem pho bien nhat: "Vai Kaki con bao nhieu met trong kho RM"
  // -------------------------------------------------------------------
  async getBalanceByItem(filter: BalanceFilter) {
    const where: Prisma.StockLedgerEntryWhereInput = {
      ...(filter.itemId ? { itemId: filter.itemId } : {}),
      ...(filter.warehouseId ? { warehouseId: filter.warehouseId } : {}),
    };

    const grouped = await this.prisma.stockLedgerEntry.groupBy({
      by: ['itemId', 'warehouseId'],
      where,
      _sum: { quantity: true },
    });

    const rows = grouped
      .map((g) => ({
        itemId: g.itemId,
        warehouseId: g.warehouseId,
        balance: this.toSafeNumber(g._sum.quantity),
      }))
      .filter((r) => filter.includeZero || r.balance > 0);

    return this.enrichBalanceRows(rows);
  }

  // -------------------------------------------------------------------
  // TON KHO THEO TUNG LO — chi tiet hon, dung khi can biet lo nao con bao
  // nhieu (vd: kiem tra truoc khi dieu chuyen mot lo cu the)
  // -------------------------------------------------------------------
  async getBalanceByLot(filter: BalanceFilter & { lotId?: number }) {
    const where: Prisma.StockLedgerEntryWhereInput = {
      ...(filter.itemId ? { itemId: filter.itemId } : {}),
      ...(filter.warehouseId ? { warehouseId: filter.warehouseId } : {}),
      ...(filter.lotId ? { lotId: filter.lotId } : {}),
    };

    const grouped = await this.prisma.stockLedgerEntry.groupBy({
      by: ['lotId', 'itemId', 'warehouseId'],
      where,
      _sum: { quantity: true },
    });

    const rows = grouped
      .map((g) => ({
        lotId: g.lotId,
        itemId: g.itemId,
        warehouseId: g.warehouseId,
        balance: this.toSafeNumber(g._sum.quantity),
      }))
      .filter((r) => filter.includeZero || r.balance > 0);

    return this.enrichBalanceRows(rows, true);
  }

  // -------------------------------------------------------------------
  // LICH SU BIEN DONG — xem tung giao dich (nhap/xuat/chuyen kho/dieu chinh)
  // -------------------------------------------------------------------
  async getTransactions(filter: TransactionFilter) {
    const page = filter.page && filter.page > 0 ? filter.page : 1;
    const limit = filter.limit && filter.limit > 0 ? Math.min(filter.limit, 200) : 50;

    const where: Prisma.StockLedgerEntryWhereInput = {
      ...(filter.itemId ? { itemId: filter.itemId } : {}),
      ...(filter.warehouseId ? { warehouseId: filter.warehouseId } : {}),
      ...(filter.lotId ? { lotId: filter.lotId } : {}),
      ...(filter.movementType ? { movementType: filter.movementType } : {}),
      ...(filter.fromDate || filter.toDate
        ? {
            createdAt: {
              ...(filter.fromDate ? { gte: new Date(filter.fromDate) } : {}),
              ...(filter.toDate ? { lte: new Date(filter.toDate) } : {}),
            },
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.stockLedgerEntry.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          item: true,
          warehouse: true,
          lot: true,
          storageLocation: true,
        },
      }),
      this.prisma.stockLedgerEntry.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  // -------------------------------------------------------------------
  // XUAT EXCEL
  // -------------------------------------------------------------------
  async exportBalanceByItemToExcel(filter: BalanceFilter): Promise<ExcelJS.Buffer> {
    const rows = await this.getBalanceByItem(filter);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'He thong Quan ly Kho NPL';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Ton kho hien tai');
    sheet.columns = [
      { header: 'Ma vat tu', key: 'itemCode', width: 16 },
      { header: 'Ten vat tu', key: 'itemName', width: 30 },
      { header: 'Kho', key: 'warehouseName', width: 26 },
      { header: 'Ton hien tai', key: 'balance', width: 16 },
      { header: 'Don vi', key: 'unit', width: 10 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E5F1' },
    };

    for (const r of rows) {
      sheet.addRow({
        itemCode: r.item?.code || '',
        itemName: r.item?.name || '',
        warehouseName: r.warehouse?.name || '',
        balance: r.balance,
        unit: r.item?.unit || '',
      });
    }

    return workbook.xlsx.writeBuffer();
  }

  async exportTransactionsToExcel(filter: TransactionFilter): Promise<ExcelJS.Buffer> {
    // Xuat toan bo giao dich khop dieu kien loc, khong phan trang (bao cao
    // can day du) — gioi han an toan toi da 10.000 dong de tranh qua tai.
    const { data } = await this.getTransactions({ ...filter, page: 1, limit: 10000 });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'He thong Quan ly Kho NPL';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Lich su bien dong');
    sheet.columns = [
      { header: 'Ngay', key: 'date', width: 18 },
      { header: 'Loai giao dich', key: 'movementType', width: 16 },
      { header: 'Ma vat tu', key: 'itemCode', width: 14 },
      { header: 'Ten vat tu', key: 'itemName', width: 26 },
      { header: 'Ma lo', key: 'lotCode', width: 16 },
      { header: 'Kho', key: 'warehouseName', width: 22 },
      { header: 'So luong', key: 'quantity', width: 14 },
      { header: 'Tham chieu', key: 'reference', width: 20 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E5F1' },
    };

    for (const entry of data) {
      sheet.addRow({
        date: entry.createdAt.toLocaleString('vi-VN'),
        movementType: entry.movementType,
        itemCode: (entry as any).item?.code || '',
        itemName: (entry as any).item?.name || '',
        lotCode: (entry as any).lot?.lotCode || '',
        warehouseName: (entry as any).warehouse?.name || '',
        quantity: this.toSafeNumber(entry.quantity),
        reference: `${entry.referenceType} #${entry.referenceId}`,
      });
    }

    return workbook.xlsx.writeBuffer();
  }

  // =====================================================================
  // Helpers
  // =====================================================================

  private async enrichBalanceRows(
    rows: { itemId: number; warehouseId: number; lotId?: number; balance: number }[],
    withLot = false,
  ) {
    const itemIds = [...new Set(rows.map((r) => r.itemId))];
    const warehouseIds = [...new Set(rows.map((r) => r.warehouseId))];
    const lotIds = withLot ? [...new Set(rows.map((r) => r.lotId!).filter(Boolean))] : [];

    const [items, warehouses, lots] = await Promise.all([
      this.prisma.item.findMany({ where: { id: { in: itemIds } } }),
      this.prisma.warehouse.findMany({ where: { id: { in: warehouseIds } } }),
      // Luon goi that (khong dung Promise.resolve([]) o nhanh else) — khi
      // lotIds rong, findMany voi `in: []` tu nhien tra ve [] dung kieu Lot[],
      // tranh TypeScript suy luan sai kieu du lieu do 2 nhanh Promise khac loai.
      this.prisma.lot.findMany({ where: { id: { in: lotIds } } }),
    ]);

    const itemMap = new Map(items.map((i) => [i.id, i]));
    const warehouseMap = new Map(warehouses.map((w) => [w.id, w]));
    const lotMap = new Map(lots.map((l) => [l.id, l]));

    // Luon tra ve cung 1 hinh dang object (lot luon co mat, chi la undefined
    // khi khong dung toi) — tranh TypeScript suy ra kieu union mo ho gay loi
    // bien dich strict null check o noi khac dung ham nay.
    return rows.map((r) => ({
      ...r,
      item: itemMap.get(r.itemId),
      warehouse: warehouseMap.get(r.warehouseId),
      lot: r.lotId !== undefined ? lotMap.get(r.lotId) : undefined,
    }));
  }

  private toSafeNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    return Number(String(value));
  }
}
