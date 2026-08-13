const CLAUDE_CONFIRM_PATTERN =
  /^(네|넵|응|예|ㅇㅇ|좋아|좋습니다|진행|그렇게|맞아|맞습니다|ok|okay|yes|해줘|해주세요|부탁|그래|좋아요|ai\s*분석|클로드\s*분석|추가\s*분석)[!.?\s]*$/i;

const CLAUDE_DECLINE_PATTERN =
  /^(아니|아니요|no|nope|취소|필요\s*없|안\s*할|그만|됐|괜찮|로컬\s*만|여기까지)[!.?\s]*$/i;

export function buildClaudeAnalysisOfferMessage(hasLocalData: boolean): string {
  const intro = hasLocalData
    ? '위 내용은 **등록·동기화된 데이터**(조직·프로젝트·외주 등)를 기준으로 한 **객관적 집계**입니다.'
    : '등록·동기화된 데이터만으로는 이 질문에 대한 **로컬 집계 결과**를 만들지 못했습니다.';

  return `【Claude 추가 분석 안내】

${intro}

**Claude 연동 추가 분석**(인사이트·해석·평가·종합 의견)을 이어서 진행할 수 있습니다.

- **진행 시** 상단 **「이번 분석 사용」** 크레딧(추정 비용)이 **발생**합니다.
- **로컬 집계만**으로 충분하면 여기서 멈추셔도 됩니다. (크레딧 **없음**)

- Claude 분석 **진행**: 「**네, AI 분석 진행**」
- **로컬 결과만 유지**: 「**아니요**」`;
}

export function isClaudeAnalysisConfirmResponse(query: string): boolean {
  return CLAUDE_CONFIRM_PATTERN.test(query.trim());
}

export function isClaudeAnalysisDeclineResponse(query: string): boolean {
  return CLAUDE_DECLINE_PATTERN.test(query.trim());
}

export function buildClaudeAnalysisDeclinedMessage(): string {
  return '알겠습니다. **로컬 집계 결과**만 유지합니다. Claude 추가 분석은 진행하지 않으며 **크레딧은 사용되지 않습니다**.';
}
