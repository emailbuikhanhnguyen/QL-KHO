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
import { ItemGroupService } from './item-group.service';
import { CreateItemGroupDto } from './dto/create-item-group.dto';
import { UpdateItemGroupDto } from './dto/update-item-group.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Danh muc - Nhom vat tu')
@ApiBearerAuth('access-token')
@Controller('item-groups')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ItemGroupController {
  constructor(private readonly service: ItemGroupService) {}

  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF)
  @Post()
  create(@Body() dto: CreateItemGroupDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF)
  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateItemGroupDto) {
    return this.service.update(id, dto);
  }

  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
