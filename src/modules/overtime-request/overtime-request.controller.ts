import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Controller, Get, Post, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { OvertimeRequestService } from './overtime-request.service';
import { CreateOvertimeRequestDto } from './dto/create-overtime-request.dto';
import { RejectOvertimeRequestDto } from './dto/reject-overtime-request.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// SEC ERP — Module Tang ca. Duyet 2 cap: Quan ly truc tiep (DEPT_HEAD) roi HR.
@ApiTags('SEC ERP - Tang ca')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('overtime-requests')
export class OvertimeRequestController {
  constructor(private readonly service: OvertimeRequestService) {}

  @Post()
  create(@Body() dto: CreateOvertimeRequestDto, @CurrentUser() user: any) {
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

  @Post(':id/approve-hr')
  @Roles(Role.ADMIN, Role.HR)
  approveHr(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.approveHr(id, user);
  }

  @Post(':id/reject')
  @Roles(Role.ADMIN, Role.DEPT_HEAD, Role.HR)
  reject(@Param('id', ParseIntPipe) id: number, @Body() dto: RejectOvertimeRequestDto, @CurrentUser() user: any) {
    return this.service.reject(id, dto, user);
  }
}
