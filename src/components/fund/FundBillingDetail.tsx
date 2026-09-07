import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { KoreanDateInput } from '@/components/admin/KoreanDateInput';
import { KoreanYearMonthInput } from '@/components/admin/KoreanYearMonthInput';
import { ProjectCodeInput } from '@/components/admin/ProjectCodeInput';
import { FundBillingPmSearch, FundBillingProjectSearch } from '@/components/fund/FundBillingSearchFields';
import { ContractAmountHistoryCell } from '@/components/fund/ContractAmountHistoryCell';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { FUND_BILLING_DEPARTMENTS, mapTextToFundBillingDepartment } from '@/constants/fundBilling';
import { useApp } from '@/context/AppContext';
import type { FundBillingReport, FundBillingSpendKind } from '@/types/fundBillingReport';
import type { FundBillingContractRevision } from '@/types/fundBillingReport';
import type { Project } from '@/types';
import { useFundBilling } from '@/context/FundBillingContext';
import {
  createMonthReportFromPrevious,
  findExactReportForProject,
  findLatestReport,
  inferSpendKind,
  isFundBillingCommonLine,
  isFundBillingDirectExpenseLine,
  latestReportsByProject,
  reportsForProject,
  resolveCommonInspected,
} from '@/utils/fundBillingReport';
import { formatAmountInput, parseAmountInput, parseKoreanDateToIso } from '@/utils/formatInput';
import { buildPersonnelRows } from '@/utils/personnelSearch';
import {
  clearFundBillingSessionDraft,
  loadFundBillingSessionDraft,
  saveFundBillingSessionDraft,
} from '@/utils/fundBillingSessionDraft';

