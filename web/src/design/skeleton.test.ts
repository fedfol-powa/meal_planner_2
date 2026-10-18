// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The test environment computes no animations: this is a static check of the skeleton rules in
// global.css (W20). Visibility and real animations are checked in the browser (plan, Task 1 and 8).
const css = readFileSync(fileURLToPath(new URL('./global.css', import.meta.url)), 'utf8');

/** Top-level rules as [selector, body], with @media blocks kept apart. */
function rules(source: string): { media: string | null; selector: string; body: string }[] {
  const out: { media: string | null; selector: string; body: string }[] = [];
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0;
  const read = (media: string | null, end: number) => {
    while (i < end) {
      const open = text.indexOf('{', i);
      if (open < 0 || open >= end) return;
      const head = text.slice(i, open).trim();
      if (head.startsWith('@media') || head.startsWith('@keyframes')) {
        let depth = 1;
        let j = open + 1;
        while (depth > 0) {
          if (text[j] === '{') depth++;
          else if (text[j] === '}') depth--;
          j++;
        }
        if (head.startsWith('@media')) {
          i = open + 1;
          read(head, j - 1);
        } else out.push({ media: null, selector: head, body: text.slice(open + 1, j - 1) });
        i = j;
        continue;
      }
      const close = text.indexOf('}', open);
      out.push({ media, selector: head, body: text.slice(open + 1, close) });
      i = close + 1;
    }
  };
  read(null, text.length);
  return out;
}

const all = rules(css);
const animated = all.filter((r) => /(^|;|\s)animation\s*:\s*(?!none)/.test(r.body));
const stopped = all.filter((r) => /animation\s*:\s*none/.test(r.body));

describe('skeleton CSS', () => {
  it('pulses from opacity 1 to 0.5', () => {
    const keyframes = all.find((r) => r.selector === '@keyframes skeleton-pulse');
    expect(keyframes?.body).toMatch(/opacity:\s*1/);
    expect(keyframes?.body).toMatch(/opacity:\s*0?\.5/);
  });

  it('animates only cards and blocks, never the container or the lines', () => {
    const pulses = animated.filter((r) => r.body.includes('skeleton-pulse'));
    expect(pulses.length).toBeGreaterThan(0);
    for (const rule of pulses) {
      for (const part of rule.selector.split(',')) expect(part.trim()).toMatch(/^\.skeleton-(card|block)$/);
    }
  });

  it('stops every block with reduced motion', () => {
    const reduced = stopped.filter((r) => r.media?.includes('prefers-reduced-motion: reduce'));
    const selectors = reduced.flatMap((r) => r.selector.split(',').map((s) => s.trim()));
    expect(selectors).toEqual(expect.arrayContaining(['.skeleton-card', '.skeleton-block']));
  });

  it('stops blocks that are the paused skeleton itself and blocks inside it', () => {
    const paused = stopped.filter((r) => r.media === null && r.selector.includes("data-paused='true'"));
    const selector = paused.map((r) => r.selector).join(',');
    expect(selector).toContain(":is(.skeleton[data-paused='true'], .skeleton[data-paused='true'] *)");
    expect(selector).toContain(':is(.skeleton-card, .skeleton-block)');
  });

  it('hides the skeleton itself and its content before the delay', () => {
    const hidden = all.find((r) => r.selector === ".skeleton:not([data-visible='true'])");
    expect(hidden?.body).toMatch(/visibility:\s*hidden/);
  });
});
