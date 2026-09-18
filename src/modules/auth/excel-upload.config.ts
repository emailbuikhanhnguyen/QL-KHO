import { BadRequestException } from '@nestjs/common';
import { memoryStorage } from 'multer';

// Import hang loat CHI can doc file 1 lan trong luc request, KHONG can
// luu lai tren dia (khac cach lam voi anh QC/Ho so dien tu — nhung file
// nay khong can giu lai lam ho so, chi doc roi xu ly ngay).
const ALLOWED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls (cu)
];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB — du rong cho vai tram dong

export const excelUploadMulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req: any, file: any, cb: any) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(new BadRequestException('Chi chap nhan file Excel (.xlsx hoac .xls)'), false);
      return;
    }
    cb(null, true);
  },
};
