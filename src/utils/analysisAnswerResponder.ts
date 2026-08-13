import type { AnalysisAnswerResponder } from '@/types/analysisChatSession';

const RESPONDER_LABELS: Record<AnalysisAnswerResponder, string> = {
  local: '로컬시스템',
  claude: '클로드',
  'local+claude': '로컬시스템+클로드',
};

export function formatAnalysisAnswerResponder(
  responder: AnalysisAnswerResponder | null | undefined,
): string {
  if (!responder) return '—';
  return RESPONDER_LABELS[responder];
}

export function analysisAnswerUsedClaude(
  responder: AnalysisAnswerResponder | null | undefined,
): boolean {
  return responder === 'claude' || responder === 'local+claude';
}
