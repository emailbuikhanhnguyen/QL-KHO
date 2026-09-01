import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { HealthCheckService } from './health-check.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('He thong - Health Check')
@ApiBearerAuth('access-token')
@Controller('health-check')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HealthCheckController {
  constructor(private readonly service: HealthCheckService) {}

  // Chi ADMIN goi duoc — dung boi script kiem tra tu dong (GitHub Actions),
  // dang nhap bang chinh tai khoan bot system.healthcheck@sec.com.
  @Get('activity-today')
  @Roles(Role.ADMIN)
  getActivityToday() {
    return this.service.getActivityToday();
  }
}
