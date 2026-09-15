export type Role = "client" | "craftsman";

export type Grade = "1級" | "2級" | "3級" | "その他資格" | "資格なし";

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
  updated_at: string;
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
  status: RequestStatus;
  created_at: string;
}

export type ProposalStatus = "pending" | "accepted" | "declined" | "withdrawn";

export interface Proposal {
  id: string;
  request_id: string;
  craftsman_id: string;
  price: number;
  message: string;
  status: ProposalStatus;
  created_at: string;
}

export type OrderStatus = "in_progress" | "delivered" | "completed" | "cancelled";

export interface Order {
  id: string;
  client_id: string;
  craftsman_id: string;
  service_id: string | null;
  request_id: string | null;
  proposal_id: string | null;
  title: string;
  price: number;
  status: OrderStatus;
  created_at: string;
  completed_at: string | null;
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
  craftsman_id: string;
  rating: number;
  comment: string | null;
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
