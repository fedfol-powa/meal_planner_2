import { useQueries, useQuery, type QueryClient } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { isBlocking, toApiError } from '../api/errors';
import { useAreaMutation } from '../api/mutations';
import { datesQuery, openingQuery, queryKeys, useQueryDeps, weekQuery, type Versioned } from '../api/queries';
import type { FamilyView, MealView, OpeningView, WeekView } from '../api/types';
import { DatePicker } from '../components/DatePicker';
import { DaySelector } from '../components/DaySelector';
import { FamilyGate } from '../components/FamilyGate';
import { Icon } from '../components/Icon';
import { useOnline } from '../components/OfflineBanner';
import { QueryError } from '../components/QueryError';
import { RecipeCard } from '../components/RecipeCard';
import { StateNotice } from '../components/StateNotice';
import { WelcomeCard } from '../features/family-new/WelcomeCard';
import { useMealActions } from '../features/meals/MealActions';
import { SaveNotices } from '../features/meals/SaveNotices';
import { UndoProvider } from '../features/meals/UndoProvider';
import { formatDayLong, formatMonthYear } from '../i18n/dates';
import type { Locale } from '../i18n/translate';
import { useLocale, useT } from '../i18n/LocaleProvider';
import { useProfile } from '../session/useFamily';
import { addDays, isMealPast, localNow, mondayOf, weekDates, type IsoDate, type LocalDateTime } from '../lib/calendar';
import { rememberMenuDay } from './menu/lastDay';
import { MenuSkeleton } from './menu/MenuSkeleton';
import { useNewWeek } from './menu/newWeek';
import { pickSelected } from './menu/selection';
import { useFamilyToday } from './menu/today';
import styles from './MenuPage.module.css';

const route = getRouteApi('/_app/menu');

/**
 * The link of the «next week's menu» email carries the family (spec W24, 6.2): when the person is in it
 * and it is not the one shown, it is chosen on the server before the day opens. The parameter goes away
 * after the use (`replace`), also when ignored. Resolves true while the choice is still pending.
 */
function useFamilyLink(linked: string | undefined): boolean {
  const { api } = useQueryDeps();
  const navigate = route.useNavigate();
  const online = useOnline();
  const profile = useProfile().data;
  const choose = useAreaMutation('profile.setCurrentFamily', undefined, (familyId: string) => api.profile.setCurrentFamily({ familyId }));
  const started = useRef(false);
  useEffect(() => {
    if (!linked || !profile || started.current) return;
    started.current = true;
    const done = () => void navigate({ search: (s) => ({ ...s, family: undefined }), replace: true });
    if (online && linked !== profile.currentFamilyId && profile.families.some((f) => f.id === linked)) choose.mutate(linked, { onSettled: done });
    else done();
  }, [linked, profile, online, choose, navigate]);
  return !!linked && !!profile;
}

/** Until the family of the link is chosen the menu of the previous one must not start reading. */
function FamilyLink({ day, onSelect, children }: { day: IsoDate | undefined; onSelect: (date: IsoDate) => void; children: ReactNode }) {
  const arriving = useFamilyLink(route.useSearch().family);
  if (arriving) return <MenuSkeleton weekStartsOn={day ? mondayOf(day) : undefined} selected={day} onSelect={onSelect} />;
  return <>{children}</>;
}

export function MenuPage() {
  const { day } = route.useSearch();
  const navigate = route.useNavigate();
  const select = (date: IsoDate) => void navigate({ search: { day: date } });
  // The undo offer outlives a change of week (the toast follows the action, not the week shown).
  return (
    <FamilyGate waiting={(paused) => <MenuSkeleton weekStartsOn={day ? mondayOf(day) : undefined} selected={day} onSelect={select} paused={paused} />}>
      {(family) => (
        <FamilyLink day={day} onSelect={select}>
          <UndoProvider familyId={family.id}>
            <MenuView family={family} />
          </UndoProvider>
        </FamilyLink>
      )}
    </FamilyGate>
  );
}

/**
 * While today's opening has not been read (offline after the day changed, or still loading), the
 * saved copy answers: today in its week if that week is saved, else the latest saved opening of the
 * same family and language. The server's answer replaces it as soon as it arrives.
 */
