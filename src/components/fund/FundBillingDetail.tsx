import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KoreanDateInput } from '@/components/admin/KoreanDateInput';
import { ProjectCodeInput } from '@/components/admin/ProjectCodeInput';
import { FundBillingPmSearch, FundBillingProjectSearch } from '@/components/fund/FundBillingSearchFields';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Select } from '@/components/ui/Input';
import { FUND_BILLING_DEPARTMENTS, mapTextToFundBillingDepartment } from '@/constants/fundBilling';
import { useApp } from '@/context/AppContext';
import type { FundBillingReport, FundBillingSpendKind } from '@/types/fundBillingReport';
import type { Project } from '@/types';
import { useFundBilling } from '@/context/FundBillingContext';
import { calcCommonInspected, findReportForProject, inferSpendKind } from '@/utils/fundBillingReport';
import { formatAmountInput, formatIsoToKoreanDate, parseAmountInput, parseKoreanDateToIso } from '@/utils/formatInput';
import { buildPersonnelRows } from '@/utils/personnelSearch';

interface SpendLine {
  id: string;
  kind: SpendKind;
  no: string;
  tradeType: string;
  vendorName: string;
  contractAmount: number;
  priorPaid: number;
  monthClaim: number;
  inspected: number;
  added?: boolean;
  manualEdit?: boolean;
}

type SpendKind = FundBillingSpendKind;

const SPEND_KINDS: { kind: SpendKind; label: string }[] = [
  { kind: 'subcontract', label: '하도급' },
  { kind: 'advance', label: '전도금' },
  { kind: 'labor', label: '인건비' },
  { kind: 'other', label: '기타' },
];

const SPEND_KIND_NO: Record<SpendKind, string> = {
  subcontract: '',
  advance: '전도금',
  labor: '인건비',
  other: '기타',
};

const SPEND_KIND_ORDER: SpendKind[] = ['subcontract', 'advance', 'labor', 'other'];

interface FundBillingDetailProps {
  report: FundBillingReport;
  onCommit: (report: FundBillingReport) => void;
  onCreateNew: () => FundBillingReport;
}

