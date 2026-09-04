// ============================================================================
// translations.ts — tu dien dich thong bao loi cua backend.
// Chi ap dung cho cac exception duoc nem ra dang { key, params } (xem
// i18n.util.ts). Cac loi khac (VD: loi validate tu ValidationPipe) khong
// bi anh huong, van hien nguyen nhu cu.
// ============================================================================

export type SupportedLang = 'vi' | 'en' | 'zh';
export const DEFAULT_LANG: SupportedLang = 'vi';
export const SUPPORTED_LANGS: SupportedLang[] = ['vi', 'en', 'zh'];

// Tu translate cac "hanh dong" (action) dung trong thong bao loi kieu
// "Khong the {action} phieu dang o trang thai X" — giu nguyen key la chuoi
// Tieng Viet khong dau da dung san trong code (khong can sua cac cho goi
// assertStatus(...) hien co), chi can dich phan hien thi cuoi cung.
export const ACTION_TRANSLATIONS: Record<string, Record<SupportedLang, string>> = {
  'duyet': { vi: 'duyệt', en: 'approve', zh: '批准' },
  'duyet (cap truong bo phan)': { vi: 'duyệt (cấp Trưởng bộ phận)', en: 'approve (Department Head level)', zh: '批准（部门主管级）' },
  'duyet (cap BOD)': { vi: 'duyệt (cấp BOD)', en: 'approve (BOD level)', zh: '批准（董事会级）' },
  'tu choi': { vi: 'từ chối', en: 'reject', zh: '拒绝' },
  'gui duyet': { vi: 'gửi duyệt', en: 'submit for approval', zh: '提交审批' },
  'xoa': { vi: 'xóa', en: 'delete', zh: '删除' },
  'xoa anh': { vi: 'xóa ảnh', en: 'delete image', zh: '删除图片' },
  'them anh': { vi: 'thêm ảnh', en: 'add image', zh: '添加图片' },
  'mo lai': { vi: 'mở lại', en: 'reopen', zh: '重新打开' },
  'chinh sua': { vi: 'chỉnh sửa', en: 'edit', zh: '编辑' },
  'thuc xuat': { vi: 'thực xuất', en: 'issue stock', zh: '发货出库' },
  'xuat kho': { vi: 'xuất kho', en: 'issue stock', zh: '出库' },
  'xuat kho nguon': { vi: 'xuất kho nguồn', en: 'ship', zh: '发出' },
  'xac nhan nhan hang': { vi: 'xác nhận nhận hàng', en: 'confirm receipt', zh: '确认收货' },
  'nhap so dem': { vi: 'nhập số đếm', en: 'enter count', zh: '录入盘点数量' },
  'hoan tat': { vi: 'hoàn tất', en: 'complete', zh: '完成' },
  'huy': { vi: 'hủy', en: 'cancel', zh: '取消' },
  'duyet QA': { vi: 'duyệt (cấp QA)', en: 'approve (QA level)', zh: '批准（质检级）' },
};

export function translateAction(action: string, lang: SupportedLang): string {
  return ACTION_TRANSLATIONS[action]?.[lang] || action;
}

