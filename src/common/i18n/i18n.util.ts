import {
  MESSAGES,
  ACTION_TRANSLATIONS,
  SupportedLang,
  DEFAULT_LANG,
  SUPPORTED_LANGS,
  translateAction,
} from './translations';

// Chuan hoa 1 gia tri "ngon ngu yeu cau" ve dung 1 trong 3 gia tri ho tro,
// mac dinh Tieng Viet neu khong hop le/khong co.
export function normalizeLang(raw: unknown): SupportedLang {
  const lang = String(raw || '').toLowerCase().slice(0, 2);
  return (SUPPORTED_LANGS as string[]).includes(lang) ? (lang as SupportedLang) : DEFAULT_LANG;
}

// Dich 1 key thanh chuoi hoan chinh theo ngon ngu, thay the cac {{placeholder}}
// bang gia tri trong params. Neu params.action khop voi 1 key trong
// ACTION_TRANSLATIONS, tu dong dich luon tu do truoc khi thay vao cau.
export function translateMessage(
  key: string,
  lang: SupportedLang,
  params: Record<string, string | number> = {},
): string {
  const template = MESSAGES[key]?.[lang];
  if (!template) return key; // khong tim thay key — tra ve chinh key do de de nhan biet thieu ban dich

  const resolvedParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    resolvedParams[k] = k === 'action' ? translateAction(String(v), lang) : String(v);
  }

  return template.replace(/\{\{(\w+)\}\}/g, (_, placeholder) => resolvedParams[placeholder] ?? `{{${placeholder}}}`);
}
