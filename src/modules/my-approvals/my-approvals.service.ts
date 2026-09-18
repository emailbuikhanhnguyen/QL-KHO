import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ElectronicDocumentService } from '../electronic-document/electronic-document.service';
import { Role } from '@prisma/client';

export interface RequestUser {
  id: number;
  role: Role;
  departmentId: number;
}

// 1 dong trong hop thu "Viec can toi duyet" — gom chung tu 6 module khac
// nhau nen phai chuan hoa ve 1 dang duy nhat.
export interface ApprovalItem {
  module: string; // khoa i18n o frontend, VD: "leave" -> nav.leave
  href: string; // link toi dung trang + mo dung phieu
  id: number;
  code: string; // Nghi phep/Tang ca khong co "code" -> dung LR-<id> lam nhan
  title: string; // mo ta ngan de nhan ra phieu (ly do / diem den / muc dich...)
  departmentName: string | null;
  submittedAt: Date | null;
  stage: 'MANAGER' | 'FINAL'; // cap dang cho: Quan ly truc tiep hay cap cuoi (6 module co dinh)
  // Them 14/09/2026 — cho Module Ho so dien tu (N cap DONG, khong co dung
  // 2 loai MANAGER/FINAL). Khi co gia tri, frontend uu tien hien "Cap X/Y"
  // thay vi nhan MANAGER/FINAL.
  level?: number;
  totalLevels?: number;
}

