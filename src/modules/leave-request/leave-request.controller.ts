import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { LeaveRequestService } from './leave-request.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { UpdateLeaveRequestDto } from './dto/update-leave-request.dto';
import { RejectLeaveRequestDto } from './dto/reject-leave-request.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// SEC ERP — Module Nghi phep (module dau tien cua he ERP moi, mo rong tu
// Kho NPL). Duyet 2 cap: Quan ly truc tiep (DEPT_HEAD) roi HR.
// KHONG dat @Roles(...) o class-level — moi nhan vien (moi role) deu duoc
// tu tao don nghi phep cho chinh minh, khong gioi han theo vai tro kho.
@ApiTags('SEC ERP - Nghi phep')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('leave-requests')
export class LeaveRequestController {
  constructor(private readonly service: LeaveRequestService) {}

  @Post()
  create(@Body() dto: CreateLeaveRequestDto, @CurrentUser() user: any) {
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
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLeaveRequestDto, @CurrentUser() user: any) {
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
  reject(@Param('id', ParseIntPipe) id: number, @Body() dto: RejectLeaveRequestDto, @CurrentUser() user: any) {
    return this.service.reject(id, dto, user);
  }
}
