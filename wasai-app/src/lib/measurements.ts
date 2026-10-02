// The body measurements a client can give with a request (Phase 33,
// request_measurements). Which ones and how to measure follow a kimono
// shop's published tailoring guide (きもの町「お仕立て寸法」): women 身長・
// ヒップ・バスト・裄; men 身長・裄・ウエスト・ヒップ, or 身長 and 体型 alone;
// the rest (前巾・後巾 …) the craftsman works out from the hip. Ranges must
// match the check constraints on the table.
export const MEASUREMENT_FIELDS = [
  { key: "height_cm", label: "身長", hint: "そのままの身長です。", min: 50, max: 250 },
  {
    key: "yuki_cm",
    label: "裄（ゆき）",
    hint: "腕を斜め下に軽く下げ、首の後ろの骨（ぐりぐり）から肩を通って、手首の骨（ぐりぐり）までの長さです。",
    min: 20,
    max: 100,
  },
  { key: "hip_cm", label: "ヒップ", hint: "腰回りのいちばん太いところです。", min: 30, max: 250 },
  { key: "bust_cm", label: "バスト", hint: "女性の着物で使います。", min: 30, max: 250 },
  { key: "waist_cm", label: "ウエスト", hint: "男性の着物で使います。", min: 30, max: 250 },
] as const;

export type MeasurementKey = (typeof MEASUREMENT_FIELDS)[number]["key"];
export const BUILD_OPTIONS = ["細身", "普通", "ふくよか"] as const;

export interface RequestMeasurements {
  height_cm: number | null;
  yuki_cm: number | null;
  hip_cm: number | null;
  bust_cm: number | null;
  waist_cm: number | null;
  build: (typeof BUILD_OPTIONS)[number] | null;
  note: string | null;
}

// Reads the measurement inputs of the request form. Returns null when none
// were filled in, an error message for a value outside its range.
export function parseMeasurements(formData: FormData): { value: RequestMeasurements | null; error?: string } {
  const value: RequestMeasurements = {
    height_cm: null,
    yuki_cm: null,
    hip_cm: null,
    bust_cm: null,
    waist_cm: null,
    build: null,
    note: null,
  };
  let any = false;
  for (const f of MEASUREMENT_FIELDS) {
    const raw = String(formData.get(f.key) ?? "").trim();
    if (!raw) continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < f.min || n > f.max) {
      return { value: null, error: `${f.label}は${f.min}〜${f.max}cmの数字で入力してください。` };
    }
    value[f.key] = Math.round(n * 10) / 10;
    any = true;
  }
  const build = String(formData.get("build") ?? "");
  if ((BUILD_OPTIONS as readonly string[]).includes(build)) {
    value.build = build as RequestMeasurements["build"];
    any = true;
  }
  const note = String(formData.get("measurement_note") ?? "").trim();
  if (note) {
    if (note.length > 500) return { value: null, error: "寸法のメモは500文字以内で入力してください。" };
    value.note = note;
    any = true;
  }
  return { value: any ? value : null };
}

// Which measurements a request must include (trial feedback: some are
// needed to tailor at all). Same source as above — きもの町 lists women's
// 身長・ヒップ・バスト・裄 and men's 身長・裄・ウエスト・ヒップ as the
// required items, and for men who don't know them, 身長 and 体型 alone.
// Only for making a kimono from scratch: 浴衣 can be either, and 帯・羽織・
// コート・寸法直し・その他 don't follow this list, so they stay optional.
export type MeasurementRequirement = "women" | "men" | "either" | "none";

const WOMEN_KEYS: MeasurementKey[] = ["height_cm", "yuki_cm", "hip_cm", "bust_cm"];
const MEN_KEYS: MeasurementKey[] = ["height_cm", "yuki_cm", "waist_cm", "hip_cm"];

export function measurementRequirement(garmentType: string): MeasurementRequirement {
  if (["振袖", "訪問着", "留袖", "小紋"].includes(garmentType)) return "women";
  if (garmentType === "男物") return "men";
  if (garmentType === "浴衣") return "either";
  return "none";
}

// Keys the browser itself should insist on (the rest of the men's rule —
// 身長+体型 instead of the full set — is checked on the server).
export function browserRequiredKeys(req: MeasurementRequirement): MeasurementKey[] {
  if (req === "women") return WOMEN_KEYS;
  if (req === "men" || req === "either") return ["height_cm"];
  return [];
}

export function measurementRequirementText(garmentType: string): string | null {
  switch (measurementRequirement(garmentType)) {
    case "women":
      return `${garmentType}の仕立てには、身長・裄・ヒップ・バストが必要です。`;
    case "men":
      return "男物の仕立てには、身長・裄・ウエスト・ヒップが必要です。わからない場合は、身長と体型だけでも大丈夫です。";
    case "either":
      return "浴衣の仕立てには、女性用なら身長・裄・ヒップ・バスト、男性用なら身長・裄・ウエスト・ヒップ（わからなければ身長と体型）が必要です。";
    default:
      return null;
  }
}

// Returns the error to show, or null when the required measurements are in.
export function checkRequiredMeasurements(garmentType: string, m: RequestMeasurements | null): string | null {
  const req = measurementRequirement(garmentType);
  if (req === "none") return null;
  const has = (keys: MeasurementKey[]) => keys.every((k) => m?.[k] != null);
  const women = has(WOMEN_KEYS);
  const men = has(MEN_KEYS) || (m?.height_cm != null && m?.build != null);
  const ok = req === "women" ? women : req === "men" ? men : women || men;
  return ok ? null : measurementRequirementText(garmentType);
}
