import { normalizeLang, translateMessage } from './i18n.util';

describe('i18n.util', () => {
  describe('normalizeLang', () => {
    it('nhan dung 3 ngon ngu ho tro', () => {
      expect(normalizeLang('vi')).toBe('vi');
      expect(normalizeLang('en')).toBe('en');
      expect(normalizeLang('zh')).toBe('zh');
    });

    it('mac dinh ve vi khi gia tri khong hop le hoac rong', () => {
      expect(normalizeLang('fr')).toBe('vi');
      expect(normalizeLang('')).toBe('vi');
      expect(normalizeLang(undefined)).toBe('vi');
      expect(normalizeLang(null)).toBe('vi');
    });

    it('chi lay 2 ky tu dau (xu ly header dang "vi-VN", "en-US"...)', () => {
      expect(normalizeLang('vi-VN')).toBe('vi');
      expect(normalizeLang('en-US')).toBe('en');
      expect(normalizeLang('zh-CN')).toBe('zh');
    });
  });

  describe('translateMessage', () => {
    it('dich dung theo tung ngon ngu cho cung 1 key', () => {
      const params = { entity: 'GoodsReceipt', id: 5 };
      expect(translateMessage('ENTITY_NOT_FOUND', 'vi', params)).toBe('GoodsReceipt #5 không tồn tại');
      expect(translateMessage('ENTITY_NOT_FOUND', 'en', params)).toBe('GoodsReceipt #5 not found');
      expect(translateMessage('ENTITY_NOT_FOUND', 'zh', params)).toBe('未找到 GoodsReceipt #5');
    });

    it('tu dong dich tu "action" trong params truoc khi thay vao cau', () => {
      const result = translateMessage('INVALID_STATUS_TRANSITION', 'en', {
        action: 'duyet',
        status: 'DRAFT',
      });
      expect(result).toBe("Cannot approve a document with status 'DRAFT'");
    });

    it('giu nguyen action goc neu khong co trong tu dien action (fallback an toan)', () => {
      const result = translateMessage('INVALID_STATUS_TRANSITION', 'en', {
        action: 'mot-hanh-dong-la-chua-tung-co',
        status: 'DRAFT',
      });
      expect(result).toContain('mot-hanh-dong-la-chua-tung-co');
    });

    it('tra ve chinh key neu khong tim thay ban dich (de de phat hien thieu sot)', () => {
      expect(translateMessage('KEY_KHONG_TON_TAI', 'vi', {})).toBe('KEY_KHONG_TON_TAI');
    });

    it('khong bi loi khi thieu params (dung placeholder mac dinh)', () => {
      const result = translateMessage('ENTITY_NOT_FOUND', 'vi', {});
      expect(result).toContain('{{entity}}');
      expect(result).toContain('{{id}}');
    });
  });
});
