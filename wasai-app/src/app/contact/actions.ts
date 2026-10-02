"use server";

import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { INQUIRY_CATEGORIES, type InquiryCategory } from "@/lib/inquiries";

export interface InquiryState {
  error?: string;
  done?: boolean;
}

// Inquiries go into the inquiries table (service role only — Phase 33) and
// the operator reads them on /admin/inquiries, so no personal mail address
// has to be published on the site.
export async function submitInquiry(_prevState: InquiryState, formData: FormData): Promise<InquiryState> {
  if (!isSupabaseConfigured()) return { error: "現在お問い合わせを受け付けられません。" };

  // A field people never see; bots that fill every input fill this too.
  if (String(formData.get("website") ?? "").trim()) return { done: true };

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const category = String(formData.get("category") ?? "") as InquiryCategory;
  const body = String(formData.get("body") ?? "").trim();

  if (!name || name.length > 100) return { error: "お名前を100文字以内で入力してください。" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { error: "返信先のメールアドレスを正しく入力してください。" };
  }
  if (!INQUIRY_CATEGORIES.includes(category)) return { error: "お問い合わせの種類を選んでください。" };
  if (!body || body.length > 4000) return { error: "内容を4000文字以内で入力してください。" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = adminClient();
  // A light brake on floods from one address: 5 an hour is plenty for a person.
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("inquiries")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", since);
  if ((count ?? 0) >= 5) return { error: "短時間に送信が続いています。しばらく時間をおいてから送信してください。" };

  const { error } = await admin.from("inquiries").insert({
    user_id: user?.id ?? null,
    name,
    email,
    category,
    body,
  });
  if (error) return { error: "送信できませんでした。時間をおいて再度お試しください。" };
  return { done: true };
}
