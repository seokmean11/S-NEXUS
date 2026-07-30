import type { Project, TrackAllocation } from '@/types';
import type {
  ContributionTrendRow,
  GroupContributionRow,
  HistoryEvent,
  PersonnelChangeRow,
  ReportPeriod,
} from '@/types/history';
import { getQuarterInfo } from '@/utils/historyLogger';

const PERSONNEL_ENTITY_TYPES = new Set([
  'executive_admin',
  'employee',
  'division_head',
  'team_head',
]);

const ALLOCATION_TRACKS = ['bid', 'design', 'production'] as const;

function inPeriod(event: HistoryEvent, period: ReportPeriod): boolean {
  return event.year === period.year && event.quarter === period.quarter;
}

function previousYearPeriod(period: ReportPeriod): ReportPeriod {
  return { year: period.year - 1, quarter: period.quarter };
}

export function getPersonnelChanges(
  events: HistoryEvent[],
  period: ReportPeriod,
): PersonnelChangeRow[] {
  return events
    .filter(
      (event) =>
        inPeriod(event, period) &&
        (event.category === 'organization' || event.category === 'executive') &&
        PERSONNEL_ENTITY_TYPES.has(event.entityType),
    )
    .map((event) => ({
      date: event.occurredAt.slice(0, 10),
      action: event.action,
      entityType: event.entityType,
      name: event.entityName ?? '-',
      detail: event.summary,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function extractContributionMap(
  events: HistoryEvent[],
  period: ReportPeriod,
): Map<string, ContributionTrendRow> {
  const map = new Map<string, ContributionTrendRow>();

  for (const event of events) {
    if (!inPeriod(event, period) || event.category !== 'allocation') continue;
    if (event.action !== 'saved' || !event.after) continue;

    const employeeId = String(event.after.employeeId ?? '');
    const employeeName = String(event.after.employeeName ?? '');
    if (!employeeId) continue;

    const ratio = Number(event.after.ratio ?? 0);
    const existing = map.get(employeeId);
    if (existing) {
      existing.currentTotal += ratio;
    } else {
      map.set(employeeId, {
        employeeId,
        employeeName,
        divisionName: String(event.metadata?.divisionName ?? '-'),
        teamName: String(event.metadata?.teamName ?? '-'),
        currentTotal: ratio,
        previousTotal: 0,
        delta: 0,
      });
    }
  }

  return map;
}

export function getIndividualContributionTrends(
  events: HistoryEvent[],
  period: ReportPeriod,
): ContributionTrendRow[] {
  const currentMap = extractContributionMap(events, period);
  const previousMap = extractContributionMap(events, previousYearPeriod(period));

  for (const [employeeId, previous] of previousMap) {
    const current = currentMap.get(employeeId);
    if (current) {
      current.previousTotal = previous.currentTotal;
      current.delta = current.currentTotal - previous.currentTotal;
    } else {
      currentMap.set(employeeId, {
        ...previous,
        currentTotal: 0,
        previousTotal: previous.currentTotal,
        delta: -previous.currentTotal,
      });
    }
  }

  for (const row of currentMap.values()) {
    if (!previousMap.has(row.employeeId)) {
      row.delta = row.currentTotal;
    }
  }

  return [...currentMap.values()].sort((a, b) => b.delta - a.delta);
}

export function getGroupContributionTrends(
  events: HistoryEvent[],
  period: ReportPeriod,
  groupType: 'division' | 'team',
): GroupContributionRow[] {
  const currentMap = new Map<string, GroupContributionRow>();
  const previousMap = new Map<string, GroupContributionRow>();
  const memberSets = new Map<string, Set<string>>();

  const accumulate = (
    target: Map<string, GroupContributionRow>,
    targetPeriod: ReportPeriod,
  ) => {
    for (const event of events) {
      if (!inPeriod(event, targetPeriod) || event.category !== 'allocation') continue;
      if (event.action !== 'saved' || !event.after) continue;

      const groupId =
        groupType === 'division'
          ? String(event.metadata?.divisionId ?? '')
          : String(event.metadata?.teamId ?? '');
      const groupName =
        groupType === 'division'
          ? String(event.metadata?.divisionName ?? '-')
          : String(event.metadata?.teamName ?? '-');
      if (!groupId) continue;

      const ratio = Number(event.after.ratio ?? 0);
      const employeeId = String(event.after.employeeId ?? '');

      const existing = target.get(groupId);
      if (existing) {
        existing.currentTotal += ratio;
      } else {
        target.set(groupId, {
          groupId,
          groupName,
          groupType,
          currentTotal: ratio,
          previousTotal: 0,
          delta: 0,
          memberCount: 0,
        });
      }

      if (employeeId) {
        const key = `${targetPeriod.year}-${targetPeriod.quarter}-${groupId}`;
        const set = memberSets.get(key) ?? new Set<string>();
        set.add(employeeId);
        memberSets.set(key, set);
      }
    }
  };

  accumulate(currentMap, period);
  accumulate(previousMap, previousYearPeriod(period));

  for (const [groupId, previous] of previousMap) {
    const current = currentMap.get(groupId);
    if (current) {
      current.previousTotal = previous.currentTotal;
      current.delta = current.currentTotal - previous.currentTotal;
    } else {
      currentMap.set(groupId, {
        ...previous,
        currentTotal: 0,
        previousTotal: previous.currentTotal,
        delta: -previous.currentTotal,
        memberCount: 0,
      });
    }
  }

  for (const row of currentMap.values()) {
    if (!previousMap.has(row.groupId)) {
      row.delta = row.currentTotal;
    }
    const key = `${period.year}-${period.quarter}-${row.groupId}`;
    row.memberCount = memberSets.get(key)?.size ?? 0;
  }

  return [...currentMap.values()].sort((a, b) => b.currentTotal - a.currentTotal);
}

export function getHistoryTimelineSummary(
  events: HistoryEvent[],
  period: ReportPeriod,
): { total: number; byCategory: Record<string, number> } {
  const filtered = events.filter((event) => inPeriod(event, period));
  const byCategory: Record<string, number> = {};
  for (const event of filtered) {
    byCategory[event.category] = (byCategory[event.category] ?? 0) + 1;
  }
  return { total: filtered.length, byCategory };
}

export function buildInitialAllocationHistory(
  allocations: TrackAllocation[],
  projects: Project[],
): HistoryEvent[] {
  const synthetic: HistoryEvent[] = [];
  const { year, quarter } = getQuarterInfo();

  for (const allocation of allocations) {
    const project = projects.find((p) => p.id === allocation.projectId);
    if (!project) continue;

    for (const track of ALLOCATION_TRACKS) {
      for (const entry of allocation[track]) {
        synthetic.push({
          id: `seed-${allocation.projectId}-${track}-${entry.employeeId}`,
          category: 'allocation',
          action: 'saved',
          entityType: 'allocation_entry',
          entityId: entry.employeeId,
          entityName: entry.employeeName,
          summary: `[초기] ${project.name} · ${track} ${entry.ratio}%`,
          occurredAt: allocation.updatedAt,
          year,
          quarter,
          after: {
            employeeId: entry.employeeId,
            employeeName: entry.employeeName,
            ratio: entry.ratio,
            track,
            projectId: project.id,
            projectName: project.name,
          },
          metadata: {
            divisionId: project.divisionId,
            divisionName: project.divisionName,
            teamId: project.teamId,
            teamName: project.teamName,
          },
        });
      }
    }
  }

  return synthetic;
}
