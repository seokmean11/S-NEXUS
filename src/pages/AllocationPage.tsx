import { AllocationForm } from '@/components/allocation/AllocationForm';
import { BudgetPanel } from '@/components/budget/BudgetPanel';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useApp } from '@/context/AppContext';

export function AllocationPage() {
  const { budget, riskScenario, setRiskScenario } = useApp();

  return (
    <ErrorBoundary fallbackTitle="인력 배분 화면 오류">
      <AllocationForm />
      <div className="allocation-budget">
        <BudgetPanel
          budget={budget}
          riskScenario={riskScenario}
          onScenarioChange={setRiskScenario}
        />
      </div>
    </ErrorBoundary>
  );
}
