"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";

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

  const supabase = await createClient();

  // Email+password only, no magic link: a public signup form would blow
  // through Supabase's shared per-project email-send cap in minutes.
  // Requires "Confirm email" turned OFF in Supabase Auth settings so this
  // returns an active session immediately (see README).
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { error: error.message };
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
