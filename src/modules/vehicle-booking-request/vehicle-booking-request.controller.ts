import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { VehicleBookingRequestService } from './vehicle-booking-request.service';
import { CreateVehicleBookingRequestDto } from './dto/create-vehicle-booking-request.dto';
import { UpdateVehicleBookingRequestDto } from './dto/update-vehicle-booking-request.dto';
import { RejectVehicleBookingRequestDto } from './dto/reject-vehicle-booking-request.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// SEC ERP — Module Xe cong vu. Duyet 2 cap: Quan ly truc tiep (DEPT_HEAD)
// roi ADMIN (dieu phoi xe) — KHAC 3 module truoc dung HR o cap cuoi, vi
// day la nghiep vu hanh chinh/co so vat chat, khong phai nhan su.
@ApiTags('SEC ERP - Xe cong vu')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('vehicle-booking-requests')
export class VehicleBookingRequestController {
  constructor(private readonly service: VehicleBookingRequestService) {}

  @Post()
  create(@Body() dto: CreateVehicleBookingRequestDto, @CurrentUser() user: any) {
    return this.service.create(dto, user);
  }

  @Get()
  findAll(@Query() query: PaginationQueryDto & { status?: any; departmentId?: number }) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateVehicleBookingRequestDto, @CurrentUser() user: any) {
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

  @Post(':id/approve-admin')
  @Roles(Role.ADMIN)
  approveAdmin(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.approveAdmin(id, user);
  }

  @Post(':id/reject')
  @Roles(Role.ADMIN, Role.DEPT_HEAD)
  reject(@Param('id', ParseIntPipe) id: number, @Body() dto: RejectVehicleBookingRequestDto, @CurrentUser() user: any) {
    return this.service.reject(id, dto, user);
  }
}
