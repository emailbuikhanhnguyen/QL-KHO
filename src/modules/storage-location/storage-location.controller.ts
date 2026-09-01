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
import { StorageLocationService } from './storage-location.service';
import { CreateStorageLocationDto } from './dto/create-storage-location.dto';
import { UpdateStorageLocationDto } from './dto/update-storage-location.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Danh muc - Vi tri luu tru')
@ApiBearerAuth('access-token')
@Controller('storage-locations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StorageLocationController {
  constructor(private readonly service: StorageLocationService) {}

  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF)
  @Post()
  create(@Body() dto: CreateStorageLocationDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query() query: PaginationQueryDto & { rackId?: number }) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF)
  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStorageLocationDto) {
    return this.service.update(id, dto);
  }

  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
