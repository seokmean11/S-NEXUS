import { Card } from '@/components/ui/Card';
import { formatCurrency, formatPercent } from '@/data/mockData';
import type { BudgetStatus, RiskScenario } from '@/types';
import { Button } from '@/components/ui/Button';

interface BudgetPanelProps {
  budget: BudgetStatus;
  riskScenario: RiskScenario;
  onScenarioChange: (scenario: RiskScenario) => void;
  readOnly?: boolean;
}

export function BudgetPanel({
  budget,
  riskScenario,
  onScenarioChange,
  readOnly = false,
}: BudgetPanelProps) {
  const rows = [
    [
      { label: '계약금액', value: formatCurrency(budget.contractAmount) },
      { label: '기성누계', value: formatCurrency(budget.cumulativeBilling) },
      { label: '잔여기성', value: formatCurrency(budget.remainingBilling) },
      { label: '기성률', value: formatPercent(budget.billingRate) },
    ],
    [
      { label: '실행예산', value: formatCurrency(budget.executionBudget) },
      { label: '집행예산', value: formatCurrency(budget.spentBudget) },
      { label: '잔여예산', value: formatCurrency(budget.remainingBudget) },
      { label: '예산소진율', value: formatPercent(budget.budgetBurnRate) },
    ],
  ];

  return (
    <Card
      title="자금 및 예산 현황"
      subtitle="현장 자금 통제력 모니터링"
      headerAction={
        !readOnly ? (
          <div className="budget-test-buttons no-print">
            <Button
              variant={riskScenario === 'cash_flow' ? 'danger' : 'ghost'}
              size="sm"
              onClick={() => onScenarioChange('cash_flow')}
            >
              ① 자금수지 악화
            </Button>
            <Button
              variant={riskScenario === 'budget_burn' ? 'danger' : 'ghost'}
              size="sm"
              onClick={() => onScenarioChange('budget_burn')}
            >
              ② 예산 소진 임박
            </Button>
            <Button
              variant={riskScenario === 'budget_exceed' ? 'danger' : 'ghost'}
              size="sm"
              onClick={() => onScenarioChange('budget_exceed')}
            >
              ③ 실행예산 초과
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onScenarioChange('normal')}
            >
              정상
            </Button>
          </div>
        ) : undefined
      }
    >
      <RiskBanner budget={budget} />
      <div className="budget-panel">
        {rows.map((row, rowIdx) => (
          <div key={rowIdx} className="budget-panel__row">
            {row.map((cell) => (
              <div key={cell.label} className="budget-panel__cell">
                <span className="budget-panel__label">{cell.label}</span>
                <span className="budget-panel__value">{cell.value}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}

function RiskBanner({ budget }: { budget: BudgetStatus }) {
  const budgetExceed = budget.spentBudget > budget.executionBudget;
  const budgetBurnHigh = budget.budgetBurnRate > 90 && !budgetExceed;
  const cashFlowBad = budget.spentBudget > budget.cumulativeBilling && !budgetExceed;

  if (budgetExceed) {
    return (
      <div className="risk-banner risk-banner--critical">
        🚨 긴급: 투입 비용이 도급 한도를 초과했습니다. 자금 통제력 약화 및 미지급 임금
        체불 사고 발생 위험이 상존하므로, 즉시 내부 실행예산 변경 기안을 진행해
        주십시오.
      </div>
    );
  }

  if (budgetBurnHigh) {
    return (
      <div className="risk-banner risk-banner--warning">
        ⚠️ 주의: 집행예산 소진율이 90%를 초과했습니다. 잔여 예산을 관리하세요.
      </div>
    );
  }

  if (cashFlowBad) {
    return (
      <div className="risk-banner risk-banner--caution">
        ⚠️ 경고: 수금된 기성액보다 집행 예산이 큽니다. 단기 자금 유동성을 점검하세요.
      </div>
    );
  }

  return null;
}
