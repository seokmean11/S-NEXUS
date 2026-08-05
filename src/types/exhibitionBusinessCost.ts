export interface ExhibitionCostByType {
  type: string;
  projectCount: number;
  totalCost: number;
  sharePercent: number;
}

export interface ExhibitionBusinessCostSummary {
  projectCount: number;
  totalCost: number;
  averageCost: number;
  items: ExhibitionCostByType[];
}
