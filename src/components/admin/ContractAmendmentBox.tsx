import { Button } from '@/components/ui/Button';
import type { AmendmentSequence, ContractEditTarget } from '@/types/contractChange';
import { MAX_CONTRACT_AMENDMENTS } from '@/types/contractChange';

interface ContractAmendmentBoxProps {
  open: boolean;
  selectedTarget: ContractEditTarget | null;
  nextSequence: AmendmentSequence | null;
  onToggle: () => void;
}

export function ContractAmendmentBox({
  open,
  selectedTarget,
  nextSequence,
  onToggle,
}: ContractAmendmentBoxProps) {
  const isNewRegistration =
    nextSequence != null && selectedTarget === nextSequence;

  return (
    <div className="contract-amendment-box">
      <Button type="button" variant={open ? 'primary' : 'outline'} size="sm" onClick={onToggle}>
        계약변경
      </Button>

      {open && (
        <div className="contract-amendment-box__panel">
          {isNewRegistration ? (
            <>
              <p className="contract-amendment-box__title">
                변경 {nextSequence}차 신규 등록
              </p>
              <p className="contract-amendment-box__hint form-field__hint--active">
                직전 차수 계약 내용을 확인한 뒤, 새로운 계약변경 내용을 입력하세요.
                입력 완료 후 <strong>수정 저장</strong>하면 {nextSequence}차로 등록됩니다.
              </p>
            </>
          ) : selectedTarget === 'initial' ? (
            <p className="contract-amendment-box__hint form-field__hint--active">
              최초 계약 수정 중 — 변경 후 <strong>수정 저장</strong>
            </p>
          ) : selectedTarget ? (
            <p className="contract-amendment-box__hint form-field__hint--active">
              변경 {selectedTarget}차 수정 중 — 변경 후 <strong>수정 저장</strong>
            </p>
          ) : null}

          {nextSequence == null && !selectedTarget && (
            <p className="contract-amendment-box__hint">
              최대 {MAX_CONTRACT_AMENDMENTS}차까지 등록되었습니다.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
