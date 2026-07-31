import type {
  AmendmentSequence,
  ContractAmendment,
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

export function formatAmountDelta(prev?: number, next?: number): string | undefined {
  const p = normalizeAmount(prev);
  const n = normalizeAmount(next);
  if (p == null || n == null || p === n) return undefined;
  const diff = n - p;
  if (diff > 0) return `증액 ${formatAmountInput(diff)}원`;
  return `감액 ${formatAmountInput(Math.abs(diff))}원`;
}

export function formatDateDelta(prev?: string, next?: string): string | undefined {
  if (!prev || !next || prev === next) return undefined;
  const days = Math.round(
    (new Date(next).getTime() - new Date(prev).getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days === 0) return undefined;
  if (days > 0) return `${days}일 증가`;
  return `${Math.abs(days)}일 감소`;
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

  let previous = baseline;
  for (const amendment of amendments) {
    const snapshot = amendmentToSnapshot(amendment);
    rows.push({
      key: amendment.id,
      label: `변경 ${amendment.sequence}차`,
      sequence: amendment.sequence,
      snapshot,
      amountDelta: formatAmountDelta(previous.contractAmount, snapshot.contractAmount),
      startDateDelta: formatDateDelta(previous.startDate, snapshot.startDate),
      endDateDelta: formatDateDelta(previous.endDate, snapshot.endDate),
    });
    previous = snapshot;
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

    for (const row of timeline) {
      const amendment = row.sequence
        ? projectAmendments.find((a) => a.sequence === row.sequence)
        : undefined;

      rows.push({
        projectId: project.id,
        projectCode: project.projectCode,
        projectName: project.name,
        label: row.label,
        sequence: row.sequence,
        contractAmount: row.snapshot.contractAmount,
        startDate: row.snapshot.startDate,
        endDate: row.snapshot.endDate,
        amountDelta: row.amountDelta,
        startDateDelta: row.startDateDelta,
        endDateDelta: row.endDateDelta,
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