// Thong bao loi theo key. {{placeholder}} se duoc thay the bang gia tri
// tuong ung trong params luc dich (xem i18n.util.ts).
export const MESSAGES: Record<string, Record<SupportedLang, string>> = {
  ENTITY_NOT_FOUND: {
    vi: '{{entity}} #{{id}} không tồn tại',
    en: '{{entity}} #{{id}} not found',
    zh: '未找到 {{entity}} #{{id}}',
  },
  INVALID_STATUS_TRANSITION: {
    vi: "Không thể {{action}} phiếu đang ở trạng thái '{{status}}'",
    en: "Cannot {{action}} a document with status '{{status}}'",
    zh: "无法对状态为「{{status}}」的单据执行{{action}}操作",
  },
  NO_LINES_TO_SUBMIT: {
    vi: 'Không thể gửi duyệt phiếu không có dòng hàng nào',
    en: 'Cannot submit a document with no line items',
    zh: '无法提交没有明细行的单据',
  },
  ONLY_HEAD_OR_ADMIN_CAN_APPROVE_RECEIPT: {
    vi: 'Chỉ Trưởng bộ phận hoặc Admin mới được duyệt phiếu nhập kho',
    en: 'Only the Department Head or Admin can approve a goods receipt',
    zh: '只有部门主管或管理员才能批准入库单',
  },
  NOT_IN_YOUR_DEPARTMENT: {
    vi: 'Bạn không thuộc phòng ban quản lý kho này',
    en: 'You do not belong to the department managing this warehouse',
    zh: '您不属于管理该仓库的部门',
  },
  WAREHOUSE_NOT_FOUND: {
    vi: 'Kho #{{id}} không tồn tại',
    en: 'Warehouse #{{id}} does not exist',
    zh: '仓库 #{{id}} 不存在',
  },
  SUPPLIER_NOT_FOUND: {
    vi: 'Nhà cung cấp #{{id}} không tồn tại',
    en: 'Supplier #{{id}} does not exist',
    zh: '供应商 #{{id}} 不存在',
  },
  ITEM_NOT_FOUND: {
    vi: 'Vật tư #{{id}} không tồn tại',
    en: 'Item #{{id}} does not exist',
    zh: '物料 #{{id}} 不存在',
  },
  STORAGE_LOCATION_NOT_FOUND: {
    vi: 'Vị trí lưu trữ #{{id}} không tồn tại',
    en: 'Storage location #{{id}} does not exist',
    zh: '库位 #{{id}} 不存在',
  },
  LOT_NOT_FOUND: {
    vi: 'Lô hàng #{{id}} không tồn tại',
    en: 'Lot #{{id}} does not exist',
    zh: '批次 #{{id}} 不存在',
  },
  RESULT_REQUIRED_BEFORE_SUBMIT: {
    vi: 'Phải chọn kết quả kiểm tra trước khi gửi duyệt',
    en: 'You must select an inspection result before submitting',
    zh: '提交前必须先选择检验结果',
  },
  IMAGE_REQUIRED_BEFORE_SUBMIT: {
    vi: 'Phải có ít nhất 1 ảnh chụp phiếu kiểm hàng trước khi gửi duyệt',
    en: 'At least one inspection photo is required before submitting',
    zh: '提交前必须至少上传一张检验照片',
  },
  ONLY_QC_MANAGER_CAN_APPROVE: {
    vi: 'Chỉ QC Manager hoặc Admin mới được duyệt phiếu kiểm hàng',
    en: 'Only the QC Manager or Admin can approve an inspection',
    zh: '只有质检经理或管理员才能批准检验单',
  },
  INVALID_QC_RESULT: {
    vi: 'Kết quả QC chỉ được là một trong: {{allowed}}',
    en: 'QC result must be one of: {{allowed}}',
    zh: '质检结果只能是以下之一：{{allowed}}',
  },
  ONLY_HEAD_OR_ADMIN_THIS_LEVEL: {
    vi: 'Chỉ Trưởng bộ phận hoặc Admin mới được duyệt cấp này',
    en: 'Only the Department Head or Admin can approve at this level',
    zh: '只有部门主管或管理员才能在此级别审批',
  },
  ONLY_OWN_DEPT_HEAD_CAN_APPROVE: {
    vi: 'Bạn chỉ được duyệt phiếu của phòng ban mình quản lý',
    en: 'You can only approve requests from your own department',
    zh: '您只能审批本部门的申请',
  },
  ONLY_BOD_OR_ADMIN_THIS_LEVEL: {
    vi: 'Chỉ BOD hoặc Admin mới được duyệt cấp này',
    en: 'Only the BOD or Admin can approve at this level',
    zh: '只有董事会或管理员才能在此级别审批',
  },
  ONLY_DEPT_HEAD_REJECT_THIS_STAGE: {
    vi: 'Chỉ Trưởng bộ phận của phòng ban này hoặc Admin mới từ chối được',
    en: 'Only this department\'s Head or Admin can reject at this stage',
    zh: '只有本部门主管或管理员才能在此阶段拒绝',
  },
  ONLY_BOD_REJECT_THIS_STAGE: {
    vi: 'Chỉ BOD hoặc Admin mới từ chối được ở cấp này',
    en: 'Only the BOD or Admin can reject at this stage',
    zh: '只有董事会或管理员才能在此阶段拒绝',
  },
  ONLY_WAREHOUSE_STAFF_CAN_ISSUE: {
    vi: 'Chỉ thủ kho hoặc Admin mới được thực xuất',
    en: 'Only warehouse staff or Admin can release stock',
    zh: '只有仓库人员或管理员才能执行出库',
  },
  ONLY_OWNER_CAN_MODIFY: {
    vi: 'Bạn chỉ được thao tác trên phiếu do chính mình tạo',
    en: 'You can only modify requests that you created',
    zh: '您只能操作自己创建的申请',
  },
  NO_STOCK_TO_COUNT: {
    vi: "Kho '{{warehouse}}' hiện không có tồn kho nào để kiểm kê",
    en: "Warehouse '{{warehouse}}' currently has no stock to count",
    zh: '仓库「{{warehouse}}」目前没有可盘点的库存',
  },
  LOT_NOT_IN_ACTIVE_STOCKTAKE: {
    vi: 'Lô hàng này không nằm trong phiên kiểm kê nào đang mở. Kiểm tra lại đã bắt đầu kiểm kê đúng kho chưa',
    en: 'This lot is not part of any open stocktake session. Check that a stocktake has been started for the correct warehouse',
    zh: '该批次不属于任何正在进行的盘点会话。请检查是否已为正确的仓库开始盘点',
  },
  ONLY_ADMIN_CAN_FORCE_COMPLETE: {
    vi: 'Chỉ Admin mới được ghi đè vượt dung sai kiểm kê',
    en: 'Only Admin can override the stocktake tolerance',
    zh: '只有管理员才能强制覆盖盘点误差范围',
  },
  UNCOUNTED_LINES_REMAINING: {
    vi: 'Còn {{count}} dòng hàng chưa được đếm. Phải đếm hết trước khi hoàn tất',
    en: '{{count}} lines are still uncounted. All lines must be counted before completing',
    zh: '还有 {{count}} 行尚未盘点。必须全部盘点完毕才能完成',
  },
  TOLERANCE_EXCEEDED: {
    vi: 'Có {{count}} dòng hàng chênh lệch vượt dung sai cho phép ({{tolerance}}%). Cần kiểm tra lại hoặc dùng Admin để ghi đè',
    en: '{{count}} lines exceed the allowed tolerance ({{tolerance}}%). Please recheck or use an Admin account to override',
    zh: '有 {{count}} 行差异超出允许的误差范围（{{tolerance}}%）。请重新核对或使用管理员账号强制覆盖',
  },
  DUPLICATE_ACTIVE_STOCKTAKE: {
    vi: "Kho này đang có phiên kiểm kê '{{code}}' chưa hoàn tất. Phải hoàn tất/hủy trước khi bắt đầu phiên mới",
    en: "This warehouse already has an unfinished stocktake session '{{code}}'. It must be completed/cancelled before starting a new one",
    zh: '该仓库已有未完成的盘点会话「{{code}}」。必须先完成/取消该会话才能开始新的盘点',
  },
  LOT_NOT_FAILED: {
    vi: "Chỉ được tạo phiếu hủy cho lô hàng có kết quả QC là 'Không đạt' (FAILED)",
    en: "A disposal request can only be created for a lot with QC result 'Failed'",
    zh: '只能为质检结果为「不合格」的批次创建报废申请',
  },
  INSUFFICIENT_STOCK_FOR_DISPOSAL: {
    vi: 'Số lượng hủy ({{requested}}) vượt quá tồn khả dụng ({{available}}) của lô hàng tại kho này',
    en: 'Disposal quantity ({{requested}}) exceeds available stock ({{available}}) for this lot at this warehouse',
    zh: '报废数量（{{requested}}）超过该批次在此仓库的可用库存（{{available}}）',
  },
};
