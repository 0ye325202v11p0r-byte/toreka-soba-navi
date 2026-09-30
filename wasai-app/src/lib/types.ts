export type Role = "client" | "craftsman";

export type Grade = "1級" | "2級" | "3級" | "その他資格" | "資格なし";

// Lower index = higher qualification. A craftsman satisfies a request's
// min_grade requirement when their own rank is <= the requirement's rank.
export const GRADE_RANK: Record<Grade, number> = {
  "1級": 0,
  "2級": 1,
  "3級": 2,
  その他資格: 3,
  資格なし: 4,
};

// Subset of Grade that a request can require (excludes "資格なし" — a
// request can't require the absence of a qualification).
export type GradeRequirement = "1級" | "2級" | "3級" | "その他資格";

export interface Profile {
  id: string;
  role: Role;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  prefecture: string | null;
  created_at: string;
}

export interface CraftsmanProfile {
  profile_id: string;
  grade: Grade | null;
  years_experience: number | null;
  specialties: string[];
  portfolio_urls: string[];
  is_accepting_orders: boolean;
  max_concurrent_orders: number | null;
  stripe_account_id: string | null;
  stripe_transfers_enabled: boolean;
  certificate_url: string | null;
  grade_verified: boolean;
  grade_verified_at: string | null;
  updated_at: string;
}

// Columns of craftsman_profiles anyone may read (Phase 32 in
// supabase/schema.sql grants SELECT on exactly these to anon/authenticated).
// stripe_account_id, stripe_transfers_enabled and certificate_url are the
// craftsman's and the operator's only — read them with the service-role
// client after checking who's asking.
export const CRAFTSMAN_PUBLIC_COLUMNS =
  "profile_id, grade, years_experience, specialties, portfolio_urls, is_accepting_orders, max_concurrent_orders, grade_verified, grade_verified_at, updated_at";
export type CraftsmanPublicProfile = Omit<
  CraftsmanProfile,
  "stripe_account_id" | "stripe_transfers_enabled" | "certificate_url"
>;

export interface CraftsmanRate {
  id: string;
  craftsman_id: string;
  garment_type: string;
  price: number;
  created_at: string;
}

export type ServiceStatus = "draft" | "published";

export interface Service {
  id: string;
  craftsman_id: string;
  title: string;
  description: string;
  garment_type: string;
  price: number;
  delivery_days: number;
  revision_count: number;
  status: ServiceStatus;
  created_at: string;
  updated_at: string;
}

export type RequestStatus = "open" | "matched" | "closed";

export interface JobRequest {
  id: string;
  client_id: string;
  title: string;
  description: string;
  garment_type: string;
  budget_min: number | null;
  budget_max: number | null;
  deadline: string | null;
  min_grade: GradeRequirement | null;
  status: RequestStatus;
  created_at: string;
}

export type ProposalStatus = "pending" | "accepted" | "declined" | "withdrawn" | "countered";

export interface Proposal {
  id: string;
  request_id: string;
  craftsman_id: string;
  price: number;
  message: string;
  status: ProposalStatus;
  countered_price: number | null;
  countered_message: string | null;
  // Phase 31: the craftsman's 納期目安 in days; null on proposals made
  // before it existed.
  delivery_days: number | null;
  created_at: string;
}

export type OrderStatus = "pending_payment" | "in_progress" | "delivered" | "completed" | "cancelled";
export type PaymentStatus = "unpaid" | "paid" | "transferred" | "refunded";

export interface Order {
  id: string;
  client_id: string;
  craftsman_id: string;
  service_id: string | null;
  request_id: string | null;
  proposal_id: string | null;
  title: string;
  garment_type: string | null;
  price: number;
  status: OrderStatus;
  payment_status: PaymentStatus;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_transfer_id: string | null;
  shipping_method: string | null;
  tracking_number: string | null;
  declared_value: number | null;
  desired_by: string | null;
  platform_fee_amount: number | null;
  fabric_check_completed_at: string | null;
  fabric_check_approved_at: string | null;
  spec_confirmation_text: string | null;
  spec_confirmed_at: string | null;
  spec_approved_at: string | null;
  fabric_check_damage: boolean;
  fabric_check_shortage: boolean;
  fabric_check_odor: boolean;
  fabric_check_notes: string | null;
  fabric_check_photo_urls: string[];
  created_at: string;
  completed_at: string | null;
  delivered_at: string | null;
  // Phase 30: how many times the client may send a delivered order back for
  // changes, how many they've used, and when they asked the operator to step
  // in (a disputed order is never auto-completed).
  revision_limit: number;
  revision_requests_used: number;
  disputed_at: string | null;
}

export interface Message {
  id: string;
  order_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface Review {
  id: string;
  order_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export const GARMENT_TYPES = [
  "振袖",
  "訪問着",
  "留袖",
  "小紋",
  "浴衣",
  "男物",
  "羽織・コート",
  "帯",
  "寸法直し・お直し",
  "その他",
] as const;

export const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
] as const;
