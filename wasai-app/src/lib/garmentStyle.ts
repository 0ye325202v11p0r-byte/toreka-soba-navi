// One soft color per garment type, so lists of listings/requests aren't a
// wall of black-on-white — there are no product photos to tell cards apart
// the way ココナラ's thumbnails do. Every fg/bg pair is >=5.4:1 and every fg
// is >=6.1:1 on white (WCAG AA for small text).
const STYLES: Record<string, { bg: string; fg: string }> = {
  振袖: { bg: "#fde8ef", fg: "#a3214f" },
  訪問着: { bg: "#f1e9fb", fg: "#6b3fa0" },
  留袖: { bg: "#e8edf7", fg: "#2f4a7f" },
  小紋: { bg: "#e7f4ec", fg: "#2c6e46" },
  浴衣: { bg: "#e5f2fb", fg: "#1d5f8f" },
  男物: { bg: "#eceff3", fg: "#45505e" },
  "羽織・コート": { bg: "#f5ece3", fg: "#7a4a22" },
  帯: { bg: "#fbf3dc", fg: "#7a5a00" },
  "寸法直し・お直し": { bg: "#e4f4f3", fg: "#1f6b66" },
};
const FALLBACK = { bg: "#f0f0f0", fg: "#555555" };

export function garmentStyle(garmentType: string): { bg: string; fg: string } {
  return STYLES[garmentType] ?? FALLBACK;
}
