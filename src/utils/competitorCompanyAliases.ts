import type { CompetitorSector } from '@/types/competitorAnalysis';

const CORPORATE_LABEL_PATTERN =
  /(?:주식회사|식회사|유한회사|유한공사|\(주\)|\(유\)|㈜|（주）|（유）|\(株\))/gu;

/** 사명 변경 등 — canonicalName(변경 후) 기준으로 과거·현재 사명을 동일 법인으로 묶음 */
export interface CompetitorCompanyAliasGroup {
  canonicalName: string;
  aliases: string[];
  sectors?: CompetitorSector[];
}

export const COMPETITOR_COMPANY_ALIAS_GROUPS: CompetitorCompanyAliasGroup[] = [
  {
    canonicalName: '다원앤컴퍼니',
    aliases: ['다원디자인'],
    sectors: ['인테리어'],
  },
];

interface AliasLookupEntry {
  canonicalKey: string;
  canonicalName: string;
  sectors?: CompetitorSector[];
}

function normalizeAliasKey(name: string): string {
  return name
    .replace(/\n+/g, ' ')
    .replace(CORPORATE_LABEL_PATTERN, ' ')
    .replace(/\s+/g, '')
    .trim();
}

function buildAliasLookup(): Map<string, AliasLookupEntry> {
  const lookup = new Map<string, AliasLookupEntry>();

  for (const group of COMPETITOR_COMPANY_ALIAS_GROUPS) {
    const canonicalKey = normalizeAliasKey(group.canonicalName);
    const entry: AliasLookupEntry = {
      canonicalKey,
      canonicalName: normalizeAliasKey(group.canonicalName),
      sectors: group.sectors,
    };

    const names = [group.canonicalName, ...group.aliases];
    for (const name of names) {
      lookup.set(normalizeAliasKey(name), entry);
    }
  }

  return lookup;
}

const ALIAS_LOOKUP = buildAliasLookup();

function findAliasEntry(
  normalizedKey: string,
  sector?: CompetitorSector | string | null,
): AliasLookupEntry | null {
  const entry = ALIAS_LOOKUP.get(normalizedKey);
  if (!entry) return null;

  if (entry.sectors?.length && sector && !entry.sectors.includes(sector as CompetitorSector)) {
    return null;
  }

  return entry;
}

export function resolveCanonicalCompanyKey(
  normalizedKey: string,
  sector?: CompetitorSector | string | null,
): string {
  const entry = findAliasEntry(normalizedKey, sector);
  return entry?.canonicalKey ?? normalizedKey;
}

export function resolveCanonicalCompanyName(
  normalizedKeyOrName: string,
  sector?: CompetitorSector | string | null,
): string {
  const normalizedKey = normalizeAliasKey(normalizedKeyOrName);
  const entry = findAliasEntry(normalizedKey, sector);
  return entry?.canonicalName ?? normalizedKey;
}

export function applyCompetitorCompanyAlias(
  nameOrKey: string,
  sector?: CompetitorSector | string | null,
): { key: string; displayName: string } {
  const key = normalizeAliasKey(nameOrKey);
  const entry = findAliasEntry(key, sector);
  if (!entry) {
    return { key, displayName: key };
  }
  return { key: entry.canonicalKey, displayName: entry.canonicalName };
}
