"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";
import { TERMS_VERSION } from "@/lib/legal";

export interface SignupState {
  error?: string;
}

export async function signup(_prevState: SignupState, formData: FormData): Promise<SignupState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const role = String(formData.get("role") ?? "") as Role;
  const prefecture = String(formData.get("prefecture") ?? "").trim();

  if (!email || !password || !displayName) {
    return { error: "メールアドレス・パスワード・表示名は必須です。" };
  }
  if (password.length < 8) {
    return { error: "パスワードは8文字以上にしてください。" };
  }
  if (role !== "client" && role !== "craftsman") {
    return { error: "登録区分を選択してください。" };
  }
  if (formData.get("agree_terms") !== "yes") {
    return { error: "利用規約とプライバシーポリシーへの同意が必要です。" };
  }
  if (role === "craftsman" && formData.get("agree_payment_agency") !== "yes") {
    return { error: "和裁士として登録するには、代金の受け取りに関する同意（利用規約第5条）が必要です。" };
  }

  const supabase = await createClient();

  // Email+password only, no magic link: a public signup form would blow
  // through Supabase's shared per-project email-send cap in minutes.
  // Requires "Confirm email" turned OFF in Supabase Auth settings so this
  // returns an active session immediately (see README).
  // The consent record lives in the auth user's metadata rather than a table
  // column, so it needs no schema migration and is written in the same call
  // that creates the account — there's no window where a user exists
  // without it. payment_agency_agreed_at is the craftsman's grant of
  // authority to collect payment on their behalf (terms 第5条); craftsmen
  // registered before this existed give it on /dashboard/payouts instead.
  const agreedAt = new Date().toISOString();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        terms_version: TERMS_VERSION,
        terms_agreed_at: agreedAt,
        ...(role === "craftsman" ? { payment_agency_agreed_at: agreedAt } : {}),
      },
    },
  });

  if (error) {
    return { error: signupErrorMessage(error.code, error.message) };
  }
  if (!data.user) {
    return { error: "登録に失敗しました。時間をおいて再度お試しください。" };
  }
  if (!data.session) {
    return {
      error:
        "確認メールを送信しました。メール内のリンクから確認後、ログインしてください（Supabase側でConfirm emailが有効になっています）。",
    };
  }

  const { error: profileError } = await supabase.from("profiles").insert({
    id: data.user.id,
    role,
    display_name: displayName,
    prefecture: prefecture || null,
  });

  if (profileError) {
    return { error: `プロフィール作成に失敗しました: ${profileError.message}` };
  }

  if (role === "craftsman") {
    const { error: craftsmanError } = await supabase.from("craftsman_profiles").insert({
      profile_id: data.user.id,
    });
    if (craftsmanError) {
      return { error: `和裁士プロフィール作成に失敗しました: ${craftsmanError.message}` };
    }
  }

  redirect("/dashboard");
}

// Supabase's auth errors are English; show the ones a user can actually hit
// here in Japanese, and fall back to the raw message for anything else.
function signupErrorMessage(code: string | undefined, message: string): string {
  switch (code) {
    case "user_already_exists":
    case "email_exists":
      return "このメールアドレスはすでに登録されています。ログインしてください。";
    case "email_address_invalid":
      return "メールアドレスの形式が正しくありません。";
    case "weak_password":
      return "パスワードが弱すぎます。別のパスワードにしてください。";
    case "over_request_rate_limit":
      return "短時間に操作が集中しています。しばらく時間をおいて再度お試しください。";
    case "signup_disabled":
      return "現在、新規登録を受け付けていません。";
    default:
      return `登録に失敗しました（${message}）`;
  }
}
