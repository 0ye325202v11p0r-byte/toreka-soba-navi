import { garmentStyle } from "@/lib/garmentStyle";

export default function GarmentChip({ garmentType }: { garmentType: string }) {
  const { bg, fg } = garmentStyle(garmentType);
  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: bg, color: fg }}
    >
      {garmentType}
    </span>
  );
}
