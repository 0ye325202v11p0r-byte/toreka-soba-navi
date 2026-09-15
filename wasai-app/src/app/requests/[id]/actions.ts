"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isStripeConfigured } from "@/lib/stripe";
import { createCheckoutSessionUrl } from "@/lib/orderPayment";
import { GRADE_RANK, type Grade, type GradeRequirement } from "@/lib/types";
import { notify } from "@/lib/notifications";
import { containsContactInfo, CONTACT_INFO_ERROR } from "@/lib/contactInfoFilter";

export interface ProposalFormState {
  error?: string;
}

export async function submitProposal(
  _prevState: ProposalFormState,
  formData: FormData
): Promise<ProposalFormState> {
  const requestId = String(formData.get("request_id") ?? "");
  const price = Number(formData.get("price"));
  const message = String(formData.get("message") ?? "").trim();

  if (!requestId) return { error: "依頼が見つかりません。" };
  if (!Number.isFinite(price) || price < 0) return { error: "見積り価格を正しく入力してください。" };
  if (!message) return { error: "提案メッセージを入力してください。" };
  if (containsContactInfo(message)) return { error: CONTACT_INFO_ERROR };

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
  if (profile?.role !== "craftsman") {
    return { error: "和裁士アカウントのみ提案できます。" };
  }

  const { data: request } = await supabase
    .from("requests")
    .select("client_id, title, status, min_grade")
    .eq("id", requestId)
    .maybeSingle();
  if (!request || request.status !== "open") {
    return { error: "この依頼は現在提案を受け付けていません。" };
  }

  const { data: craftsmanProfile } = await supabase
    .from("craftsman_profiles")
    .select("grade, is_accepting_orders")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (craftsmanProfile?.is_accepting_orders === false) {
    return { error: "新規受注を停止中は提案できません。プロフィールで設定を変更してください。" };
  }

  if (request.min_grade) {
    const myGrade = craftsmanProfile?.grade as Grade | null;
    const requiredGrade = request.min_grade as GradeRequirement;
    const meetsRequirement = myGrade != null && GRADE_RANK[myGrade] <= GRADE_RANK[requiredGrade];
    if (!meetsRequirement) {
      return { error: `この依頼は「${request.min_grade}」以上の資格級位を登録した和裁士のみ提案できます。` };
    }
  }

  const { error } = await supabase.from("proposals").insert({
    request_id: requestId,
    craftsman_id: user.id,
    price,
    message,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "この依頼にはすでに提案済みです。" };
    }
    return { error: error.message };
  }

  await notify(supabase, {
    userId: request.client_id,
    type: "proposal_received",
    title: "新しい提案が届きました",
    body: request.title,
    link: `/requests/${requestId}`,
  });

  revalidatePath(`/requests/${requestId}`);
  return {};
}

export interface RespondProposalState {
  error?: string;
}

export async function respondProposal(
  _prevState: RespondProposalState,
  formData: FormData
): Promise<RespondProposalState> {
  const proposalId = String(formData.get("proposal_id") ?? "");
  const decision = String(formData.get("decision") ?? "");

  if (!proposalId || (decision !== "accepted" && decision !== "declined")) {
    return { error: "不正なリクエストです。" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です。" };

  const { data: proposal, error: proposalFetchError } = await supabase
    .from("proposals")
    .select("id, request_id, craftsman_id, price, status")
    .eq("id", proposalId)
    .maybeSingle();

  if (proposalFetchError || !proposal) return { error: "提案が見つかりません。" };
  if (proposal.status !== "pending") return { error: "この提案はすでに処理済みです。" };

  if (decision === "accepted" && !isStripeConfigured()) {
    return { error: "決済機能は準備中です。しばらくお待ちください。" };
  }

  const { data: request, error: requestFetchError } = await supabase
    .from("requests")
    .select("id, client_id, title, garment_type, status")
    .eq("id", proposal.request_id)
    .maybeSingle();

  if (requestFetchError || !request || request.client_id !== user.id) {
    return { error: "この操作を行う権限がありません。" };
  }

  const { error: updateError } = await supabase
    .from("proposals")
    .update({ status: decision })
    .eq("id", proposalId);
  if (updateError) return { error: updateError.message };

  if (decision === "accepted") {
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        client_id: request.client_id,
        craftsman_id: proposal.craftsman_id,
        request_id: request.id,
        proposal_id: proposal.id,
        title: request.title,
        garment_type: request.garment_type,
        price: proposal.price,
        status: "pending_payment",
      })
      .select("id, title, price")
      .single();
    if (orderError) return { error: orderError.message };

    await supabase.from("requests").update({ status: "matched" }).eq("id", request.id);
    // Decline every other still-pending proposal on this request now that
    // it's matched — best-effort cleanup, not required for correctness
    // (the request's own status already stops new proposals).
    await supabase
      .from("proposals")
      .update({ status: "declined" })
      .eq("request_id", request.id)
      .eq("status", "pending");

    await notify(supabase, {
      userId: proposal.craftsman_id,
      type: "proposal_accepted",
      title: "提案が承諾されました",
      body: request.title,
      link: `/orders/${order.id}`,
    });

    const checkoutUrl = await createCheckoutSessionUrl(supabase, order);
    redirect(checkoutUrl);
  } else {
    await notify(supabase, {
      userId: proposal.craftsman_id,
      type: "proposal_declined",
      title: "提案が見送られました",
      body: request.title,
      link: `/requests/${proposal.request_id}`,
    });
  }

  revalidatePath(`/requests/${proposal.request_id}`);
  return {};
}

export interface WithdrawProposalState {
  error?: string;
}

export async function withdrawProposal(
  _prevState: WithdrawProposalState,
  formData: FormData
): Promise<WithdrawProposalState> {
  const proposalId = String(formData.get("proposal_id") ?? "");
  if (!proposalId) return { error: "提案が見つかりません。" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です。" };

  const { data: proposal } = await supabase
    .from("proposals")
    .select("id, request_id, craftsman_id, status")
    .eq("id", proposalId)
    .maybeSingle();

  if (!proposal || proposal.craftsman_id !== user.id) {
    return { error: "この操作を行う権限がありません。" };
  }
  if (proposal.status !== "pending") {
    return { error: "検討中の提案のみ取り下げできます。" };
  }

  const { error } = await supabase
    .from("proposals")
    .update({ status: "withdrawn" })
    .eq("id", proposalId);
  if (error) return { error: error.message };

  revalidatePath(`/requests/${proposal.request_id}`);
  return {};
}
