import * as ImageManipulator from 'expo-image-manipulator';

/** Max width sent to API — server re-compresses again as a safety net. */
const SELFIE_MAX_WIDTH = 640;
const SELFIE_JPEG_QUALITY = 0.72;

/**
 * Resize + compress a camera capture before base64 upload.
 * Cuts mobile payload from ~2–5 MB to ~50–120 KB on typical phones.
 */
export async function prepareSelfieForUpload(photoUri) {
  if (!photoUri) return null;
  const result = await ImageManipulator.manipulateAsync(
    photoUri,
    [{ resize: { width: SELFIE_MAX_WIDTH } }],
    {
      compress: SELFIE_JPEG_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    },
  );
  return result.base64 || null;
}

export function newPunchRequestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
