"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/adminAuth";

export interface InquiryStatusState {
  error?: string;
}

export async function setInquiryStatus(_prevState: InquiryStatusState, formData: FormData): Promise<InquiryStatusState> {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || (status !== "open" && status !== "closed")) return { error: "不正なリクエストです。" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdminUser(user?.email)) return { error: "権限がありません。" };

  const { error } = await adminClient().from("inquiries").update({ status }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/inquiries");
  return {};
}
