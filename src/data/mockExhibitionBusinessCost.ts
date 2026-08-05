import type { ExhibitionBusinessCostSummary } from '@/types/exhibitionBusinessCost';

const RAW_ITEMS = [
  { type: '기획·콘셉', projectCount: 18, totalCost: 2_450_000_000 },
  { type: '공간·설계', projectCount: 22, totalCost: 3_820_000_000 },
  { type: '전시·제작', projectCount: 31, totalCost: 8_960_000_000 },
  { type: '설치·시공', projectCount: 27, totalCost: 4_710_000_000 },
  { type: '운영·유지', projectCount: 14, totalCost: 1_380_000_000 },
  { type: '기타', projectCount: 9, totalCost: 680_000_000 },
] as const;

const totalCost = RAW_ITEMS.reduce((sum, item) => sum + item.totalCost, 0);
const projectCount = RAW_ITEMS.reduce((sum, item) => sum + item.projectCount, 0);

export const MOCK_EXHIBITION_BUSINESS_COST: ExhibitionBusinessCostSummary = {
  projectCount,
  totalCost,
  averageCost: projectCount > 0 ? Math.round(totalCost / projectCount) : 0,
  items: RAW_ITEMS.map((item) => ({
    ...item,
    sharePercent: totalCost > 0 ? (item.totalCost / totalCost) * 100 : 0,
  })),
};
