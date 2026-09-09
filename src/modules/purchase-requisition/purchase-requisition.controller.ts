import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PurchaseRequisitionService } from './purchase-requisition.service';
import { CreatePurchaseRequisitionDto } from './dto/create-purchase-requisition.dto';
import { RejectPurchaseRequisitionDto } from './dto/reject-purchase-requisition.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// SEC ERP — Module Mua hang, Giai doan 1: "Yeu cau mua hang" (khong gia).
// Duyet 2 cap: Truong bo phan (DEPT_HEAD) roi BOD.
@ApiTags('SEC ERP - Mua hang (Giai doan 1: Yeu cau)')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('purchase-requisitions')
export class PurchaseRequisitionController {
  constructor(private readonly service: PurchaseRequisitionService) {}

  @Post()
  create(@Body() dto: CreatePurchaseRequisitionDto, @CurrentUser() user: any) {
    return this.service.create(dto, user);
  }

  @Get()
  findAll(@Query() query: PaginationQueryDto & { status?: any; departmentId?: number }) {
    return this.service.findAll(query);
  }

  @Get('item-name-suggestions')
  getItemNameSuggestions() {
    return this.service.getItemNameSuggestions();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: CreatePurchaseRequisitionDto, @CurrentUser() user: any) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.remove(id, user);
  }

  @Post(':id/submit')
  submit(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.submit(id, user);
  }

  @Post(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.cancel(id, user);
  }

  @Post(':id/approve-manager')
  @Roles(Role.ADMIN, Role.DEPT_HEAD)
  approveManager(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.approveManager(id, user);
  }

  @Post(':id/approve-bod')
  @Roles(Role.ADMIN, Role.BOD)
  approveBod(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.approveBod(id, user);
  }

  @Post(':id/reject')
  @Roles(Role.ADMIN, Role.DEPT_HEAD, Role.BOD)
  reject(@Param('id', ParseIntPipe) id: number, @Body() dto: RejectPurchaseRequisitionDto, @CurrentUser() user: any) {
    return this.service.reject(id, dto, user);
  }
}
