import type { MentoringLogRow } from '@/lib/data/mentoring-logs';
import { formatVisitRange } from '@/lib/utils/format';

/** 공식 서식 제목 (원본 양식과 동일) */
const REPORT_TITLE = '대전 소상공인·자영업자 재기지원사업 컨설팅 결과보고서';

/** 서명 이미지(data:URI) 인라인 표시. 없으면 도장 자리표시 '(인)'. */
function Sign({ src }: { src: string | null }) {
  if (!src) return <span className="text-muted-foreground">(인)</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="서명" className="ml-1 inline-block h-8 align-middle object-contain" />;
}

/**
 * 멘토링 일지 '출력 원본' 문서 뷰 (멘토·진흥원·넥스트랩 공용).
 * 원본 컨설팅 결과보고서 서식과 정합성을 맞춘 표 레이아웃:
 *   [상단 정보표] 업체명·대표자·일시·장소·컨설팅주제·참석자(서명)·컨설턴트(서명)
 *   [1. 컨설팅]  기업 애로사항 등 / 컨설팅 내용 / 컨설팅 결과
 *   [2. 현장사진] 사진1 · 사진2
 * 서명은 케이스 단위로 저장·재사용되므로 '현재 적용된 서명'을 참석자/컨설턴트 칸에 인라인 표시한다.
 */
export function MentoringLogDocument({
  round,
  businessName,
  ownerName,
  mentorName,
  log,
  mentorSig,
  menteeSig,
  photos,
}: {
  round: number;
  businessName: string;
  ownerName: string;
  mentorName: string | null;
  log: MentoringLogRow;
  mentorSig: string | null;
  menteeSig: string | null;
  photos: string[];
}) {
  const visited = formatVisitRange(log.visited_at, log.duration_minutes);

  // 표 공통 스타일 — 셀 전체 1px 실선 테두리 + 라벨(th) 음영. 원본 표형식과 동일한 격자.
  const cell =
    '[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:align-top ' +
    '[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2 [&_th]:text-center [&_th]:font-semibold';

  return (
    <div className="mx-auto w-full max-w-3xl bg-card p-6 text-foreground shadow-sm print:p-0 print:shadow-none">
      <h1 className="text-center text-lg font-bold leading-snug sm:text-xl">{REPORT_TITLE}</h1>
      <p className="mb-4 mt-1 text-center text-xs text-muted-foreground print:hidden">
        {businessName}
        {' · '}
        {round}회차
        {mentorName ? ` · 담당 멘토 ${mentorName}` : ''}
      </p>

      {/* 상단 정보표 (라벨 | 값 | 라벨 | 값) */}
      <table className={`w-full table-fixed border-collapse text-sm ${cell}`}>
        <colgroup>
          <col className="w-[18%]" />
          <col className="w-[32%]" />
          <col className="w-[18%]" />
          <col className="w-[32%]" />
        </colgroup>
        <tbody>
          <tr>
            <th>업 체 명</th>
            <td className="text-left">{businessName || '-'}</td>
            <th>대 표 자</th>
            <td className="text-left">{ownerName || '-'}</td>
          </tr>
          <tr>
            <th>일 시</th>
            <td className="text-left">{visited || '-'}</td>
            <th>장 소</th>
            <td className="text-left">{log.place || '-'}</td>
          </tr>
          <tr>
            <th>컨설팅주제</th>
            <td className="text-left" colSpan={3}>
              {log.topic || '-'}
            </td>
          </tr>
          <tr>
            <th>참석자</th>
            <td className="text-left">
              {ownerName || '-'}
              <Sign src={menteeSig} />
            </td>
            <th>컨설턴트</th>
            <td className="text-left">
              {mentorName || '-'}
              <Sign src={mentorSig} />
            </td>
          </tr>
        </tbody>
      </table>

      {/* 1. 컨설팅 */}
      <h2 className="mb-1.5 mt-6 border-l-4 border-foreground/70 pl-2 text-base font-bold">1. 컨설팅</h2>
      <table className={`w-full table-fixed border-collapse text-sm ${cell}`}>
        <colgroup>
          <col className="w-[18%]" />
          <col className="w-[82%]" />
        </colgroup>
        <tbody>
          <tr>
            <th className="align-top">기업 애로사항 등</th>
            <td className="text-left">
              <div className="min-h-14 whitespace-pre-wrap">{log.difficulties || '-'}</div>
            </td>
          </tr>
          <tr>
            <th className="align-top">컨설팅 내용</th>
            <td className="text-left">
              <div className="min-h-28 whitespace-pre-wrap">{log.content || '-'}</div>
            </td>
          </tr>
          <tr>
            <th className="align-top">컨설팅 결과</th>
            <td className="text-left">
              <div className="min-h-20 whitespace-pre-wrap">{log.result || '-'}</div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* 2. 현장사진 */}
      <h2 className="mb-1.5 mt-6 border-l-4 border-foreground/70 pl-2 text-base font-bold">2. 현장사진</h2>
      <table className={`w-full table-fixed border-collapse text-sm ${cell}`}>
        <colgroup>
          <col className="w-1/2" />
          <col className="w-1/2" />
        </colgroup>
        <tbody>
          <tr>
            <th>사진1</th>
            <th>사진2</th>
          </tr>
          <tr>
            {[0, 1].map((i) => (
              <td key={i} className="h-40 text-center align-middle">
                {photos[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photos[i]}
                    alt={`현장사진 ${i + 1}`}
                    className="mx-auto max-h-36 max-w-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">(현장사진 첨부)</span>
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
