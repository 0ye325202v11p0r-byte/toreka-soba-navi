"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { GradeRequirement } from "@/lib/types";

const GRADE_REQUIREMENTS: GradeRequirement[] = ["1級", "2級", "3級", "その他資格"];

export interface RequestFormState {
  error?: string;
}

export async function createRequest(
  _prevState: RequestFormState,
  formData: FormData
): Promise<RequestFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です。" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "client") {
    return { error: "依頼者アカウントのみ依頼を投稿できます。" };
  }

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const garmentType = String(formData.get("garment_type") ?? "").trim();
  const budgetMinRaw = String(formData.get("budget_min") ?? "").trim();
  const budgetMaxRaw = String(formData.get("budget_max") ?? "").trim();
  const deadline = String(formData.get("deadline") ?? "").trim();
  const minGradeRaw = String(formData.get("min_grade") ?? "").trim();
  const minGrade = GRADE_REQUIREMENTS.includes(minGradeRaw as GradeRequirement)
    ? (minGradeRaw as GradeRequirement)
    : null;

  if (!title || !description || !garmentType) {
    return { error: "タイトル・説明・着物の種類は必須です。" };
  }

  const { data: request, error } = await supabase
    .from("requests")
    .insert({
      client_id: user.id,
      title,
      description,
      garment_type: garmentType,
      budget_min: budgetMinRaw ? Number(budgetMinRaw) : null,
      budget_max: budgetMaxRaw ? Number(budgetMaxRaw) : null,
      deadline: deadline || null,
      min_grade: minGrade,
      status: "open",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  redirect(`/requests/${request.id}`);
}
