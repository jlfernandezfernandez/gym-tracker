/**
 * Training Activity Heatmap (GitHub-style 52-week horizontal calendar)
 * Displays workout consistency, volume/duration quantile shading, and weekly streak counter.
 */
import { useEffect, useMemo, useRef } from 'preact/hooks';
import {
  calculateQuantileThresholds,
  calculateWeeklyStreak,
  getMondayOfWeek,
  resolveHeatTier,
  toIsoDate,
  type StreakStats,
} from '../lib/volume';

export interface HeatmapProps {
  sessions?: any[];
  onSelectDate?: (date: string, sessions: any[]) => void;
  selectedDate?: string | null;
  className?: string;
  today?: Date;
}

const MONTH_NAMES_ES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

const WEEKDAY_LABELS = [
  { day: 0, label: 'L' }, // Lunes
  { day: 2, label: 'X' }, // Miércoles
  { day: 4, label: 'V' }, // Viernes
];

const WEEKS_COUNT = 52;

export function Heatmap({
  sessions = [],
  onSelectDate,
  selectedDate,
  className = '',
  today = new Date(),
}: HeatmapProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Group sessions by ISO date YYYY-MM-DD
  const sessionsByDate = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const session of sessions) {
      const rawDate = session?.session_date || session?.date;
      if (!rawDate) continue;
      const dateKey = typeof rawDate === 'string' ? rawDate.slice(0, 10) : toIsoDate(new Date(rawDate));
      const list = map.get(dateKey) || [];
      list.push(session);
      map.set(dateKey, list);
    }
    return map;
  }, [sessions]);

  // Streak stats
  const streakStats: StreakStats = useMemo(() => {
    return calculateWeeklyStreak(sessions, today);
  }, [sessions, today]);

  // Build calendar matrix (columns = weeks, rows = 7 weekdays)
  const { weeks, monthHeaders, thresholds } = useMemo(() => {
    const currentMonday = getMondayOfWeek(today);
    const startMonday = new Date(currentMonday);
    startMonday.setDate(startMonday.getDate() - (WEEKS_COUNT - 1) * 7);

    const todayStr = toIsoDate(today);
    const activeValues: number[] = [];

    interface DayCell {
      date: Date;
      dateString: string;
      dayOfWeek: number; // 0 (Mon) - 6 (Sun)
      sessions: any[];
      value: number; // duration or volume
      tier: number;
      isToday: boolean;
      isFuture: boolean;
      isSelected: boolean;
      label: string;
    }

    interface WeekCol {
      weekIndex: number;
      mondayDate: Date;
      days: DayCell[];
    }

    const weeksList: WeekCol[] = [];
    const headers: Array<{ weekIndex: number; label: string }> = [];
    let lastMonth = -1;

    for (let w = 0; w < WEEKS_COUNT; w++) {
      const monday = new Date(startMonday);
      monday.setDate(monday.getDate() + w * 7);

      const month = monday.getMonth();
      if (month !== lastMonth) {
        headers.push({ weekIndex: w, label: MONTH_NAMES_ES[month] });
        lastMonth = month;
      }

      const days: DayCell[] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(monday);
        date.setDate(date.getDate() + d);
        const dateString = toIsoDate(date);
        const isFuture = dateString > todayStr;
        const isToday = dateString === todayStr;
        const isSelected = selectedDate === dateString;
        const daySessions = sessionsByDate.get(dateString) || [];

        let dayDuration = 0;
        let dayVolume = 0;
        for (const s of daySessions) {
          dayDuration += Number(s.duration_actual || s.duration_estimated || 0);
          dayVolume += Number(s.total_volume || 0);
        }

        const value = dayDuration > 0 ? dayDuration : (dayVolume > 0 ? dayVolume : (daySessions.length > 0 ? 30 : 0));
        if (value > 0 && !isFuture) {
          activeValues.push(value);
        }

        const shortDateFormatted = date.toLocaleDateString('es-ES', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });

        const label = daySessions.length > 0
          ? `${shortDateFormatted}: ${daySessions.length} entreno${daySessions.length > 1 ? 's' : ''}${dayDuration ? ` · ${dayDuration} min` : ''}${dayVolume ? ` · ${Math.round(dayVolume)} kg` : ''}`
          : isFuture
            ? `${shortDateFormatted}`
            : `${shortDateFormatted}: Descanso`;

        days.push({
          date,
          dateString,
          dayOfWeek: d,
          sessions: daySessions,
          value,
          tier: 0,
          isToday,
          isFuture,
          isSelected,
          label,
        });
      }

      weeksList.push({
        weekIndex: w,
        mondayDate: monday,
        days,
      });
    }

    // Calculate quantile thresholds
    const quantiles = calculateQuantileThresholds(activeValues);

    // Apply tier to each day
    for (const week of weeksList) {
      for (const day of week.days) {
        if (!day.isFuture && day.value > 0) {
          day.tier = resolveHeatTier(day.value, quantiles);
        }
      }
    }

    return { weeks: weeksList, monthHeaders: headers, thresholds: quantiles };
  }, [sessionsByDate, today, selectedDate]);

  // Auto-scroll to current week on mount / render
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [weeks]);

  const tierColors = [
    'bg-surface-2 dark:bg-surface-2', // tier 0
    'bg-accent/25',                   // tier 1
    'bg-accent/50',                   // tier 2
    'bg-accent/75',                   // tier 3
    'bg-accent',                      // tier 4
  ];

  return (
    <div class={`card !p-4 ${className}`} data-testid="activity-heatmap">
      {/* Header: Title & Streak Counter */}
      <div class="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-edge">
        <div>
          <h3 class="text-[.95rem] font-bold text-ink">Actividad y consistencia</h3>
          <p class="mt-0.5 text-[.74rem] text-hint">
            {streakStats.totalWorkouts} entrenamientos · {streakStats.activeWeeksCount} semanas activas este año
          </p>
        </div>

        <div
          class="flex items-center gap-1.5 rounded-pill bg-accent-bg px-3 py-1.5 text-accent shadow-xs"
          aria-label={`Racha actual de ${streakStats.currentStreak} semanas`}
          data-testid="streak-badge"
        >
          <span class="text-base leading-none">🔥</span>
          <span class="text-[.78rem] font-[700] tracking-tight">
            {streakStats.currentStreak === 1
              ? '1 semana'
              : `${streakStats.currentStreak} semanas`}
          </span>
        </div>
      </div>

      {/* Heatmap Grid Container with horizontal scroll */}
      <div class="relative mt-3">
        <div
          ref={scrollRef}
          class="overflow-x-auto pb-2 scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          tabIndex={0}
          aria-label="Calendario de actividad de entrenamiento de 52 semanas"
        >
          <div class="min-w-fit flex gap-2">
            {/* Weekday Row Labels (L, X, V) */}
            <div class="flex flex-col justify-between pt-[18px] pb-[2px] pr-1 text-[.64rem] font-bold text-hint select-none" aria-hidden="true">
              <span class="h-[12px] leading-[12px]">L</span>
              <span class="h-[12px] leading-[12px]"></span>
              <span class="h-[12px] leading-[12px]">X</span>
              <span class="h-[12px] leading-[12px]"></span>
              <span class="h-[12px] leading-[12px]">V</span>
              <span class="h-[12px] leading-[12px]"></span>
              <span class="h-[12px] leading-[12px]"></span>
            </div>

            {/* Weeks Columns Grid */}
            <div class="flex flex-col gap-1">
              {/* Month Header Track */}
              <div class="relative h-[14px] text-[.65rem] font-bold text-hint select-none" aria-hidden="true">
                {monthHeaders.map((header) => (
                  <span
                    key={`${header.weekIndex}-${header.label}`}
                    class="absolute whitespace-nowrap"
                    style={{ left: `${header.weekIndex * 15}px` }}
                  >
                    {header.label}
                  </span>
                ))}
              </div>

              {/* Day Cells Matrix */}
              <div class="flex gap-[3px]">
                {weeks.map((week) => (
                  <div key={week.weekIndex} class="flex flex-col gap-[3px]">
                    {week.days.map((day) => {
                      const hasWorkouts = day.sessions.length > 0;
                      return (
                        <button
                          key={day.dateString}
                          type="button"
                          disabled={day.isFuture}
                          class={`size-[12px] rounded-[2.5px] transition-all p-0 border-0 ${
                            day.isFuture
                              ? 'bg-surface-2 opacity-25 cursor-default'
                              : `${tierColors[day.tier]} ${hasWorkouts ? 'cursor-pointer hover:scale-125' : 'cursor-default'}`
                          } ${
                            day.isToday
                              ? 'ring-1.5 ring-accent ring-offset-1 ring-offset-surface'
                              : ''
                          } ${
                            day.isSelected
                              ? 'ring-2 ring-ink ring-offset-1 ring-offset-surface z-10'
                              : ''
                          }`}
                          title={day.label}
                          aria-label={day.label}
                          data-date={day.dateString}
                          data-tier={day.tier}
                          data-workouts={day.sessions.length}
                          onClick={() => {
                            if (!day.isFuture && onSelectDate) {
                              onSelectDate(day.dateString, day.sessions);
                            }
                          }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Legend Footer */}
      <div class="mt-3 flex items-center justify-between text-[.7rem] text-hint pt-2 border-t border-edge/60">
        <span>
          {streakStats.maxStreak > 0 && `Mejor racha: ${streakStats.maxStreak} sem.`}
        </span>
        <div class="flex items-center gap-1.5">
          <span class="text-[.66rem]">Menos</span>
          <div class="flex gap-1" aria-hidden="true">
            {tierColors.map((colorClass, tierIndex) => (
              <span
                key={tierIndex}
                class={`size-[10px] rounded-[2px] ${colorClass}`}
                title={`Nivel ${tierIndex}`}
              />
            ))}
          </div>
          <span class="text-[.66rem]">Más</span>
        </div>
      </div>
    </div>
  );
}
