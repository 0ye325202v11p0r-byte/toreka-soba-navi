"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { containsContactInfo, CONTACT_INFO_ERROR } from "@/lib/contactInfoFilter";
import { notify } from "@/lib/notifications";
import { checkCraftsmanCanAcceptWork } from "@/lib/capacity";
import { GRADE_RANK, type Grade, type GradeRequirement } from "@/lib/types";

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
  if (containsContactInfo(title) || containsContactInfo(description)) {
    return { error: CONTACT_INFO_ERROR };
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

  // Until now, a newly posted request had zero passive discovery for
  // craftsmen — they had to browse /requests themselves to notice it. Notify
  // craftsmen whose specialties/grade/capacity actually match, using the
  // same eligibility check submitProposal enforces server-side — no point
  // notifying someone who's full and would just be rejected if they tried.
  const { data: matchingCraftsmen } = await supabase
    .from("craftsman_profiles")
    .select("profile_id, grade")
    .contains("specialties", [garmentType]);

  const gradeEligible = (matchingCraftsmen ?? []).filter((c) => {
    if (!minGrade) return true;
    const grade = c.grade as Grade | null;
    return grade != null && GRADE_RANK[grade] <= GRADE_RANK[minGrade];
  });
  const capacityResults = await Promise.all(
    gradeEligible.map((c) => checkCraftsmanCanAcceptWork(supabase, c.profile_id))
  );
  const eligibleCraftsmen = gradeEligible.filter((_, i) => capacityResults[i].ok);

  await Promise.all(
    eligibleCraftsmen.map((c) =>
      notify(supabase, {
        userId: c.profile_id,
        type: "new_matching_request",
        title: "条件に合う新しい依頼が届きました",
        body: title,
        link: `/requests/${request.id}`,
      })
    )
  );

  redirect(`/requests/${request.id}`);
}
