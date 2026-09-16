import { Injectable, BadRequestException, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../../common/notification/notification.service';
import { CreateElectronicDocumentDto } from './dto/create-electronic-document.dto';
import { RejectElectronicDocumentDto } from './dto/reject-electronic-document.dto';
import { ApproveElectronicDocumentDto } from './dto/approve-electronic-document.dto';
import { ElectronicDocumentStatus, ApprovalStepStatus, Prisma, Role } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { buildPagination } from '../../common/pagination.util';
import * as fs from 'fs';
import * as path from 'path';

export interface RequestUser {
  id: number;
  role: Role;
  departmentId: number;
}

// Gioi han an toan khi "di bo" theo chuoi reportsToId — tranh vong lap vo
// han neu du lieu to chuc bi cau hinh sai (VD: A bao cao B, B bao cao A).
// Sep noi thuc te "thuong chi can duyet 3 cap", nen 10 la du rong rai.
const MAX_APPROVAL_LEVELS = 10;

@Injectable()
export class ElectronicDocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notification: NotificationService,
  ) {}

  async create(dto: CreateElectronicDocumentDto, file: Express.Multer.File, currentUser: RequestUser) {
    if (!file) {
      throw new BadRequestException('Khong nhan duoc file. Kiem tra field name phai la "file".');
    }
    const code = await this.generateCode();

    return this.prisma.electronicDocument.create({
      data: {
        code,
        uploadedBy: currentUser.id,
        departmentId: currentUser.departmentId,
        title: dto.title,
        category: dto.category,
        fileName: file.filename,
        originalFileName: file.originalname,
        version: 1,
        status: ElectronicDocumentStatus.DRAFT,
        createdBy: currentUser.id,
      },
    });
  }

  // Tai len 1 phien ban MOI cho ho so DA duoc duyet — tao 1 ban ghi MOI
  // hoan toan (khong ghi de), lien ket nguoc toi ban cu qua previousVersionId
  // — dung theo dung yeu cau Sep: "co giu ban cu khi cap nhat".
  async createNewVersion(oldDocumentId: number, dto: CreateElectronicDocumentDto, file: Express.Multer.File, currentUser: RequestUser) {
    const oldDoc = await this.findOne(oldDocumentId);
    if (oldDoc.status !== ElectronicDocumentStatus.APPROVED) {
      throw new BadRequestException({ key: 'INVALID_STATUS_TRANSITION', params: { action: 'tao phien ban moi', status: oldDoc.status } });
    }
    if (!file) {
      throw new BadRequestException('Khong nhan duoc file. Kiem tra field name phai la "file".');
    }
    const code = await this.generateCode();

    return this.prisma.electronicDocument.create({
      data: {
        code,
        uploadedBy: currentUser.id,
        departmentId: oldDoc.departmentId,
        title: dto.title || oldDoc.title,
        category: dto.category ?? oldDoc.category,
        fileName: file.filename,
        originalFileName: file.originalname,
        version: oldDoc.version + 1,
        previousVersionId: oldDoc.id,
        status: ElectronicDocumentStatus.DRAFT,
        createdBy: currentUser.id,
      },
    });
  }

  async findAll(query: PaginationQueryDto & { status?: ElectronicDocumentStatus; departmentId?: number }) {
    const { skip, take, page, limit } = buildPagination(query.page, query.limit);
    const where: Prisma.ElectronicDocumentWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.electronicDocument.findMany({
        where,
        skip,
        take,
        orderBy: { id: 'desc' },
        include: { department: true, approvalSteps: { orderBy: { level: 'asc' } } },
      }),
      this.prisma.electronicDocument.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: number) {
    const found = await this.prisma.electronicDocument.findUnique({
      where: { id },
      include: { department: true, approvalSteps: { orderBy: { level: 'asc' } }, previousVersion: true, nextVersions: true },
    });
    if (!found) throw new NotFoundException({ key: 'ENTITY_NOT_FOUND', params: { entity: 'ElectronicDocument', id } });
    return this.attachUserNames(found);
  }

  // approverId/uploadedBy KHONG co quan he truc tiep toi User trong schema
  // (tranh lam roi User model voi qua nhieu quan he nguoc) — gan ten hien
  // thi bang 1 truy van gop rieng, khong can doi schema/migrate lai.
  private async attachUserNames(doc: any) {
    const ids = new Set<number>([doc.uploadedBy]);
    for (const step of doc.approvalSteps || []) ids.add(step.approverId);

    const users = await this.prisma.user.findMany({ where: { id: { in: Array.from(ids) } } });
    const nameById = new Map(users.map((u: any) => [u.id, u.fullName]));

    return {
      ...doc,
      uploadedByName: nameById.get(doc.uploadedBy) || null,
      approvalSteps: (doc.approvalSteps || []).map((s: any) => ({ ...s, approverName: nameById.get(s.approverId) || null })),
    };
  }

  // Goi y ten loai ho so da tung dung — giong co che cua Mua hang, giup
  // nguoi dung go nhanh ma khong bi ep vao 1 danh sach dinh san.
  async getCategorySuggestions(): Promise<string[]> {
    const docs = await this.prisma.electronicDocument.findMany({
      where: { category: { not: null } },
      select: { category: true },
      distinct: ['category'],
      take: 100,
    });
    return docs.map((d) => d.category).filter((c): c is string => !!c);
  }

  async remove(id: number, currentUser: RequestUser) {
    const doc = await this.findOne(id);
    this.assertStatus(doc, [ElectronicDocumentStatus.DRAFT], 'xoa');
    this.assertOwner(doc, currentUser);

    // Xoa file that tren dia cung, khong chi ban ghi database.
    const filePath = path.join(process.cwd(), 'uploads', 'electronic-documents', doc.fileName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    return this.prisma.electronicDocument.delete({ where: { id } });
  }

  // ===========================================================================
  // TRAI TIM cua module nay — dung chuoi duyet DONG bang cach "di bo" theo
  // User.reportsToId, KHAC HOAN TOAN 6 module cu (2 cap co dinh).
  // ===========================================================================
  async submit(id: number, currentUser: RequestUser) {
    const doc = await this.findOne(id);
    this.assertStatus(doc, [ElectronicDocumentStatus.DRAFT], 'gui duyet');
    this.assertOwner(doc, currentUser);

    const chain = await this.buildApprovalChain(currentUser.id);
    if (chain.length === 0) {
      throw new BadRequestException({ key: 'NO_APPROVER_CONFIGURED' });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.documentApprovalStep.createMany({
        data: chain.map((approverId, idx) => ({
          documentId: id,
          level: idx + 1,
          approverId,
          status: ApprovalStepStatus.PENDING,
        })),
      });
      await tx.electronicDocument.update({
        where: { id },
        data: { status: ElectronicDocumentStatus.PENDING_APPROVAL, submittedAt: new Date() },
      });
    });

    // Bao cho nguoi duyet DAU TIEN trong chuoi (cap gan nguoi tao nhat).
    const firstApproverEmail = await this.notification.getEmailByUserId(chain[0]);
    if (firstApproverEmail) {
      await this.notification.sendToEmails(
        [firstApproverEmail],
        `[SEC ERP] Hồ sơ ${doc.code} cần bạn duyệt`,
        `<p>Hồ sơ <b>${doc.code}</b> (${doc.title}) đang chờ bạn duyệt.</p>`,
      );
    }

    return this.findOne(id);
  }

  // Di theo User.reportsToId tu nguoi tao len dan, tra ve danh sach approverId
  // theo dung thu tu cap (level 1 = gan nguoi tao nhat). Phat hien vong lap
  // (du lieu to chuc bi loi) va dung lai o gioi han an toan.
  private async buildApprovalChain(starterId: number): Promise<number[]> {
    const chain: number[] = [];
    const visited = new Set<number>([starterId]);
    let currentId = starterId;

    for (let i = 0; i < MAX_APPROVAL_LEVELS; i++) {
      const user = await this.prisma.user.findUnique({ where: { id: currentId }, select: { reportsToId: true } });
      if (!user || !user.reportsToId) break; // toi dinh (VD Giam doc) — khong con cap tren
      if (visited.has(user.reportsToId)) {
        throw new BadRequestException({ key: 'ORG_CHART_CYCLE_DETECTED' });
      }
      visited.add(user.reportsToId);
      chain.push(user.reportsToId);
      currentId = user.reportsToId;
    }

    return chain;
  }

  async cancel(id: number, currentUser: RequestUser) {
    const doc = await this.findOne(id);
    this.assertStatus(doc, [ElectronicDocumentStatus.DRAFT, ElectronicDocumentStatus.PENDING_APPROVAL], 'huy');
    this.assertOwner(doc, currentUser);

    return this.prisma.electronicDocument.update({
      where: { id },
      data: { status: ElectronicDocumentStatus.CANCELLED, cancelledAt: new Date() },
    });
  }

  // Duyet dung buoc HIEN TAI (cap co status PENDING nho nhat). Neu day la
  // buoc CUOI CUNG trong chuoi -> ho so chuyen APPROVED. Neu con buoc sau
  // -> bao email cho nguoi duyet cap tiep theo.
  async approveStep(documentId: number, dto: ApproveElectronicDocumentDto, currentUser: RequestUser) {
    const doc = await this.findOne(documentId);
    this.assertStatus(doc, [ElectronicDocumentStatus.PENDING_APPROVAL], 'duyet');

    const currentStep = doc.approvalSteps.find((s) => s.status === ApprovalStepStatus.PENDING);
    if (!currentStep) {
      throw new ConflictException({ key: 'INVALID_STATUS_TRANSITION', params: { action: 'duyet', status: doc.status } });
    }
    if (currentUser.role !== Role.ADMIN && currentStep.approverId !== currentUser.id) {
      throw new ForbiddenException({ key: 'NOT_YOUR_APPROVAL_STEP' });
    }

    await this.prisma.documentApprovalStep.update({
      where: { id: currentStep.id },
      data: { status: ApprovalStepStatus.APPROVED, actedAt: new Date(), actedBy: currentUser.id, comment: dto.comment },
    });

    const remainingSteps = doc.approvalSteps.filter((s) => s.status === ApprovalStepStatus.PENDING && s.id !== currentStep.id);
    const nextStep = remainingSteps.sort((a, b) => a.level - b.level)[0];

    if (nextStep) {
      const nextEmail = await this.notification.getEmailByUserId(nextStep.approverId);
      if (nextEmail) {
        await this.notification.sendToEmails(
          [nextEmail],
          `[SEC ERP] Hồ sơ ${doc.code} cần bạn duyệt`,
          `<p>Hồ sơ <b>${doc.code}</b> (${doc.title}) đã qua cấp trước, đang chờ bạn duyệt.</p>`,
        );
      }
    } else {
      await this.prisma.electronicDocument.update({
        where: { id: documentId },
        data: { status: ElectronicDocumentStatus.APPROVED },
      });
      const uploaderEmail = await this.notification.getEmailByUserId(doc.uploadedBy);
      if (uploaderEmail) {
        await this.notification.sendToEmails(
          [uploaderEmail],
          `[SEC ERP] Hồ sơ ${doc.code} đã được duyệt xong`,
          `<p>Hồ sơ <b>${doc.code}</b> đã được duyệt qua toàn bộ ${doc.approvalSteps.length} cấp.</p>`,
        );
      }
    }

    return this.findOne(documentId);
  }

  // Tu choi o BAT KY cap nao lam DUNG dung phieu ngay lap tuc — cac cap
  // sau (chua duyet toi) chuyen SKIPPED, khong can xet nua.
  async rejectStep(documentId: number, dto: RejectElectronicDocumentDto, currentUser: RequestUser) {
    const doc = await this.findOne(documentId);
    this.assertStatus(doc, [ElectronicDocumentStatus.PENDING_APPROVAL], 'tu choi');

    const currentStep = doc.approvalSteps.find((s) => s.status === ApprovalStepStatus.PENDING);
    if (!currentStep) {
      throw new ConflictException({ key: 'INVALID_STATUS_TRANSITION', params: { action: 'tu choi', status: doc.status } });
    }
    if (currentUser.role !== Role.ADMIN && currentStep.approverId !== currentUser.id) {
      throw new ForbiddenException({ key: 'NOT_YOUR_APPROVAL_STEP' });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.documentApprovalStep.update({
        where: { id: currentStep.id },
        data: { status: ApprovalStepStatus.REJECTED, actedAt: new Date(), actedBy: currentUser.id, comment: dto.reason },
      });
      await tx.documentApprovalStep.updateMany({
        where: { documentId, status: ApprovalStepStatus.PENDING },
        data: { status: ApprovalStepStatus.SKIPPED },
      });
      await tx.electronicDocument.update({
        where: { id: documentId },
        data: { status: ElectronicDocumentStatus.REJECTED, rejectedBy: currentUser.id, rejectedAt: new Date(), rejectionReason: dto.reason },
      });
    });

    return this.findOne(documentId);
  }

  // Dung cho "Viec can toi duyet" — tra ve danh sach ho so ma currentUser
  // dang la nguoi duyet o buoc PENDING hien tai.
  async findPendingForUser(userId: number) {
    const pendingSteps = await this.prisma.documentApprovalStep.findMany({
      where: { approverId: userId, status: ApprovalStepStatus.PENDING },
      include: { document: { include: { department: true, approvalSteps: true } } },
    });
    // Chi tra ve neu day THUC SU la buoc dang cho hien tai (level nho nhat
    // con PENDING cua ho so do) — tranh truong hop hien nham buoc chua toi.
    const result: any[] = [];
    for (const step of pendingSteps) {
      const allSteps = await this.prisma.documentApprovalStep.findMany({ where: { documentId: step.documentId } });
      const lowestPending = allSteps.filter((s) => s.status === ApprovalStepStatus.PENDING).sort((a, b) => a.level - b.level)[0];
      if (lowestPending && lowestPending.id === step.id) {
        result.push(step);
      }
    }
    return result;
  }

  private assertOwner(doc: { uploadedBy: number }, currentUser: RequestUser) {
    if (currentUser.role !== Role.ADMIN && doc.uploadedBy !== currentUser.id) {
      throw new ForbiddenException({ key: 'ONLY_OWNER_CAN_MODIFY' });
    }
  }

  private assertStatus(doc: { status: ElectronicDocumentStatus }, allowed: ElectronicDocumentStatus[], action: string) {
    if (!allowed.includes(doc.status)) {
      throw new ConflictException({ key: 'INVALID_STATUS_TRANSITION', params: { action, status: doc.status } });
    }
  }

  private async generateCode(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.electronicDocument.count({ where: { code: { startsWith: `ED-${year}-` } } });
    const seq = String(count + 1).padStart(6, '0');
    return `ED-${year}-${seq}`;
  }
}
