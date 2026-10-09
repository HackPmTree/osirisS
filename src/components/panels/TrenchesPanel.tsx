/**
 * TrenchesPanel — панель слоя «Окопы (статические данные)» в левом меню.
 *
 * Минимальная, по ТЗ §2:
 *   - переключатель видимости слоя (вкл/выкл);
 *   - счётчик объектов (показано / всего);
 *   - фильтр по типу (траншея / блиндаж / позиция / ДОТ);
 *   - фильтр по статусу (активный / заброшенный / уничтоженный / неизвестный).
 *
 * Данные — статический /public/data/trenches.geojson (без БД и API).
 * Состояние живёт в хуке useTrenches(), который ведёт страница (page.tsx)
 * и передаёт сюда пропсы — тот же паттерн, что у terrainPanelProps.
 */

'use client';

import {
  ALL_TRENCH_STATUSES,
  ALL_TRENCH_TYPES,
  TRENCH_STATUS_COLORS,
  TRENCH_STATUS_LABEL_RU,
  TRENCH_TYPE_COLORS,
  TRENCH_TYPE_LABEL_RU,
  type TrenchStatus,
  type TrenchType,
} from '@/types/trench';

interface TrenchesPanelProps {
  /** Видимость слоя на карте (activeLayers.trench_static в стейте страницы). */
  visible: boolean;
  onToggleVisible: () => void;
  loading: boolean;
  error: string | null;
  total: number;
  /** Из них — объектов из демо-файла и из хранилища сканера (честный учёт). */
  demoCount?: number;
  scannedCount?: number;
  visibleCount: number;
  typesOn: Set<TrenchType>;
  statusesOn: Set<TrenchStatus>;
  onToggleType: (t: TrenchType) => void;
  onToggleStatus: (s: TrenchStatus) => void;
  onResetFilters: () => void;
}

/** Компактный чип-переключатель фильтра с цветовым маркером. */
function FilterChip({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-[9.5px] font-mono uppercase tracking-wider transition-colors ${
        active
          ? 'border-white/20 bg-white/[0.06] text-white/75'
          : 'border-white/[0.06] bg-transparent text-white/30 hover:bg-white/[0.03]'
      }`}
    >
      <span
        aria-hidden
        className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
        style={{ background: color, opacity: active ? 1 : 0.35 }}
      />
      {label}
    </button>
  );
}

function TrenchesPanel({
  visible,
  onToggleVisible,
  loading,
  error,
  total,
  demoCount = 0,
  scannedCount = 0,
  visibleCount,
  typesOn,
  statusesOn,
  onToggleType,
  onToggleStatus,
  onResetFilters,
}: TrenchesPanelProps) {
  const filtersDirty =
    typesOn.size !== ALL_TRENCH_TYPES.length || statusesOn.size !== ALL_TRENCH_STATUSES.length;

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
      {/* Заголовок + главный тумблер видимости слоя */}
      <button
        type="button"
        onClick={onToggleVisible}
        aria-pressed={visible}
        className="flex w-full items-center gap-2 text-left"
      >
        <span
          className="relative flex h-4 w-7 flex-shrink-0 items-center rounded-full border transition-colors"
          style={{
            background: visible ? 'rgba(230,57,70,0.25)' : 'transparent',
            borderColor: visible ? 'rgba(230,57,70,0.7)' : 'rgba(255,255,255,0.15)',
          }}
        >
          <span
            className="absolute h-2.5 w-2.5 rounded-full transition-all"
            style={{
              left: visible ? 14 : 2,
              background: visible ? '#e63946' : 'rgba(255,255,255,0.25)',
              boxShadow: visible ? '0 0 6px rgba(230,57,70,0.6)' : 'none',
            }}
          />
        </span>
        <span className={`flex-1 text-[11px] font-mono uppercase tracking-wider ${visible ? 'text-white/80' : 'text-white/40'}`}>
          Показывать окопы
        </span>
        {/* Счётчик объектов: видно после фильтра / всего в файле */}
        <span className="text-[10px] font-mono tabular-nums text-white/40">
          {loading ? '…' : `${visibleCount}/${total}`}
        </span>
      </button>

      {error && (
        <p role="alert" className="mt-2 text-[10px] leading-snug text-red-300/80">
          {error}
        </p>
      )}

      {/* Честная сводка источников: демо-файл vs реально просканированные данные */}
      {!loading && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] font-mono uppercase tracking-wider text-white/35">
          <span>Демо-файл: <span className="text-white/55">{demoCount}</span></span>
          <span aria-hidden className="text-white/15">|</span>
          <span>Сканер / вручную: <span className={scannedCount > 0 ? 'text-[var(--gold-primary)]' : 'text-white/55'}>{scannedCount}</span></span>
        </div>
      )}
      {!loading && scannedCount === 0 && (
        <p className="mt-1 text-[9.5px] leading-snug text-white/30">
          Просканированных укреплений пока нет. Запустите CV-скан или обведите линию
          в модуле «ОКОПЫ → Картограф укреплений» — они появятся здесь и на карте.
        </p>
      )}

      {/* Фильтр по типу */}
      <div className="mt-2.5">
        <div className="mb-1 text-[9px] font-mono uppercase tracking-[0.18em] text-white/30">
          Тип объекта
        </div>
        <div className="flex flex-wrap gap-1">
          {ALL_TRENCH_TYPES.map((t) => (
            <FilterChip
              key={t}
              label={TRENCH_TYPE_LABEL_RU[t]}
              color={TRENCH_TYPE_COLORS[t]}
              active={typesOn.has(t)}
              onClick={() => onToggleType(t)}
            />
          ))}
        </div>
      </div>

      {/* Фильтр по статусу */}
      <div className="mt-2.5">
        <div className="mb-1 text-[9px] font-mono uppercase tracking-[0.18em] text-white/30">
          Статус
        </div>
        <div className="flex flex-wrap gap-1">
          {ALL_TRENCH_STATUSES.map((s) => (
            <FilterChip
              key={s}
              label={TRENCH_STATUS_LABEL_RU[s]}
              color={TRENCH_STATUS_COLORS[s]}
              active={statusesOn.has(s)}
              onClick={() => onToggleStatus(s)}
            />
          ))}
        </div>
      </div>

      {/* Сброс фильтров + легенда пунктира */}
      <div className="mt-2.5 flex items-center justify-between">
        <button
          type="button"
          onClick={onResetFilters}
          disabled={!filtersDirty}
          className={`rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider transition-colors ${
            filtersDirty
              ? 'border-white/15 text-[var(--gold-primary)] hover:bg-white/10'
              : 'border-white/[0.06] text-white/20'
          }`}
        >
          Сбросить фильтр
        </button>
        <span className="text-[8.5px] font-mono text-white/25">
          · · · заброшено&nbsp;&nbsp;- - - уничтожено
        </span>
      </div>
    </div>
  );
}

export default TrenchesPanel;
