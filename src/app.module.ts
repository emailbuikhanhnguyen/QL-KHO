import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { DepartmentModule } from './modules/department/department.module';
import { ItemGroupModule } from './modules/item-group/item-group.module';
import { ItemModule } from './modules/item/item.module';
import { SupplierModule } from './modules/supplier/supplier.module';
import { WarehouseModule } from './modules/warehouse/warehouse.module';
import { ZoneModule } from './modules/zone/zone.module';
import { RackModule } from './modules/rack/rack.module';
import { StorageLocationModule } from './modules/storage-location/storage-location.module';
import { LotModule } from './modules/lot/lot.module';
import { GoodsReceiptModule } from './modules/goods-receipt/goods-receipt.module';
import { QcInspectionModule } from './modules/qc-inspection/qc-inspection.module';
import { IssueRequestModule } from './modules/issue-request/issue-request.module';
import { WarehouseTransferModule } from './modules/warehouse-transfer/warehouse-transfer.module';
import { StockLedgerModule } from './modules/stock-ledger/stock-ledger.module';
import { StocktakeModule } from './modules/stocktake/stocktake.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Phuc vu giao dien web tinh (HTML/CSS/JS thuan) tu thu muc `web/` o
    // goc project. Loai tru duong dan /api/* de khong bi tranh chap voi
    // cac API controller — static file va API cung chung 1 server/1 port.
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'web'),
      exclude: ['/api*'],
    }),
    PrismaModule,
    AuthModule,
    DepartmentModule,
    ItemGroupModule,
    ItemModule,
    SupplierModule,
    WarehouseModule,
    ZoneModule,
    RackModule,
    StorageLocationModule,
    LotModule,
    GoodsReceiptModule,
    QcInspectionModule,
    IssueRequestModule,
    WarehouseTransferModule,
    StockLedgerModule,
    StocktakeModule,
  ],
})
export class AppModule {}
