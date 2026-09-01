import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';

// Thu muc luu anh — nam ngoai code, ben canh project. Khi deploy that len
// may chu (VD: PC phong server), nen tro thu muc nay ra o dia rieng co
// backup, KHONG de chung voi code (de code deploy lai khong xoa mat anh).
export const QC_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'qc-inspections');

// Dam bao thu muc luu ton tai truoc khi Multer ghi file vao.
function ensureUploadDirExists() {
  if (!fs.existsSync(QC_UPLOAD_DIR)) {
    fs.mkdirSync(QC_UPLOAD_DIR, { recursive: true });
  }
}
ensureUploadDirExists();

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export const qcImageMulterOptions = {
  storage: diskStorage({
    destination: (_req: any, _file: any, cb: any) => {
      ensureUploadDirExists();
      cb(null, QC_UPLOAD_DIR);
    },
    filename: (_req: any, file: any, cb: any) => {
      const ext = path.extname(file.originalname);
      const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      cb(null, uniqueName);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req: any, file: any, cb: any) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(new BadRequestException('Chi chap nhan file anh JPEG, PNG hoac WEBP'), false);
      return;
    }
    cb(null, true);
  },
};
