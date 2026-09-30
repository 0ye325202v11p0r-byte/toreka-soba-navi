"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { isStripeConfigured, isValidOrderPrice, MIN_ORDER_PRICE } from "@/lib/stripe";
import { createCheckoutSessionUrl } from "@/lib/orderPayment";
import { GRADE_RANK, type Grade, type GradeRequirement } from "@/lib/types";
import { notify } from "@/lib/notifications";
import { containsContactInfo, CONTACT_INFO_ERROR } from "@/lib/contactInfoFilter";
import { checkCraftsmanCanAcceptWork } from "@/lib/capacity";

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
  const deliveryDays = Number(formData.get("delivery_days"));

  if (!requestId) return { error: "依頼が見つかりません。" };
  if (!isValidOrderPrice(price)) return { error: `見積り価格は${MIN_ORDER_PRICE}円以上の整数で入力してください。` };
  // Shown to the client as the 提供時期 before they pay (特定商取引法12条の6).
  if (!Number.isInteger(deliveryDays) || deliveryDays < 1 || deliveryDays > 365) {
    return { error: "納期目安は1〜365日の整数で入力してください。" };
  }
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
    .select("grade")
    .eq("profile_id", user.id)
    .maybeSingle();

  const capacityCheck = await checkCraftsmanCanAcceptWork(supabase, user.id);
  if (!capacityCheck.ok) return { error: capacityCheck.reason };

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
    delivery_days: deliveryDays,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "この依頼にはすでに提案済みです。" };
    }
    return { error: error.message };
  }

  await notify({
    userId: request.client_id,
    type: "proposal_received",
    title: "新しい提案が届きました",
    body: request.title,
    link: `/requests/${requestId}`,
  });

  revalidatePath(`/requests/${requestId}`);
  return {};
}

export interface CounterProposalState {
  error?: string;
}