@Injectable()
export class MyApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly electronicDocumentService: ElectronicDocumentService,
  ) {}

  // Quy tac chung (giong het logic trong tung module, chi gom lai):
  //  - Cap QUAN LY: chi DEPT_HEAD cua DUNG phong ban do (Admin thay tat ca).
  //  - Cap CUOI: tuy module (HR / ADMIN / BOD / ACCOUNTANT).
  //  - Separation of Duties: KHONG hien phieu do CHINH minh tao (tru Admin) —
  //    vi co hien ra cung se bi chan khi bam duyet, gay kho hieu.
  async getMyApprovals(currentUser: RequestUser): Promise<ApprovalItem[]> {
    const isAdmin = currentUser.role === Role.ADMIN;
    const canApproveAsManager = isAdmin || currentUser.role === Role.DEPT_HEAD;

    // Dieu kien loc cap Quan ly, dung chung cho 5 module co departmentId.
    const managerWhere = isAdmin
      ? {}
      : { departmentId: currentUser.departmentId, NOT: { requestedBy: currentUser.id } };

    const items: ApprovalItem[] = [];

    // ---------- 1. Nghi phep ----------
    if (canApproveAsManager) {
      const rows = await this.prisma.leaveRequest.findMany({
        where: { status: 'PENDING_MANAGER_APPROVAL', ...managerWhere },
        include: { department: true },
      });
      items.push(...rows.map((r) => this.toItem('leave', '/leave-requests.html', r.id, `LR-${r.id}`, r.reason, r.department?.name, r.submittedAt, 'MANAGER')));
    }
    if (isAdmin || currentUser.role === Role.HR) {
      const rows = await this.prisma.leaveRequest.findMany({
        where: { status: 'PENDING_HR_APPROVAL', ...(isAdmin ? {} : { NOT: { requestedBy: currentUser.id } }) },
        include: { department: true },
      });
      items.push(...rows.map((r) => this.toItem('leave', '/leave-requests.html', r.id, `LR-${r.id}`, r.reason, r.department?.name, r.submittedAt, 'FINAL')));
    }

    // ---------- 2. Tang ca ----------
    if (canApproveAsManager) {
      const rows = await this.prisma.overtimeRequest.findMany({
        where: { status: 'PENDING_MANAGER_APPROVAL', ...managerWhere },
        include: { department: true },
      });
      items.push(...rows.map((r) => this.toItem('overtime', '/overtime-requests.html', r.id, `OT-${r.id}`, r.reason, r.department?.name, r.submittedAt, 'MANAGER')));
    }
    if (isAdmin || currentUser.role === Role.HR) {
      const rows = await this.prisma.overtimeRequest.findMany({
        where: { status: 'PENDING_HR_APPROVAL', ...(isAdmin ? {} : { NOT: { requestedBy: currentUser.id } }) },
        include: { department: true },
      });
      items.push(...rows.map((r) => this.toItem('overtime', '/overtime-requests.html', r.id, `OT-${r.id}`, r.reason, r.department?.name, r.submittedAt, 'FINAL')));
    }

    // ---------- 3. Ra/vao cong ----------
    if (canApproveAsManager) {
      const rows = await this.prisma.gatePassRequest.findMany({
        where: { status: 'PENDING_MANAGER_APPROVAL', ...managerWhere },
        include: { department: true },
      });
      items.push(...rows.map((r) => this.toItem('gatepass', '/gate-pass-requests.html', r.id, r.code, r.purpose, r.department?.name, r.submittedAt, 'MANAGER')));
    }
    if (isAdmin || currentUser.role === Role.HR) {
      const rows = await this.prisma.gatePassRequest.findMany({
        where: { status: 'PENDING_HR_APPROVAL', ...(isAdmin ? {} : { NOT: { requestedBy: currentUser.id } }) },
        include: { department: true },
      });
      items.push(...rows.map((r) => this.toItem('gatepass', '/gate-pass-requests.html', r.id, r.code, r.purpose, r.department?.name, r.submittedAt, 'FINAL')));
    }

    // ---------- 4. Xe cong vu (cap cuoi la ADMIN, khong phai HR) ----------
    if (canApproveAsManager) {
      const rows = await this.prisma.vehicleBookingRequest.findMany({
        where: { status: 'PENDING_MANAGER_APPROVAL', ...managerWhere },
        include: { department: true },
      });
      items.push(...rows.map((r) => this.toItem('vehicle', '/vehicle-booking-requests.html', r.id, r.code, `${r.departure} → ${r.destination}`, r.department?.name, r.submittedAt, 'MANAGER')));
    }
    if (isAdmin) {
      const rows = await this.prisma.vehicleBookingRequest.findMany({
        where: { status: 'PENDING_ADMIN_APPROVAL' },
        include: { department: true },
      });
      items.push(...rows.map((r) => this.toItem('vehicle', '/vehicle-booking-requests.html', r.id, r.code, `${r.departure} → ${r.destination}`, r.department?.name, r.submittedAt, 'FINAL')));
    }

    // ---------- 5. Yeu cau mua hang (cap cuoi la BOD) ----------
    if (canApproveAsManager) {
      const rows = await this.prisma.purchaseRequisition.findMany({
        where: { status: 'PENDING_MANAGER_APPROVAL', ...managerWhere },
        include: { department: true },
      });
      items.push(...rows.map((r) => this.toItem('purchase-requisition', '/purchase-requisitions.html', r.id, r.code, r.reason, r.department?.name, r.submittedAt, 'MANAGER')));
    }
    if (isAdmin || currentUser.role === Role.BOD) {
      const rows = await this.prisma.purchaseRequisition.findMany({
        where: { status: 'PENDING_BOD_APPROVAL', ...(isAdmin ? {} : { NOT: { requestedBy: currentUser.id } }) },
        include: { department: true },
      });
      items.push(...rows.map((r) => this.toItem('purchase-requisition', '/purchase-requisitions.html', r.id, r.code, r.reason, r.department?.name, r.submittedAt, 'FINAL')));
    }

    // ---------- 6. PR co gia ----------
    // KHAC 5 module tren: khong co departmentId/requestedBy rieng — phong ban
    // lay gian tiep qua purchaseRequisition, nguoi tao la createdBy (Purchaser).
    if (canApproveAsManager) {
      const rows = await this.prisma.purchaseRequest.findMany({
        where: {
          status: 'PENDING_MANAGER_APPROVAL',
          ...(isAdmin
            ? {}
            : { purchaseRequisition: { departmentId: currentUser.departmentId }, NOT: { createdBy: currentUser.id } }),
        },
        include: { purchaseRequisition: { include: { department: true } } },
      });
      items.push(
        ...rows.map((r) =>
          this.toItem('pricedpr', '/purchase-requests.html', r.id, r.code, `${r.totalAmountUsd} USD`, r.purchaseRequisition?.department?.name, r.submittedAt, 'MANAGER'),
        ),
      );
    }
    if (isAdmin || currentUser.role === Role.ACCOUNTANT) {
      const rows = await this.prisma.purchaseRequest.findMany({
        where: { status: 'PENDING_ACCOUNTANT_APPROVAL', ...(isAdmin ? {} : { NOT: { createdBy: currentUser.id } }) },
        include: { purchaseRequisition: { include: { department: true } } },
      });
      items.push(
        ...rows.map((r) =>
          this.toItem('pricedpr', '/purchase-requests.html', r.id, r.code, `${r.totalAmountUsd} USD`, r.purchaseRequisition?.department?.name, r.submittedAt, 'FINAL'),
        ),
      );
    }

    // ---------- 7. Ho so dien tu (N cap DONG theo so do to chuc — khac
    // hoan toan 6 module tren, KHONG loc theo Role/Department co dinh, ma
    // di theo dung chuoi reportsToId da duoc snapshot luc Gui duyet). ----------
    const pendingDocSteps = await this.electronicDocumentService.findPendingForUser(currentUser.id);
    for (const step of pendingDocSteps) {
      const doc = (step as any).document;
      items.push({
        module: 'edoc',
        href: '/electronic-documents.html',
        id: doc.id,
        code: doc.code,
        title: doc.title,
        departmentName: doc.department?.name ?? null,
        submittedAt: doc.submittedAt,
        stage: 'FINAL', // gia tri mac dinh, frontend se uu tien dung level/totalLevels ben duoi
        level: step.level,
        totalLevels: doc.approvalSteps ? doc.approvalSteps.length : undefined,
      });
    }

    // ---------- 8. Khach/NCC vao cong (cap cuoi la BOD, giong Yeu cau
    // mua hang — 2 cap co dinh, KHONG dung N-cap dong nhu Ho so dien tu) ----------
    if (canApproveAsManager) {
      const rows = await this.prisma.guestRegistration.findMany({
        where: { status: 'PENDING_MANAGER_APPROVAL', ...managerWhere },
        include: { department: true, visitors: true },
      });
      items.push(...rows.map((r) => this.toItem('guest', '/guest-registrations.html', r.id, r.code, `${r.visitors.length} người — ${r.companyName}`, r.department?.name, r.submittedAt, 'MANAGER')));
    }
    if (isAdmin || currentUser.role === Role.BOD) {
      const rows = await this.prisma.guestRegistration.findMany({
        where: { status: 'PENDING_BOD_APPROVAL', ...(isAdmin ? {} : { NOT: { requestedBy: currentUser.id } }) },
        include: { department: true, visitors: true },
      });
      items.push(...rows.map((r) => this.toItem('guest', '/guest-registrations.html', r.id, r.code, `${r.visitors.length} người — ${r.companyName}`, r.department?.name, r.submittedAt, 'FINAL')));
    }

    // Phieu cho lau nhat len dau — de khong ai bi bo quen.
    items.sort((a, b) => {
      const ta = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      const tb = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
      return ta - tb;
    });

    return items;
  }

  // Chi tra ve TONG SO — dung cho badge tren menu/Dashboard, nhe hon nhieu
  // so voi tai ve toan bo danh sach chi de dem.
  async countMyApprovals(currentUser: RequestUser): Promise<{ count: number }> {
    const items = await this.getMyApprovals(currentUser);
    return { count: items.length };
  }

  private toItem(
    module: string,
    href: string,
    id: number,
    code: string,
    title: string,
    departmentName: string | null | undefined,
    submittedAt: Date | null,
    stage: 'MANAGER' | 'FINAL',
  ): ApprovalItem {
    return { module, href, id, code, title, departmentName: departmentName ?? null, submittedAt, stage };
  }
}
