// Ket qua tra ve sau khi import — moi dong file Excel co dung 1 muc ket
// qua tuong ung, du dong do thanh cong hay loi. KHONG dung DTO validate
// (day la KIEU TRA VE, khong phai du lieu nhan vao).
export interface BulkImportRowResult {
  row: number; // so dong trong file Excel (tinh ca dong tieu de = dong 1)
  email: string;
  success: boolean;
  tempPassword?: string; // CHI co khi success — mat khau tam sinh ngau nhien
  error?: string;
}

export interface BulkImportSummary {
  totalRows: number;
  successCount: number;
  errorCount: number;
  results: BulkImportRowResult[];
}
