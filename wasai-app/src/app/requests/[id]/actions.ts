"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
    .select("status")
    .eq("id", requestId)
    .maybeSingle();
  if (!request || request.status !== "open") {
    return { error: "この依頼は現在提案を受け付けていません。" };
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

  const { data: request, error: requestFetchError } = await supabase
    .from("requests")
    .select("id, client_id, title, status")
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
    const { error: orderError } = await supabase.from("orders").insert({
      client_id: request.client_id,
      craftsman_id: proposal.craftsman_id,
      request_id: request.id,
      proposal_id: proposal.id,
      title: request.title,
      price: proposal.price,
      status: "in_progress",
    });
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
  }

  revalidatePath(`/requests/${proposal.request_id}`);
  return {};
}
