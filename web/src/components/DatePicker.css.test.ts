// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The test environment applies no CSS modules: the rules of the new week (W24, spec 6.1) are checked in the source.
const css = readFileSync(fileURLToPath(new URL('./DatePicker.module.css', import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, head, body]) => ({ selectors: head!.split(',').map((s) => s.trim()), body: body! }));
const declares = (body: string, property: string, value: string) => new RegExp(`(^|;)\\s*${property}:\\s*${value.replace(/[()]/g, '\\$&')}\\s*(;|$)`).test(body.trim());
const NOT_CHOSEN = ":not([aria-pressed='true'])";

describe('date picker: new week (CSS)', () => {
  it('draws the dot 10 px green with a border of the background, top right of the icon', () => {
    const toggle = rules.find((r) => r.selectors.includes('.toggle') && /position:/.test(r.body));
    expect(toggle && declares(toggle.body, 'position', 'relative')).toBe(true);
    const dot = rules.find((r) => r.selectors.includes('.dot'))!;
    for (const [property, value] of [['position', 'absolute'], ['top', '7px'], ['right', '6px'], ['width', '10px'], ['height', '10px'], ['border', '2px solid var(--canvas)'], ['border-radius', '50%'], ['background', 'var(--green)']]) {
      expect(declares(dot.body, property!, value!), `${property}: ${value}`).toBe(true);
    }
  });

  it('gives the days of the new week a green number on light green, also on hover, only when not chosen', () => {
    const fresh = rules.filter((r) => r.selectors.some((s) => s.includes('.fresh')));
    expect(fresh.length).toBeGreaterThan(0);
    for (const rule of fresh) for (const selector of rule.selectors) expect(selector).toContain(NOT_CHOSEN);
    const plain = fresh.find((r) => r.selectors.includes(`.day.fresh${NOT_CHOSEN}`))!;
    expect(declares(plain.body, 'color', 'var(--green)')).toBe(true);
    expect(declares(plain.body, 'background', 'var(--soft-green)')).toBe(true);
    const hover = fresh.find((r) => r.selectors.some((s) => s.startsWith(`.day.fresh${NOT_CHOSEN}`) && s.includes(':hover')))!;
    expect(declares(hover.body, 'background', 'var(--soft-green)')).toBe(true);
  });

  it('keeps the chosen day dark with white text, also on hover', () => {
    const chosen = rules.find((r) => r.selectors.includes(".day[aria-pressed='true']"))!;
    expect(declares(chosen.body, 'background', 'var(--ink)')).toBe(true);
    expect(declares(chosen.body, 'color', '#fff')).toBe(true);
    // No other rule of the days can cover it: those with a hover or the new week exclude the chosen day.
    const others = rules.flatMap((r) => r.selectors.filter((s) => s.startsWith('.day') && (s.includes(':hover') || s.includes('.fresh'))).map((s) => ({ s, body: r.body })));
    for (const { s, body } of others) if (/(^|;)\s*(background|color):/.test(body)) expect(s).toContain(NOT_CHOSEN);
  });
});
