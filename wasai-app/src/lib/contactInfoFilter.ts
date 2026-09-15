// Heuristic detector for contact info (phone / email / LINE ID) in
// free-text fields, used to stop the platform being disintermediated before
// any money has changed hands (see the "依頼者・和裁士が直接連絡先を
// 交換して、2回目以降アプリの外で完結してしまうのでは" discussion this
// was added for). Deliberately only applied pre-payment — see call sites —
// since contact info is often legitimately needed once a job is underway
// (delivery address, phone for a courier, etc).
//
// This is a heuristic, not a guarantee: it will miss creative evasions
// (spelled-out digits, "ゼロキュウゼロ...", a phone number split across
// multiple messages) and can in principle false-positive on an unrelated
// 10+ digit number. Good enough to stop the common case without adding a
// full moderation pipeline.

const PHONE_PATTERN = /0\d{1,4}[-‐–ー. ]?\d{1,4}[-‐–ー. ]?\d{3,4}(?!\d)/;
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const LINE_PATTERN = /(line|ライン)\s*(id|アイディー)?\s*[:：]/i;

export function containsContactInfo(text: string): boolean {
  return PHONE_PATTERN.test(text) || EMAIL_PATTERN.test(text) || LINE_PATTERN.test(text);
}

export const CONTACT_INFO_ERROR =
  "電話番号・メールアドレス・LINE IDらしき文字列が含まれています。取引が成立し支払いが完了するまでは、安全のため連絡先の交換をご遠慮ください。";
