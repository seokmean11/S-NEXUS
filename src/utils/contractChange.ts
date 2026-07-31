import type {
  AmendmentSequence,
  ContractAmendment,
  ContractChangeStatusItem,
  ContractChangeExportRow,
  ContractSnapshot,
  ContractTimelineRow,
} from '@/types/contractChange';
import { MAX_CONTRACT_AMENDMENTS } from '@/types/contractChange';
import type { Project } from '@/types';
import { formatAmountInput, formatIsoToKoreanDate } from '@/utils/formatInput';

function normalizeAmount(value?: number): number | undefined {
  return value == null || Number.isNaN(value) ? undefined : value;
}

function normalizeEndDate(value?: string): string | undefined {
  return value && value.trim() ? value : undefined;
}

export function snapshotFromProject(
  project: Pick<Project, 'contractAmount' | 'startDate' | 'endDate'>,
): ContractSnapshot {
  return {
    contractAmount: normalizeAmount(project.contractAmount),
    startDate: project.startDate,
    endDate: normalizeEndDate(project.endDate),
  };
}

export function getProjectBaseline(project: Project): ContractSnapshot {
  return project.initialContract ?? snapshotFromProject(project);
}

export function getAmendmentsForProject(
  amendments: ContractAmendment[],
  projectId: string,
): ContractAmendment[] {
  return amendments
    .filter((a) => a.projectId === projectId)
    .sort((a, b) => a.sequence - b.sequence);
}

export function getNextAmendmentSequence(
  amendments: ContractAmendment[],
  projectId: string,
): AmendmentSequence | null {
  const count = getAmendmentsForProject(amendments, projectId).length;
  const next = count + 1;
  if (next > MAX_CONTRACT_AMENDMENTS) return null;
  return next as AmendmentSequence;
}

export function getSnapshotBeforeSequence(
  baseline: ContractSnapshot,
  amendments: ContractAmendment[],
  sequence: AmendmentSequence,
): ContractSnapshot {
  const previous = amendments
    .filter((a) => a.sequence < sequence)
    .sort((a, b) => b.sequence - a.sequence)[0];
  return previous ? amendmentToSnapshot(previous) : baseline;
}

export function amendmentToSnapshot(amendment: ContractAmendment): ContractSnapshot {
  return {
    contractAmount: normalizeAmount(amendment.contractAmount),
    startDate: amendment.startDate,
    endDate: normalizeEndDate(amendment.endDate),
  };
}

export function getEffectiveContract(
  baseline: ContractSnapshot,
  amendments: ContractAmendment[],
): ContractSnapshot {
  if (amendments.length === 0) return baseline;
  const latest = amendments[amendments.length - 1];
  return amendmentToSnapshot(latest);
}

function formatMonthValue(months: number): string {
  const abs = Math.abs(months);
  const formatted = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
  return `${formatted}개월`;
}

function signedMonthDelta(prev?: string, next?: string): number | undefined {
  if (!prev || !next || prev === next) return undefined;

  const days =
    (new Date(next).getTime() - new Date(prev).getTime()) / (1000 * 60 * 60 * 24);
  if (Math.abs(days) < 0.5) return undefined;

  const months = days / 30;
  return Math.round(months * 10) / 10;
}

function contractDurationMonths(start: string, end?: string): number | undefined {
  if (!end) return undefined;

  const days =
    (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24);
  if (days < 0) return undefined;

  return Math.round((days / 30) * 10) / 10;
}

function buildAmountChangeItem(
  prev?: number,
  next?: number,
): ContractChangeStatusItem | undefined {
  const p = normalizeAmount(prev);
  const n = normalizeAmount(next);
  if (p == null || n == null || p === n) return undefined;

  const diff = n - p;
  return {
    label: '금액증감',
    value: `${formatAmountInput(Math.abs(diff))}원`,
    direction: diff > 0 ? 'up' : 'down',
  };
}

function buildPeriodChangeItem(
  baseline: ContractSnapshot,
  latest: ContractSnapshot,
): ContractChangeStatusItem | undefined {
  const baselineDuration = contractDurationMonths(baseline.startDate, baseline.endDate);
  const latestDuration = contractDurationMonths(latest.startDate, latest.endDate);

  if (baselineDuration != null && latestDuration != null && baselineDuration !== latestDuration) {
    const diff = Math.round((latestDuration - baselineDuration) * 10) / 10;
    if (diff === 0) return undefined;
    return {
      label: '기간증감',
      value: formatMonthValue(diff),
      direction: diff > 0 ? 'up' : 'down',
    };
  }

  const startDiff = signedMonthDelta(baseline.startDate, latest.startDate);
  if (startDiff != null && startDiff !== 0) {
    return {
      label: '기간증감',
      value: formatMonthValue(startDiff),
      direction: startDiff > 0 ? 'up' : 'down',
    };
  }

  const endDiff = signedMonthDelta(baseline.endDate, latest.endDate);
  if (endDiff != null && endDiff !== 0) {
    return {
      label: '기간증감',
      value: formatMonthValue(endDiff),
      direction: endDiff > 0 ? 'up' : 'down',
    };
  }

  return undefined;
}

