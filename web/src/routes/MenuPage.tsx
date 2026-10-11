import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { isBlocking, toApiError } from '../api/errors';
import { openingQuery, useQueryDeps, weekQuery } from '../api/queries';
import type { FamilyView } from '../api/types';
import { DatePicker } from '../components/DatePicker';
import { DaySelector } from '../components/DaySelector';
import { FamilyGate } from '../components/FamilyGate';
import { Icon } from '../components/Icon';
import { Loading } from '../components/Loading';
import { QueryError } from '../components/QueryError';
import { RecipeCard } from '../components/RecipeCard';
import { StateNotice } from '../components/StateNotice';
import { formatDayLong, formatMonthYear } from '../i18n/dates';
import { useLocale, useT } from '../i18n/LocaleProvider';
import { isMealPast, localNow, mondayOf, type IsoDate } from '../lib/calendar';
import { rememberMenuDay } from './menu/lastDay';
import { pickSelected } from './menu/selection';
import styles from './MenuPage.module.css';

const route = getRouteApi('/_app/menu');

export function MenuPage() {
  return <FamilyGate>{(family) => <MenuView family={family} />}</FamilyGate>;
}

const notice = (content: ReactNode) => <section className="secondary-view app-view">{content}</section>;

function MenuView({ family }: { family: FamilyView }) {
  const t = useT();
  const { locale } = useLocale();
  const deps = useQueryDeps();
  const { day: requested } = route.useSearch();
  const navigate = route.useNavigate();
  const familyId = family.id;

  const opening = useQuery(openingQuery(deps, familyId));
  const openingDay = opening.data?.kind === 'day' ? opening.data : null;
  const weekStart = requested ? mondayOf(requested) : openingDay?.weekStartsOn;
  const week = useQuery({ ...weekQuery(deps, familyId, weekStart ?? ''), enabled: !!weekStart, retry: false });
  const track = useRef<HTMLDivElement>(null);
  // Day the track is already moving to (smooth tap or user scroll): no instant jump over it.
  const settling = useRef<IsoDate | null>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // One path to open and close the calendar, remembering who opened it (review, finding 13).
  const [pickerOpen, setPickerOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const closePicker = useCallback(() => {
    setPickerOpen(false);
    opener.current?.focus();
  }, []);
  const togglePicker = (element: HTMLElement) => {
    if (pickerOpen) return closePicker();
    opener.current = element;
    setPickerOpen(true);
  };

  const days = week.data?.days.map((d) => d.date) ?? [];
  const selected = pickSelected(days, requested, openingDay?.date);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

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

  function select(date: IsoDate) {
    if (days.includes(date)) {
      settling.current = date;
      track.current?.querySelector(`#day-${date}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
      void navigate({ search: { day: date }, replace: true });
    } else {
      void navigate({ search: { day: date } });
    }
  }

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

  if (opening.isError && isBlocking(opening.error, !!opening.data)) return notice(<QueryError error={opening.error} onRetry={() => void opening.refetch()} />);
  if (!opening.data) return notice(<Loading />);
  if (opening.data.kind === 'no_weeks') return notice(<StateNotice title={t('menu.noWeeks.title')} body={t('menu.noWeeks.body')} />);
  if (week.isError && !weekMissing && isBlocking(week.error, !!week.data)) return notice(<QueryError error={week.error} onRetry={() => void week.refetch()} />);
  if (!week.data || !selected) return notice(<Loading />);

  const now = localNow(family.timeZone);
  return (
    <section className="calendar app-view" aria-label={t('nav.menu')}>
      <nav className="day-navigation" aria-label={t('menu.days')}>
        <div className={styles.toolbar}>
          <button type="button" className={styles.month} data-date-picker-toggle aria-expanded={pickerOpen} onClick={(e) => togglePicker(e.currentTarget)}>
            {formatMonthYear(locale, selected)}
          </button>
          <div className={styles.actions}>
            <DatePicker familyId={familyId} selected={selected} open={pickerOpen} onToggle={togglePicker} onClose={closePicker} onSelect={select} />
            <button type="button" className={styles.action} aria-label={t('menu.shopping')} disabled>
              <Icon name="bag" />
            </button>
          </div>
        </div>
        <DaySelector dates={days} selected={selected} onSelect={select} />
      </nav>
      <div className="week-track" ref={track} tabIndex={0} role="region" aria-label={t('menu.week')} onScroll={onScroll}>
        {week.data.days.map((day) => (
          <section className="day" id={`day-${day.date}`} key={day.date} aria-labelledby={`heading-${day.date}`}>
            <h2 className="visually-hidden" id={`heading-${day.date}`}>{formatDayLong(locale, day.date)}</h2>
            {day.meals.length === 0 && <StateNotice title={t('menu.dayEmpty')} />}
            {day.meals.map((meal) => (
              <RecipeCard
                key={meal.slotId}
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
              />
            ))}
          </section>
        ))}
      </div>
    </section>
  );
}
