import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Controller, Get, Post, Delete, Body, Param, Query, ParseIntPipe, UseGuards, UseInterceptors, UploadedFile, Res } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { ElectronicDocumentService } from './electronic-document.service';
import { documentUploadMulterOptions } from './document-upload.config';
import { CreateElectronicDocumentDto } from './dto/create-electronic-document.dto';
import { RejectElectronicDocumentDto } from './dto/reject-electronic-document.dto';
import { ApproveElectronicDocumentDto } from './dto/approve-electronic-document.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// SEC ERP — Module Ho so dien tu. KHAC HOAN TOAN 6 module cu: duyet theo
// so do to chuc THAT (N cap dong, di theo User.reportsToId), khong phai
// 2 cap co dinh. Xem ghi chu chi tiet trong electronic-document.service.ts.
@ApiTags('SEC ERP - Ho so dien tu')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('electronic-documents')
export class ElectronicDocumentController {
  constructor(private readonly service: ElectronicDocumentService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', documentUploadMulterOptions))
  create(@Body() dto: CreateElectronicDocumentDto, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: any) {
    return this.service.create(dto, file, user);
  }

  @Post(':id/new-version')
  @UseInterceptors(FileInterceptor('file', documentUploadMulterOptions))
  createNewVersion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateElectronicDocumentDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    return this.service.createNewVersion(id, dto, file, user);
  }

  @Get()
  findAll(@Query() query: PaginationQueryDto & { status?: any; departmentId?: number }) {
    return this.service.findAll(query);
  }

  @Get('category-suggestions')
  getCategorySuggestions() {
    return this.service.getCategorySuggestions();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  // Xem/tai file da upload (tra ve raw bytes, giong pattern QC anh)
  @Get(':id/file')
  async getFile(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const doc = await this.service.findOne(id);
    const filePath = path.join(process.cwd(), 'uploads', 'electronic-documents', doc.fileName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File khong ton tai tren dia' });
    }
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.originalFileName)}"`);
    return res.sendFile(filePath);
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

  @Post(':id/approve')
  approveStep(@Param('id', ParseIntPipe) id: number, @Body() dto: ApproveElectronicDocumentDto, @CurrentUser() user: any) {
    return this.service.approveStep(id, dto, user);
  }

  @Post(':id/reject')
  rejectStep(@Param('id', ParseIntPipe) id: number, @Body() dto: RejectElectronicDocumentDto, @CurrentUser() user: any) {
    return this.service.rejectStep(id, dto, user);
  }
}
