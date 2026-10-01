// Shared by the contact form, its server action and the operator's inbox.
// Must match the check constraint on inquiries.category (Phase 33).
export const INQUIRY_CATEGORIES = [
  "サービスについて",
  "取引について",
  "特商法の表示事項の請求",
  "個人情報の開示等の請求",
  "不具合の報告",
  "その他",
] as const;
export type InquiryCategory = (typeof INQUIRY_CATEGORIES)[number];
