import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { setOnline } from '../test/connectivity';
import { renderWithProviders } from '../test/renderWithProviders';
import { OfflineBanner, offlineMessageKey } from './OfflineBanner';

describe('offline banner (second PR)', () => {
  it('on the shopping routes says that the list stays editable, elsewhere read-only', () => {
    expect(offlineMessageKey('/shopping/2026-10-05')).toBe('offline.bannerShopping');
    expect(offlineMessageKey('/menu')).toBe('offline.banner');
    expect(offlineMessageKey('/shoppingx')).toBe('offline.banner');
  });
  it('shows the text of the route only while offline', async () => {
    renderWithProviders(<OfflineBanner pathname="/shopping/2026-10-05" />);
    act(() => setOnline(false));
    // Found by its text: the startup skeleton (W20) has its own, empty, status while the session starts.
    const text = 'Sei offline: le modifiche alla lista restano su questo telefono e si sincronizzano quando torni in linea.';
    expect((await screen.findByText(text)).getAttribute('role')).toBe('status');
    act(() => setOnline(true));
    expect(screen.queryByText(text)).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
