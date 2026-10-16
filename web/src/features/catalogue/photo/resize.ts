/** Long side of the image sent: the server makes the final WebP of 1600 px (spec W12, section 4). */
export const UPLOAD_MAX_SIDE = 2048;
const JPEG_QUALITY = 0.85;

/** The browser cannot decode the file: shown as `photo_unreadable`, nothing is uploaded. */
export class PhotoResizeError extends Error {
  constructor() {
    super('photo_unreadable');
    this.name = 'PhotoResizeError';
  }
}

/** The size within `max` on the long side, proportions kept; a smaller image stays as it is. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export interface ResizeDeps {
  createImageBitmap?: (image: Blob, options?: ImageBitmapOptions) => Promise<ImageBitmap>;
  createCanvas?: () => HTMLCanvasElement;
}

/**
 * A JPEG of at most 2048 px, quality 0.85, made with a canvas and no library: 0.3–0.8 MB instead
 * of the 3–5 MB of a phone photo. Re-encoding drops the metadata (GPS position included), also
 * of a small image. JPEG, not WebP: Safari does not encode WebP from a canvas reliably.
 */
export async function resizeForUpload(file: File, deps: ResizeDeps = {}): Promise<Blob> {
  const decode = deps.createImageBitmap ?? ((image, options) => createImageBitmap(image, options));
  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(file, { imageOrientation: 'from-image' });
  } catch {
    throw new PhotoResizeError();
  }
  try {
    const size = fitWithin(bitmap.width, bitmap.height, UPLOAD_MAX_SIDE);
    const canvas = deps.createCanvas?.() ?? document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) throw new PhotoResizeError();
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', JPEG_QUALITY));
    if (!blob) throw new PhotoResizeError();
    return blob;
  } finally {
    bitmap.close();
  }
}