/** @deprecated 내부 호환용 */
export function formatAmountDelta(prev?: number, next?: number): string | undefined {
  const item = buildAmountChangeItem(prev, next);
  if (!item) return undefined;
  const tag = item.direction === 'up' ? '증' : '감';
  return `${item.label} ${item.value} (${tag})`;
}

export function formatDateDeltaInMonths(prev?: string, next?: string): string | undefined {
  const diff = signedMonthDelta(prev, next);
  if (diff == null || diff === 0) return undefined;
  const tag = diff > 0 ? '증' : '감';
  return `기간증감 ${formatMonthValue(diff)} (${tag})`;
}

/** @deprecated use formatDateDeltaInMonths */
export function formatDateDelta(prev?: string, next?: string): string | undefined {
  return formatDateDeltaInMonths(prev, next);
}

export function buildFinalChangeStatusItems(
  baseline: ContractSnapshot,
  amendments: ContractAmendment[],
): ContractChangeStatusItem[] {
  if (amendments.length === 0) return [];

  const latest = getEffectiveContract(baseline, amendments);
  const items: ContractChangeStatusItem[] = [];

  const amountItem = buildAmountChangeItem(baseline.contractAmount, latest.contractAmount);
  if (amountItem) items.push(amountItem);

  const periodItem = buildPeriodChangeItem(baseline, latest);
  if (periodItem) items.push(periodItem);

  return items;
}

/** @deprecated use buildFinalChangeStatusItems */
export function buildFinalChangeStatusLines(
  baseline: ContractSnapshot,
  amendments: ContractAmendment[],
): string[] {
  return buildFinalChangeStatusItems(baseline, amendments).map(
    (item) =>
      `${item.label} ${item.value} (${item.direction === 'up' ? '증' : '감'})`,
  );
}

export function buildContractTimeline(
  baseline: ContractSnapshot,
  amendments: ContractAmendment[],
): ContractTimelineRow[] {
  const rows: ContractTimelineRow[] = [
    {
      key: 'initial',
      label: '최초',
      snapshot: baseline,
    },
  ];

  for (const amendment of amendments) {
    const snapshot = amendmentToSnapshot(amendment);
    rows.push({
      key: amendment.id,
      label: `변경 ${amendment.sequence}차`,
      sequence: amendment.sequence,
      snapshot,
    });
  }

  return rows;
}

export function flattenContractChangesForExport(
  projects: Project[],
  amendments: ContractAmendment[],
): ContractChangeExportRow[] {
  const rows: ContractChangeExportRow[] = [];

  for (const project of projects) {
    const baseline = getProjectBaseline(project);
    const projectAmendments = getAmendmentsForProject(amendments, project.id);
    const timeline = buildContractTimeline(baseline, projectAmendments);
    const finalItems = buildFinalChangeStatusItems(baseline, projectAmendments);
    const lastAmendment = projectAmendments[projectAmendments.length - 1];
    const amountItem = finalItems.find((item) => item.label === '금액증감');
    const periodItem = finalItems.find((item) => item.label === '기간증감');

    for (const row of timeline) {
      const amendment = row.sequence
        ? projectAmendments.find((a) => a.sequence === row.sequence)
        : undefined;

      const isLastAmendment = amendment?.id === lastAmendment?.id;

      rows.push({
        projectId: project.id,
        projectCode: project.projectCode,
        projectName: project.name,
        label: row.label,
        sequence: row.sequence,
        contractAmount: row.snapshot.contractAmount,
        startDate: row.snapshot.startDate,
        endDate: row.snapshot.endDate,
        amountDelta: isLastAmendment && amountItem
          ? `${amountItem.label} ${amountItem.value} (${amountItem.direction === 'up' ? '증' : '감'})`
          : undefined,
        startDateDelta: isLastAmendment && periodItem
          ? `${periodItem.label} ${periodItem.value} (${periodItem.direction === 'up' ? '증' : '감'})`
          : undefined,
        endDateDelta: undefined,
        registeredAt: amendment?.registeredAt ?? project.createdAt,
        registeredByName: amendment?.registeredByName,
      });
    }
  }

  return rows;
}

export function formatContractAmount(value?: number): string {
  if (value == null || value <= 0) return '-';
  return `${formatAmountInput(value)}원`;
}

export function formatContractDate(value?: string): string {
  if (!value) return '-';
  return formatIsoToKoreanDate(value);
}

export function canRegisterAmendmentSequence(
  amendments: ContractAmendment[],
  sequence: AmendmentSequence,
): boolean {
  const count = amendments.length;
  return sequence >= 1 && sequence <= MAX_CONTRACT_AMENDMENTS && sequence <= count + 1;
}
