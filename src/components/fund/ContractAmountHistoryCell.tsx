import { useEffect, useRef, useState } from 'react';
import type { FundBillingContractRevision } from '@/types/fundBillingReport';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  appendContractRevision,
  contractRevisionLabel,
  ensureContractHistory,
  nextContractRevisionSequence,
  removeLatestContractRevision,
  updateContractRevisionAmount,
} from '@/utils/fundBillingContractHistory';
import { formatAmountInput, parseAmountInput } from '@/utils/formatInput';

function won(value: number): string {
  return value.toLocaleString('ko-KR');
}

interface ContractAmountHistoryCellProps {
  unlocked: boolean;
  contractAmount: number;
  history?: FundBillingContractRevision[];
  cumulativeAmount?: number;
  simpleBudgetEdit?: boolean;
  onExceed?: () => void;
  onCommit: (next: {
    contractAmount: number;
    contractAmountHistory: FundBillingContractRevision[];
  }) => void;
}

export function ContractAmountHistoryCell({
  unlocked,
  contractAmount,
  history,
  cumulativeAmount = 0,
  simpleBudgetEdit = false,
  onExceed,
  onCommit,
}: ContractAmountHistoryCellProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [budgetEditing, setBudgetEditing] = useState(false);
  const budgetInputRef = useRef<HTMLInputElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [allowNext, setAllowNext] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftAmount, setDraftAmount] = useState(contractAmount);
  const [editingSequence, setEditingSequence] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState(0);
  const [editText, setEditText] = useState('');
  const [draftText, setDraftText] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const draftInputRef = useRef<HTMLInputElement>(null);

  const revisions = ensureContractHistory(contractAmount, history);
  const hasRevisions = revisions.length > 1;
  const latest = revisions[revisions.length - 1];
  const nextLabel = contractRevisionLabel(nextContractRevisionSequence(revisions));

  const closeAll = () => {
    setConfirmOpen(false);
    setHistoryOpen(false);
    setAllowNext(false);
    setDraftOpen(false);
    setEditingSequence(null);
    setBudgetEditing(false);
  };

  useEffect(() => {
    if (!unlocked) setBudgetEditing(false);
  }, [unlocked]);

  useEffect(() => {
    if (simpleBudgetEdit && budgetEditing) budgetInputRef.current?.focus();
  }, [simpleBudgetEdit, budgetEditing]);

  useEffect(() => {
    if (editingSequence !== null) editInputRef.current?.focus();
  }, [editingSequence]);

  useEffect(() => {
    if (draftOpen) draftInputRef.current?.focus();
  }, [draftOpen]);

  const openHistory = (nextAllowed: boolean) => {
    setAllowNext(nextAllowed);
    setDraftOpen(false);
    setEditingSequence(null);
    setDraftAmount(contractAmount);
    setHistoryOpen(true);
  };

  const saveNext = () => {
    if (draftAmount < cumulativeAmount) {
      onExceed?.();
      return;
    }
    onCommit(appendContractRevision(contractAmount, history, draftAmount));
    closeAll();
  };

  const saveEdited = (sequence: number) => {
    if (editAmount < cumulativeAmount) {
      onExceed?.();
      return;
    }
    onCommit(updateContractRevisionAmount(contractAmount, history, sequence, editAmount));
    setEditingSequence(null);
  };

  const deleteLatest = () => {
    const next = removeLatestContractRevision(contractAmount, history);
    if (!next) return;
    onCommit(next);
    setEditingSequence(null);
  };

  const commitSimpleAmount = (nextAmount: number) => {
    onCommit({
      contractAmount: nextAmount,
      contractAmountHistory: history ?? [],
    });
  };

  return (
    <>
      {simpleBudgetEdit && unlocked && budgetEditing ? (
        <input
          ref={budgetInputRef}
          className="fund-sheet__input fund-sheet__input--num"
          inputMode="numeric"
          value={formatAmountInput(contractAmount)}
          onChange={(event) => commitSimpleAmount(parseAmountInput(event.target.value) ?? 0)}
        />
      ) : unlocked ? (
        <button
          type="button"
          className="fund-sheet__contract-btn"
          onClick={() => setConfirmOpen(true)}
        >
          <span>{won(contractAmount)}</span>
          {hasRevisions && !simpleBudgetEdit ? <span className="fund-sheet__rev-tag">{latest.label}</span> : null}
        </button>
      ) : hasRevisions ? (
        <button
          type="button"
          className="fund-sheet__contract-btn"
          onClick={() => openHistory(false)}
        >
          <span>{won(contractAmount)}</span>
          <span className="fund-sheet__rev-tag">{latest.label}</span>
        </button>
      ) : (
        <span className="fund-sheet__contract-view">{won(contractAmount)}</span>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={simpleBudgetEdit ? '실행예산 변경' : '계약금액 변경'}
        message={simpleBudgetEdit ? '실행예산을 변경하시겠습니까?' : '계약금액을 변경하시겠습니까?'}
        confirmLabel="네"
        cancelLabel="아니오"
        onConfirm={() => {
          setConfirmOpen(false);
          if (simpleBudgetEdit) {
            setBudgetEditing(true);
            return;
          }
          openHistory(true);
        }}
        onCancel={() => setConfirmOpen(false)}
      />

      {historyOpen ? (
        <div
          className="confirm-dialog-backdrop no-print"
          onClick={closeAll}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div
            className="confirm-dialog fund-sheet__history-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fund-contract-history-title"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <h3 id="fund-contract-history-title" className="confirm-dialog__title">
              하도급금액 변경 이력
            </h3>
            <ul className="fund-sheet__history-list">
              {revisions.map((item, index) => {
                const isLatest = index === revisions.length - 1;
                const canDelete = isLatest && item.sequence > 0;
                const editing = editingSequence === item.sequence;
                return (
                  <li key={item.sequence}>
                    <strong>{item.label}</strong>
                    {editing ? (
                      <input
                        ref={editInputRef}
                        className="fund-sheet__history-amount-input"
                        inputMode="numeric"
                        value={editText}
                        onChange={(event) => {
                          const parsed = parseAmountInput(event.target.value);
                          setEditText(parsed === undefined ? '' : formatAmountInput(parsed));
                          setEditAmount(parsed ?? 0);
                        }}
                      />
                    ) : (
                      <span>{won(item.amount)}</span>
                    )}
                    <span className="fund-sheet__history-row-actions">
                      {editing ? (
                        <>
                          <button type="button" onClick={() => saveEdited(item.sequence)}>
                            저장
                          </button>
                          <button type="button" onClick={() => setEditingSequence(null)}>
                            취소
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="fund-sheet__actions-edit"
                            onClick={() => {
                              setDraftOpen(false);
                              setEditingSequence(item.sequence);
                              setEditAmount(item.amount);
                              setEditText(item.amount ? formatAmountInput(item.amount) : '');
                            }}
                          >
                            수정
                          </button>
                          {canDelete ? (
                            <button type="button" className="fund-sheet__history-del" onClick={deleteLatest}>
                              삭제
                            </button>
                          ) : null}
                        </>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>

            {allowNext && draftOpen ? (
              <label className="fund-sheet__history-draft">
                {nextLabel} 금액
                <input
                  ref={draftInputRef}
                  className="fund-sheet__budget-input"
                  inputMode="numeric"
                  value={draftText}
                  onChange={(event) => {
                    const parsed = parseAmountInput(event.target.value);
                    setDraftText(parsed === undefined ? '' : formatAmountInput(parsed));
                    setDraftAmount(parsed ?? 0);
                  }}
                />
              </label>
            ) : null}

            <div className="confirm-dialog__actions">
              <Button variant="outline" onClick={closeAll}>
                닫기
              </Button>
              {allowNext ? (
                draftOpen ? (
                  <Button variant="primary" onClick={saveNext}>
                    저장
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    onClick={() => {
                      setEditingSequence(null);
                      setDraftAmount(contractAmount);
                      setDraftText(contractAmount ? formatAmountInput(contractAmount) : '');
                      setDraftOpen(true);
                    }}
                  >
                    다음차수 ({nextLabel})
                  </Button>
                )
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
