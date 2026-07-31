import { Button } from '@/components/ui/Button';
import type { AmendmentSequence, ContractEditTarget } from '@/types/contractChange';
import { MAX_CONTRACT_AMENDMENTS } from '@/types/contractChange';

interface ContractAmendmentBoxProps {
  open: boolean;
  selectedTarget: ContractEditTarget | null;
  availableSequences: AmendmentSequence[];
  nextSequence: AmendmentSequence | null;
  onToggle: () => void;
  onSelectInitial: () => void;
  onSelectSequence: (sequence: AmendmentSequence) => void;
}

export function ContractAmendmentBox({
  open,
  selectedTarget,
  availableSequences,
  nextSequence,
  onToggle,
  onSelectInitial,
  onSelectSequence,
}: ContractAmendmentBoxProps) {
  return (
    <div className="contract-amendment-box">
      <Button type="button" variant={open ? 'primary' : 'outline'} size="sm" onClick={onToggle}>
        계약변경
      </Button>

      {open && (
        <div className="contract-amendment-box__panel">
          <p className="contract-amendment-box__title">변경 차수 선택</p>
          <div className="contract-amendment-box__rounds">
            <button
              type="button"
              className={`contract-amendment-round contract-amendment-round--initial ${selectedTarget === 'initial' ? 'contract-amendment-round--active' : ''}`}
              onClick={onSelectInitial}
            >
              최초
            </button>
            {availableSequences.map((seq) => (
              <button
                key={seq}
                type="button"
                className={`contract-amendment-round ${selectedTarget === seq ? 'contract-amendment-round--active' : ''} ${seq === nextSequence ? 'contract-amendment-round--next' : ''}`}
                onClick={() => onSelectSequence(seq)}
              >
                {seq}차
              </button>
            ))}
          </div>
          {nextSequence == null && (
            <p className="contract-amendment-box__hint">
              최대 {MAX_CONTRACT_AMENDMENTS}차까지 등록되었습니다.
            </p>
          )}
          {selectedTarget === 'initial' && (
            <p className="contract-amendment-box__hint">
              최초 계약 정보 수정 후 <strong>수정 저장</strong>으로 확정
            </p>
          )}
          {selectedTarget && selectedTarget !== 'initial' && (
            <p className="contract-amendment-box__hint">
              {selectedTarget}차: 새 계약금액·기간 입력 후 <strong>수정 저장</strong>으로 확정
            </p>
          )}
        </div>
      )}
    </div>
  );
}
