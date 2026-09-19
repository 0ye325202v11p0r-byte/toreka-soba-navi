import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
// Certificates are often scanned as PDF, not just photographed.
const ALLOWED_CERTIFICATE_TYPES = [...ALLOWED_IMAGE_TYPES, "application/pdf"];

export function validateUploadedFile(
  file: File,
  kind: "image" | "certificate"
): string | null {
  if (file.size > MAX_FILE_SIZE) return "ファイルサイズは5MB以下にしてください。";
  const allowed = kind === "certificate" ? ALLOWED_CERTIFICATE_TYPES : ALLOWED_IMAGE_TYPES;
  if (!allowed.includes(file.type)) {
    return kind === "certificate"
      ? "対応形式はJPEG・PNG・WebP・GIF・PDFです。"
      : "対応形式はJPEG・PNG・WebP・GIFです。";
  }
  return null;
}

// Object names are namespaced "{userId}/..." so storage RLS policies can
// check (storage.foldername(name))[1] = auth.uid() — every bucket here
// follows that convention.
export async function uploadUserFile(
  supabase: SupabaseClient,
  bucket: string,
  userId: string,
  file: File
): Promise<string> {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const path = `${userId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return path;
}

export function publicUrlFor(supabase: SupabaseClient, bucket: string, path: string): string {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
