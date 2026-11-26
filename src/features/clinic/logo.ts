export const LOGO_BUCKET = "clinic-logos";
export const LOGO_MAX_BYTES = 1024 * 1024;
export const LOGO_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const;

/** Public URL of a clinic logo stored in the public `clinic-logos` bucket (null when none is set). */
export function clinicLogoUrl(path: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!path || !base) return null;
  return `${base}/storage/v1/object/public/${LOGO_BUCKET}/${path}`;
}

/** Checks the first bytes so a renamed file cannot pass as an image. */
export function sniffImageType(bytes: Uint8Array): keyof typeof LOGO_TYPES | null {
  const at = (i: number) => bytes[i] ?? -1;
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return "image/png";
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  if (
    at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 &&
    at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50
  ) return "image/webp";
  return null;
}
