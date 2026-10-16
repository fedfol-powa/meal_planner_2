import { describe, expect, it, vi } from 'vitest';
import { fitWithin, PhotoResizeError, resizeForUpload } from './resize';

describe('fitWithin', () => {
  it('scales the long side down to the maximum, rounding', () => {
    expect(fitWithin(4032, 3024, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(3024, 4032, 2048)).toEqual({ width: 1536, height: 2048 });
    expect(fitWithin(3000, 2001, 2048)).toEqual({ width: 2048, height: 1366 });
  });
  it('keeps a smaller image as it is', () => {
    expect(fitWithin(800, 600, 2048)).toEqual({ width: 800, height: 600 });
  });
});

describe('resizeForUpload', () => {
  function fakes(width: number, height: number) {
    const drawn: unknown[] = [];
    const blob = new Blob(['jpeg'], { type: 'image/jpeg' });
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: (...args: unknown[]) => drawn.push(args) }),
      toBlob: vi.fn((done: (blob: Blob | null) => void, _type?: string, _quality?: number) => done(blob))
    };
    const bitmap = { width, height, close: vi.fn() };
    const createImageBitmap = vi.fn(async () => bitmap as unknown as ImageBitmap);
    return { canvas, bitmap, blob, drawn, deps: { createImageBitmap, createCanvas: () => canvas as unknown as HTMLCanvasElement } };
  }

  it('re-encodes as JPEG 0.85 at the size of fitWithin, honouring the orientation', async () => {
    const f = fakes(4032, 3024);
    const file = new File(['raw'], 'IMG_0001.HEIC', { type: 'image/heic' });
    expect(await resizeForUpload(file, f.deps)).toBe(f.blob);
    expect(f.deps.createImageBitmap).toHaveBeenCalledWith(file, { imageOrientation: 'from-image' });
    expect({ width: f.canvas.width, height: f.canvas.height }).toEqual({ width: 2048, height: 1536 });
    expect(f.drawn).toEqual([[f.bitmap, 0, 0, 2048, 1536]]);
    expect(f.canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.85);
    expect(f.bitmap.close).toHaveBeenCalled();
  });

  it('re-encodes a small image too, to drop its metadata', async () => {
    const f = fakes(800, 600);
    await resizeForUpload(new File(['raw'], 'a.png', { type: 'image/png' }), f.deps);
    expect({ width: f.canvas.width, height: f.canvas.height }).toEqual({ width: 800, height: 600 });
    expect(f.canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.85);
  });

  it('an image the browser cannot decode is a PhotoResizeError', async () => {
    const createImageBitmap = vi.fn(async () => {
      throw new DOMException('decode', 'InvalidStateError');
    });
    await expect(resizeForUpload(new File(['x'], 'a.bin'), { createImageBitmap })).rejects.toBeInstanceOf(PhotoResizeError);
  });
});
