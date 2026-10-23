import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { ButtonSkeleton, FieldSkeleton, SettingsCardSkeleton, SkeletonRows, TitleSkeleton } from './PageSkeletons';
import { LoadingScope, Skeleton } from './Skeleton';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const inScope = (ui: ReactNode, paused = false) =>
  render(
    <LocaleProvider initial="it-IT">
      <LoadingScope loading paused={paused}>{ui}</LoadingScope>
    </LocaleProvider>
  );

describe('page skeleton pieces (W22)', () => {
  it('builds cards in the given order with the page classes', () => {
    const { container } = inScope(
      <Skeleton>
        <SettingsCardSkeleton>
          <FieldSkeleton />
          <SkeletonRows count={3} />
        </SettingsCardSkeleton>
      </Skeleton>
    );
    const card = container.querySelector('.settings-card.skeleton-card')!;
    expect([...card.children].map((el) => el.tagName.toLowerCase() + (el.className ? `.${el.className.split(' ')[0]}` : ''))).toEqual([
      'h2.skeleton-line',
      'div.field',
      'ul.row-list'
    ]);
    expect(card.querySelectorAll('ul.row-list > li')).toHaveLength(3);
    expect(card.querySelectorAll('li .row-main > span.skeleton-line')).toHaveLength(3);
    expect(container.querySelector('button, a, input, select, [tabindex]')).toBeNull();
  });

  it('fills each row inside a real card', () => {
    const { container, unmount } = inScope(
      <Skeleton>
        <SkeletonRows count={2} filled action={<ButtonSkeleton />} />
      </Skeleton>
    );
    const rows = [...container.querySelectorAll('li')];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.querySelector('.row-main.skeleton-block')).not.toBeNull();
      expect(row.querySelector('.text-button.skeleton-block')).not.toBeNull();
    }
    unmount();
    const plain = inScope(
      <Skeleton>
        <SkeletonRows count={2} />
      </Skeleton>
    );
    expect(plain.container.querySelector('.row-main.skeleton-block')).toBeNull();
  });

  it('builds link rows like the profile', () => {
    const { container, unmount } = inScope(
      <Skeleton>
        <SkeletonRows count={1} link lead trail />
      </Skeleton>
    );
    const link = container.querySelector('li > .row-link')!;
    expect([...link.children].map((el) => `${el.tagName.toLowerCase()}.${el.getAttribute('class')}`)).toEqual(['svg.icon', 'span.row-main', 'svg.icon']);
    unmount();
    const bare = inScope(
      <Skeleton>
        <SkeletonRows count={1} link />
      </Skeleton>
    );
    expect([...bare.container.querySelector('li > .row-link')!.children].map((el) => el.className)).toEqual(['row-main']);
  });

  it('holds the title back for the delay and stops it offline', () => {
    const { container } = inScope(
      <h1>
        <TitleSkeleton />
        <TitleSkeleton height="2lh" />
      </h1>,
      true
    );
    const [title, tall] = [...container.querySelectorAll<HTMLElement>('h1 .skeleton')] as [HTMLElement, HTMLElement];
    expect(title.dataset.visible).toBe('false');
    act(() => void vi.advanceTimersByTime(200));
    expect(title.dataset.visible).toBe('true');
    expect(title.dataset.paused).toBe('true');
    expect(title.classList.contains('skeleton-block')).toBe(true);
    expect(tall.style.height).toBe('2lh');
  });
});
