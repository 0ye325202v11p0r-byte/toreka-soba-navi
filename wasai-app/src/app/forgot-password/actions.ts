"use server";

import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";

export interface ForgotPasswordState {
  error?: string;
  sent?: boolean;
}

export async function requestPasswordReset(
  _prevState: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { error: "メールアドレスを入力してください。" };
  }

  const supabase = await createClient();
  // Supabase's shared per-project SMTP has a low send-rate cap (see the
  // same caveat on signup) — fine for testing, but production needs a
  // custom SMTP provider configured in Supabase Auth settings or reset
  // emails will start failing under any real traffic.
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${SITE_URL}/auth/callback?next=/reset-password`,
  });

  // Report success either way — telling the caller "that email isn't
  // registered" would let anyone probe which addresses have accounts.
  if (error) {
    return { error: "メールの送信に失敗しました。時間をおいて再度お試しください。" };
  }
  return { sent: true };
}
