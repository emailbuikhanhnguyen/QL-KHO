import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { MyApprovalsService } from './my-approvals.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// SEC ERP — Hop thu gom chung "Viec can toi duyet" tu ca 6 module co
// luong duyet (Nghi phep / Tang ca / Ra-vao cong / Xe cong vu / Yeu cau
// mua hang / PR co gia). KHONG co endpoint duyet rieng o day — bam vao 1
// dong se dieu huong sang dung trang cua module do de duyet, tranh nhan
// ban logic duyet (da co day du trong tung module).
@ApiTags('SEC ERP - Viec can toi duyet')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('my-approvals')
export class MyApprovalsController {
  constructor(private readonly service: MyApprovalsService) {}

  @Get()
  getMyApprovals(@CurrentUser() user: any) {
    return this.service.getMyApprovals(user);
  }

  @Get('count')
  countMyApprovals(@CurrentUser() user: any) {
    return this.service.countMyApprovals(user);
  }
}