interface SpendLine {
  id: string;
  kind: SpendKind;
  no: string;
  tradeType: string;
  vendorName: string;
  contractAmount: number;
  contractAmountHistory?: FundBillingContractRevision[];
  priorPaid: number;
  monthClaim: number;
  inspected: number;
  added?: boolean;
  manualEdit?: boolean;
  commonInspectedManual?: boolean;
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

interface FundBillingLocationState {
  fundBillingGate?: 'past' | 'ask-edit' | 'edit';
  writePanelOpen?: boolean;
}

interface FundBillingDetailProps {
  report: FundBillingReport;
  onCommit: (report: FundBillingReport) => void;
  onCreateNew: () => FundBillingReport;
}

export function FundBillingDetail({ report, onCommit, onCreateNew }: FundBillingDetailProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { reports, driveWritable } = useFundBilling();
  const { employees, executiveOffice, divisions, teams } = useApp();
  const personnel = useMemo(
    () => buildPersonnelRows(executiveOffice.admins, employees, divisions, teams),
    [executiveOffice.admins, employees, divisions, teams],
  );

  const searchProjects = useMemo(
    () =>
      latestReportsByProject(reports)
        .filter((item) => item.projectName.trim())
        .map((item) => ({
          id: item.id,
          name: item.projectName,
          projectCode: item.projectCode,
          divisionId: '',
          divisionName: item.department,
          teamId: '',
          teamName: '',
          status: '실행' as const,
          contractAmount: item.contractAmount,
          startDate: parseKoreanDateToIso(item.startDate) || '',
          endDate: parseKoreanDateToIso(item.endDate) || undefined,
          pmId: '',
          participantIds: [],
          createdAt: item.updatedAt,
          updatedAt: item.updatedAt,
        })),
    [reports],
  );

  const sessionDraft = useRef(loadFundBillingSessionDraft(report.id, report.monthKey)).current;

  const [projectMode, setProjectMode] = useState<'existing' | 'new'>(
    sessionDraft?.projectMode ??
      (report.linkedProjectId ? 'existing' : report.projectName ? 'existing' : 'new'),
  );
  const [newProjectConfirmOpen, setNewProjectConfirmOpen] = useState(false);
  const locationGate = (location.state as FundBillingLocationState | null)?.fundBillingGate;
  const [pendingCreateMonth, setPendingCreateMonth] = useState<string | null>(null);
  const [pastNoticeOpen, setPastNoticeOpen] = useState(locationGate === 'past');
  const [editConfirmOpen, setEditConfirmOpen] = useState(locationGate === 'ask-edit');
  const [projectName, setProjectName] = useState(sessionDraft?.projectName ?? report.projectName);
  const [selectedProjectId, setSelectedProjectId] = useState(
    sessionDraft?.selectedProjectId ?? (report.linkedProjectId || report.id),
  );
  const [projectCode, setProjectCode] = useState(sessionDraft?.projectCode ?? report.projectCode);
  const [department, setDepartment] = useState(
    sessionDraft?.department ?? mapTextToFundBillingDepartment(report.department, report.projectName),
  );
  const [contractAmount, setContractAmount] = useState(sessionDraft?.contractAmount ?? report.contractAmount);
  const [startDate, setStartDate] = useState(sessionDraft?.startDate ?? report.startDate);
  const [endDate, setEndDate] = useState(sessionDraft?.endDate ?? report.endDate);
  const [pmName, setPmName] = useState(sessionDraft?.pmName ?? report.pmName);
  const [writtenDate, setWrittenDate] = useState(sessionDraft?.writtenDate ?? report.writtenDate);
  const [collectedPrior, setCollectedPrior] = useState(sessionDraft?.collectedPrior ?? report.collectedPrior);
  const [expectedCollection, setExpectedCollection] = useState(
    sessionDraft?.expectedCollection ?? report.expectedCollection,
  );
  const [directCostBudget, setDirectCostBudget] = useState(
    sessionDraft?.directCostBudget ?? report.directCostBudget ?? 0,
  );
  const [overheads, setOverheads] = useState<SpendLine[]>(() =>
    (sessionDraft?.overheads ?? report.overheads).map((line) => ({ ...line })),
  );
  const [lines, setLines] = useState<SpendLine[]>(() =>
    arrangeSpendLines((sessionDraft?.lines ?? report.lines).map((line) => ({ ...line }))),
  );
  const [execUndoStack, setExecUndoStack] = useState<SpendLine[][]>([]);
  const [addKindOpen, setAddKindOpen] = useState(false);
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const liveUndoLockRef = useRef(false);
  const liveUndoTimerRef = useRef<number>();
  const [lineDialog, setLineDialog] = useState<{ action: 'edit' | 'delete'; id: string } | null>(null);
  const [commonInspectedConfirmOpen, setCommonInspectedConfirmOpen] = useState(false);
  const [monthPickerOpen, setMonthPickerOpen] = useState(
    Boolean((location.state as FundBillingLocationState | null)?.writePanelOpen),
  );
  const [existingSearchOpen, setExistingSearchOpen] = useState(false);
  const writePanelRef = useRef<HTMLDivElement>(null);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<SpendLine | null>(null);

  const collectedTotal = collectedPrior + expectedCollection;
  const vendorTotals = useMemo(() => summarizeLines(lines), [lines]);
  const displayOverheads = useMemo(() => {
    const commonInspected = resolveCommonInspected(overheads, vendorTotals.inspected, directCostBudget);
    return overheads.map((line) => {
      if (!isFundBillingCommonLine(line)) return line;
      return { ...line, monthClaim: 0, inspected: commonInspected };
    });
  }, [overheads, vendorTotals.inspected, directCostBudget]);
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
  const latestMonthKey = useMemo(
    () => findLatestReport(reports, report.id)?.monthKey ?? report.monthKey,
    [reports, report.id, report.monthKey],
  );
  const [editUnlocked, setEditUnlocked] = useState(() => {
    if (locationGate === 'past') return false;
    if (sessionDraft?.editUnlocked) return true;
    return locationGate === 'edit';
  });
  const readOnly = report.monthKey < latestMonthKey || !editUnlocked;

  useEffect(() => {
    if (!monthPickerOpen) setExistingSearchOpen(false);
  }, [monthPickerOpen]);

  useEffect(() => {
    if (!monthPickerOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!writePanelRef.current?.contains(event.target as Node)) {
        setMonthPickerOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMonthPickerOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [monthPickerOpen]);

  const buildCurrentReport = (): FundBillingReport => ({
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

  const comparableLines = useMemo(
    () =>
      editingId && editDraft
        ? lines.map((line) => (line.id === editingId ? editDraft : line))
        : lines,
    [editingId, editDraft, lines],
  );
  const currentFingerprint = useMemo(
    () =>
      fingerprintBillingDraft({
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
        lines: comparableLines,
      }),
    [
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
      comparableLines,
    ],
  );
  const [savedFingerprint, setSavedFingerprint] = useState<string | null>(null);
  const driveFingerprint = useMemo(() => fingerprintFromSavedReport(report), [report]);
  const canSave = !readOnly && currentFingerprint !== (savedFingerprint ?? driveFingerprint);

  const confirmSaveReport = () => {
    if (!canSave) return;
    onCommit(buildCurrentReport());
    setSavedFingerprint(currentFingerprint);
    clearFundBillingSessionDraft(report.id, report.monthKey);
    setSaveConfirmOpen(false);
  };

  const sessionDraftPayloadRef = useRef<{ save: boolean; draft: Parameters<typeof saveFundBillingSessionDraft>[0] } | null>(
    null,
  );
  sessionDraftPayloadRef.current = {
    save: Boolean(editUnlocked),
    draft: {
      id: report.id,
      monthKey: report.monthKey,
      projectMode,
      projectName,
      selectedProjectId,
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
      overheads: displayOverheads,
      lines: comparableLines,
      editUnlocked,
    },
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const payload = sessionDraftPayloadRef.current;
      if (!payload) return;
      if (payload.save) saveFundBillingSessionDraft(payload.draft);
      else clearFundBillingSessionDraft(payload.draft.id, payload.draft.monthKey);
    }, 200);
    return () => {
      window.clearTimeout(timer);
      const payload = sessionDraftPayloadRef.current;
      if (!payload) return;
      if (payload.save) saveFundBillingSessionDraft(payload.draft);
    };
  }, [
    report.id,
    report.monthKey,
    currentFingerprint,
    savedFingerprint,
    driveFingerprint,
    editUnlocked,
  ]);

  const handleWriteProjectSelect = (project: Project) => {
    const matched =
      findExactReportForProject(reports, project) ??
      findExactReportForProject(reports, { id: project.id, name: project.name, projectCode: project.projectCode });
    if (!matched) return;
    setProjectMode('existing');
    setSelectedProjectId(matched.id);
    if (matched.id === report.id) return;
    navigate(`/fund/billing/${matched.id}?month=${matched.monthKey}`, {
      state: { writePanelOpen: true } satisfies FundBillingLocationState,
    });
  };

  const requestNewProject = () => {
    if (projectMode === 'new') return;
    setNewProjectConfirmOpen(true);
  };

  const confirmNewProject = () => {
    setNewProjectConfirmOpen(false);
    const created = onCreateNew();
    navigate(`/fund/billing/${created.id}?month=${created.monthKey}`, {
      state: { writePanelOpen: true } satisfies FundBillingLocationState,
    });
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
    setLines((current) =>
      current.map((line) => (line.id === id ? clampSpendLineToContract(line, patch) : line)),
    );
  };

  const updateOverhead = (id: string, patch: Partial<SpendLine>) => {
    setOverheads((current) =>
      current.map((line) => (line.id === id ? clampSpendLineToContract(line, patch) : line)),
    );
  };

  const unlockCommonInspected = () => {
    const common = displayOverheads.find(isFundBillingCommonLine);
    if (!common) return;
    updateOverhead(common.id, {
      commonInspectedManual: true,
      inspected: common.inspected,
    });
  };

  const requestCommonInspectedEdit = () => {
    const common = displayOverheads.find(isFundBillingCommonLine);
    if (!common || common.commonInspectedManual) return;
    if (common.inspected) {
      setCommonInspectedConfirmOpen(true);
      return;
    }
    unlockCommonInspected();
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
        current.map((line) =>
          line.id === editingId ? { ...clampSpendLineToContract(editDraft), added: false, manualEdit: false } : line,
        ),
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

  const projectMonthKeys = useMemo(
    () => reportsForProject(reports, report.id).map((item) => item.monthKey),
    [reports, report.id],
  );

  const handleBillingMonthChange = (nextMonth: string) => {
    if (!nextMonth) return;
    setMonthPickerOpen(false);

    if (nextMonth === report.monthKey) {
      if (nextMonth < latestMonthKey) {
        setEditUnlocked(false);
        setPastNoticeOpen(true);
      } else if (nextMonth === latestMonthKey && !editUnlocked) {
        setEditConfirmOpen(true);
      }
      return;
    }

    if (nextMonth < latestMonthKey) {
      navigate(`/fund/billing/${report.id}?month=${nextMonth}`, {
        state: { fundBillingGate: 'past' } satisfies FundBillingLocationState,
      });
      return;
    }

    if (nextMonth === latestMonthKey) {
      navigate(`/fund/billing/${report.id}?month=${nextMonth}`, {
        state: { fundBillingGate: 'ask-edit' } satisfies FundBillingLocationState,
      });
      return;
    }

    setPendingCreateMonth(nextMonth);
  };

  const cancelCreateNextMonth = () => {
    setPendingCreateMonth(null);
  };

  const finishCreateNextMonth = () => {
    if (!pendingCreateMonth) return;
    const latestSaved = findLatestReport(reports, report.id) ?? report;
    const current = buildCurrentReport();
    const source = report.monthKey === latestMonthKey && editUnlocked ? current : latestSaved;
    if (report.monthKey === latestMonthKey && editUnlocked && canSave) onCommit(current);
    const created = createMonthReportFromPrevious(source, pendingCreateMonth);
    onCommit(created);
    setPendingCreateMonth(null);
    clearFundBillingSessionDraft(report.id, report.monthKey);
    navigate(`/fund/billing/${created.id}?month=${created.monthKey}`, {
      state: { fundBillingGate: 'edit' } satisfies FundBillingLocationState,
    });
  };

  return (
    <div className="fund-billing-detail">
      <div className="page-header page-header--row no-print fund-billing-detail__header">
        <div>
          <p className="fund-billing-detail__crumb">
            <Link to="/fund/billing">기성관리</Link>
            <span> / 월별 기성보고서 작성</span>
          </p>
          <h2>월별 기성보고서 작성</h2>
          <p>담당자가 프로젝트별 월 기성을 입력하는 화면입니다. 프로젝트 등록 메뉴가 열리면 검색 선택과 직접 입력을 함께 사용합니다.</p>
          {driveWritable ? null : (
            <p className="fund-billing-sandbox-note">
              개발웹입니다. 저장해도 공용 드라이브 원본은 바뀌지 않습니다.
            </p>
          )}
        </div>
        <div className="fund-billing-detail__toolbar">
          <div
            className={`fund-billing-month-switch${monthPickerOpen ? ' is-open' : ''}`}
            ref={writePanelRef}
          >
            <Button
              type="button"
              className="fund-billing-action-btn fund-billing-action-btn--write"
              onClick={() => setMonthPickerOpen((open) => !open)}
            >
              작성
            </Button>
            {monthPickerOpen ? (
              <div className="fund-billing-month-switch__panel">
                <div className="fund-billing-month-switch__fields">
                  <div className="fund-billing-month-switch__field">
                    <span className="fund-billing-month-switch__field-label">1. 프로젝트</span>
                    <div className="fund-billing-mode-toggle" role="group" aria-label="프로젝트 입력 방식">
                      <button
                        type="button"
                        className={projectMode === 'existing' && existingSearchOpen ? 'is-active' : ''}
                        onClick={() => {
                          setProjectMode('existing');
                          setExistingSearchOpen(true);
                        }}
                      >
                        기존
                      </button>
                      <button
                        type="button"
                        className={projectMode === 'new' ? 'is-active' : ''}
                        onClick={() => {
                          setExistingSearchOpen(false);
                          requestNewProject();
                        }}
                      >
                        신규
                      </button>
                    </div>
                    {projectMode === 'existing' && existingSearchOpen ? (
                      <FundBillingProjectSearch
                        hideLabel
                        startOpen
                        projects={searchProjects}
                        value={projectName}
                        selectedProjectId={report.id}
                        onSelect={handleWriteProjectSelect}
                      />
                    ) : projectMode === 'new' ? (
                      <p className="fund-billing-month-switch__new-hint">
                        신규 프로젝트입니다. 아래 기본정보에 프로젝트명·코드를 입력하세요.
                      </p>
                    ) : null}
                  </div>
                  <div className="fund-billing-month-switch__field">
                    <span className="fund-billing-month-switch__field-label">2. 기성월</span>
                    <KoreanYearMonthInput
                      className="fund-billing-month-switch__input"
                      value={report.monthKey}
                      existingMonthKeys={projectMonthKeys}
                      onChange={handleBillingMonthChange}
                    />
                  </div>
                </div>
                <span className="fund-billing-month-switch__hint">
                  프로젝트와 기성월을 모두 선택한 뒤에 기본정보·집행현황 입력이 활성화됩니다. 최신월은 수정, 이후 월은 신규 작성, 이전 월은 조회만 가능합니다.
                </span>
              </div>
            ) : null}
          </div>
          <Button
            type="button"
            className="fund-billing-action-btn fund-billing-action-btn--save"
            disabled={!canSave}
            onClick={() => setSaveConfirmOpen(true)}
          >
            저장
          </Button>
        </div>
      </div>

      <div className="fund-billing-detail__body">
        <fieldset
          className={`fund-billing-detail__canvas${readOnly ? ' is-readonly' : ''}`}
          disabled={readOnly}
        >
        <Card title="기본정보" className="fund-billing-info-card">
        <div className="fund-billing-info-form">
          <div className="form-field">
            <label htmlFor="fund-billing-project-name" className="form-field__label">
              프로젝트
            </label>
            <input
              id="fund-billing-project-name"
              type="text"
              className="form-field__input"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder={projectMode === 'new' ? '신규 프로젝트명 입력' : '선택한 프로젝트명'}
              readOnly={projectMode === 'existing'}
              autoComplete="off"
            />
          </div>
          <ProjectCodeInput
            label="프로젝트 코드"
            value={projectCode}
            onChange={setProjectCode}
          />
          <Select
            label="사업유형"
            value={mapTextToFundBillingDepartment(department)}
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
          프로젝트 기존·신규는 상단 <strong>작성</strong>에서 선택합니다. 기존은 선택한 프로젝트의 기본정보·집행현황이 반영되고, 신규는 이 화면에서 직접 입력합니다.
        </p>
      </Card>

      <div className="fund-sheet__meta-wrap">
        <table className="fund-sheet__meta">
          <tbody>
            <tr>
              <th>사업유형</th>
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
            title="공통비 관리팀검수 = (직접공사비 관리팀검수 + 직접경비 관리팀검수) ÷ 실행예산직접원가 × 공통비 하도급금액"
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
                  readOnly={readOnly}
                  entryMode={
                    isFundBillingDirectExpenseLine(line)
                      ? 'cumulative'
                      : isFundBillingCommonLine(line)
                        ? 'common'
                        : 'default'
                  }
                  commonInspectedManual={Boolean(line.commonInspectedManual)}
                  onChange={(patch) => updateOverhead(line.id, patch)}
                  onRequestCommonInspectedEdit={
                    isFundBillingCommonLine(line) ? requestCommonInspectedEdit : undefined
                  }
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
                      showActions={!readOnly}
                      readOnly={readOnly}
                      isEditing={editingId === row.line.id}
                      onChange={(patch) => {
                        if (editingId === row.line.id) {
                          setEditDraft((current) =>
                            current ? clampSpendLineToContract(current, patch) : current,
                          );
                          if (patch.contractAmountHistory) {
                            updateLine(row.line.id, patch);
                          }
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
        </fieldset>
      </div>
      <ConfirmDialog
        open={saveConfirmOpen}
        title="월별 기성보고서 저장"
        confirmLabel="예"
        cancelLabel="아니오"
        message="해당 월의 기성보고서를 저장하시겠습니까?"
        onConfirm={confirmSaveReport}
        onCancel={() => setSaveConfirmOpen(false)}
      />
      <ConfirmDialog
        open={pastNoticeOpen}
        title="안내"
        confirmLabel="확인"
        hideCancel
        message="선택한 연월은 수정할 수 없습니다."
        onConfirm={() => setPastNoticeOpen(false)}
        onCancel={() => setPastNoticeOpen(false)}
      />
      <ConfirmDialog
        open={editConfirmOpen}
        title="월별 기성보고서 수정"
        confirmLabel="예"
        cancelLabel="아니오"
        message="선택한 월의 기성보고서를 수정하시겠습니까?"
        onConfirm={() => {
          setEditUnlocked(true);
          setEditConfirmOpen(false);
        }}
        onCancel={() => {
          setEditUnlocked(false);
          setEditConfirmOpen(false);
        }}
      />
      <ConfirmDialog
        open={Boolean(pendingCreateMonth)}
        title="월별 기성보고서 작성"
        confirmLabel="예"
        cancelLabel="아니오"
        message="선택한 월의 기성보고서를 작성하시겠습니까?"
        onConfirm={finishCreateNextMonth}
        onCancel={cancelCreateNextMonth}
      />
      <ConfirmDialog
        open={commonInspectedConfirmOpen}
        title="공통비 관리팀검수 수정"
        confirmLabel="예"
        cancelLabel="아니오"
        message={`공통비 관리팀검수는 수식으로 계산된 금액입니다.

(직접공사비 관리팀검수 + 직접경비 관리팀검수) ÷ 실행예산직접원가 × 공통비 하도급금액

변경하시겠습니까?`}
        onConfirm={() => {
          setCommonInspectedConfirmOpen(false);
          unlockCommonInspected();
        }}
        onCancel={() => setCommonInspectedConfirmOpen(false)}
      />
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

function fingerprintFromSavedReport(report: FundBillingReport): string {
  const arrangedLines = arrangeSpendLines(report.lines.map((line) => ({ ...line })));
  const overheads = (report.overheads ?? []).map((line) => ({ ...line }));
  const vendorTotals = summarizeLines(arrangedLines);
  const directCostBudget = report.directCostBudget ?? 0;
  const commonInspected = resolveCommonInspected(overheads, vendorTotals.inspected, directCostBudget);
  const displayOverheads = overheads.map((line) => {
    if (!isFundBillingCommonLine(line)) return line;
    return { ...line, monthClaim: 0, inspected: commonInspected };
  });
  return fingerprintBillingDraft({
    projectName: report.projectName,
    projectCode: report.projectCode,
    department: mapTextToFundBillingDepartment(report.department, report.projectName),
    contractAmount: report.contractAmount,
    startDate: report.startDate,
    endDate: report.endDate,
    writtenDate: report.writtenDate,
    pmName: report.pmName,
    collectedPrior: report.collectedPrior,
    expectedCollection: report.expectedCollection,
    directCostBudget,
    linkedProjectId: report.linkedProjectId || report.id,
    overheads: displayOverheads,
    lines: arrangedLines,
  });
}

function fingerprintBillingDraft(draft: {
  projectName: string;
  projectCode: string;
  department: string;
  contractAmount: number;
  startDate: string;
  endDate: string;
  writtenDate: string;
  pmName: string;
  collectedPrior: number;
  expectedCollection: number;
  directCostBudget: number;
  linkedProjectId: string;
  overheads: SpendLine[];
  lines: SpendLine[];
}): string {
  const money = (value: number) => Math.round(Number.isFinite(value) ? value : 0);
  const packLines = (rows: SpendLine[]) =>
    rows.map((line) => ({
      id: line.id,
      kind: line.kind,
      no: line.no,
      tradeType: line.tradeType.trim(),
      vendorName: line.vendorName.trim(),
      contractAmount: money(line.contractAmount),
      priorPaid: money(line.priorPaid),
      monthClaim: money(line.monthClaim),
      inspected: money(line.inspected),
      commonInspectedManual: Boolean(line.commonInspectedManual),
      contractAmountHistory: line.contractAmountHistory ?? [],
    }));
  return JSON.stringify({
    projectName: draft.projectName.trim(),
    projectCode: draft.projectCode.trim(),
    department: draft.department.trim(),
    contractAmount: money(draft.contractAmount),
    startDate: draft.startDate,
    endDate: draft.endDate,
    writtenDate: draft.writtenDate,
    pmName: draft.pmName.trim(),
    collectedPrior: money(draft.collectedPrior),
    expectedCollection: money(draft.expectedCollection),
    directCostBudget: money(draft.directCostBudget),
    linkedProjectId: draft.linkedProjectId,
    overheads: packLines(draft.overheads),
    lines: packLines(draft.lines),
  });
}

function clampSpendLineToContract(line: SpendLine, patch: Partial<SpendLine> = {}): SpendLine {
  const next = { ...line, ...patch };
  const cap = Number.isFinite(next.contractAmount) ? Math.max(0, next.contractAmount) : 0;
  const priorPaid = Math.max(0, Number.isFinite(next.priorPaid) ? next.priorPaid : 0);
  const inspectedRaw = Math.max(0, Number.isFinite(next.inspected) ? next.inspected : 0);
  const monthClaimRaw = Math.max(0, Number.isFinite(next.monthClaim) ? next.monthClaim : 0);
  const prior = Math.min(priorPaid, cap);
  const inspected = Math.min(inspectedRaw, Math.max(0, cap - prior));
  const monthClaim = Math.min(monthClaimRaw, cap);
  return {
    ...next,
    contractAmount: cap,
    priorPaid: prior,
    inspected,
    monthClaim,
  };
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
  readOnly = false,
  isEditing,
  entryMode = 'default',
  commonInspectedManual = false,
  onRequestCommonInspectedEdit,
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
  readOnly?: boolean;
  isEditing?: boolean;
  entryMode?: 'default' | 'cumulative' | 'common';
  commonInspectedManual?: boolean;
  onRequestCommonInspectedEdit?: () => void;
  onEdit?: () => void;
  onSave?: () => void;
  onCancelEdit?: () => void;
  onDelete?: () => void;
}) {
  const cumulative = line.priorPaid + line.inspected;
  const remain = line.contractAmount - cumulative;
  const unlocked = Boolean(isEditing) && !readOnly;
  const monthClaimLocked = readOnly || entryMode === 'cumulative' || entryMode === 'common';
  const commonInspectLocked = !readOnly && entryMode === 'common' && !commonInspectedManual;
  const inspectedLocked = readOnly || entryMode === 'cumulative' || commonInspectLocked;

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
        <ContractAmountHistoryCell
          unlocked={unlocked}
          contractAmount={line.contractAmount}
          history={line.contractAmountHistory}
          onCommit={(next) => onChange(next)}
        />
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
      <td
        className={`fund-sheet__num${inspectedLocked ? ' fund-sheet__fixed' : ' fund-sheet__edit'}${
          commonInspectLocked ? ' fund-sheet__formula-cell' : ''
        }`}
        title={
          commonInspectLocked
            ? '수식: (직접공사비 관리팀검수 + 직접경비 관리팀검수) ÷ 실행예산직접원가 × 공통비 하도급금액'
            : undefined
        }
        onClick={commonInspectLocked ? onRequestCommonInspectedEdit : undefined}
      >
        {inspectedLocked ? (
          won(line.inspected)
        ) : (
          <AmountInput
            value={line.inspected}
            onChange={(value) =>
              onChange(
                entryMode === 'common'
                  ? { inspected: value, commonInspectedManual: true }
                  : { inspected: value },
              )
            }
          />
        )}
      </td>
      <td className="fund-sheet__num">{ratioText(line.inspected, line.contractAmount)}</td>
      <td className={`fund-sheet__num${entryMode === 'cumulative' ? ' fund-sheet__edit' : ' fund-sheet__fixed'}`}>
        {entryMode === 'cumulative' ? (
          <AmountInput
            value={cumulative}
            onChange={(value) => {
              const capped = Math.min(Math.max(0, value), Math.max(0, line.contractAmount));
              const delta = Math.max(0, capped - line.priorPaid);
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

function cloneSpendLines(lines: SpendLine[]): SpendLine[] {
  return lines.map((line) => ({
    ...line,
    contractAmountHistory: line.contractAmountHistory?.map((item) => ({ ...item })),
  }));
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
