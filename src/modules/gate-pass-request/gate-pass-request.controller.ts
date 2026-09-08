import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { GatePassRequestService } from './gate-pass-request.service';
import { CreateGatePassRequestDto } from './dto/create-gate-pass-request.dto';
import { UpdateGatePassRequestDto } from './dto/update-gate-pass-request.dto';
import { RejectGatePassRequestDto } from './dto/reject-gate-pass-request.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// SEC ERP — Module Ra/vao cong ngoai gio. Duyet 2 cap: Quan ly truc tiep
// (DEPT_HEAD) roi HR (yeu cau goc ghi "HR/Admin/Bao ve" — tam dung HR).
@ApiTags('SEC ERP - Ra/vao cong')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('gate-pass-requests')
export class GatePassRequestController {
  constructor(private readonly service: GatePassRequestService) {}

  @Post()
  create(@Body() dto: CreateGatePassRequestDto, @CurrentUser() user: any) {
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
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateGatePassRequestDto, @CurrentUser() user: any) {
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

  @Post(':id/approve-hr')
  @Roles(Role.ADMIN, Role.HR)
  approveHr(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.approveHr(id, user);
  }

  @Post(':id/reject')
  @Roles(Role.ADMIN, Role.DEPT_HEAD, Role.HR)
  reject(@Param('id', ParseIntPipe) id: number, @Body() dto: RejectGatePassRequestDto, @CurrentUser() user: any) {
    return this.service.reject(id, dto, user);
  }
}
