import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Integration test theo yeu cau muc 6.4 cua spec: it nhat 1 integration test cho API Item.
// Can DATABASE_URL tro toi mot Postgres test (vd: local hoac Supabase project rieng cho test).
describe('Item API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let itemGroupId: number;

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
      data: { code: `IG-E2E-${Date.now()}`, name: 'Nhom test e2e' },
    });
    itemGroupId = group.id;
  });

  afterAll(async () => {
    await prisma.item.deleteMany({ where: { itemGroupId } });
    await prisma.itemGroup.delete({ where: { id: itemGroupId } });
    await app.close();
  });

  const itemCode = `VT-E2E-${Date.now()}`;
  let createdId: number;

  it('POST /api/items - tao item moi thanh cong', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/items')
      .send({
        code: itemCode,
        name: 'Vai kaki test',
        unit: 'met',
        itemGroupId,
        minStock: 5,
        maxStock: 50,
      })
      .expect(201);

    expect(res.body).toMatchObject({ code: itemCode, unit: 'met' });
    createdId = res.body.id;
  });

  it('POST /api/items - tra ve 400 khi minStock > maxStock', async () => {
    await request(app.getHttpServer())
      .post('/api/items')
      .send({
        code: `${itemCode}-BAD`,
        name: 'Vai loi',
        unit: 'met',
        itemGroupId,
        minStock: 100,
        maxStock: 10,
      })
      .expect(400);
  });

  it('POST /api/items - tra ve 409 khi trung ma vat tu', async () => {
    await request(app.getHttpServer())
      .post('/api/items')
      .send({
        code: itemCode,
        name: 'Vai trung ma',
        unit: 'met',
        itemGroupId,
        minStock: 1,
        maxStock: 10,
      })
      .expect(409);
  });

  it('GET /api/items/:id - lay chi tiet item vua tao', async () => {
    const res = await request(app.getHttpServer()).get(`/api/items/${createdId}`).expect(200);
    expect(res.body.code).toBe(itemCode);
  });

  it('GET /api/items - danh sach co phan trang', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/items')
      .query({ page: 1, limit: 20 })
      .expect(200);

    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total');
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(20);
  });

  it('PUT /api/items/:id - cap nhat ten item', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/items/${createdId}`)
      .send({ name: 'Vai kaki test (updated)' })
      .expect(200);

    expect(res.body.name).toBe('Vai kaki test (updated)');
  });

  it('DELETE /api/items/:id - soft delete, sau do GET tra ve 404', async () => {
    await request(app.getHttpServer()).delete(`/api/items/${createdId}`).expect(200);
    await request(app.getHttpServer()).get(`/api/items/${createdId}`).expect(404);

    const raw = await prisma.item.findUnique({ where: { id: createdId } });
    expect(raw?.deletedAt).not.toBeNull(); // van con trong DB, chi bi soft delete
  });
});
