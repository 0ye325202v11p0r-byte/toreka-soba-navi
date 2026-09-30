// Operator details and consent bookkeeping shared by /terms, /privacy,
// /tokushoho, signup and the payouts page, so the pages can't drift apart.

// The operator's legal name is shown only where the law requires it —
// 特定商取引法に基づく表示 (販売業者の氏名 can't be omitted). The terms and
// privacy policy name the business and give the name and address on
// request instead (個人情報保護法32条 allows "本人の求めに応じて遅滞なく
// 回答する" for 氏名・住所), so it isn't repeated on more pages than needed.
export const OPERATOR_NAME = "柏木 涼（屋号：和裁マッチ）";
export const BUSINESS_LABEL = "和裁マッチ（個人事業）";
export const CONTACT_EMAIL = "0ye325202v11p0r@gmail.com";

// Bump together with the "最終更新日" on /terms whenever the terms change.
// Stored in each user's auth user_metadata at signup (terms_version), so we
// can tell later which version someone agreed to.
export const TERMS_VERSION = "2026-09-29";
export const TERMS_UPDATED_LABEL = "2026年9月29日";
