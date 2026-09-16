import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';

// Thu muc luu ho so — giong nguyen tac QC_UPLOAD_DIR: nam ngoai code, de
// khong bi mat khi deploy lai.
export const DOCUMENT_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'electronic-documents');

function ensureUploadDirExists() {
  if (!fs.existsSync(DOCUMENT_UPLOAD_DIR)) {
    fs.mkdirSync(DOCUMENT_UPLOAD_DIR, { recursive: true });
  }
}
ensureUploadDirExists();

// Rong hon anh QC — day la "ho so hang ngay" chung, khong chi anh. Theo
// dung xac nhan Sep: khong ep loai ho so cu the, nen cho phep dinh dang
// pho bien nhat cho van ban/bang bieu/anh chup.
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/webp',
];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB — rong hon anh QC (5MB) vi co the la file Word/Excel

export const documentUploadMulterOptions = {
  storage: diskStorage({
    destination: (_req: any, _file: any, cb: any) => {
      ensureUploadDirExists();
      cb(null, DOCUMENT_UPLOAD_DIR);
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
      cb(new BadRequestException('Chi chap nhan PDF, Word, Excel, hoac anh JPEG/PNG/WEBP'), false);
      return;
    }
    cb(null, true);
  },
};
