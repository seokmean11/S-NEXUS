import type { Project } from '@/types';

const DIVISION_ALIASES: Record<string, string> = {
  인테리어: '인테리어사업본부',
  전시: '전시사업본부',
  뉴미디어: '뉴미디어사업본부',
  해외: '해외사업본부',
};

export function resolveDivisionFilter(query: string): string | null {
  for (const [alias, fullName] of Object.entries(DIVISION_ALIASES)) {
    if (query.includes(alias)) return fullName;
  }
  return Object.values(DIVISION_ALIASES).find((name) => query.includes(name)) ?? null;
}

export function filterProjectsByQuery(
  projects: Project[],
  query?: string,
): { projects: Project[]; scopeNote: string } {
  if (!query?.trim()) {
    return { projects, scopeNote: `전체 ${projects.length}건` };
  }

  const normalized = query.trim();
  let filtered = projects;
  const notes: string[] = [];

  const division = resolveDivisionFilter(normalized);
  if (division) {
    filtered = filtered.filter((project) => project.divisionName === division);
    notes.push(division);
  }

  if (/공모/.test(normalized)) {
    filtered = filtered.filter((project) => project.status === '공모');
    notes.push('공모 단계');
  } else if (/설계/.test(normalized)) {
    filtered = filtered.filter((project) => project.status === '설계');
    notes.push('설계 단계');
  } else if (/제작/.test(normalized)) {
    filtered = filtered.filter((project) => project.status === '제작');
    notes.push('제작 단계');
  }

  if (/국내/.test(normalized) && !/해외/.test(normalized)) {
    filtered = filtered.filter((project) => project.marketScope === '국내');
    notes.push('국내');
  } else if (/해외/.test(normalized)) {
    filtered = filtered.filter((project) => project.marketScope === '해외');
    notes.push('해외');
  }

  if (notes.length === 0) {
    return { projects, scopeNote: `전체 ${projects.length}건` };
  }

  return {
    projects: filtered,
    scopeNote: `${notes.join(' · ')} ${filtered.length}건 (전체 ${projects.length}건 중)`,
  };
}

export function buildDivisionSummary(projects: Project[]) {
  const map = new Map<string, { count: number; orderCount: number; amount: number }>();

  for (const project of projects) {
    const bucket = map.get(project.divisionName) ?? { count: 0, orderCount: 0, amount: 0 };
    bucket.count += 1;
    const amount = project.contractAmount ?? 0;
    if (amount > 0) {
      bucket.orderCount += 1;
      bucket.amount += amount;
    }
    map.set(project.divisionName, bucket);
  }

  return [...map.entries()]
    .map(([division, stats]) => ({ division, ...stats }))
    .sort((a, b) => b.amount - a.amount);
}
