import { parseGIF, decompressFrames } from 'gifuct-js';

export interface GifFrame {
  canvas: HTMLCanvasElement; // full-size composited frame
  delay: number;             // ms this frame is displayed
}

export interface GifClip {
  frames: GifFrame[];
  totalMs: number;
}

/**
 * Load a GIF and decompose it into static per-frame canvases (loopable).
 * Optionally removes a flat gray background (e.g. m3.gif) from every frame,
 * since the sprite otherwise draws as an opaque rectangle.
 */
export async function loadGifClip(url: string, opts?: { removeGray?: boolean }): Promise<GifClip | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const buff = await resp.arrayBuffer();
    const gif = parseGIF(buff);
    const frames = decompressFrames(gif, true);
    if (!frames.length) return null;

    const width = gif.lsd.width;
    const height = gif.lsd.height;

    // Persistent compositor canvas that accumulates patches frame over frame,
    // honoring GIF disposal rules (disposalType 2 = clear before this frame).
    const compositor = document.createElement('canvas');
    compositor.width = width;
    compositor.height = height;
    const gifCtx = compositor.getContext('2d');
    if (!gifCtx) return null;
    gifCtx.clearRect(0, 0, width, height);

    const temp = document.createElement('canvas');
    let tempCtx = temp.getContext('2d');

    const out: GifFrame[] = [];

    const removeGray = opts?.removeGray === true;

    for (const frame of frames) {
      const dims = frame.dims;

      if (frame.disposalType === 2) {
        gifCtx.clearRect(0, 0, width, height);
      }

      // Composite this frame's patch onto the persistent canvas.
      temp.width = dims.width;
      temp.height = dims.height;
      tempCtx = temp.getContext('2d');
      if (!tempCtx) continue;
      const imgData = tempCtx.createImageData(dims.width, dims.height);
      imgData.data.set(frame.patch);
      tempCtx.putImageData(imgData, 0, 0);
      gifCtx.drawImage(temp, dims.left, dims.top);

      // Snapshot the current composited state as a finished frame.
      const snap = document.createElement('canvas');
      snap.width = width;
      snap.height = height;
      const snapCtx = snap.getContext('2d');
      if (!snapCtx) continue;

      if (removeGray) {
        // Copy then strip the flat gray background (alpha = 0 where near-gray).
        snapCtx.drawImage(compositor, 0, 0);
        const imageData = snapCtx.getImageData(0, 0, width, height);
        const d = imageData.data;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2];
          if (Math.abs(r - 192) <= 8 && Math.abs(g - 192) <= 8 && Math.abs(b - 192) <= 8) {
            d[i + 3] = 0;
          }
        }
        snapCtx.putImageData(imageData, 0, 0);
      } else {
        snapCtx.drawImage(compositor, 0, 0);
      }

      out.push({ canvas: snap, delay: Math.max(16, frame.delay) });
    }

    const totalMs = out.reduce((sum, f) => sum + f.delay, 0);
    return { frames: out, totalMs };
  } catch {
    return null;
  }
}