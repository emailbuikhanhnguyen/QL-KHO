import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Integration test: xac nhan /api/auth/register da bi khoa, chi ADMIN goi duoc.
describe('Auth API (e2e) - RBAC lockdown', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let departmentId: number;

  const adminEmail = `admin-e2e-${Date.now()}@congty.com`;
  const adminPassword = 'Admin@123456';
  const staffEmail = `staff-e2e-${Date.now()}@congty.com`;
  const staffPassword = 'Staff@123456';

  let adminToken: string;
  let staffToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();

    prisma = app.get(PrismaService);

    const dept = await prisma.department.create({
      data: { code: `DEPT-E2E-${Date.now()}`, name: 'Phong ban test e2e' },
    });
    departmentId = dept.id;

    // Tao san 1 ADMIN va 1 WAREHOUSE_STAFF thang qua Prisma (gia lap seed),
    // vi endpoint /register gio da bi khoa nen khong the tu tao qua API.
    const bcrypt = require('bcrypt');
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: await bcrypt.hash(adminPassword, 10),
        fullName: 'Admin E2E',
        role: Role.ADMIN,
        departmentId,
      },
    });
    await prisma.user.create({
      data: {
        email: staffEmail,
        passwordHash: await bcrypt.hash(staffPassword, 10),
        fullName: 'Staff E2E',
        role: Role.WAREHOUSE_STAFF,
        departmentId,
      },
    });

    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: adminEmail, password: adminPassword });
    adminToken = adminLogin.body.accessToken;

    const staffLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: staffEmail, password: staffPassword });
    staffToken = staffLogin.body.accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { departmentId } });
    await prisma.department.delete({ where: { id: departmentId } });
    await app.close();
  });

  it('POST /api/auth/register - tra ve 401 khi khong co token', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: `new-${Date.now()}@congty.com`,
        password: 'Password123',
        fullName: 'Nguoi dung moi',
        role: Role.REQUESTER,
        departmentId,
      })
      .expect(401);
  });

  it('POST /api/auth/register - tra ve 403 khi dang nhap bang role khong phai ADMIN', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        email: `new-${Date.now()}@congty.com`,
        password: 'Password123',
        fullName: 'Nguoi dung moi',
        role: Role.REQUESTER,
        departmentId,
      })
      .expect(403);
  });

  it('POST /api/auth/register - thanh cong khi dang nhap bang ADMIN', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: `new-${Date.now()}@congty.com`,
        password: 'Password123',
        fullName: 'Nguoi dung moi',
        role: Role.REQUESTER,
        departmentId,
      })
      .expect(201);

    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('GET /api/auth/me - tra ve dung thong tin user dang dang nhap', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.email).toBe(adminEmail);
    expect(res.body.role).toBe(Role.ADMIN);
  });
});
