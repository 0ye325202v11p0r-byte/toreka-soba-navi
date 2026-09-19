"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateUploadedFile, uploadUserFile, publicUrlFor } from "@/lib/storage";

export interface UploadState {
  error?: string;
}

export async function uploadAvatar(_prevState: UploadState, formData: FormData): Promise<UploadState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "画像を選択してください。" };

  const validationError = validateUploadedFile(file, "image");
  if (validationError) return { error: validationError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です。" };

  try {
    const path = await uploadUserFile(supabase, "avatars", user.id, file);
    const url = publicUrlFor(supabase, "avatars", path);
    const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
    if (error) return { error: error.message };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "アップロードに失敗しました。" };
  }

  revalidatePath("/dashboard/profile");
  return {};
}

export async function addPortfolioPhoto(_prevState: UploadState, formData: FormData): Promise<UploadState> {
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "写真を選択してください。" };

  for (const file of files) {
    const validationError = validateUploadedFile(file, "image");
    if (validationError) return { error: validationError };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です。" };

  const { data: craftsmanProfile } = await supabase
    .from("craftsman_profiles")
    .select("portfolio_urls")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!craftsmanProfile) return { error: "和裁士プロフィールが見つかりません。" };

  try {
    const newUrls: string[] = [];
    for (const file of files) {
      const path = await uploadUserFile(supabase, "portfolio", user.id, file);
      newUrls.push(publicUrlFor(supabase, "portfolio", path));
    }
    const { error } = await supabase
      .from("craftsman_profiles")
      .update({ portfolio_urls: [...craftsmanProfile.portfolio_urls, ...newUrls] })
      .eq("profile_id", user.id);
    if (error) return { error: error.message };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "アップロードに失敗しました。" };
  }

  revalidatePath("/dashboard/profile");
  return {};
}

export async function uploadCertificate(_prevState: UploadState, formData: FormData): Promise<UploadState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "ファイルを選択してください。" };

  const validationError = validateUploadedFile(file, "certificate");
  if (validationError) return { error: validationError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です。" };

  try {
    // Stored as a private-bucket path, not a public URL — certificates can
    // carry a name/DOB, so only the owner and an admin (via a service-role
    // signed URL) should ever be able to view it. Overwriting the same
    // profile_id's certificate_url column with a new path (rather than
    // upsert-in-place) also naturally trips the grade_verified reset
    // trigger, same as the old URL-paste flow did.
    const path = await uploadUserFile(supabase, "certificates", user.id, file);
    const { error } = await supabase
      .from("craftsman_profiles")
      .update({ certificate_url: path })
      .eq("profile_id", user.id);
    if (error) return { error: error.message };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "アップロードに失敗しました。" };
  }

  revalidatePath("/dashboard/profile");
  return {};
}
