import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PurchaseRequestService } from './purchase-request.service';
import { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';
import { UpdatePurchaseRequestDto } from './dto/update-purchase-request.dto';
import { ApproveManagerPurchaseRequestDto } from './dto/approve-manager-purchase-request.dto';
import { RejectPurchaseRequestDto } from './dto/reject-purchase-request.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// SEC ERP — Module Mua hang, Giai doan 2: "PR co gia". Chi tao tu 1 Yeu
// cau mua hang da duoc BOD duyet. Duyet 2 cap: Truong bo phan roi Ke toan
// (KHONG phai HR nhu 4 module truoc).
@ApiTags('SEC ERP - Mua hang (Giai doan 2: PR co gia)')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('purchase-requests')
export class PurchaseRequestController {
  constructor(private readonly service: PurchaseRequestService) {}

  @Post()
  @Roles(Role.ADMIN, Role.PURCHASER)
  create(@Body() dto: CreatePurchaseRequestDto, @CurrentUser() user: any) {
    return this.service.create(dto, user);
  }

  @Get()
  findAll(@Query() query: PaginationQueryDto & { status?: any }) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.PURCHASER)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePurchaseRequestDto, @CurrentUser() user: any) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.PURCHASER)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.remove(id, user);
  }

  @Post(':id/submit')
  @Roles(Role.ADMIN, Role.PURCHASER)
  submit(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.submit(id, user);
  }

  @Post(':id/cancel')
  @Roles(Role.ADMIN, Role.PURCHASER)
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.cancel(id, user);
  }

  @Post(':id/approve-manager')
  @Roles(Role.ADMIN, Role.DEPT_HEAD)
  approveManager(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveManagerPurchaseRequestDto,
    @CurrentUser() user: any,
  ) {
    return this.service.approveManager(id, dto, user);
  }

  @Post(':id/approve-accountant')
  @Roles(Role.ADMIN, Role.ACCOUNTANT)
  approveAccountant(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.approveAccountant(id, user);
  }

  @Post(':id/reject')
  @Roles(Role.ADMIN, Role.DEPT_HEAD, Role.ACCOUNTANT)
  reject(@Param('id', ParseIntPipe) id: number, @Body() dto: RejectPurchaseRequestDto, @CurrentUser() user: any) {
    return this.service.reject(id, dto, user);
  }
}
