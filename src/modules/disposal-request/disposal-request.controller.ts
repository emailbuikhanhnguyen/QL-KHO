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
import { DisposalRequestService } from './disposal-request.service';
import { CreateDisposalRequestDto } from './dto/create-disposal-request.dto';
import { UpdateDisposalRequestDto } from './dto/update-disposal-request.dto';
import { RejectDisposalRequestDto } from './dto/reject-disposal-request.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// Module: Xu ly hang loi — Phieu huy vat tu. Duyet 2 cap: QA (QC_MANAGER)
// roi BOD, theo xac nhan cua Sep Thanh (cau 20-21 phan hoi v2).
@ApiTags('Xu ly hang loi (Phieu huy vat tu)')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('disposal-requests')
export class DisposalRequestController {
  constructor(private readonly service: DisposalRequestService) {}

  @Post()
  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF, Role.QC_MANAGER)
  create(@Body() dto: CreateDisposalRequestDto, @CurrentUser() user: any) {
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
  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF, Role.QC_MANAGER)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDisposalRequestDto, @CurrentUser() user: any) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF, Role.QC_MANAGER)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.remove(id, user);
  }

  @Post(':id/submit')
  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF, Role.QC_MANAGER)
  submit(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.submit(id, user);
  }

  @Post(':id/approve-qa')
  @Roles(Role.ADMIN, Role.QC_MANAGER)
  approveQa(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.approveQa(id, user);
  }

  @Post(':id/approve-bod')
  @Roles(Role.ADMIN, Role.BOD)
  approveBod(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.approveBod(id, user);
  }

  @Post(':id/reject')
  @Roles(Role.ADMIN, Role.QC_MANAGER, Role.BOD)
  reject(@Param('id', ParseIntPipe) id: number, @Body() dto: RejectDisposalRequestDto, @CurrentUser() user: any) {
    return this.service.reject(id, dto, user);
  }
}
