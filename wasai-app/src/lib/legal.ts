// Operator details and consent bookkeeping shared by /terms, /privacy,
// /tokushoho, signup and the payouts page, so the pages can't drift apart.

export const OPERATOR_NAME = "柏木 涼（屋号：和裁マッチ）";
export const CONTACT_EMAIL = "0ye325202v11p0r@gmail.com";

// Bump together with the "最終更新日" on /terms whenever the terms change.
// Stored in each user's auth user_metadata at signup (terms_version), so we
// can tell later which version someone agreed to.
export const TERMS_VERSION = "2026-09-29";
export const TERMS_UPDATED_LABEL = "2026年9月29日";
