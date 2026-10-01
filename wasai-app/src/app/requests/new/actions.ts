"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { containsContactInfo, CONTACT_INFO_ERROR } from "@/lib/contactInfoFilter";
import { notify } from "@/lib/notifications";
import { checkCraftsmanCanAcceptWork } from "@/lib/capacity";
import { parseMeasurements } from "@/lib/measurements";
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

  const measurements = parseMeasurements(formData);
  if (measurements.error) return { error: measurements.error };
  if (measurements.value?.note && containsContactInfo(measurements.value.note)) {
    return { error: CONTACT_INFO_ERROR };
  }

  // 指名依頼 (「この和裁士に相談する」): only that craftsman sees it and can
  // propose — enforced by requests_select_visible / proposals_insert_own
  // (Phase 33), checked here so the client gets a readable error.
  const directedTo = String(formData.get("directed_to") ?? "").trim() || null;
  if (directedTo) {
    const { data: target } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", directedTo)
      .maybeSingle();
    if (!target || target.role !== "craftsman") return { error: "相談先の和裁士が見つかりません。" };
    const capacity = await checkCraftsmanCanAcceptWork(supabase, directedTo);
    if (!capacity.ok) return { error: capacity.reason };
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
      // A grade filter means nothing on a request only one craftsman sees.
      min_grade: directedTo ? null : minGrade,
      status: "open",
      directed_to: directedTo,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  if (measurements.value) {
    // Best-effort: the request itself is posted either way, and the craftsman
    // can still ask for sizes in the messages.
    await supabase.from("request_measurements").insert({
      request_id: request.id,
      client_id: user.id,
      ...measurements.value,
    });
  }

  if (directedTo) {
    await notify({
      userId: directedTo,
      type: "directed_request",
      title: "あなたへの相談が届きました",
      body: title,
      link: `/requests/${request.id}`,
    });
    redirect(`/requests/${request.id}`);
  }

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
      notify({
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
