import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { StockMovementType } from '@prisma/client';
import { StockLedgerService } from './stock-ledger.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// Chi doc du lieu (khong sua/xoa gi), nen khong can RolesGuard — ai da
// dang nhap deu xem/xuat bao cao duoc.
@ApiTags('So cai ton kho & Bao cao')
@ApiBearerAuth('access-token')
@Controller('stock-ledger')
@UseGuards(JwtAuthGuard)
export class StockLedgerController {
  constructor(private readonly service: StockLedgerService) {}

  @Get('balance')
  getBalanceByItem(
    @Query('itemId') itemId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('includeZero') includeZero?: string,
  ) {
    return this.service.getBalanceByItem({
      itemId: itemId ? Number(itemId) : undefined,
      warehouseId: warehouseId ? Number(warehouseId) : undefined,
      includeZero: includeZero === 'true',
    });
  }

  @Get('balance-by-lot')
  getBalanceByLot(
    @Query('itemId') itemId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('lotId') lotId?: string,
    @Query('includeZero') includeZero?: string,
  ) {
    return this.service.getBalanceByLot({
      itemId: itemId ? Number(itemId) : undefined,
      warehouseId: warehouseId ? Number(warehouseId) : undefined,
      lotId: lotId ? Number(lotId) : undefined,
      includeZero: includeZero === 'true',
    });
  }

  @Get('transactions')
  getTransactions(
    @Query('itemId') itemId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('lotId') lotId?: string,
    @Query('movementType') movementType?: StockMovementType,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getTransactions({
      itemId: itemId ? Number(itemId) : undefined,
      warehouseId: warehouseId ? Number(warehouseId) : undefined,
      lotId: lotId ? Number(lotId) : undefined,
      movementType,
      fromDate,
      toDate,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('low-stock-alerts')
  getLowStockAlerts() {
    return this.service.getLowStockAlerts();
  }

  @Get('balance/export')
  async exportBalance(
    @Res() res: Response,
    @Query('itemId') itemId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('includeZero') includeZero?: string,
  ) {
    const buffer = await this.service.exportBalanceByItemToExcel({
      itemId: itemId ? Number(itemId) : undefined,
      warehouseId: warehouseId ? Number(warehouseId) : undefined,
      includeZero: includeZero === 'true',
    });

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="ton-kho-${Date.now()}.xlsx"`,
    });
    res.send(buffer);
  }

  @Get('transactions/export')
  async exportTransactions(
    @Res() res: Response,
    @Query('itemId') itemId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('lotId') lotId?: string,
    @Query('movementType') movementType?: StockMovementType,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const buffer = await this.service.exportTransactionsToExcel({
      itemId: itemId ? Number(itemId) : undefined,
      warehouseId: warehouseId ? Number(warehouseId) : undefined,
      lotId: lotId ? Number(lotId) : undefined,
      movementType,
      fromDate,
      toDate,
    });

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="lich-su-ton-kho-${Date.now()}.xlsx"`,
    });
    res.send(buffer);
  }
}
