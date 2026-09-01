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
import { Role } from '@prisma/client';
import { ItemService } from './item.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

// VI DU AP DUNG RBAC — dung lam mau de ap dung tuong tu cho cac controller
// con lai (ItemGroup, Supplier, Warehouse, Zone, Rack, StorageLocation, Lot).
//
// Quy uoc:
// - Moi endpoint deu yeu cau da dang nhap (JwtAuthGuard).
// - GET (xem danh muc): cho phep MOI role da dang nhap xem — khong @Roles()
//   nghia la khong gioi han thoi.
// - POST/PUT/DELETE (sua du lieu danh muc): chi ADMIN va WAREHOUSE_STAFF.
//   Sau nay neu can gioi han sau hon theo tung Department (vd: WAREHOUSE_STAFF
//   cua Color Kitchen khong duoc sua Item cua RM) thi se can them logic kiem
//   tra department ngay trong service, RolesGuard chi kiem tra o muc Role.
@ApiTags('Danh muc - Vat tu')
@ApiBearerAuth('access-token')
@Controller('items')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ItemController {
  constructor(private readonly service: ItemService) {}

  @Post()
  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF)
  create(@Body() dto: CreateItemDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query() query: PaginationQueryDto & { itemGroupId?: number; isActive?: string }) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateItemDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
