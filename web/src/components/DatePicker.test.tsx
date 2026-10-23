import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_FAMILY_ID } from '../api/fake/fakeApi';
import { renderWithProviders } from '../test/renderWithProviders';
import { DatePicker } from './DatePicker';
import styles from './DatePicker.module.css';

describe('date picker: new week', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-22T10:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());
  const week = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'];
  const render = (props: { dot: boolean; fresh: readonly string[]; selected?: string }) =>
    renderWithProviders(<DatePicker familyId={DEMO_FAMILY_ID} selected={props.selected ?? '2026-10-22'} open onToggle={() => {}} onClose={() => {}} onSelect={() => {}} dot={props.dot} fresh={props.fresh} />);

  it('names the icon and marks it with a decorative dot', async () => {
    render({ dot: true, fresh: week });
    const icon = await screen.findByRole('button', { name: 'Scegli un giorno, menu della settimana prossima pronto' });
    expect(icon.querySelector(`.${styles.dot}`)?.getAttribute('aria-hidden')).toBe('true');
  });

  it('without the notice: the usual name and no dot', async () => {
    render({ dot: false, fresh: [] });
    const icon = await screen.findByRole('button', { name: 'Scegli un giorno' });
    expect(icon.querySelector(`.${styles.dot}`)).toBeNull();
  });

  it('the chosen day of the new week stays the chosen one', async () => {
    render({ dot: true, fresh: week, selected: '2026-10-26' });
    const dialog = await screen.findByRole('dialog', { name: 'Scegli un giorno' });
    await waitFor(() => expect((within(dialog).getByRole('button', { name: 'lunedì 26 ottobre, settimana nuova' }) as HTMLButtonElement).disabled).toBe(false));
    const chosen = within(dialog).getByRole('button', { name: 'lunedì 26 ottobre, settimana nuova' });
    expect(chosen.getAttribute('aria-pressed')).toBe('true');
    expect(chosen.classList.contains(styles.fresh!)).toBe(true);
    expect(within(dialog).getByRole('button', { name: 'martedì 27 ottobre, settimana nuova' }).getAttribute('aria-pressed')).toBe('false');
  });
});