// The client's one counter-offer against a pending proposal. Deliberately
// one round only (see supabase/schema.sql Phase 14) — the craftsman then
// just accepts or declines the countered price via respondProposal, rather
// than the two sides being able to bounce offers back and forth forever.
export async function counterProposal(
  _prevState: CounterProposalState,
  formData: FormData
): Promise<CounterProposalState> {
  const proposalId = String(formData.get("proposal_id") ?? "");
  const counteredPrice = Number(formData.get("countered_price"));
  const counteredMessage = String(formData.get("countered_message") ?? "").trim();

  if (!proposalId) return { error: "提案が見つかりません。" };
  if (!isValidOrderPrice(counteredPrice)) {
    return { error: `提示価格は${MIN_ORDER_PRICE}円以上の整数で入力してください。` };
  }
  if (containsContactInfo(counteredMessage)) return { error: CONTACT_INFO_ERROR };

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
  if (!proposal) return { error: "提案が見つかりません。" };
  if (proposal.status !== "pending") return { error: "この提案には交渉できません。" };

  const { data: request } = await supabase
    .from("requests")
    .select("client_id, title")
    .eq("id", proposal.request_id)
    .maybeSingle();
  if (!request || request.client_id !== user.id) {
    return { error: "この操作を行う権限がありません。" };
  }

  const { error } = await supabase
    .from("proposals")
    .update({ status: "countered", countered_price: counteredPrice, countered_message: counteredMessage || null })
    .eq("id", proposalId);
  if (error) return { error: error.message };

  await notify({
    userId: proposal.craftsman_id,
    type: "proposal_countered",
    title: "価格交渉の提案が届きました",
    body: request.title,
    link: `/requests/${proposal.request_id}`,
  });

  revalidatePath(`/requests/${proposal.request_id}`);
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
    .select("id, request_id, craftsman_id, price, status, countered_price")
    .eq("id", proposalId)
    .maybeSingle();

  if (proposalFetchError || !proposal) return { error: "提案が見つかりません。" };
  if (proposal.status !== "pending" && proposal.status !== "countered") {
    return { error: "この提案はすでに処理済みです。" };
  }

  // A plain "pending" proposal is the client's call (accept/decline the
  // craftsman's asking price). Once the client has countered, the ball is in
  // the craftsman's court — they accept/decline the countered price instead.
  const isCountered = proposal.status === "countered";

  const { data: request, error: requestFetchError } = await supabase
    .from("requests")
    .select("id, client_id, title, garment_type, status, deadline")
    .eq("id", proposal.request_id)
    .maybeSingle();
  if (requestFetchError || !request) return { error: "依頼が見つかりません。" };

  const actorIsAllowed = isCountered
    ? proposal.craftsman_id === user.id
    : request.client_id === user.id;
  if (!actorIsAllowed) return { error: "この操作を行う権限がありません。" };

  if (decision === "accepted" && !isStripeConfigured()) {
    return { error: "決済機能は準備中です。しばらくお待ちください。" };
  }
  if (decision === "accepted") {
    const capacityCheck = await checkCraftsmanCanAcceptWork(supabase, proposal.craftsman_id);
    if (!capacityCheck.ok) return { error: capacityCheck.reason };
  }

  const finalPrice = isCountered ? proposal.countered_price! : proposal.price;

  // Accepting writes rows the actor doesn't own under RLS — when a craftsman
  // accepts a counter-offer, the order belongs to the client and the
  // request is the client's too — and a proposal's price is immutable for
  // either party (Phase 29 in supabase/schema.sql). So the accept path runs
  // on the service-role client, after the authorization checks above; a
  // plain decline only touches the proposal and stays on the user's own.
  const writer = decision === "accepted" ? adminClient() : supabase;

  // Conditional on the status read above, so a double-submit (or both
  // parties acting at once) can't create a second order for one proposal.
  const { data: updatedProposal, error: updateError } = await writer
    .from("proposals")
    .update(isCountered ? { status: decision, price: finalPrice } : { status: decision })
    .eq("id", proposalId)
    .eq("status", proposal.status)
    .select("id")
    .maybeSingle();
  if (updateError) return { error: updateError.message };
  if (!updatedProposal) return { error: "この提案はすでに処理済みです。" };

  if (decision === "accepted") {
    const { data: order, error: orderError } = await writer
      .from("orders")
      .insert({
        client_id: request.client_id,
        craftsman_id: proposal.craftsman_id,
        request_id: request.id,
        proposal_id: proposal.id,
        title: request.title,
        garment_type: request.garment_type,
        price: finalPrice,
        status: "pending_payment",
        desired_by: request.deadline,
        // Proposals have no 修正回数 field; one round of changes, same as a
        // listing's default (Phase 30).
        revision_limit: 1,
      })
      .select("id, title, price")
      .single();
    if (orderError) return { error: orderError.message };

    await writer.from("requests").update({ status: "matched" }).eq("id", request.id);
    // Decline every other still-pending proposal on this request now that
    // it's matched — best-effort cleanup, not required for correctness
    // (the request's own status already stops new proposals).
    await writer
      .from("proposals")
      .update({ status: "declined" })
      .eq("request_id", request.id)
      .in("status", ["pending", "countered"]);

    await notify({
      // A plain accept is the client accepting the craftsman's asking price
      // (notify the craftsman); accepting a counter is the craftsman
      // agreeing to the client's counter-offer (notify the client instead).
      userId: isCountered ? request.client_id : proposal.craftsman_id,
      type: "proposal_accepted",
      title: isCountered ? "交渉価格が承諾されました" : "提案が承諾されました",
      body: request.title,
      link: `/orders/${order.id}`,
    });

    // Only the client pays. When the craftsman is the one accepting (a
    // counter-offer), send them to the new order instead — the client gets
    // the notification above and pays from the order page.
    if (isCountered) redirect(`/orders/${order.id}`);
    const checkoutUrl = await createCheckoutSessionUrl(supabase, order);
    redirect(checkoutUrl);
  } else {
    await notify({
      userId: isCountered ? request.client_id : proposal.craftsman_id,
      type: "proposal_declined",
      title: isCountered ? "交渉価格が見送られました" : "提案が見送られました",
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
  if (proposal.status !== "pending" && proposal.status !== "countered") {
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

export interface CloseRequestState {
  error?: string;
}

// The client's way to take their own request off the board (found nobody,
// changed their mind, sorted it elsewhere) — without it an unanswered
// request stayed "募集中" forever. Only an open request: a matched one has
// an order, which has its own cancel rules. Any quotes still waiting are
// declined so the craftsmen who sent them aren't left hanging.
export async function closeRequest(_prevState: CloseRequestState, formData: FormData): Promise<CloseRequestState> {
  const requestId = String(formData.get("request_id") ?? "");
  if (!requestId) return { error: "依頼が見つかりません。" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です。" };

  // Conditional on still being open, so a craftsman accepting a counter-offer
  // at the same moment (which matches the request) wins cleanly.
  const { data: closed, error } = await supabase
    .from("requests")
    .update({ status: "closed" })
    .eq("id", requestId)
    .eq("client_id", user.id)
    .eq("status", "open")
    .select("id, title")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!closed) return { error: "この依頼は締め切れません（すでに成立または終了しています）。" };

  const { data: waiting } = await supabase
    .from("proposals")
    .update({ status: "declined" })
    .eq("request_id", requestId)
    .in("status", ["pending", "countered"])
    .select("craftsman_id");
  for (const p of waiting ?? []) {
    await notify({
      userId: p.craftsman_id,
      type: "request_closed",
      title: "提案した依頼が締め切られました",
      body: closed.title,
      link: `/requests/${requestId}`,
    });
  }

  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/requests");
  revalidatePath("/dashboard");
  return {};
}
