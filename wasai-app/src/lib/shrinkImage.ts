// Runs in the browser, before an upload. Phone photos are typically 2–5MB,
// but a Server Action accepts 1MB by default (raised to 4mb in
// next.config.ts — Vercel itself refuses request bodies over 4.5MB), and a
// too-large upload failed with a bare 500 and no message. Scaling to 1600px
// on the long side (plenty for any place a photo is shown here) as JPEG
// brings a phone photo to a few hundred KB.
const MAX_SIDE = 1600;
const QUALITY = 0.85;
const KEEP_IF_UNDER = 900 * 1024;

export async function shrinkImage(file: File): Promise<File> {
  // GIFs may be animated; anything else that isn't an image is left alone.
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= KEEP_IF_UNDER) {
    bitmap.close();
    return file;
  }
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  // JPEG has no transparency — put transparent PNGs on white, not black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]*$/, "") + ".jpg", { type: "image/jpeg" });
}

export function shrinkImages(files: FileList | File[]): Promise<File[]> {
  return Promise.all(Array.from(files).map(shrinkImage));
}

// For a file input that's submitted with its <form>: swap its files for the
// shrunk ones so the form sends those.
export async function shrinkInputFiles(input: HTMLInputElement): Promise<void> {
  if (!input.files?.length) return;
  const shrunk = await shrinkImages(input.files);
  const dt = new DataTransfer();
  for (const f of shrunk) dt.items.add(f);
  input.files = dt.files;
}