export function FundBillingDetail({ report, onCommit, onCreateNew }: FundBillingDetailProps) {
  const navigate = useNavigate();
  const { reports } = useFundBilling();
  const { visibleProjects, employees, executiveOffice, divisions, teams } = useApp();
  const personnel = useMemo(
    () => buildPersonnelRows(executiveOffice.admins, employees, divisions, teams),
    [executiveOffice.admins, employees, divisions, teams],
  );

  const searchProjects = useMemo(() => {
    const covered = new Set(
      visibleProjects
        .map((project) => findReportForProject(reports, project)?.id)
        .filter((id): id is string => Boolean(id)),
    );
    const extras: Project[] = reports
      .filter((item) => item.projectName && !covered.has(item.id))
      .map((item) => ({
        id: item.id,
        name: item.projectName,
        projectCode: item.projectCode,
        divisionId: '',
        divisionName: item.department,
        teamId: '',
        teamName: '',
        status: '실행',
        contractAmount: item.contractAmount,
        startDate: parseKoreanDateToIso(item.startDate) || '',
        endDate: parseKoreanDateToIso(item.endDate),
        pmId: '',
        participantIds: [],
        createdAt: item.updatedAt,
        updatedAt: item.updatedAt,
      }));
    return [...visibleProjects, ...extras];
  }, [visibleProjects, reports]);

  const [projectMode, setProjectMode] = useState<'existing' | 'new'>(
    report.linkedProjectId ? 'existing' : report.projectName ? 'existing' : 'new',
  );
  const [newProjectConfirmOpen, setNewProjectConfirmOpen] = useState(false);
  const [projectName, setProjectName] = useState(report.projectName);
  const [selectedProjectId, setSelectedProjectId] = useState(report.linkedProjectId || report.id);
  const [projectCode, setProjectCode] = useState(report.projectCode);
  const [department, setDepartment] = useState(report.department);
  const [contractAmount, setContractAmount] = useState(report.contractAmount);
  const [startDate, setStartDate] = useState(report.startDate);
  const [endDate, setEndDate] = useState(report.endDate);
  const [pmName, setPmName] = useState(report.pmName);
  const [writtenDate, setWrittenDate] = useState(report.writtenDate);
  const [collectedPrior, setCollectedPrior] = useState(report.collectedPrior);
  const [expectedCollection, setExpectedCollection] = useState(report.expectedCollection);
  const [directCostBudget, setDirectCostBudget] = useState(report.directCostBudget ?? 0);
  const [overheads, setOverheads] = useState<SpendLine[]>(() =>
    report.overheads.map((line) => ({ ...line })),
  );
  const [lines, setLines] = useState<SpendLine[]>(() => arrangeSpendLines(report.lines.map((line) => ({ ...line }))));
  const [execUndoStack, setExecUndoStack] = useState<SpendLine[][]>([]);
  const [addKindOpen, setAddKindOpen] = useState(false);
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const liveUndoLockRef = useRef(false);
  const liveUndoTimerRef = useRef<number>();
  const [lineDialog, setLineDialog] = useState<{ action: 'edit' | 'delete'; id: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<SpendLine | null>(null);

  const collectedTotal = collectedPrior + expectedCollection;
  const vendorTotals = useMemo(() => summarizeLines(lines), [lines]);
  const expenseInspected = overheads.find(isDirectExpenseLine)?.inspected ?? 0;
  const commonContract = overheads.find(isCommonLine)?.contractAmount ?? 0;
  const displayOverheads = useMemo(() => {
    const commonInspected =
      directCostBudget > 0
        ? calcCommonInspected(vendorTotals.inspected, expenseInspected, directCostBudget, commonContract)
        : (overheads.find(isCommonLine)?.inspected ?? 0);
    return overheads.map((line) => {
      if (!isCommonLine(line)) return line;
      return { ...line, monthClaim: 0, inspected: commonInspected };
    });
  }, [overheads, vendorTotals.inspected, expenseInspected, directCostBudget, commonContract]);
  const overheadTotals = useMemo(() => summarizeLines(displayOverheads), [displayOverheads]);
  const grandTotals = useMemo(
    () => addSummaries(vendorTotals, overheadTotals),
    [vendorTotals, overheadTotals],
  );
  const monthSpendExpected = grandTotals.inspected;
  const spentTotal = grandTotals.cumulative;
  const netCash = collectedTotal - spentTotal;
  const collectionRate = ratioText(collectedTotal, contractAmount);
  const spendRate = ratioText(spentTotal, contractAmount);
  const cashRate = cashRateText(netCash, contractAmount);
  const execView = useMemo(() => buildExecView(lines), [lines]);
  const skipCommit = useRef(true);

  useEffect(() => {
    if (skipCommit.current) {
      skipCommit.current = false;
      return;
    }
    onCommit({
      id: report.id,
      monthKey: report.monthKey,
      projectName,
      projectCode,
      department,
      contractAmount,
      startDate,
      endDate,
      writtenDate,
      pmName,
      collectedPrior,
      expectedCollection,
      directCostBudget,
      linkedProjectId: selectedProjectId,
      overheads: displayOverheads,
      lines,
      updatedAt: new Date().toISOString(),
    });
  }, [
    report.id,
    report.monthKey,
    projectName,
    projectCode,
    department,
    contractAmount,
    startDate,
    endDate,
    writtenDate,
    pmName,
    collectedPrior,
    expectedCollection,
    directCostBudget,
    selectedProjectId,
    displayOverheads,
    lines,
    onCommit,
  ]);

  const applySelectedProject = (project: Project) => {
    const registered = visibleProjects.find((item) => item.id === project.id) ?? project;
    const matched = findReportForProject(reports, registered) ?? findReportForProject(reports, project);

    if (matched && matched.id !== report.id) {
      navigate(`/fund/billing/${matched.id}`);
      return;
    }

    setSelectedProjectId(registered.id);
    setProjectName(registered.name);
    setProjectMode('existing');

    const nextCode = registered.projectCode;
    setProjectCode(isOfficialProjectCode(nextCode) ? nextCode ?? '' : matched?.projectCode ?? '');

    if (registered.divisionName) {
      setDepartment(
        mapTextToFundBillingDepartment(registered.divisionName, registered.projectType, registered.marketScope),
      );
    } else if (matched?.department) {
      setDepartment(matched.department);
    }

    const nextAmount = registered.contractAmount ?? registered.initialContract?.contractAmount;
    setContractAmount(nextAmount || matched?.contractAmount || 0);

    const nextStart = registered.startDate || registered.initialContract?.startDate;
    setStartDate(nextStart ? formatIsoToKoreanDate(nextStart) : matched?.startDate || '');

    const nextEnd = registered.endDate || registered.initialContract?.endDate;
    setEndDate(nextEnd ? formatIsoToKoreanDate(nextEnd) : matched?.endDate || '');

    const pmFromOrg = employees.find((employee) => eId(employee.id) === eId(registered.pmId));
    setPmName(pmFromOrg?.name ?? matched?.pmName ?? '');

    const source = matched ?? report;
    setCollectedPrior(source.collectedPrior);
    setExpectedCollection(source.expectedCollection);
    setDirectCostBudget(source.directCostBudget ?? 0);
    setWrittenDate(source.writtenDate);
    setOverheads(source.overheads.map((line) => ({ ...line })));
    setLines(arrangeSpendLines(source.lines.map((line) => ({ ...line }))));
    setExecUndoStack([]);
    clearEditState();
  };

  const requestNewProject = () => {
    if (projectMode === 'new') return;
    setNewProjectConfirmOpen(true);
  };

  const confirmNewProject = () => {
    setNewProjectConfirmOpen(false);
    const created = onCreateNew();
    navigate(`/fund/billing/${created.id}`);
  };

  const pushExecUndo = (snapshot = linesRef.current) => {
    setExecUndoStack((stack) => [...stack, cloneSpendLines(snapshot)].slice(-80));
  };

  const updateLine = (id: string, patch: Partial<SpendLine>) => {
    if (!liveUndoLockRef.current) {
      pushExecUndo();
      liveUndoLockRef.current = true;
    }
    if (liveUndoTimerRef.current) window.clearTimeout(liveUndoTimerRef.current);
    liveUndoTimerRef.current = window.setTimeout(() => {
      liveUndoLockRef.current = false;
    }, 800);
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  };

  const updateOverhead = (id: string, patch: Partial<SpendLine>) => {
    setOverheads((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  };

  const addSpendLine = (kind: SpendKind) => {
    liveUndoLockRef.current = false;
    pushExecUndo();
    const next = createSpendLine(kind);
    setLines((current) => arrangeSpendLines([...current, next]));
    setEditingId(next.id);
    setEditDraft(next);
    setAddKindOpen(false);
  };

  const requestEditLine = (id: string) => {
    if (editingId === id) return;
    setLineDialog({ action: 'edit', id });
  };

  const requestDeleteLine = (id: string) => {
    setLineDialog({ action: 'delete', id });
  };

  const clearEditState = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const saveEditLine = () => {
    if (!editingId || !editDraft) return;
    liveUndoLockRef.current = false;
    pushExecUndo();
    setLines((current) =>
      arrangeSpendLines(
        current.map((line) => (line.id === editingId ? { ...editDraft, added: false, manualEdit: false } : line)),
      ),
    );
    clearEditState();
  };

  const cancelEditLine = () => {
    if (editingId && editDraft?.added) {
      setLines((current) => arrangeSpendLines(current.filter((line) => line.id !== editingId)));
      setExecUndoStack((stack) => (stack.length ? stack.slice(0, -1) : stack));
    }
    clearEditState();
  };

  const confirmLineDialog = () => {
    if (!lineDialog) return;
    if (lineDialog.action === 'edit') {
      if (editingId && editDraft?.added && editingId !== lineDialog.id) {
        setLines((current) => arrangeSpendLines(current.filter((line) => line.id !== editingId)));
        setExecUndoStack((stack) => (stack.length ? stack.slice(0, -1) : stack));
      }
      const target = lines.find((line) => line.id === lineDialog.id);
      if (target) {
        setEditingId(target.id);
        setEditDraft({ ...target });
      }
    } else {
      liveUndoLockRef.current = false;
      pushExecUndo();
      setLines((current) => arrangeSpendLines(current.filter((line) => line.id !== lineDialog.id)));
      if (lineDialog.id === editingId) clearEditState();
    }
    setLineDialog(null);
  };

  const undoExec = () => {
    if (liveUndoTimerRef.current) {
      window.clearTimeout(liveUndoTimerRef.current);
      liveUndoTimerRef.current = undefined;
    }
    liveUndoLockRef.current = false;
    setExecUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const next = stack.slice(0, -1);
      const previous = stack[stack.length - 1];
      setLines(arrangeSpendLines(cloneSpendLines(previous)));
      return next;
    });
    clearEditState();
  };

  return (
    <div className="fund-billing-detail">
      <div className="page-header page-header--row no-print fund-billing-detail__header">
        <div>
          <p className="fund-billing-detail__crumb">
            <Link to="/fund/billing">기성관리</Link>
            <span> / 월별 기성 입력</span>
          </p>
          <h2>월별 기성보고서</h2>
          <p>담당자가 프로젝트별 월 기성을 입력하는 화면입니다. 프로젝트 등록 메뉴가 열리면 검색 선택과 직접 입력을 함께 사용합니다.</p>
        </div>
      </div>

      <div className="fund-billing-detail__body">
        <div className="fund-billing-detail__canvas">
        <Card title="기본정보" className="fund-billing-info-card">
        <div className="fund-billing-info-form">
          <div className="fund-billing-project-field">
            <span className="form-field__label">프로젝트</span>
            <div className="fund-billing-project-field__row">
              <div className="fund-billing-mode-toggle" role="group" aria-label="프로젝트 입력 방식">
                <button
                  type="button"
                  className={projectMode === 'existing' ? 'is-active' : ''}
                  onClick={() => setProjectMode('existing')}
                >
                  기존
                </button>
                <button
                  type="button"
                  className={projectMode === 'new' ? 'is-active' : ''}
                  onClick={requestNewProject}
                >
                  신규
                </button>
              </div>
              {projectMode === 'existing' ? (
                <FundBillingProjectSearch
                  hideLabel
                  projects={searchProjects}
                  value={projectName}
                  selectedProjectId={selectedProjectId}
                  onChange={setProjectName}
                  onSelect={applySelectedProject}
                />
              ) : (
                <input
                  id="fund-billing-project-new"
                  type="text"
                  className="form-field__input"
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="신규 프로젝트명 입력"
                  autoComplete="off"
                />
              )}
            </div>
          </div>
          <ProjectCodeInput
            label="프로젝트 코드"
            value={projectCode}
            onChange={setProjectCode}
          />
          <Select
            label="사업부"
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            options={FUND_BILLING_DEPARTMENTS.map((item) => ({ value: item, label: item }))}
          />
          <div className="form-field">
            <label htmlFor="fund-billing-contract-amount" className="form-field__label">
              수주금액
            </label>
            <input
              id="fund-billing-contract-amount"
              className="form-field__input"
              inputMode="numeric"
              value={contractAmount ? formatAmountInput(contractAmount) : ''}
              onChange={(event) => setContractAmount(parseAmountInput(event.target.value) ?? 0)}
              placeholder="프로젝트 선택 시 자동 · 직접 입력 가능"
            />
          </div>
          <KoreanDateInput label="계약 시작" value={startDate} onChange={setStartDate} />
          <KoreanDateInput label="계약 종료" value={endDate} onChange={setEndDate} />
          <KoreanDateInput label="작성일자" value={writtenDate} onChange={setWrittenDate} />
          <FundBillingPmSearch people={personnel} value={pmName} onChange={setPmName} />
        </div>
        <p className="fund-billing-info-hint">
          <strong>기존</strong>에서 계약 목록의 프로젝트를 선택하면 프로젝트 코드·사업부·수주금액·계약기간이 있는 항목은 자동으로 채워지고, 없는 항목만 직접 입력하면 됩니다.
          <strong>신규</strong>는 ERP에 아직 없는 선투입 기성에만 사용하며, 모든 항목을 수기로 입력합니다.
        </p>
      </Card>

      <div className="fund-sheet__meta-wrap">
        <table className="fund-sheet__meta">
          <tbody>
            <tr>
              <th>사업부</th>
              <td>{department || '-'}</td>
              <th>계약금액</th>
              <td className="fund-sheet__num">{won(contractAmount)}</td>
              <th>계약기간</th>
              <td colSpan={2}>
                {startDate || '-'}
                {endDate ? ` ~ ${endDate}` : ''}
              </td>
              <th>작성일자</th>
              <td>{writtenDate || '-'}</td>
            </tr>
            <tr>
              <th rowSpan={1}>수금현황</th>
              <th>기수금액</th>
              <td className="fund-sheet__num">
                <AmountInput value={collectedPrior} onChange={setCollectedPrior} />
              </td>
              <th>금월수금예정액</th>
              <td className="fund-sheet__num">
                <AmountInput value={expectedCollection} onChange={setExpectedCollection} />
              </td>
              <th>ⓐ 수금누계</th>
              <td className="fund-sheet__num fund-sheet__meta-total">
                {won(collectedTotal)}
                {collectionRate ? <span className="fund-sheet__pct">{collectionRate}</span> : null}
              </td>
              <th>수지금액 ⓒ=ⓐ-ⓑ</th>
              <td className={`fund-sheet__num ${netCash < 0 ? 'fund-sheet__neg' : ''}`}>{won(netCash)}</td>
            </tr>
            <tr>
              <th>집행현황</th>
              <th>기지출금액</th>
              <td className="fund-sheet__num">{won(grandTotals.priorPaid)}</td>
              <th>금월지출예정액</th>
              <td className="fund-sheet__num">{won(monthSpendExpected)}</td>
              <th>ⓑ 지출누계</th>
              <td className="fund-sheet__num fund-sheet__meta-total">
                {won(spentTotal)}
                {spendRate ? <span className="fund-sheet__pct">{spendRate}</span> : null}
              </td>
              <th>수지율</th>
              <td
                className={`fund-sheet__num fund-sheet__cash-rate ${
                  !contractAmount
                    ? ''
                    : netCash < 0
                      ? 'fund-sheet__cash-rate--minus'
                      : 'fund-sheet__cash-rate--plus'
                }`}
              >
                {cashRate}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="fund-sheet fund-sheet--summary">
        <h3 className="fund-sheet__title">
          <span>집행현황</span>
          <label
            className="fund-sheet__budget-field"
            title="공통비 검수 = (직접공사비 검수 + 직접경비 검수) / 실행예산직접원가 * 공통비 하도급금액"
          >
            실행예산직접원가
            <input
              className="fund-sheet__budget-input"
              inputMode="numeric"
              value={formatAmountInput(directCostBudget)}
              onChange={(event) => setDirectCostBudget(parseAmountInput(event.target.value) ?? 0)}
            />
          </label>
        </h3>
        <div className="fund-sheet__table-wrap fund-sheet__table-wrap--summary">
          <table className="fund-sheet__table fund-sheet__table--summary">
            <SpendColGroup />
            <thead>
              <SpendColumnHeaders />
            </thead>
            <tbody>
              <SummaryRow label="직접공사비" values={vendorTotals} className="fund-sheet__subtotal" />
              {displayOverheads.map((line) => (
                <SpendLineRow
                  key={line.id}
                  line={line}
                  className="fund-sheet__overhead"
                  hideVendor
                  entryMode={
                    isDirectExpenseLine(line) ? 'cumulative' : isCommonLine(line) ? 'common' : 'default'
                  }
                  onChange={(patch) => updateOverhead(line.id, patch)}
                />
              ))}
              <SummaryRow
                label="직접원가 계"
                values={grandTotals}
                className="fund-sheet__total fund-sheet__section-end"
              />
            </tbody>
          </table>
        </div>
      </div>

      <div className="fund-sheet">

          <div className="fund-sheet__section-banner">
            <div className="fund-sheet__toolbar">
              <div className="fund-sheet__add">
                <button
                  type="button"
                  className="fund-sheet__add-btn"
                  onClick={() => setAddKindOpen((open) => !open)}
                >
                  + 행추가
                </button>
                {addKindOpen ? (
                  <div className="fund-sheet__add-menu" role="menu">
                    {SPEND_KINDS.map((item) => (
                      <button
                        key={item.kind}
                        type="button"
                        role="menuitem"
                        onClick={() => addSpendLine(item.kind)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="fund-sheet__undo-btn"
                disabled={execUndoStack.length === 0}
                onClick={undoExec}
              >
                되돌리기
              </button>
            </div>
            <span>직접공사비 집행</span>
          </div>
          <div className="fund-sheet__frozen-wrap">
            <table className="fund-sheet__table fund-sheet__table--frozen">
              <ExecColGroup />
              <thead>
                <ExecColumnHeaders />
              </thead>
            </table>
          </div>
          <div className="fund-sheet__exec-pane" tabIndex={0} aria-label="직접공사비 집행 공종 목록">
            <table className="fund-sheet__table">
              <ExecColGroup />
              <tbody>
                {execView.map((row) =>
                  row.type === 'spacer' ? (
                    <tr key={row.id} className="fund-sheet__spacer">
                      <td colSpan={14} />
                    </tr>
                  ) : (
                    <SpendLineRow
                      key={row.line.id}
                      line={editingId === row.line.id && editDraft ? editDraft : row.line}
                      showActions
                      isEditing={editingId === row.line.id}
                      onChange={(patch) => {
                        if (editingId === row.line.id) {
                          setEditDraft((current) => (current ? { ...current, ...patch } : current));
                          return;
                        }
                        updateLine(row.line.id, patch);
                      }}
                      onEdit={() => requestEditLine(row.line.id)}
                      onSave={saveEditLine}
                      onCancelEdit={cancelEditLine}
                      onDelete={() => requestDeleteLine(row.line.id)}
                    />
                  ),
                )}
              </tbody>
            </table>
          </div>
      </div>
        </div>
      </div>
      <ConfirmDialog
        open={lineDialog?.action === 'edit'}
        title="집행 건 수정"
        confirmLabel="예"
        cancelLabel="아니오"
        message={`이 행의 공종, 업체명, 하도급금액, 기지출금액 등 모든 항목을 수기로 수정할 수 있습니다.

수정한 내용은 저장을 눌러야 확정됩니다. 수정을 진행하시겠습니까?`}
        onConfirm={confirmLineDialog}
        onCancel={() => setLineDialog(null)}
      />
      <ConfirmDialog
        open={lineDialog?.action === 'delete'}
        title="집행 건 삭제"
        confirmLabel="예"
        cancelLabel="아니오"
        message="해당 집행건을 모두 삭제하시겠습니까?"
        onConfirm={confirmLineDialog}
        onCancel={() => setLineDialog(null)}
      />
      <ConfirmDialog
        open={newProjectConfirmOpen}
        title="신규 프로젝트 입력"
        confirmLabel="예"
        cancelLabel="아니오"
        message={`발주처 계약이 진행되기 전(ERP 미등록) 기성 지급 건입니까?

신규는 계약정보에 없는 선투입 기성처럼, ERP에 아직 없는 경우에만 사용합니다.

등록되어 있는 프로젝트는 신규로 선택하지 마세요. 아니오를 누른 뒤 기존에서 계약 목록을 선택하세요.`}
        onConfirm={confirmNewProject}
        onCancel={() => setNewProjectConfirmOpen(false)}
      />
    </div>
  );
}

function SpendColGroup() {
  return (
    <colgroup>
      <col className="fund-sheet__col-no" />
      <col className="fund-sheet__col-trade" />
      <col className="fund-sheet__col-vendor" />
      <col className="fund-sheet__col-money" />
      <col className="fund-sheet__col-money" />
      <col className="fund-sheet__col-pct" />
      <col className="fund-sheet__col-money" />
      <col className="fund-sheet__col-pct" />
      <col className="fund-sheet__col-money" />
      <col className="fund-sheet__col-pct" />
      <col className="fund-sheet__col-money" />
      <col className="fund-sheet__col-pct" />
      <col className="fund-sheet__col-money" />
    </colgroup>
  );
}

function ExecColGroup() {
  return (
    <colgroup>
      <col className="fund-sheet__col-action" />
      <col className="fund-sheet__col-no" />
      <col className="fund-sheet__col-trade" />
      <col className="fund-sheet__col-vendor" />
      <col className="fund-sheet__col-money" />
      <col className="fund-sheet__col-money" />
      <col className="fund-sheet__col-pct" />
      <col className="fund-sheet__col-money" />
      <col className="fund-sheet__col-pct" />
      <col className="fund-sheet__col-money" />
      <col className="fund-sheet__col-pct" />
      <col className="fund-sheet__col-money" />
      <col className="fund-sheet__col-pct" />
      <col className="fund-sheet__col-money" />
    </colgroup>
  );
}

function ExecColumnHeaders() {
  return (
    <>
      <tr className="fund-sheet__colhead">
        <th rowSpan={2}>선택</th>
        <th rowSpan={2}>계약 No.</th>
        <th rowSpan={2}>공종</th>
        <th rowSpan={2}>업체명</th>
        <th rowSpan={2}>하도급금액</th>
        <th colSpan={2}>기지출금액</th>
        <th className="fund-sheet__edit-head" colSpan={2}>금월청구금액</th>
        <th className="fund-sheet__edit-head" colSpan={2}>관리팀 검수</th>
        <th colSpan={2}>누계</th>
        <th rowSpan={2}>잔액</th>
      </tr>
      <tr className="fund-sheet__colhead">
        <th>금액</th>
        <th>비율</th>
        <th>금액</th>
        <th>비율</th>
        <th>금액</th>
        <th>비율</th>
        <th>금액</th>
        <th>비율</th>
      </tr>
    </>
  );
}

function SpendColumnHeaders() {
  return (
    <>
      <tr className="fund-sheet__colhead">
        <th rowSpan={2} colSpan={3}>구 분</th>
        <th rowSpan={2}>하도급금액</th>
        <th colSpan={2}>기지출금액</th>
        <th className="fund-sheet__edit-head" colSpan={2}>금월청구금액</th>
        <th className="fund-sheet__edit-head" colSpan={2}>관리팀 검수</th>
        <th colSpan={2}>누계</th>
        <th rowSpan={2}>잔액</th>
      </tr>
      <tr className="fund-sheet__colhead">
        <th>금액</th>
        <th>비율</th>
        <th>금액</th>
        <th>비율</th>
        <th>금액</th>
        <th>비율</th>
        <th>금액</th>
        <th>비율</th>
      </tr>
    </>
  );
}

function AmountInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <input
      className="fund-sheet__input fund-sheet__input--num"
      inputMode="numeric"
      value={formatAmountInput(value)}
      onChange={(event) => onChange(parseAmountInput(event.target.value) ?? 0)}
    />
  );
}

function AmountPair({ amount, base }: { amount: number; base: number }) {
  return (
    <>
      <td className="fund-sheet__num">{won(amount)}</td>
      <td className="fund-sheet__num">{ratioText(amount, base)}</td>
    </>
  );
}

function SummaryRow({
  label,
  values,
  className,
}: {
  label: string;
  values: ReturnType<typeof summarizeLines>;
  className: string;
}) {
  return (
    <tr className={className}>
      <td colSpan={3} className="fund-sheet__label-merge">{label}</td>
      <td className="fund-sheet__num">{won(values.contractAmount)}</td>
      <AmountPair amount={values.priorPaid} base={values.contractAmount} />
      <AmountPair amount={values.monthClaim} base={values.contractAmount} />
      <AmountPair amount={values.inspected} base={values.contractAmount} />
      <AmountPair amount={values.cumulative} base={values.contractAmount} />
      <td className="fund-sheet__num">{won(values.remain)}</td>
    </tr>
  );
}

function SpendLineRow({
  line,
  onChange,
  className,
  hideVendor,
  showActions,
  isEditing,
  entryMode = 'default',
  onEdit,
  onSave,
  onCancelEdit,
  onDelete,
}: {
  line: SpendLine;
  onChange: (patch: Partial<SpendLine>) => void;
  className?: string;
  hideVendor?: boolean;
  showActions?: boolean;
  isEditing?: boolean;
  entryMode?: 'default' | 'cumulative' | 'common';
  onEdit?: () => void;
  onSave?: () => void;
  onCancelEdit?: () => void;
  onDelete?: () => void;
}) {
  const cumulative = line.priorPaid + line.inspected;
  const remain = line.contractAmount - cumulative;
  const unlocked = Boolean(isEditing);
  const monthClaimLocked = entryMode === 'cumulative' || entryMode === 'common';
  const inspectedLocked = entryMode === 'cumulative' || entryMode === 'common';

  return (
    <tr className={className}>
      {showActions ? (
        <td className="fund-sheet__actions">
          {isEditing ? (
            <>
              <button type="button" className="fund-sheet__actions-save" onClick={onSave}>
                저장
              </button>
              <button type="button" onClick={onCancelEdit}>
                취소
              </button>
            </>
          ) : (
            <button type="button" onClick={onEdit}>
              수정
            </button>
          )}
          <button type="button" className="fund-sheet__actions-del" onClick={onDelete}>
            삭제
          </button>
        </td>
      ) : null}
      {hideVendor ? (
        <td colSpan={3} className="fund-sheet__label-merge">{line.tradeType}</td>
      ) : (
        <>
          <td>{line.no}</td>
          <td>
            {unlocked ? (
              <input
                className="fund-sheet__input"
                value={line.tradeType}
                onChange={(event) => onChange({ tradeType: event.target.value })}
                placeholder="공종"
              />
            ) : (
              line.tradeType
            )}
          </td>
          <td>
            {unlocked ? (
              <input
                className="fund-sheet__input"
                value={line.vendorName}
                onChange={(event) => onChange({ vendorName: event.target.value })}
                placeholder="업체명"
              />
            ) : (
              line.vendorName
            )}
          </td>
        </>
      )}
      <td className={`fund-sheet__num${unlocked ? ' fund-sheet__edit' : ' fund-sheet__fixed'}`}>
        {unlocked ? (
          <AmountInput value={line.contractAmount} onChange={(value) => onChange({ contractAmount: value })} />
        ) : (
          won(line.contractAmount)
        )}
      </td>
      <td className={`fund-sheet__num${unlocked ? ' fund-sheet__edit' : ' fund-sheet__fixed'}`}>
        {unlocked ? (
          <AmountInput value={line.priorPaid} onChange={(value) => onChange({ priorPaid: value })} />
        ) : (
          won(line.priorPaid)
        )}
      </td>
      <td className="fund-sheet__num">{ratioText(line.priorPaid, line.contractAmount)}</td>
      <td className={`fund-sheet__num${monthClaimLocked ? ' fund-sheet__fixed' : ' fund-sheet__edit'}`}>
        {monthClaimLocked ? (
          won(line.monthClaim)
        ) : (
          <AmountInput value={line.monthClaim} onChange={(value) => onChange({ monthClaim: value })} />
        )}
      </td>
      <td className="fund-sheet__num">{ratioText(line.monthClaim, line.contractAmount)}</td>
      <td className={`fund-sheet__num${inspectedLocked ? ' fund-sheet__fixed' : ' fund-sheet__edit'}`}>
        {inspectedLocked ? (
          won(line.inspected)
        ) : (
          <AmountInput value={line.inspected} onChange={(value) => onChange({ inspected: value })} />
        )}
      </td>
      <td className="fund-sheet__num">{ratioText(line.inspected, line.contractAmount)}</td>
      <td className={`fund-sheet__num${entryMode === 'cumulative' ? ' fund-sheet__edit' : ' fund-sheet__fixed'}`}>
        {entryMode === 'cumulative' ? (
          <AmountInput
            value={cumulative}
            onChange={(value) => {
              const delta = value - line.priorPaid;
              onChange({ monthClaim: delta, inspected: delta });
            }}
          />
        ) : (
          won(cumulative)
        )}
      </td>
      <td className="fund-sheet__num">{ratioText(cumulative, line.contractAmount)}</td>
      <td className="fund-sheet__num fund-sheet__fixed">{won(remain)}</td>
    </tr>
  );
}

function isDirectExpenseLine(line: SpendLine): boolean {
  return line.id.includes('oh-directExpense') || line.tradeType === '직접경비';
}

function isCommonLine(line: SpendLine): boolean {
  return line.id.includes('oh-common') || line.tradeType === '공통비';
}

function cloneSpendLines(lines: SpendLine[]): SpendLine[] {
  return lines.map((line) => ({ ...line }));
}

function createSpendLine(kind: SpendKind): SpendLine {
  return {
    id: `exec-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    no: kind === 'subcontract' ? '' : SPEND_KIND_NO[kind],
    tradeType: '',
    vendorName: '',
    contractAmount: 0,
    priorPaid: 0,
    monthClaim: 0,
    inspected: 0,
    added: true,
  };
}

function arrangeSpendLines(lines: SpendLine[]): SpendLine[] {
  const groups: Record<SpendKind, SpendLine[]> = {
    subcontract: [],
    advance: [],
    labor: [],
    other: [],
  };
  for (const line of lines) {
    const kind = line.kind && groups[line.kind] ? line.kind : inferSpendKind(line.no);
    groups[kind].push({ ...line, kind });
  }
  return SPEND_KIND_ORDER.flatMap((kind) => {
    if (kind !== 'subcontract') {
      return groups[kind].map((line) => ({ ...line, no: SPEND_KIND_NO[kind] }));
    }
    return groups[kind].map((line, index) => ({ ...line, no: String(index + 1) }));
  });
}

function buildExecView(lines: SpendLine[]): Array<{ type: 'line'; line: SpendLine } | { type: 'spacer'; id: string }> {
  const groups = SPEND_KIND_ORDER.map((kind) => ({
    kind,
    items: lines.filter((line) => line.kind === kind),
  })).filter((group) => group.items.length > 0);

  const rows: Array<{ type: 'line'; line: SpendLine } | { type: 'spacer'; id: string }> = [];
  groups.forEach((group, index) => {
    if (index > 0) {
      rows.push({ type: 'spacer', id: `spacer-${group.kind}` });
    }
    group.items.forEach((line) => {
      rows.push({ type: 'line', line });
    });
  });
  return rows;
}

function addSummaries(
  left: ReturnType<typeof summarizeLines>,
  right: ReturnType<typeof summarizeLines>,
) {
  return {
    contractAmount: left.contractAmount + right.contractAmount,
    priorPaid: left.priorPaid + right.priorPaid,
    monthClaim: left.monthClaim + right.monthClaim,
    inspected: left.inspected + right.inspected,
    cumulative: left.cumulative + right.cumulative,
    remain: left.remain + right.remain,
  };
}

function summarizeLines(lines: SpendLine[]) {
  const contractAmount = lines.reduce((sum, line) => sum + line.contractAmount, 0);
  const priorPaid = lines.reduce((sum, line) => sum + line.priorPaid, 0);
  const monthClaim = lines.reduce((sum, line) => sum + line.monthClaim, 0);
  const inspected = lines.reduce((sum, line) => sum + line.inspected, 0);
  const cumulative = priorPaid + inspected;
  return {
    contractAmount,
    priorPaid,
    monthClaim,
    inspected,
    cumulative,
    remain: contractAmount - cumulative,
  };
}

function won(value: number): string {
  if (!value) return '0';
  return Math.round(value).toLocaleString('ko-KR');
}

function ratioText(part: number, whole: number): string {
  if (!whole) return '';
  const percent = (part / whole) * 100;
  const rounded = Math.abs(percent - Math.round(percent)) < 0.05 ? Math.round(percent) : Number(percent.toFixed(1));
  return `${rounded}%`;
}

function cashRateText(netCash: number, contractAmount: number): string {
  if (!contractAmount) return '-';
  const percent = (netCash / contractAmount) * 100;
  const rounded = Math.abs(percent - Math.round(percent)) < 0.05 ? Math.round(percent) : Number(percent.toFixed(1));
  if (rounded > 0) return `+${rounded}%`;
  if (rounded < 0) return `${rounded}%`;
  return '0%';
}

function isOfficialProjectCode(value?: string): boolean {
  if (!value) return false;
  return value.replace(/\D/g, '').length === 10;
}

function normalizeName(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

function eId(value?: string): string {
  return value ?? '';
}
