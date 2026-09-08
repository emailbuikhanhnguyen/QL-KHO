import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Controller, Get, Post, Delete, Body, Query, Param, UseGuards } from '@nestjs/common';
import { MealRegistrationService } from './meal-registration.service';
import { RegisterMealDto } from './dto/register-meal.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// SEC ERP — Module Bao com hang ngay. KHONG can duyet — tu dang ky, tu
// dieu chinh/huy truoc khi qua ngay. HR/Admin xem bao cao tong hop rieng.
@ApiTags('SEC ERP - Bao com')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('meal-registrations')
export class MealRegistrationController {
  constructor(private readonly service: MealRegistrationService) {}

  @Post()
  register(@Body() dto: RegisterMealDto, @CurrentUser() user: any) {
    return this.service.register(dto, user);
  }

  @Delete(':mealDate')
  cancel(@Param('mealDate') mealDate: string, @CurrentUser() user: any) {
    return this.service.cancel(mealDate, user);
  }

  @Get('mine')
  findMine(@Query('fromDate') fromDate: string, @Query('toDate') toDate: string, @CurrentUser() user: any) {
    return this.service.findMine(user, fromDate, toDate);
  }

  @Get('summary')
  getSummary(@Query('date') date: string, @CurrentUser() user: any) {
    return this.service.getSummary(date, user);
  }
}
