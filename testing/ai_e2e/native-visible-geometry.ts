import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { NativeRect } from './native-wda.ts';

function assertRect(rect: NativeRect) {
  if (!rect || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(rect[key as keyof NativeRect]))
    || rect.width <= 0 || rect.height <= 0) throw new Error('Invalid visible native geometry.');
}

// Port the original LynxRect.get_rated_rect(...).scale_to_rect(view.rect),
// using the displayed WDA view in points, not a physical screencast rectangle.
// Preserve division/multiplication order rather than simplifying the formula.
export async function originalVisibleElementRect(view: NativeRect, bodyPadding: number[], elementPadding: number[], timeoutMs = 5000): Promise<NativeRect> {
  assertRect(view);
  function box(quad: number[]) {
    if (!Array.isArray(quad) || quad.length !== 8 || quad.some(value => !Number.isFinite(value))) {
      throw new Error('Invalid visible native padding quad.');
    }
    const rect = { x: quad[0], y: quad[1], width: quad[2] - quad[0], height: quad[5] - quad[1] };
    assertRect(rect);
    return rect;
  }
  box(bodyPadding);
  box(elementPadding);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid visible geometry deadline.');
  // The original driver rounds to two decimals using Python's binary-float,
  // ties-even semantics. Keep that runtime instead of approximating with JS
  // Math.round/toFixed, which disagree at exact ties such as 0.125.
  return new Promise((resolve, reject) => {
    const child = execFile(process.env.MIDSCENE_PIXEL_PYTHON ?? 'python3',
      [fileURLToPath(new URL('./scripts/native_visible_geometry.py', import.meta.url))],
      { timeout: Math.ceil(timeoutMs), maxBuffer: 16 * 1024 }, (error, stdout) => {
        if (error) return reject(error);
        try { const rect = JSON.parse(stdout); assertRect(rect); resolve(rect); }
        catch (failure) { reject(failure); }
      });
    child.stdin!.on('error', reject);
    child.stdin!.end(JSON.stringify({ view, bodyPadding, elementPadding }));
  });
}

// Unchanged Sparkling _rects_correspond tolerances. This is identity binding,
// not a substitute for the pixel, route, callback or capability assertions.
export function visibleRectsCorrespond(native: NativeRect, cdp: NativeRect): boolean {
  assertRect(native);
  assertRect(cdp);
  const positionTolerance = Math.max(12, Math.min(Math.max(native.width, cdp.width), Math.max(native.height, cdp.height)) * 0.15);
  const sizeTolerance = Math.max(16, Math.max(native.width, native.height, cdp.width, cdp.height) * 0.25);
  return Math.abs(native.x + native.width / 2 - (cdp.x + cdp.width / 2)) <= positionTolerance
    && Math.abs(native.y + native.height / 2 - (cdp.y + cdp.height / 2)) <= positionTolerance
    && Math.abs(native.width - cdp.width) <= sizeTolerance
    && Math.abs(native.height - cdp.height) <= sizeTolerance;
}
