import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Role, StocktakeStatus } from '@prisma/client';
import { StocktakeService } from './stocktake.service';
import { StartStocktakeDto } from './dto/start-stocktake.dto';
import { UpdateCountDto } from './dto/update-count.dto';
import { ForceCompleteDto } from './dto/force-complete.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Kiem ke')
@ApiBearerAuth('access-token')
@Controller('stocktakes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StocktakeController {
  constructor(private readonly service: StocktakeService) {}

  @Post()
  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF)
  start(@Body() dto: StartStocktakeDto, @CurrentUser() user: any) {
    return this.service.start(dto, user);
  }

  @Get()
  findAll(@Query() query: PaginationQueryDto & { warehouseId?: number; status?: StocktakeStatus }) {
    return this.service.findAll(query);
  }

  // QUAN TRONG: khai bao TRUOC @Get(':id') — vi day la duong dan tinh
  // ("find-line-by-lot"), neu dat sau se bi ':id' "an mat" (Nest se thu
  // parse "find-line-by-lot" thanh so va bao loi 400).
  //
  // Dung cho luong quet QR: dien thoai quet duoc lotId, goi endpoint nay
  // de tim dung dong dang cho dem trong phien kiem ke dang mo cua kho do.
  @Get('find-line-by-lot')
  findActiveLineByLot(@Query('lotId', ParseIntPipe) lotId: number) {
    return this.service.findActiveLineByLot(lotId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Put(':id/lines/:lineId')
  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF)
  updateCount(
    @Param('id', ParseIntPipe) id: number,
    @Param('lineId', ParseIntPipe) lineId: number,
    @Body() dto: UpdateCountDto,
    @CurrentUser() user: any,
  ) {
    return this.service.updateCount(id, lineId, dto, user);
  }

  @Post(':id/complete')
  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF)
  complete(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.complete(id, user);
  }

  // Ghi de vuot dung sai — chi ADMIN, bat buoc co ly do
  @Post(':id/force-complete')
  @Roles(Role.ADMIN)
  forceComplete(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ForceCompleteDto,
    @CurrentUser() user: any,
  ) {
    return this.service.forceComplete(id, dto, user);
  }

  @Post(':id/cancel')
  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF)
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.cancel(id, user);
  }
}
