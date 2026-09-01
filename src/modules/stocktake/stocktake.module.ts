import { Module } from '@nestjs/common';
import { StocktakeService } from './stocktake.service';
import { StocktakeController } from './stocktake.controller';
import { StockLedgerModule } from '../stock-ledger/stock-ledger.module';

@Module({
  imports: [StockLedgerModule],
  controllers: [StocktakeController],
  providers: [StocktakeService],
  exports: [StocktakeService],
})
export class StocktakeModule {}
