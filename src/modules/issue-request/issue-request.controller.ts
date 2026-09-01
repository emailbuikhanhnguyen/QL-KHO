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
import { IssueRequestStatus } from '@prisma/client';
import { IssueRequestService } from './issue-request.service';
import { CreateIssueRequestDto } from './dto/create-issue-request.dto';
import { UpdateIssueRequestDto } from './dto/update-issue-request.dto';
import { RejectIssueRequestDto } from './dto/reject-issue-request.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// Luu y: KHONG dung RolesGuard/@Roles o day (tru viec kiem tra rieng trong
// service) — vi bat ky role nao (REQUESTER, WAREHOUSE_STAFF, DEPT_HEAD,
// BOD, QC_MANAGER, ADMIN) deu co the can tao phieu xuat kho cho ban than.
// Quyen han thuc su (duyet cap nao, ai duoc xuat) duoc kiem tra chi tiet
// ben trong service (theo role + doi chieu voi phong ban/nguoi tao phieu).
@ApiTags('Xuat kho (duyet da cap)')
@ApiBearerAuth('access-token')
@Controller('issue-requests')
@UseGuards(JwtAuthGuard)
export class IssueRequestController {
  constructor(private readonly service: IssueRequestService) {}

  @Post()
  create(@Body() dto: CreateIssueRequestDto, @CurrentUser() user: any) {
    return this.service.create(dto, user);
  }

  @Get()
  findAll(
    @Query()
    query: PaginationQueryDto & {
      warehouseId?: number;
      status?: IssueRequestStatus;
      requesterId?: number;
    },
  ) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateIssueRequestDto,
    @CurrentUser() user: any,
  ) {
    return this.service.update(id, dto, user);
  }

  // Gui duyet: DRAFT -> PENDING_HEAD_APPROVAL
  @Post(':id/submit')
  submit(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.submit(id, user);
  }

  // Duyet cap 1 (Truong bo phan): PENDING_HEAD_APPROVAL -> PENDING_BOD_APPROVAL
  @Post(':id/approve-head')
  approveByHead(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.approveByHead(id, user);
  }

  // Duyet cap 2 (BOD): PENDING_BOD_APPROVAL -> APPROVED
  @Post(':id/approve-bod')
  approveByBod(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.approveByBod(id, user);
  }

  // Tu choi (o bat ky cap duyet nao dang cho)
  @Post(':id/reject')
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectIssueRequestDto,
    @CurrentUser() user: any,
  ) {
    return this.service.reject(id, dto, user);
  }

  // Mo lai phieu bi tu choi: REJECTED -> DRAFT
  @Post(':id/reopen')
  reopen(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.reopen(id, user);
  }

  // Thuc xuat: APPROVED -> ISSUED (tu dong phan bo FEFO, tru ton kho)
  @Post(':id/issue')
  issue(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.issue(id, user);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.remove(id, user);
  }
}
