export type HistoryCategory = 'executive' | 'organization' | 'project' | 'allocation';

export type HistoryAction = 'created' | 'updated' | 'deleted' | 'saved';

export interface HistoryEvent {
  id: string;
  category: HistoryCategory;
  action: HistoryAction;
  entityType: string;
  entityId?: string;
  entityName?: string;
  summary: string;
  occurredAt: string;
  year: number;
  quarter: 1 | 2 | 3 | 4;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ExecutiveAdmin {
  id: string;
  name: string;
  rank: string;
}

export interface ExecutiveOffice {
  admins: ExecutiveAdmin[];
}

/** @deprecated migrated to admins[] */
export interface LegacyExecutiveOffice {
  adminName?: string;
  adminRank?: string;
}

export interface ReportPeriod {
  year: number;
  quarter: 1 | 2 | 3 | 4;
}

export interface PersonnelChangeRow {
  date: string;
  action: HistoryAction;
  entityType: string;
  name: string;
  detail: string;
}

export interface ContributionTrendRow {
  employeeId: string;
  employeeName: string;
  divisionName: string;
  teamName: string;
  currentTotal: number;
  previousTotal: number;
  delta: number;
}

export interface GroupContributionRow {
  groupId: string;
  groupName: string;
  groupType: 'division' | 'team';
  currentTotal: number;
  previousTotal: number;
  delta: number;
  memberCount: number;
}
