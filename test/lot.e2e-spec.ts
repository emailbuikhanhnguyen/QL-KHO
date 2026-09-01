import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Integration test theo yeu cau muc 6.4 cua spec: it nhat 1 integration test cho API Lot.
describe('Lot API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let itemGroupId: number;
  let itemId: number;
  let supplierId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();

    prisma = app.get(PrismaService);

    const group = await prisma.itemGroup.create({
      data: { code: `IG-LOT-E2E-${Date.now()}`, name: 'Nhom test lot e2e' },
    });
    itemGroupId = group.id;

    const item = await prisma.item.create({
      data: {
        code: `VT-LOT-E2E-${Date.now()}`,
        name: 'Vai test cho lot',
        unit: 'met',
        itemGroupId,
        minStock: 1,
        maxStock: 100,
      },
    });
    itemId = item.id;

    const supplier = await prisma.supplier.create({
      data: { code: `NCC-E2E-${Date.now()}`, name: 'NCC test' },
    });
    supplierId = supplier.id;
  });

  afterAll(async () => {
    await prisma.lot.deleteMany({ where: { itemId } });
    await prisma.item.delete({ where: { id: itemId } });
    await prisma.itemGroup.delete({ where: { id: itemGroupId } });
    await prisma.supplier.delete({ where: { id: supplierId } });
    await app.close();
  });

  const lotCode = `LOT-E2E-${Date.now()}`;
  let createdId: number;

  it('POST /api/lots - tao lo moi, qcStatus mac dinh PENDING', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/lots')
      .send({ itemId, lotCode, supplierId, color: 'Xanh', size: 'M' })
      .expect(201);

    expect(res.body.qcStatus).toBe('PENDING');
    createdId = res.body.id;
  });

  it('POST /api/lots - tra ve 400 khi itemId khong ton tai', async () => {
    await request(app.getHttpServer())
      .post('/api/lots')
      .send({ itemId: 999999, lotCode: `${lotCode}-X`, supplierId })
      .expect(400);
  });

  it('POST /api/lots - tra ve 409 khi trung ma lo cho cung item', async () => {
    await request(app.getHttpServer())
      .post('/api/lots')
      .send({ itemId, lotCode, supplierId })
      .expect(409);
  });

  it('GET /api/lots/:id - lay chi tiet lo', async () => {
    const res = await request(app.getHttpServer()).get(`/api/lots/${createdId}`).expect(200);
    expect(res.body.lotCode).toBe(lotCode);
  });

  it('PUT /api/lots/:id - cap nhat qcStatus sang PASSED', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/lots/${createdId}`)
      .send({ qcStatus: 'PASSED' })
      .expect(200);

    expect(res.body.qcStatus).toBe('PASSED');
  });

  it('GET /api/lots - filter theo qcStatus', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/lots')
      .query({ qcStatus: 'PASSED', itemId })
      .expect(200);

    expect(res.body.data.some((l: any) => l.id === createdId)).toBe(true);
  });

  it('DELETE /api/lots/:id - soft delete', async () => {
    await request(app.getHttpServer()).delete(`/api/lots/${createdId}`).expect(200);
    await request(app.getHttpServer()).get(`/api/lots/${createdId}`).expect(404);
  });
});
