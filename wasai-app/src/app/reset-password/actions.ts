"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface ResetPasswordState {
  error?: string;
}

export async function resetPassword(
  _prevState: ResetPasswordState,
  formData: FormData
): Promise<ResetPasswordState> {
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("password_confirm") ?? "");

  if (password.length < 8) {
    return { error: "パスワードは8文字以上にしてください。" };
  }
  if (password !== passwordConfirm) {
    return { error: "パスワードが一致しません。" };
  }

  const supabase = await createClient();
  // Relies on the recovery session /auth/callback established from the
  // emailed link — if that link expired or was already used, there's no
  // session here and this fails.
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return {
      error: "パスワードの更新に失敗しました。リンクの有効期限が切れている可能性があるので、もう一度お試しください。",
    };
  }

  redirect("/dashboard");
}
