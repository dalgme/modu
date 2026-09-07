import { CalendarClock, MapPin, Phone } from 'lucide-react';

import { formatDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

/** 배정일(ISO)로부터 오늘까지 경과 일수 (배정 당일 = 0). */
function daysSinceAssigned(assignedAt: string): number {
  const then = new Date(assignedAt).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

/** 경과일에 따른 색상/문구 (오래될수록 주의 색). 멘토가 눈에 띄게 확인하도록 단계별 강조. */
function elapsedTone(days: number): {
  card: string;
  bigText: string;
  chip: string;
  note: string;
  label: string;
} {
  if (days <= 3) {
    return {
      card: 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40',
      bigText: 'text-emerald-700 dark:text-emerald-300',
      chip: 'bg-emerald-600 text-white',
      note: 'text-emerald-700/80 dark:text-emerald-300/80',
      label: '배정 초기',
    };
  }
  if (days <= 7) {
    return {
      card: 'border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/40',
      bigText: 'text-sky-700 dark:text-sky-300',
      chip: 'bg-sky-600 text-white',
      note: 'text-sky-700/80 dark:text-sky-300/80',
      label: '진행 중',
    };
  }
  if (days <= 14) {
    return {
      card: 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40',
      bigText: 'text-amber-700 dark:text-amber-300',
      chip: 'bg-amber-500 text-white',
      note: 'text-amber-700/80 dark:text-amber-300/80',
      label: '확인 필요',
    };
  }
  return {
    card: 'border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40',
    bigText: 'text-rose-700 dark:text-rose-300',
    chip: 'bg-rose-600 text-white',
    note: 'text-rose-700/80 dark:text-rose-300/80',
    label: '지연 주의',
  };
}

/**
 * 멘토 배정 후 경과일 강조 카드.
 * 멘토가 케이스를 열었을 때 "배정된 지 며칠 지났는지"를 크게 보여줘 진행 지연을 방지한다.
 * assignedAt 없으면(미배정) 렌더하지 않는다.
 * address 가 있으면 '사업장 주소 네이버로 보기', phone 이 있으면 '전화 걸기' 버튼을 함께 노출(방문·연락 준비용).
 */
export function MentorElapsedCard({
  assignedAt,
  address,
  phone,
}: {
  assignedAt: string | null;
  address?: string | null;
  phone?: string | null;
}) {
  if (!assignedAt) return null;
  const days = daysSinceAssigned(assignedAt);
  const tone = elapsedTone(days);
  const addr = address?.trim();
  const mapHref = addr ? `https://map.naver.com/p/search/${encodeURIComponent(addr)}` : null;
  const telDigits = phone?.replace(/[^\d+]/g, '');
  const telHref = telDigits ? `tel:${telDigits}` : null;

  return (
    <div className={cn('flex flex-wrap items-center gap-4 rounded-xl border p-4', tone.card)}>
      <span
        className={cn(
          'flex h-12 w-12 shrink-0 items-center justify-center rounded-lg',
          tone.chip,
        )}
      >
        <CalendarClock className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className={cn('text-2xl font-bold tabular-nums', tone.bigText)}>D+{days}</span>
          <span className={cn('text-sm font-semibold', tone.bigText)}>
            멘토 배정 후 {days}일 경과
          </span>
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', tone.chip)}>
            {tone.label}
          </span>
        </div>
        <p className={cn('mt-0.5 text-xs', tone.note)}>배정일 {formatDate(assignedAt)}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {mapHref && (
          <a
            href={mapHref}
            target="_blank"
            rel="noopener noreferrer"
            title={`네이버 지도에서 위치 보기 · ${addr}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#03C75A] px-3 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
          >
            <MapPin className="h-4 w-4" />
            사업장 주소 네이버로 보기
          </a>
        )}
        {telHref && (
          <a
            href={telHref}
            title={`전화 걸기 · ${phone}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
          >
            <Phone className="h-4 w-4" />
            전화 걸기
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * 리스트 행에 붙이는 컴팩트 경과일 배지 (진행현황 리스트·대기 큐 등).
 * assignedAt 없으면 렌더하지 않는다.
 */
export function MentorElapsedBadge({ assignedAt }: { assignedAt: string | null }) {
  if (!assignedAt) return null;
  const days = daysSinceAssigned(assignedAt);
  const tone = elapsedTone(days);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold',
        tone.chip,
      )}
      title={`멘토 배정 후 ${days}일 경과 (배정일 ${formatDate(assignedAt)})`}
    >
      <CalendarClock className="h-3 w-3" />
      배정 D+{days}
    </span>
  );
}
