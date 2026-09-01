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
import { Role, WarehouseTransferStatus } from '@prisma/client';
import { WarehouseTransferService } from './warehouse-transfer.service';
import { CreateWarehouseTransferDto } from './dto/create-warehouse-transfer.dto';
import { UpdateWarehouseTransferDto } from './dto/update-warehouse-transfer.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Dieu chuyen kho')
@ApiBearerAuth('access-token')
@Controller('warehouse-transfers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WarehouseTransferController {
  constructor(private readonly service: WarehouseTransferService) {}

  @Post()
  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF)
  create(@Body() dto: CreateWarehouseTransferDto, @CurrentUser() user: any) {
    return this.service.create(dto, user);
  }

  @Get()
  findAll(
    @Query()
    query: PaginationQueryDto & {
      sourceWarehouseId?: number;
      destWarehouseId?: number;
      status?: WarehouseTransferStatus;
    },
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
    @Body() dto: UpdateWarehouseTransferDto,
    @CurrentUser() user: any,
  ) {
    return this.service.update(id, dto, user);
  }

  // Kho nguon xac nhan xuat: DRAFT -> SHIPPED
  @Post(':id/ship')
  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF)
  ship(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.ship(id, user);
  }

  // Kho dich xac nhan nhan: SHIPPED -> RECEIVED
  @Post(':id/receive')
  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF)
  receive(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.receive(id, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.remove(id, user);
  }
}