function savedOpening(queryClient: QueryClient, familyId: string, today: IsoDate, locale: Locale): Versioned<OpeningView> | undefined {
  const weekStartsOn = mondayOf(today);
  if (queryClient.getQueryData<Versioned<WeekView>>(queryKeys.week(familyId, weekStartsOn, locale))) {
    return { version: '', data: { kind: 'day', date: today, weekStartsOn } };
  }
  const saved = queryClient
    .getQueriesData<Versioned<OpeningView>>({ queryKey: ['menu', 'getOpening'] })
    .filter(([key, value]) => {
      const input = key[2] as { familyId?: string; locale?: string; today?: string } | undefined;
      return value && input?.familyId === familyId && input.locale === locale;
    })
    .sort(([a], [b]) => String((b[2] as { today?: string }).today).localeCompare(String((a[2] as { today?: string }).today)));
  return saved[0]?.[1];
}

/** Where the Today button's tap lands: a day, or the opening of a family date (tap after midnight). */
type FocusIntent = { kind: 'day'; day: IsoDate } | { kind: 'opening'; date: IsoDate };

const notice = (content: ReactNode) => <section className="secondary-view app-view">{content}</section>;

function MenuView({ family }: { family: FamilyView }) {
  const t = useT();
  const { locale } = useLocale();
  const deps = useQueryDeps();
  const { day: requested, welcome: welcomeAsked } = route.useSearch();
  // The card stays until closed: the menu's own navigations (days) do not carry the parameter.
  const [welcome, setWelcome] = useState(!!welcomeAsked && family.role === 'family_admin');
  const closeWelcome = () => {
    setWelcome(false);
    void navigate({ search: (s) => ({ ...s, welcome: undefined }), replace: true });
  };
  const navigate = route.useNavigate();
  const familyId = family.id;

  // The family's local date, sent with the opening: the server validates it and answers for that day.
  const { today, recheck: recheckToday } = useFamilyToday(family.timeZone);
  const opening = useQuery({ ...openingQuery(deps, familyId, today), placeholderData: () => savedOpening(deps.queryClient, familyId, today, locale) });
  const openingDay = opening.data?.kind === 'day' ? opening.data : null;
  const weekStart = requested ? mondayOf(requested) : openingDay?.weekStartsOn;
  const week = useQuery({ ...weekQuery(deps, familyId, weekStart ?? ''), enabled: !!weekStart, retry: false });
  // Today's week, with the menu's own query (the same key when it is the week shown): the button
  // shows only when it says today has a meal, never from the opening. It starts with the week shown,
  // so that both observers share one read when they are the same week.
  const todayWeek = useQuery({ ...weekQuery(deps, familyId, mondayOf(today)), enabled: !!weekStart, retry: false });
  // A blocking error (not found, refused) counts as no data, as for the week shown; offline the copy stays.
  const todayWeekBlocked = todayWeek.isError && isBlocking(todayWeek.error, !!todayWeek.data);
  const todayHasMeals = !todayWeekBlocked && !!todayWeek.data?.days.find((d) => d.date === today)?.meals.some((m) => m.kind !== 'empty');
  const track = useRef<HTMLDivElement>(null);
  // Day the track is already moving to (smooth tap or user scroll): no instant jump over it.
  const settling = useRef<IsoDate | null>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The month gets the focus when the Today button's tap arrives (the button is gone by then).
  const month = useRef<HTMLButtonElement>(null);
  const focusOnArrival = useRef<FocusIntent | null>(null);

  // One path to open and close the calendar, remembering who opened it (review, finding 13).
  const [pickerOpen, setPickerOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const closePicker = useCallback(() => {
    setPickerOpen(false);
    opener.current?.focus();
  }, []);
  const togglePicker = (element: HTMLElement) => {
    if (pickerOpen) return closePicker();
    focusOnArrival.current = null;
    opener.current = element;
    setPickerOpen(true);
  };

  const days = week.data?.days.map((d) => d.date) ?? [];
  const selected = pickSelected(days, requested, openingDay?.date);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const newWeek = useNewWeek(familyId, selected);

  // The weeks either side, for the swipe on the days: every month they touch is read in advance
  // with the calendar's own query (usually the month already shown, one read).
  const neighbourWeeks = selected ? [mondayOf(addDays(selected, -7)), mondayOf(addDays(selected, 7))] : [];
  const months = [...new Set(neighbourWeeks.flatMap((monday) => [monday.slice(0, 7), addDays(monday, 6).slice(0, 7)]))];
  const datesWithMenu = useQueries({ queries: months.map((month) => datesQuery(deps, familyId, month)) }).flatMap((q) => q.data ?? []);
  const hasMenu = (monday: IsoDate) => datesWithMenu.some((date) => mondayOf(date) === monday);
  const isSaved = (monday: IsoDate) => !!deps.queryClient.getQueryData(queryKeys.week(familyId, monday, locale));
  // A week alongside exists if one of its days has a menu or it is saved.
  const exists = neighbourWeeks.map((monday) => hasMenu(monday) || isSaved(monday));
  const adjacent = { previous: !!exists[0], next: !!exists[1] };
  // When it exists and is not saved yet it is read once in advance, so that the drag of the days lands
  // on it without «Loading…». Nothing observes that read: it is not repeated when the app comes back
  // or reconnects; on arrival the week's own read checks the saved copy's version.
  const { api, queryClient } = deps;
  const toRead = neighbourWeeks.filter(hasMenu).join(',');
  useEffect(() => {
    if (!toRead) return;
    for (const monday of toRead.split(',')) {
      void queryClient.prefetchQuery({ ...weekQuery({ api, queryClient, locale }, familyId, monday), staleTime: Infinity, retry: false });
    }
  }, [toRead, api, queryClient, locale, familyId]);

  // A day whose week does not exist (old link, typo) falls back to the opening day.
  const weekMissing = !!requested && week.isError && toApiError(week.error).code === 'not_found';
  useEffect(() => {
    if (weekMissing) void navigate({ search: {}, replace: true });
  }, [weekMissing, navigate]);

  useEffect(() => rememberMenuDay(requested), [requested]);

  useLayoutEffect(() => {
    if (!selected) return;
    if (settling.current === selected) {
      settling.current = null;
      return;
    }
    track.current?.querySelector(`#day-${selected}`)?.scrollIntoView({ block: 'nearest', inline: 'start' });
  }, [selected, week.data?.startsOn]);

  /**
   * The same weekday in the next or previous week, if that week has a day with a menu or a saved
   * copy; the day itself may have no meals and is shown empty, like any such day.
   */
  function swipeWeek(step: -1 | 1): boolean {
    if (!selected) return false;
    const target = addDays(selected, step * 7);
    const monday = mondayOf(target);
    if (!isSaved(monday) && !hasMenu(monday)) return false;
    select(target);
    return true;
  }

  function select(date: IsoDate) {
    if (days.includes(date)) {
      settling.current = date;
      track.current?.querySelector(`#day-${date}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
      void navigate({ search: { day: date }, replace: true });
    } else {
      void navigate({ search: { day: date } });
    }
  }

  /** Today as a chosen day; after midnight, what the second tap on Menu does (the new day's opening). */
  function goToday() {
    const now = localNow(family.timeZone).slice(0, 10);
    if (now !== today) {
      focusOnArrival.current = { kind: 'opening', date: now };
      // With no day asked the address does not change: the new date has to render by itself.
      if (requested === undefined) recheckToday();
      else void navigate({ search: {} });
    } else {
      focusOnArrival.current = { kind: 'day', day: today };
      select(today);
    }
  }

  // The intent is dropped by another navigation, a new family date or a failed opening. An opening
  // counts once the server answers or the read waits offline, never as the provisional saved copy.
  useEffect(() => {
    const intent = focusOnArrival.current;
    if (!intent) return;
    const dropped = intent.kind === 'day' ? requested !== intent.day || today !== intent.day : requested !== undefined || today !== intent.date || opening.isError;
    if (dropped) {
      focusOnArrival.current = null;
      return;
    }
    const openingResolved = !!opening.data && (!opening.isPlaceholderData || opening.fetchStatus === 'paused');
    const target = intent.kind === 'day' ? intent.day : openingResolved ? openingDay?.date : undefined;
    if (target && week.data && selected === target && month.current) {
      month.current.focus();
      focusOnArrival.current = null;
    }
  });

  // Debounced instead of `scrollend`, which older iOS Safari versions do not fire.
  function onScroll() {
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      const element = track.current;
      const shown = element && week.data?.days[Math.round(element.scrollLeft / element.clientWidth)];
      if (!shown || shown.date === selectedRef.current) return;
      settling.current = shown.date;
      void navigate({ search: { day: shown.date }, replace: true });
    }, 120);
  }

  // A requested day needs no opening: its week is enough (offline after the day changed).
  if (!requested && opening.isError && isBlocking(opening.error, !!opening.data)) return notice(<QueryError error={opening.error} onRetry={() => void opening.refetch()} />);
  // Week not known yet (first start, no saved opening): the menu's shape with blocks for month and days.
  if (!requested && !opening.data) return <MenuSkeleton paused={opening.fetchStatus === 'paused'} />;
  if (opening.data?.kind === 'no_weeks') return notice(<StateNotice title={t('menu.noWeeks.title')} body={t('menu.noWeeks.body')} />);
  if (week.isError && !weekMissing && isBlocking(week.error, !!week.data)) return notice(<QueryError error={week.error} onRetry={() => void week.refetch()} />);
  // The week is known: real month and days, the meals as blocks until the week arrives (W20).
  if (!week.data || !selected) {
    return <MenuSkeleton weekStartsOn={weekStart} selected={selected ?? requested ?? openingDay?.date ?? weekStart} onSelect={select} paused={week.fetchStatus === 'paused'} />;
  }

  const now = localNow(family.timeZone);
  return (
    <section className="calendar app-view" aria-label={t('nav.menu')}>
      <SaveNotices />
      {welcome && <WelcomeCard onClose={closeWelcome} />}
      <nav className="day-navigation" aria-label={t('menu.days')}>
        <div className={styles.toolbar}>
          <button type="button" ref={month} className={styles.month} data-date-picker-toggle aria-expanded={pickerOpen} onClick={(e) => togglePicker(e.currentTarget)}>
            {formatMonthYear(locale, selected)}
          </button>
          <div className={styles.actions}>
            {todayHasMeals && selected !== today && (
              <button type="button" className={styles.today} aria-label={t('menu.todayLabel')} onClick={goToday}>
                <Icon name="today" />
                <span>{t('menu.today')}</span>
              </button>
            )}
            <DatePicker
              familyId={familyId}
              selected={selected}
              open={pickerOpen}
              onToggle={togglePicker}
              onClose={closePicker}
              onSelect={select}
              dot={!!newWeek.weekStartsOn}
              fresh={newWeek.weekStartsOn ? weekDates(newWeek.weekStartsOn) : []}
            />
            <Link to="/shopping/$weekStartsOn" params={{ weekStartsOn: week.data.startsOn }} search={{ day: selected }} className={styles.action} aria-label={t('menu.shopping')}>
              <Icon name="bag" />
            </Link>
          </div>
        </div>
        <DaySelector dates={days} selected={selected} onSelect={select} adjacent={adjacent} onSwipe={swipeWeek} />
      </nav>
      <div className="week-track" ref={track} tabIndex={0} role="region" aria-label={t('menu.week')} onScroll={onScroll}>
        {week.data.days.map((day) => (
          <section className="day" id={`day-${day.date}`} key={day.date} aria-labelledby={`heading-${day.date}`}>
            <h2 className="visually-hidden" id={`heading-${day.date}`}>{formatDayLong(locale, day.date)}</h2>
            {day.meals.length === 0 && <StateNotice title={t('menu.dayEmpty')} />}
            {day.meals.map((meal) => (
              <MenuMeal key={meal.slotId} meal={meal} week={week.data!} familyId={familyId} now={now} />
            ))}
          </section>
        ))}
      </div>
    </section>
  );
}

/** One meal of the week, with the pencil and the editor sheet (round 2). */
function MenuMeal({ meal, week, familyId, now }: { meal: MealView; week: WeekView; familyId: string; now: LocalDateTime }) {
  const t = useT();
  const { actions, sheet } = useMealActions({ familyId, weekStartsOn: week.startsOn, meal, week, online: useOnline() });
  return (
    <>
      <RecipeCard
        cardKey={meal.slotId}
        label={t(`meal.${meal.mealType}`)}
        kind={meal.kind}
        recipe={meal.recipe}
        freeText={meal.freeText}
        servings={meal.servings}
        ingredients={meal.ingredients}
        note={meal.note}
        rating={meal.rating}
        lastChange={meal.lastChange}
        detailSearch={meal.recipe && meal.canOpenRecipe ? { from: 'menu', day: meal.date, slot: meal.slotId } : null}
        familyId={familyId}
        isPast={isMealPast(meal.date, meal.mealType, now)}
        actions={actions}
      />
      {sheet}
    </>
  );
}
