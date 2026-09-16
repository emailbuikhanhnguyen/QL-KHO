import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SetReportsToDto } from './dto/set-reports-to.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser } from './decorators/current-user.decorator';

@ApiTags('Xac thuc (Auth)')
@ApiBearerAuth('access-token')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Da khoa: chi ADMIN da dang nhap moi tao duoc user moi.
  // Tai khoan ADMIN dau tien duoc tao san qua `npm run prisma:seed`
  // (seed ghi thang vao DB, khong di qua endpoint nay).
  @Post('register')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // Gioi han chong do mat khau (brute-force) — them 10/09/2026 sau dot ra
  // soat bao mat. Toi da 5 lan goi /login trong 1 phut tinh theo dia chi IP;
  // vuot qua se tra ve 429 Too Many Requests.
  //
  // Vi sao 5 lan/phut: du rong cho nguoi that go nham mat khau vai lan,
  // nhung du chat de viec do tu dien mat khau tro nen khong kha thi
  // (truoc day KHONG co gioi han nao — do duoc khong gioi han so lan).
  //
  // LUU Y: gioi han tinh theo IP. Neu ca cong ty di chung 1 duong mang ra
  // Internet (thuong gap), nhieu nguoi dang nhap cung luc co the dung han
  // chung. Neu thuc te gap tinh trang do, can nang so lan len hoac chuyen
  // sang gioi han theo email thay vi theo IP.
  @Post('login')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: any) {
    return user;
  }

  // Them 04/09/2026 (SEC ERP) — danh sach nhan vien de chon nhieu nguoi
  // tham gia Tang ca. Truyen ?departmentId= de loc rieng 1 phong ban.
  @Get('users')
  @UseGuards(JwtAuthGuard)
  findUsers(@Query('departmentId') departmentId?: string) {
    return this.authService.findUsers(departmentId ? Number(departmentId) : undefined);
  }

  // Them 14/09/2026 — Admin cau hinh "cap tren truc tiep" cho tung nhan
  // vien, phuc vu so do to chuc that ma Module Ho so dien tu can dung de
  // dung chuoi duyet N cap dong. Truyen reportsToId=null de xoa (dinh cao
  // nhat, khong bao cao ai).
  @Put('users/:id/reports-to')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  setReportsTo(@Param('id', ParseIntPipe) id: number, @Body() dto: SetReportsToDto) {
    return this.authService.setReportsTo(id, dto.reportsToId ?? null);
  }
}
