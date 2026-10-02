// Operator details and consent bookkeeping shared by /terms, /privacy,
// /tokushoho, signup and the payouts page, so the pages can't drift apart.

// The operator's name, address, phone and mail address aren't published:
// 特定商取引法 lets an online seller omit 氏名・住所・電話番号 if the page
// says they're sent promptly on request (消費者庁「特定商取引法ガイド」
// 通信販売の広告の表示事項を省略できる場合), a mail address is only required
// for email advertising, and 個人情報保護法32条 allows 氏名・住所 to be given
// on request. Requests come in through /contact (stored in inquiries) and
// the operator answers them from /admin/inquiries.
export const BUSINESS_LABEL = "和裁マッチ（個人事業）";
export const CONTACT_PATH = "/contact";

// Bump together with the "最終更新日" on /terms whenever the terms change.
// Stored in each user's auth user_metadata at signup (terms_version), so we
// can tell later which version someone agreed to.
export const TERMS_VERSION = "2026-10-02";
export const TERMS_UPDATED_LABEL = "2026年10月2日";
