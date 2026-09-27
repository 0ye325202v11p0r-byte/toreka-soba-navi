export const SITE_NAME = "和裁マッチ";
export const SITE_DESCRIPTION =
  "和裁士と、着物の仕立て・お直しを依頼したい人をつなぐ専門マッチングサービス。仲介の中抜きに頼らず、和裁士自身が価格を決めて直接依頼を受けられます。";
// Trimmed and without a trailing slash: every caller appends "/path", and
// a stray space/newline or trailing "/" pasted into the env var makes
// Stripe reject the resulting return_url as "Not a valid URL" (seen in
// production) even though `new URL()` itself tolerates it.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").trim().replace(/\/+$/, "");
