import type { FreeItemView, ShoppingItemView, ShoppingListView } from '@app/contract';
import { DEPARTMENT_LABELS } from '@app/domain/shopping';
import { getRouteApi, Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { isBlocking, toApiError } from '../../api/errors';
import type { FamilyView } from '../../api/types';
import { FamilyGate } from '../../components/FamilyGate';
import { Icon } from '../../components/Icon';
import { QueryError } from '../../components/QueryError';
import { BusyArea, LoadingScope, Skeleton } from '../../components/Skeleton';
import { StateNotice } from '../../components/StateNotice';
import { formatChangeTime, formatDayMonth } from '../../i18n/dates';
import { useLocale, useT } from '../../i18n/LocaleProvider';
import type { Locale } from '../../i18n/translate';
import { addDays, localNow } from '../../lib/calendar';
import { listExport } from './exportText';
import { ExcludedItems } from './ExcludedItems';
import { FreeItems } from './FreeItems';
import type { ShoppingOperation } from './queue/ops';
import { QueueNotices } from './QueueNotices';
import { ShareMenu } from './ShareMenu';
import { ShoppingItemRow } from './ShoppingItemRow';
import styles from './ShoppingPage.module.css';
import { useShoppingList } from './useShoppingList';

const route = getRouteApi('/_app/shopping/$weekStartsOn');

export function ShoppingPage() {
  return <FamilyGate waiting={(paused) => <ShoppingWaiting paused={paused} />}>{(family) => <ShoppingView family={family} />}</FamilyGate>;
}

function BackLink() {
  const t = useT();
  const { day } = route.useSearch();
  return (
    <Link to="/menu" search={day ? { day } : {}} className="page-back">
      <Icon name="chevron-left" />
      {t('nav.menu')}
    </Link>
  );
}

/** The page's column and header, the same while loading, on errors and with the list (W20). */
function ShoppingLayout({ header, children }: { header: ReactNode; children?: ReactNode }) {
  return (
    <section className="secondary-view app-view" aria-labelledby="list-title">
      <div className="page-column">
        <header className="page-header">{header}</header>
        {children}
      </div>
    </section>
  );
}

/**
 * Waiting for the list, or for the changes saved on the phone (W20): back link and title are real (the week
 * comes from the address), the summary, the «…» menu and the departments are blocks of one wait.
 */
function ShoppingWaiting({ paused }: { paused: boolean }) {
  const t = useT();
  const { locale } = useLocale();
  const { weekStartsOn } = route.useParams();
  return (
    <LoadingScope loading paused={paused}>
      <ShoppingLayout
        header={
          <div className={styles.header}>
            <BackLink />
            <h1 className="page-title" id="list-title">{t('shopping.title', { range: weekRange(locale, weekStartsOn) })}</h1>
            <Skeleton as="p" className={`${styles.meta} skeleton-block`} style={{ width: '30%', height: '1lh' }} />
            <Skeleton className={styles.menuWrap}><span className="skeleton-block" style={{ width: 44, height: 44, marginRight: -8 }} /></Skeleton>
          </div>
        }
      >
        <BusyArea>
          <Skeleton><ShoppingListSkeleton /></Skeleton>
        </BusyArea>
      </ShoppingLayout>
    </LoadingScope>
  );
}

/** Two departments of four one-line items, with the list's own classes. */
function ShoppingListSkeleton() {
  return (
    <>
      {[0, 1].map((group) => (
        <section key={group} className={`${styles.group} skeleton-card`}>
          <h2 className="skeleton-line" />
          <ul className={styles.items}>
            {[0, 1, 2, 3].map((i) => (
              <li key={i}>
                <div className={styles.row}>
                  <span className={styles.item}><span className="skeleton-line" style={{ gridColumn: '1 / -1' }} /></span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

/** «12–18 ottobre», «28 settembre – 4 ottobre»: days of the week as calendar dates. */
function weekRange(locale: Locale, monday: string): string {
  const sunday = addDays(monday, 6);
  if (monday.slice(0, 7) === sunday.slice(0, 7)) return `${Number(monday.slice(8))}–${formatDayMonth(locale, sunday)}`;
  return `${formatDayMonth(locale, monday)} – ${formatDayMonth(locale, sunday)}`;
}

function ShoppingView({ family }: { family: FamilyView }) {
  const t = useT();
  const { locale } = useLocale();
  const { weekStartsOn } = route.useParams();
  const familyId = family.id;
  const list = useShoppingList(familyId, weekStartsOn);

  const back = <BackLink />;
  const page = (header: ReactNode, content?: ReactNode) => <ShoppingLayout header={header}>{content}</ShoppingLayout>;

  const { query } = list;
  if (query.isError) {
    const code = toApiError(query.error).code;
    // A week never generated, or a link that is not a Monday: nothing to buy, back to the menu.
    if (code === 'not_found' || code === 'invalid') return page(back, <StateNotice title={t('shopping.empty.title')} body={t('shopping.empty.body')} />);
    if (isBlocking(query.error, !!query.data)) return page(back, <QueryError error={query.error} onRetry={() => void query.refetch()} />);
  }
  // No list without the queue saved on the phone (PR #22): its wait is the same skeleton as the read's.
  if (!list.view) return <ShoppingWaiting paused={!query.data && query.fetchStatus === 'paused'} />;

  const { view, pendingKeys, pendingFreeIds } = list.view;
  // A new id for every change: it ties the queued operation to its answer.
  const edit = () => ({ familyId, weekStartsOn, id: crypto.randomUUID() });
  const act = (op: ShoppingOperation, label: string) => void list.act(op, label).catch(() => undefined);
  const toggle = (item: ShoppingItemView) =>
    act(
      {
        kind: 'setItemChecked',
        // The quantity shown when ticking: a repetition saves the same content (spec, quantityAtCheck).
        input: { ...edit(), ingredientId: item.ingredientId, varietyKey: item.varietyKey, checked: !item.checked, ...(item.checked ? {} : { quantityAtCheck: item.combined }) }
      },
      item.name
    );
  const putBack = (item: ShoppingItemView) =>
    act({ kind: 'setAddedBack', input: { ...edit(), ingredientId: item.ingredientId, varietyKey: item.varietyKey, addedBack: true } }, item.name);
  const toggleFree = (item: FreeItemView) => act({ kind: 'setFreeItemChecked', input: { ...edit(), itemId: item.id, checked: !item.checked } }, item.text);
  const removeFree = (item: FreeItemView) => act({ kind: 'removeFreeItem', input: { ...edit(), itemId: item.id } }, item.text);
  const addFree = (text: string) => act({ kind: 'addFreeItem', input: { ...edit(), text } }, text);

  // «Altro» is always there: it holds the row that adds a free item.
  const groups: ShoppingListView['departments'] = view.departments.some((d) => d.department === 'other')
    ? view.departments
    : [...view.departments, { department: 'other', items: [] }];
  const nothingLeft = listExport(view).lines.length === 0;
  const skipped = view.skipped.map((s) => s.recipeName ?? t('shopping.unpublished'));

  return page(
    <div className={styles.header}>
      {back}
      <h1 className="page-title" id="list-title">{t('shopping.title', { range: weekRange(locale, weekStartsOn) })}</h1>
      <p className={styles.meta}>{t('shopping.meals', { count: view.mealCount })}</p>
      {list.pendingCount > 0 && <p className={styles.pending} role="status">{t('shopping.pendingSync')}</p>}
      {/* After the title in the reading order; the grid puts the «…» button at the top right. */}
      <ShareMenu
        view={view}
        base={list.query.data!}
        familyId={familyId}
        weekStartsOn={weekStartsOn}
        unsynced={list.pendingCount + list.notices.length}
        flush={() => void list.flush()}
      />
    </div>,
    <>
      <QueueNotices notices={list.notices} onDismiss={(id) => void list.dismiss(id)} />
      {skipped.length > 0 && <p className={styles.notice}>{t('shopping.skipped', { names: skipped.join(', ') })}</p>}
      {groups.map((group) => (
        <section key={group.department} className={styles.group} aria-labelledby={`dep-${group.department}`}>
          <h2 id={`dep-${group.department}`}>{DEPARTMENT_LABELS[locale][group.department]}</h2>
          <ul className={styles.items}>
            {group.items.map((item) => (
              <ShoppingItemRow key={item.key} item={item} pending={pendingKeys.has(item.key)} onToggle={() => toggle(item)} />
            ))}
            {group.department === 'other' && (
              <FreeItems items={view.freeItems} pending={pendingFreeIds} onToggle={toggleFree} onRemove={removeFree} onAdd={addFree} />
            )}
          </ul>
        </section>
      ))}
      <ExcludedItems items={view.excluded} onPutBack={putBack} />
      {nothingLeft && <p className={styles.notice} role="status">{t('shopping.allRemoved')}</p>}
      {view.lastChange && (
        <p className={styles.lastChange}>
          {t('shopping.lastChange', {
            name: view.lastChange.name ?? t('meal.formerMember'),
            time: formatChangeTime(locale, localNow(family.timeZone, new Date(view.lastChange.at)))
          })}
        </p>
      )}
    </>
  );
}
