import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Controller, Get, Post, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { GuestRegistrationService } from './guest-registration.service';
import { CreateGuestRegistrationDto } from './dto/create-guest-registration.dto';
import { RejectGuestRegistrationDto } from './dto/reject-guest-registration.dto';
import { CheckInGuestDto } from './dto/check-in-guest.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// SEC ERP — Module Khach/NCC vao cong. Ap dung dung quy trinh giay hien
// tai: Nhan vien dang ky truoc -> Quan ly -> BOD duyet (2 cap co dinh,
// giong 6 module cu). Sau khi APPROVED, Bao ve dung dien thoai quet QR
// (endpoint check-in) de xac nhan — thay cho doi chieu CCCD + ky giay.
@ApiTags('SEC ERP - Khach/NCC vao cong')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('guest-registrations')
export class GuestRegistrationController {
  constructor(private readonly service: GuestRegistrationService) {}

  @Post()
  create(@Body() dto: CreateGuestRegistrationDto, @CurrentUser() user: any) {
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

  @Get(':id/qr-payload')
  getCheckInPayload(@Param('id', ParseIntPipe) id: number) {
    return this.service.getCheckInPayload(id);
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
  approveByManager(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.approveByManager(id, user);
  }

  @Post(':id/approve-bod')
  approveByBod(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.approveByBod(id, user);
  }

  @Post(':id/reject')
  reject(@Param('id', ParseIntPipe) id: number, @Body() dto: RejectGuestRegistrationDto, @CurrentUser() user: any) {
    return this.service.reject(id, dto, user);
  }

  // Bao ve quet QR xong, FE goi endpoint nay voi ma da doc duoc de xac nhan.
  @Post(':id/check-in')
  checkIn(@Param('id', ParseIntPipe) id: number, @Body() dto: CheckInGuestDto, @CurrentUser() user: any) {
    return this.service.checkIn(id, dto, user);
  }
}
