import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';

// He thong thong bao email tu dong theo tung giao dich (khac han script
// daily-healthcheck/daily-stock-alert chay theo LICH co dinh qua GitHub
// Actions) — Service nay duoc GOI TRUC TIEP tu trong NestJS ngay luc co
// hanh dong submit/duyet, dung LAI dung 2 bien moi truong GMAIL_USER/
// GMAIL_APP_PASSWORD, nhung LAN NAY phai cau hinh tren RENDER (Environment
// Variables cua web service), KHONG PHAI GitHub Secrets (khac ngu canh
// voi 2 script cu chay qua GitHub Actions).
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly prisma: PrismaService) {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    if (user && pass) {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass },
      });
    } else {
      this.logger.warn(
        'GMAIL_USER/GMAIL_APP_PASSWORD chua cau hinh tren Render — bo qua gui email thong bao (khong lam crash app).',
      );
    }
  }

  async sendToEmails(emails: string[], subject: string, htmlBody: string): Promise<void> {
    if (!this.transporter || emails.length === 0) return;
    try {
      await this.transporter.sendMail({
        from: `"SEC ERP" <${process.env.GMAIL_USER}>`,
        to: emails.join(','),
        subject,
        html: htmlBody,
      });
    } catch (err: any) {
      // KHONG duoc de loi gui email lam crash luong nghiep vu chinh — chi
      // log lai, luong duyet/tao don van tiep tuc thanh cong binh thuong.
      this.logger.error(`Gui email thong bao that bai: ${err.message}`);
    }
  }

  async getEmailsByRoleInDepartment(role: Role, departmentId: number): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: { role, departmentId, isActive: true, deletedAt: null },
    });
    return users.map((u) => u.email);
  }

  async getEmailsByRole(role: Role): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: { role, isActive: true, deletedAt: null },
    });
    return users.map((u) => u.email);
  }

  // Them 14/09/2026 — dung cho Module Ho so dien tu: chuoi duyet la theo
  // TUNG NGUOI CU THE (qua User.reportsToId), khong theo Role/Department
  // nhu 6 module cu, nen can tra ve email cua 1 user_id chinh xac.
  async getEmailByUserId(userId: number): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return user ? user.email : null;
  }
}
