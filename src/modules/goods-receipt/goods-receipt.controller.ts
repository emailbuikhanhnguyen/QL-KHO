import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
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
import { GoodsReceiptStatus, Role } from '@prisma/client';
import { GoodsReceiptService } from './goods-receipt.service';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { UpdateGoodsReceiptDto } from './dto/update-goods-receipt.dto';
import { RejectGoodsReceiptDto } from './dto/reject-goods-receipt.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Nhap kho (Module 2)')
@ApiBearerAuth('access-token')
@Controller('goods-receipts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GoodsReceiptController {
  constructor(private readonly service: GoodsReceiptService) {}

  @Post()
  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF)
  create(@Body() dto: CreateGoodsReceiptDto, @CurrentUser() user: any) {
    return this.service.create(dto, user);
  }

  @Get()
  findAll(
    @Query()
    query: PaginationQueryDto & { warehouseId?: number; status?: GoodsReceiptStatus },
  ) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGoodsReceiptDto,
    @CurrentUser() user: any,
  ) {
    return this.service.update(id, dto, user);
  }

  // Gui phieu di duyet: DRAFT -> PENDING_APPROVAL
  @Post(':id/submit')
  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF)
  submit(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.submit(id, user);
  }

  // Duyet phieu: PENDING_APPROVAL -> CONFIRMED (tao Lot + cong ton kho)
  @Post(':id/approve')
  @Roles(Role.ADMIN, Role.DEPT_HEAD)
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.approve(id, user);
  }

  // Tu choi phieu: PENDING_APPROVAL -> REJECTED
  @Post(':id/reject')
  @Roles(Role.ADMIN, Role.DEPT_HEAD)
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectGoodsReceiptDto,
    @CurrentUser() user: any,
  ) {
    return this.service.reject(id, dto, user);
  }

  // Mo lai phieu bi tu choi de sua: REJECTED -> DRAFT
  @Post(':id/reopen')
  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF)
  reopen(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.reopen(id, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.remove(id, user);
  }
}
