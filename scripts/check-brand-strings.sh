#!/usr/bin/env bash
# 브랜딩 리터럴 잔재 검사 (docs/MODU-DESIGN.md §17-4). 기관명은 programs 에서 읽고 코드에는 {client}/{operator}/{program} 만 둔다.
# 사용: bash scripts/check-brand-strings.sh  (lint 단계에서 실행, 1건이라도 있으면 실패)
set -euo pipefail
cd "$(dirname "$0")/.."
PATTERN='재기지원|진흥원|넥스트랩|restart\.poclab\.kr|대전일자리|세종창조|렛츠'
# '휴대전화' 등 우연히 '대전'을 포함하는 낱말은 제외 대상이 아니므로 '대전' 단독은 검사하지 않는다(위 기관명 패턴으로 충분).
HITS=$(grep -rnE "$PATTERN" src/ --include='*.ts' --include='*.tsx' || true)
if [ -n "$HITS" ]; then
  echo "❌ 브랜딩 리터럴이 코드에 남아 있습니다 (기관명은 행사 설정에서 읽으세요):"
  echo "$HITS"
  echo "$HITS" | wc -l
  exit 1
fi
echo "✔ 브랜딩 리터럴 0건"
