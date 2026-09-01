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
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { QcStatus, Role } from '@prisma/client';
import { LotService } from './lot.service';
import { CreateLotDto } from './dto/create-lot.dto';
import { UpdateLotDto } from './dto/update-lot.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Danh muc - Lo hang')
@ApiBearerAuth('access-token')
@Controller('lots')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LotController {
  constructor(private readonly service: LotService) {}

  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF)
  @Post()
  create(@Body() dto: CreateLotDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(
    @Query()
    query: PaginationQueryDto & { itemId?: number; supplierId?: number; qcStatus?: QcStatus },
  ) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  // Anh QR ma hoa "KHO-LOT-{id}" — dung de in dan len hang vat ly, sau nay
  // quet bang dien thoai luc kiem ke de nhanh chong tim dung dong can dem.
  // Khong ma hoa URL day du vi dia chi truy cap app co the doi theo thoi
  // gian (ngrok -> domain that), trong khi tem da dan co the ton tai nhieu
  // thang — dung ID noi bo se khong bao gio bi "hong" du app doi dia chi.
  @Get(':id/qrcode')
  async getQrCode(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const buffer = await this.service.generateQrCodePng(id);
    res.set({
      'Content-Type': 'image/png',
      'Content-Disposition': `inline; filename="lot-${id}-qr.png"`,
    });
    res.send(buffer);
  }

  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF)
  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLotDto) {
    return this.service.update(id, dto);
  }

  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
