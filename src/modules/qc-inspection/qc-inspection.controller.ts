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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as fs from 'fs';
import { QcInspectionStatus, Role } from '@prisma/client';
import { QcInspectionService } from './qc-inspection.service';
import { CreateQcInspectionDto } from './dto/create-qc-inspection.dto';
import { UpdateQcInspectionDto } from './dto/update-qc-inspection.dto';
import { RejectQcInspectionDto } from './dto/reject-qc-inspection.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { qcImageMulterOptions } from './qc-image-upload.config';

@ApiTags('QC - Kiem tra chat luong (Module 3)')
@ApiBearerAuth('access-token')
@Controller('qc-inspections')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QcInspectionController {
  constructor(private readonly service: QcInspectionService) {}

  @Post()
  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF, Role.QC_MANAGER)
  create(@Body() dto: CreateQcInspectionDto, @CurrentUser() user: any) {
    return this.service.create(dto, user);
  }

  @Get()
  findAll(
    @Query() query: PaginationQueryDto & { lotId?: number; status?: QcInspectionStatus },
  ) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF, Role.QC_MANAGER)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateQcInspectionDto,
    @CurrentUser() user: any,
  ) {
    return this.service.update(id, dto, user);
  }

  // Upload 1 anh cho phieu kiem — goi nhieu lan de upload nhieu anh.
  // multipart/form-data, field name = "file"
  @Post(':id/images')
  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF, Role.QC_MANAGER)
  @UseInterceptors(FileInterceptor('file', qcImageMulterOptions))
  addImage(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    if (!file) {
      throw new Error('Khong nhan duoc file. Kiem tra field name phai la "file".');
    }
    return this.service.addImage(id, file, user);
  }

  // Xem/tai anh da upload (tra ve raw bytes voi dung content-type)
  @Get('images/:imageId/file')
  async getImageFile(@Param('imageId', ParseIntPipe) imageId: number) {
    const image = await this.service.getImageById(imageId);
    const stream = fs.createReadStream(image.filePath);
    return new StreamableFile(stream);
  }

  @Delete('images/:imageId')
  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF, Role.QC_MANAGER)
  removeImage(@Param('imageId', ParseIntPipe) imageId: number, @CurrentUser() user: any) {
    return this.service.removeImage(imageId, user);
  }

  // Gui duyet: DRAFT -> PENDING_APPROVAL
  @Post(':id/submit')
  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF, Role.QC_MANAGER)
  submit(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.submit(id, user);
  }

  // Duyet: PENDING_APPROVAL -> APPROVED (cap nhat Lot.qcStatus that su)
  @Post(':id/approve')
  @Roles(Role.ADMIN, Role.QC_MANAGER)
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.approve(id, user);
  }

  // Tu choi: PENDING_APPROVAL -> REJECTED
  @Post(':id/reject')
  @Roles(Role.ADMIN, Role.QC_MANAGER)
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectQcInspectionDto,
    @CurrentUser() user: any,
  ) {
    return this.service.reject(id, dto, user);
  }

  // Mo lai phieu bi tu choi: REJECTED -> DRAFT
  @Post(':id/reopen')
  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF, Role.QC_MANAGER)
  reopen(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.reopen(id, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF, Role.QC_MANAGER)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.remove(id, user);
  }
}
