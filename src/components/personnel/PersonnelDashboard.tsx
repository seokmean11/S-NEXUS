import { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input, Select } from '@/components/ui/Input';
import { PersonnelMenuPermissionsEditor } from '@/components/personnel/PersonnelMenuPermissionsEditor';
import { PersonnelMultiSelectFilter } from '@/components/personnel/PersonnelMultiSelectFilter';
import { PersonnelResourceStatusPanel } from '@/components/personnel/PersonnelResourceStatusPanel';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import {
  buildPersonnelRows,
  EMPTY_PERSONNEL_FILTERS,
  filterPersonnelRows,
  formatPersonnelGradeCell,
  formatPersonnelPermissionCell,
  formatPersonnelPositionCell,
  getPersonnelDivisionFilterOptions,
  getDivisionOptions,
  getScopedPersonFilterOptions,
  getScopedTeamFilterOptions,
  getPersonnelGradeFormValue,
  getPersonnelPositionFormValue,
  getPersonnelTeamFormValue,
  getPersonnelEditorTeamSelectOptions,
  isPersonnelOrgAffiliationEditable,
  PERSONNEL_TEAM_NONE_VALUE,
  appendLegacySelectOption,
  buildPersonnelGradeUpdates,
  buildPersonnelPositionUpdates,
  derivePersonnelRankFromGrade,
  resolvePersonnelRankForSave,
  PERSONNEL_GRADE_SELECT_OPTIONS,
  PERSONNEL_RANK_SELECT_OPTIONS,
  PERSONNEL_POSITION_SELECT_OPTIONS,
  prunePersonnelFilters,
  parseDivisionHeadRowId,
  parseTeamHeadRowId,
  type PersonnelFilterKey,
  type PersonnelFilters,
  type PersonnelRow,
} from '@/utils/personnelSearch';
import {
  exportPersonnelSearchResults,
  PERSONNEL_EXPORT_FORMAT_OPTIONS,
  type PersonnelExportFormat,
} from '@/utils/personnelExport';
import { summarizePersonnelResourceStats } from '@/utils/personnelResourceStats';

import type { PersonnelMenuPermissions } from '@/types/menuPermissions';
import { normalizeMenuPermissions } from '@/utils/menuPermissions';
import { isPlatformSuperAdminPerson } from '@/utils/platformSuperAdmin';

const EMPTY_PERSON_FORM = {
  name: '',
  grade: '',
  rank: '',
  position: '',
  menuPermissions: {} as PersonnelMenuPermissions,
  divisionId: '',
  teamId: '',
};

const EMPTY_PERSONNEL_PROFILE = {
  gradeLevel: undefined,
  gradeRank: undefined,
  position: undefined,
  permissionLevel: undefined,
} as const;

const CLEAR_DIVISION_HEAD_FIELDS = {
  headName: '',
  headRank: '',
  headGradeLevel: undefined,
  headGradeRank: undefined,
  headPosition: undefined,
  headPermissionLevel: undefined,
  headMenuPermissions: undefined,
} as const;

const CLEAR_TEAM_HEAD_FIELDS = { ...CLEAR_DIVISION_HEAD_FIELDS };

export function PersonnelDashboard({ embedded = false }: { embedded?: boolean }) {
  const {
    executiveOffice,
    divisions,
    teams,
    employees,
    updateExecutiveAdmin,
    removeExecutiveAdmin,
    updateEmployee,
    removeEmployee,
    addEmployee,
    updateDivision,
    updateTeam,
  } = useApp();
  const { canEditMenu } = useAuth();
  const canEditOrg = canEditMenu('org');

  const [filters, setFilters] = useState<PersonnelFilters>(EMPTY_PERSONNEL_FILTERS);
  const [activeFilterKey, setActiveFilterKey] = useState<PersonnelFilterKey | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editingRow, setEditingRow] = useState<PersonnelRow | null>(null);
  const [isAddingPerson, setIsAddingPerson] = useState(false);
  const [addConfirmOpen, setAddConfirmOpen] = useState(false);
  const [personForm, setPersonForm] = useState(EMPTY_PERSON_FORM);
  const [deletePersonTarget, setDeletePersonTarget] = useState<PersonnelRow | null>(null);
  const [exportFormat, setExportFormat] = useState<PersonnelExportFormat>('excel');
  const [exporting, setExporting] = useState(false);
  const [resourceStatusOpen, setResourceStatusOpen] = useState(false);
  const editorDialogRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const resourcePanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!embedded || !resourceStatusOpen) return;

    const body = bodyRef.current;
    const panel = resourcePanelRef.current;
    if (!body || !panel) return;

    requestAnimationFrame(() => {
      const scrollTop =
        panel.getBoundingClientRect().top -
        body.getBoundingClientRect().top +
        body.scrollTop;
      body.scrollTo({ top: Math.max(0, scrollTop - 8), behavior: 'smooth' });
    });
  }, [embedded, resourceStatusOpen]);

  const divisionNameById = useMemo(
    () => new Map(divisions.map((division) => [division.id, division.name])),
    [divisions],
  );

  const allPersonRows = useMemo(
    () => buildPersonnelRows(executiveOffice.admins ?? [], employees, divisions, teams),
    [executiveOffice.admins, employees, divisions, teams],
  );

  const resourceStats = useMemo(
    () => summarizePersonnelResourceStats(allPersonRows),
    [allPersonRows],
  );

  const filteredPersonRows = useMemo(
    () => filterPersonnelRows(allPersonRows, filters),
    [allPersonRows, filters],
  );

  const divisionFilterOptions = useMemo(
    () => getPersonnelDivisionFilterOptions(divisions),
    [divisions],
  );

  const teamFilterOptions = useMemo(
    () => getScopedTeamFilterOptions(teams, divisions, filters),
    [teams, divisions, filters],
  );

  const personFilterOptions = useMemo(
    () => getScopedPersonFilterOptions(allPersonRows, filters),
    [allPersonRows, filters],
  );

  const editorTeamSelectOptions = useMemo(
    () =>
      getPersonnelEditorTeamSelectOptions(teams, personForm.divisionId, {
        includeNone: Boolean(editingRow) && !isAddingPerson,
        currentTeamId: personForm.teamId,
      }),
    [teams, personForm.divisionId, personForm.teamId, editingRow, isAddingPerson],
  );

  const canSavePersonForm = useMemo(() => {
    if (!isAddingPerson) return true;

    if (!personForm.name.trim()) return false;
    if (!personForm.divisionId) return false;
    if (!personForm.teamId || personForm.teamId === PERSONNEL_TEAM_NONE_VALUE) return false;

    const rankResult = resolvePersonnelRankForSave(personForm.grade, personForm.rank);
    return rankResult.ok;
  }, [isAddingPerson, personForm]);

  const autoDerivedRank = useMemo(
    () => derivePersonnelRankFromGrade(personForm.grade),
    [personForm.grade],
  );

  const gradeSelectOptions = useMemo(
    () => [
      { value: '', label: '선택' },
      ...appendLegacySelectOption(PERSONNEL_GRADE_SELECT_OPTIONS, personForm.grade),
    ],
    [personForm.grade],
  );

  const rankSelectOptions = useMemo(
    () => [
      { value: '', label: '선택' },
      ...appendLegacySelectOption(PERSONNEL_RANK_SELECT_OPTIONS, personForm.rank),
    ],
    [personForm.rank],
  );

  const positionSelectOptions = useMemo(
    () => [
      { value: '', label: '선택' },
      ...appendLegacySelectOption(PERSONNEL_POSITION_SELECT_OPTIONS, personForm.position),
    ],
    [personForm.position],
  );

  useEffect(() => {
    if (!editingRow && !isAddingPerson) return;
    editorDialogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [editingRow, isAddingPerson]);

  const resultCount = filteredPersonRows.length;
  const totalCount = allPersonRows.length;

  const updateFilters = (updater: (prev: PersonnelFilters) => PersonnelFilters) => {
    setFilters((prev) => {
      const next = updater(prev);
      return prunePersonnelFilters(next, divisions, teams, allPersonRows);
    });
  };

  const handleDivisionFilterChange = (field: PersonnelFilters['division']) => {
    updateFilters((prev) => ({ ...prev, division: field }));
  };

  const handleTeamFilterChange = (field: PersonnelFilters['team']) => {
    updateFilters((prev) => ({ ...prev, team: field }));
  };

  const handlePersonFilterChange = (field: PersonnelFilters['person']) => {
    updateFilters((prev) => ({ ...prev, person: field }));
  };

  const showMessage = (text: string) => {
    setMessage(text);
    setError('');
    setTimeout(() => setMessage(''), 3000);
  };

  const showError = (text: string) => {
    setError(text);
    setMessage('');
    setTimeout(() => setError(''), 4000);
  };

  const handleExportResults = async () => {
    if (resultCount === 0) {
      showError('내보낼 검색 결과가 없습니다.');
      return;
    }

    setExporting(true);
    try {
      await exportPersonnelSearchResults({
        format: exportFormat,
        entityType: 'employee',
        personRows: filteredPersonRows,
        divisions: [],
        teams: [],
        divisionNameById,
        filters,
      });
      showMessage('검색 결과를 내보냈습니다.');
    } catch {
      showError('내보내기에 실패했습니다.');
    } finally {
      setExporting(false);
    }
  };

  const closeEditor = () => {
    setEditingRow(null);
    setIsAddingPerson(false);
    setPersonForm(EMPTY_PERSON_FORM);
  };

  const openAddPersonEditor = () => {
    if (!canEditOrg) return;
    setAddConfirmOpen(false);
    setEditingRow(null);
    setIsAddingPerson(true);
    setPersonForm(EMPTY_PERSON_FORM);
    setMessage('');
    setError('');
  };

  const openEditPerson = (row: PersonnelRow) => {
    if (!canEditOrg) return;
    setEditingRow(row);
    setMessage('');
    setError('');

    const resolvedDivisionId =
      row.divisionId ??
      (row.teamId ? teams.find((team) => team.id === row.teamId)?.divisionId : undefined) ??
      '';

    setPersonForm({
      name: row.name,
      grade: getPersonnelGradeFormValue(row),
      rank: row.rank,
      position: getPersonnelPositionFormValue(row.position),
      menuPermissions: normalizeMenuPermissions(row.menuPermissions) ?? {},
      divisionId: resolvedDivisionId,
      teamId: getPersonnelTeamFormValue(row),
    });
  };

  const buildHeadFieldUpdates = (
    gradeResult: ReturnType<typeof buildPersonnelGradeUpdates>,
    positionResult: ReturnType<typeof buildPersonnelPositionUpdates>,
    menuPermissions: PersonnelMenuPermissions,
  ) => ({
    ...(gradeResult.ok && gradeResult.updates
      ? {
          headGradeLevel: gradeResult.updates.gradeLevel,
          headGradeRank: gradeResult.updates.gradeRank,
        }
      : {}),
    headMenuPermissions: normalizeMenuPermissions(menuPermissions),
    ...(positionResult.ok && positionResult.updates
      ? { headPosition: positionResult.updates.position }
      : {}),
  });

  const validateOrgAffiliation = (): { divisionId: string; teamId: string } | null => {
    const divisionId = personForm.divisionId;
    if (!divisionId) {
      showError('사업본부를 선택해 주세요.');
      return null;
    }

    if (isAddingPerson) {
      const teamId = personForm.teamId;
      if (!teamId || teamId === PERSONNEL_TEAM_NONE_VALUE) {
        showError('소속 팀을 선택해 주세요.');
        return null;
      }

      const team = teams.find((item) => item.id === teamId);
      if (!team || team.divisionId !== divisionId) {
        showError('선택한 팀이 사업본부와 일치하지 않습니다.');
        return null;
      }

      return { divisionId, teamId };
    }

    if (!editingRow) return null;

    const teamId = personForm.teamId;
    if (!teamId) {
      showError('소속 팀을 선택해 주세요.');
      return null;
    }

    if (editingRow.kind === 'division_head') {
      if (teamId !== PERSONNEL_TEAM_NONE_VALUE) {
        showError('본부장은 소속 팀을 없음으로 선택해 주세요.');
        return null;
      }
      return { divisionId, teamId: PERSONNEL_TEAM_NONE_VALUE };
    }

    if (teamId === PERSONNEL_TEAM_NONE_VALUE) {
      if (editingRow.kind === 'team_head') {
        showError('팀장은 소속 팀을 선택해 주세요.');
        return null;
      }
      return { divisionId, teamId: PERSONNEL_TEAM_NONE_VALUE };
    }

    const team = teams.find((item) => item.id === teamId);
    if (!team || team.divisionId !== divisionId) {
      showError('선택한 팀이 사업본부와 일치하지 않습니다.');
      return null;
    }

    return { divisionId, teamId };
  };

  const resolveSavedTeamId = (teamId: string): string | undefined => {
    if (teamId === PERSONNEL_TEAM_NONE_VALUE) return undefined;
    return teamId;
  };

  const handleSavePersonEdit = () => {
    if (!canEditOrg || !editingRow) return;

    const name = personForm.name.trim();

    if (!name) {
      showError('이름을 입력해 주세요.');
      return;
    }

    const rankResult = resolvePersonnelRankForSave(personForm.grade, personForm.rank);
    if (!rankResult.ok) {
      showError(rankResult.message);
      return;
    }
    const rank = rankResult.rank;

    const gradeResult = buildPersonnelGradeUpdates(personForm.grade, editingRow);
    if (!gradeResult.ok) {
      showError(gradeResult.message);
      return;
    }

    const positionResult = buildPersonnelPositionUpdates(personForm.position, editingRow);
    if (!positionResult.ok) {
      showError(positionResult.message);
      return;
    }

    const menuPermissions = normalizeMenuPermissions(personForm.menuPermissions);

    const sharedUpdates = {
      ...(gradeResult.updates ?? {}),
      ...(positionResult.updates ?? {}),
      menuPermissions,
    };

    if (editingRow.kind === 'executive') {
      const affiliation = validateOrgAffiliation();
      if (!affiliation) return;

      updateExecutiveAdmin(editingRow.id, {
        name,
        rank,
        ...sharedUpdates,
        divisionId: affiliation.divisionId,
        teamId: resolveSavedTeamId(affiliation.teamId),
      });
      showMessage('개인정보가 저장되었습니다.');
      closeEditor();
      return;
    }

    if (editingRow.kind === 'division_head') {
      const affiliation = validateOrgAffiliation();
      if (!affiliation) return;

      const oldDivisionId = parseDivisionHeadRowId(editingRow.id);
      if (!oldDivisionId) {
        showError('본부 정보를 찾을 수 없습니다.');
        return;
      }

      const headUpdates = {
        headName: name,
        headRank: rank,
        ...buildHeadFieldUpdates(gradeResult, positionResult, personForm.menuPermissions),
      };

      if (oldDivisionId !== affiliation.divisionId) {
        updateDivision(oldDivisionId, { ...CLEAR_DIVISION_HEAD_FIELDS });
      }
      updateDivision(affiliation.divisionId, headUpdates);
      showMessage('개인정보가 저장되었습니다.');
      closeEditor();
      return;
    }

    if (editingRow.kind === 'team_head') {
      const affiliation = validateOrgAffiliation();
      if (!affiliation) return;

      const oldTeamId = parseTeamHeadRowId(editingRow.id);
      if (!oldTeamId) {
        showError('팀 정보를 찾을 수 없습니다.');
        return;
      }

      const headUpdates = {
        headName: name,
        headRank: rank,
        ...buildHeadFieldUpdates(gradeResult, positionResult, personForm.menuPermissions),
      };

      if (oldTeamId !== affiliation.teamId) {
        updateTeam(oldTeamId, { ...CLEAR_TEAM_HEAD_FIELDS });
        updateTeam(affiliation.teamId, {
          ...headUpdates,
          divisionId: affiliation.divisionId,
        });
      } else {
        updateTeam(affiliation.teamId, {
          ...headUpdates,
          divisionId: affiliation.divisionId,
        });
      }
      showMessage('개인정보가 저장되었습니다.');
      closeEditor();
      return;
    }

    const affiliation = validateOrgAffiliation();
    if (!affiliation) return;

    updateEmployee(editingRow.id, {
      name,
      role: rank,
      ...sharedUpdates,
      divisionId: affiliation.divisionId,
      teamId:
        affiliation.teamId === PERSONNEL_TEAM_NONE_VALUE ? '' : affiliation.teamId,
    });
    showMessage('개인정보가 저장되었습니다.');
    closeEditor();
  };

  const handleSavePersonAdd = () => {
    if (!canEditOrg || !isAddingPerson) return;

    const name = personForm.name.trim();
    if (!name) {
      showError('이름을 입력해 주세요.');
      return;
    }

    const rankResult = resolvePersonnelRankForSave(personForm.grade, personForm.rank);
    if (!rankResult.ok) {
      showError(rankResult.message);
      return;
    }
    const rank = rankResult.rank;

    const gradeResult = buildPersonnelGradeUpdates(personForm.grade, EMPTY_PERSONNEL_PROFILE);
    if (!gradeResult.ok) {
      showError(gradeResult.message);
      return;
    }

    const positionResult = buildPersonnelPositionUpdates(
      personForm.position,
      EMPTY_PERSONNEL_PROFILE,
    );
    if (!positionResult.ok) {
      showError(positionResult.message);
      return;
    }

    const affiliation = validateOrgAffiliation();
    if (!affiliation) return;

    const employeeId = addEmployee(affiliation.teamId, name, rank);
    if (!employeeId) {
      showError('인원 등록에 실패했습니다. 팀 정보를 확인해 주세요.');
      return;
    }

    const menuPermissions = normalizeMenuPermissions(personForm.menuPermissions);
    updateEmployee(employeeId, {
      ...(gradeResult.updates ?? {}),
      ...(positionResult.updates ?? {}),
      menuPermissions,
      divisionId: affiliation.divisionId,
      teamId: affiliation.teamId,
    });

    showMessage('인원이 추가되었습니다.');
    closeEditor();
  };

  const handleDeletePersonConfirm = () => {
    if (!canEditOrg || !deletePersonTarget) return;

    if (isPlatformSuperAdminPerson(deletePersonTarget)) {
      showError('플랫폼 통합관리자(서석민)는 삭제할 수 없습니다.');
      setDeletePersonTarget(null);
      return;
    }

    if (deletePersonTarget.kind === 'executive') {
      removeExecutiveAdmin(deletePersonTarget.id);
      showMessage('경영진이 삭제되었습니다.');
    } else if (deletePersonTarget.kind === 'division_head') {
      const divisionId = parseDivisionHeadRowId(deletePersonTarget.id);
      if (divisionId) {
        updateDivision(divisionId, {
          headName: '',
          headRank: '',
          headGradeLevel: undefined,
          headGradeRank: undefined,
          headPosition: undefined,
          headPermissionLevel: undefined,
        });
      }
      showMessage('본부장 정보가 삭제되었습니다.');
    } else if (deletePersonTarget.kind === 'team_head') {
      const teamId = parseTeamHeadRowId(deletePersonTarget.id);
      if (teamId) {
        updateTeam(teamId, {
          headName: '',
          headRank: '',
          headGradeLevel: undefined,
          headGradeRank: undefined,
          headPosition: undefined,
          headPermissionLevel: undefined,
        });
      }
      showMessage('팀장 정보가 삭제되었습니다.');
    } else {
      const result = removeEmployee(deletePersonTarget.id);
      if (!result.ok) {
        showError(result.reason);
        setDeletePersonTarget(null);
        return;
      }
      showMessage('팀원이 삭제되었습니다.');
    }

    if (editingRow?.id === deletePersonTarget.id) closeEditor();
    setDeletePersonTarget(null);
  };

  const editorOpen = !!editingRow || isAddingPerson;

  const handleEditorSave = () => {
    if (isAddingPerson) {
      handleSavePersonAdd();
      return;
    }
    handleSavePersonEdit();
  };

  const resourceStatusPanel = resourceStatusOpen ? (
    <div
      ref={embedded ? resourcePanelRef : undefined}
      className={embedded ? 'org-page__resource-status' : undefined}
    >
      <PersonnelResourceStatusPanel stats={resourceStats} rows={allPersonRows} />
    </div>
  ) : null;

  const personnelSearchCard = (
      <Card
        title="인원검색"
        subtitle="사업본부 · 팀 · 이름·직급 검색으로 조직 인원을 통합 조회합니다"
        className={embedded ? 'personnel-dashboard--embedded' : undefined}
      >
        {message && <div className="toast toast--success no-print">{message}</div>}
        {error && <div className="toast toast--error no-print">{error}</div>}

        <div className="personnel-dashboard__filters no-print">
          <PersonnelMultiSelectFilter
            filterKey="division"
            options={divisionFilterOptions}
            field={filters.division}
            activeFilterKey={activeFilterKey}
            onActivate={() => setActiveFilterKey('division')}
            onChange={handleDivisionFilterChange}
          />
          <PersonnelMultiSelectFilter
            filterKey="team"
            options={teamFilterOptions}
            field={filters.team}
            activeFilterKey={activeFilterKey}
            onActivate={() => setActiveFilterKey('team')}
            onChange={handleTeamFilterChange}
          />
          <PersonnelMultiSelectFilter
            filterKey="person"
            options={personFilterOptions}
            field={filters.person}
            activeFilterKey={activeFilterKey}
            placeholder="예: 홍길동, 팀장"
            onActivate={() => setActiveFilterKey('person')}
            onChange={handlePersonFilterChange}
          />
        </div>

        <div className="personnel-dashboard__add-action no-print">
          <Button
            variant="primary"
            size="sm"
            disabled={!canEditOrg}
            title={canEditOrg ? undefined : '조직관리 읽기전용 — 등록할 수 없습니다.'}
            onClick={() => setAddConfirmOpen(true)}
          >
            인원추가등록
          </Button>
        </div>

        <div className="personnel-dashboard__summary">
          <span>
            전체 {totalCount}건 · 검색 결과 {resultCount}건
          </span>
          <div className="personnel-dashboard__export-actions no-print">
            <Select
              label="내보내기 형식"
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as PersonnelExportFormat)}
              options={PERSONNEL_EXPORT_FORMAT_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportResults}
              disabled={exporting || resultCount === 0}
            >
              {exporting ? '내보내는 중…' : '검색 결과 내보내기'}
            </Button>
          </div>
        </div>

        <div className="personnel-table-wrap">
          <table className="personnel-table">
            <thead>
              <tr>
                <th>이름</th>
                <th>급수</th>
                <th>직급</th>
                <th>지위</th>
                <th>권한</th>
                <th>사업본부</th>
                <th>팀</th>
                <th className="personnel-table__actions">관리</th>
              </tr>
            </thead>
            <tbody>
              {filteredPersonRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="personnel-table__empty">
                    검색 결과가 없습니다.
                  </td>
                </tr>
              ) : (
                filteredPersonRows.map((row) => (
                  <tr key={`${row.kind}-${row.id}`}>
                    <td>{row.name}</td>
                    <td>{formatPersonnelGradeCell(row)}</td>
                    <td>{row.rank}</td>
                    <td>{formatPersonnelPositionCell(row)}</td>
                    <td className="personnel-table__permissions">{formatPersonnelPermissionCell(row)}</td>
                    <td>{row.divisionName}</td>
                    <td>{row.teamName}</td>
                    <td className="personnel-table__actions">
                      <div className="personnel-table__action-group">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!canEditOrg}
                          title={canEditOrg ? undefined : '조직관리 읽기전용 — 수정할 수 없습니다.'}
                          onClick={() => openEditPerson(row)}
                        >
                          수정
                        </Button>
                        {!isPlatformSuperAdminPerson(row) && (
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={!canEditOrg}
                            title={canEditOrg ? undefined : '조직관리 읽기전용 — 삭제할 수 없습니다.'}
                            onClick={() => setDeletePersonTarget(row)}
                          >
                            삭제
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
  );

  return (
    <>
      {embedded ? (
        <>
          <div className="org-page__toolbar personnel-resource-toolbar no-print">
            <Button
              variant={resourceStatusOpen ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setResourceStatusOpen((open) => !open)}
            >
              {resourceStatusOpen ? '자원정보현황 닫기' : '자원정보현황'}
            </Button>
          </div>

          <div className="org-page__body" ref={bodyRef}>
            {resourceStatusPanel}
            {personnelSearchCard}
          </div>
        </>
      ) : (
        <div className="personnel-dashboard-stack">
          <div className="personnel-resource-toolbar no-print">
            <Button
              variant={resourceStatusOpen ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setResourceStatusOpen((open) => !open)}
            >
              {resourceStatusOpen ? '자원정보현황 닫기' : '자원정보현황'}
            </Button>
          </div>

          {resourceStatusPanel}
          {personnelSearchCard}
        </div>
      )}

      {editorOpen && (editingRow || isAddingPerson) && (
        <div className="personnel-edit-backdrop no-print" onClick={closeEditor}>
          <div
            ref={editorDialogRef}
            className="personnel-edit-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="personnel-edit-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="personnel-edit-dialog__header">
              <h3 id="personnel-edit-dialog-title" className="personnel-edit-dialog__title">
                {isAddingPerson ? '인원 추가등록' : '개인정보 수정'}
              </h3>
              {isAddingPerson ? (
                <p className="personnel-edit-dialog__subtitle">
                  전사 조직에 새 인원을 등록합니다.
                </p>
              ) : editingRow ? (
                <p className="personnel-edit-dialog__subtitle">
                  {editingRow.name} · {editingRow.divisionName} · {editingRow.teamName}
                </p>
              ) : null}
              <p className="personnel-edit-dialog__guide">
                {isAddingPerson ? (
                  <>
                    아래 항목을 입력한 뒤 하단 <strong>저장</strong> 버튼을 눌러 등록해 주세요.
                  </>
                ) : (
                  <>
                    아래 항목을 수정한 뒤 하단 <strong>저장</strong> 버튼을 눌러 반영해 주세요.
                  </>
                )}
              </p>
            </div>

            <div className="personnel-edit-dialog__body">
              <div className="personnel-editor-grid">
                <Input
                  label="이름"
                  value={personForm.name}
                  onChange={(e) => setPersonForm((prev) => ({ ...prev, name: e.target.value }))}
                />
                <Select
                  label="급수"
                  value={personForm.grade}
                  onChange={(e) => {
                    const grade = e.target.value;
                    const derivedRank = derivePersonnelRankFromGrade(grade);
                    setPersonForm((prev) => ({
                      ...prev,
                      grade,
                      ...(derivedRank ? { rank: derivedRank } : {}),
                    }));
                  }}
                  options={gradeSelectOptions}
                />
                <Select
                  label="직급"
                  value={personForm.rank}
                  onChange={(e) =>
                    setPersonForm((prev) => ({ ...prev, rank: e.target.value }))
                  }
                  options={rankSelectOptions}
                  disabled={Boolean(autoDerivedRank)}
                  title={
                    autoDerivedRank
                      ? '급수 선택에 따라 직급이 자동 설정됩니다.'
                      : undefined
                  }
                />
                <Select
                  label="지위"
                  value={personForm.position}
                  onChange={(e) =>
                    setPersonForm((prev) => ({ ...prev, position: e.target.value }))
                  }
                  options={positionSelectOptions}
                />
                {(isAddingPerson ||
                  (editingRow && isPersonnelOrgAffiliationEditable(editingRow.kind))) && (
                  <>
                    <Select
                      label="사업본부"
                      value={personForm.divisionId}
                      onChange={(e) =>
                        setPersonForm((prev) => ({
                          ...prev,
                          divisionId: e.target.value,
                          teamId:
                            isAddingPerson || editingRow?.kind === 'team_head'
                              ? ''
                              : PERSONNEL_TEAM_NONE_VALUE,
                        }))
                      }
                      options={[{ value: '', label: '선택' }, ...getDivisionOptions(divisions)]}
                    />
                    <Select
                      label="팀"
                      value={personForm.teamId}
                      onChange={(e) =>
                        setPersonForm((prev) => ({ ...prev, teamId: e.target.value }))
                      }
                      options={editorTeamSelectOptions}
                    />
                  </>
                )}
                <div className="personnel-edit-dialog__menu-perms">
                  <p className="personnel-edit-dialog__field-label">메뉴 권한</p>
                  {!isAddingPerson && editingRow && isPlatformSuperAdminPerson(editingRow) ? (
                    <p className="personnel-edit-dialog__locked-role">
                      개발자 (통합관리) — 모든 메뉴·조직·권한 관리 가능. 변경할 수 없습니다.
                    </p>
                  ) : (
                    <PersonnelMenuPermissionsEditor
                      value={personForm.menuPermissions}
                      onChange={(menuPermissions) =>
                        setPersonForm((prev) => ({ ...prev, menuPermissions }))
                      }
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="personnel-edit-dialog__footer">
              <p className="personnel-edit-dialog__save-hint">
                {isAddingPerson ? (
                  <>
                    입력 내용은 <strong>저장</strong>을 눌러야 전사 인원에 반영됩니다.
                  </>
                ) : (
                  <>
                    변경 내용은 <strong>저장</strong>을 눌러야 목록에 반영됩니다.
                  </>
                )}
              </p>
              <div className="personnel-editor-actions">
                <Button variant="ghost" onClick={closeEditor}>
                  취소
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  className="personnel-edit-dialog__save-btn"
                  onClick={handleEditorSave}
                  disabled={isAddingPerson && !canSavePersonForm}
                >
                  저장
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={addConfirmOpen}
        title="인원 추가등록"
        message="새 인원을 전사 조직에 추가하시겠습니까?"
        confirmLabel="네"
        cancelLabel="아니오"
        onConfirm={openAddPersonEditor}
        onCancel={() => setAddConfirmOpen(false)}
      />

      <ConfirmDialog
        open={deletePersonTarget !== null}
        title="인원 삭제"
        message={deletePersonTarget ? `${deletePersonTarget.name} 님을 삭제하시겠습니까?` : ''}
        confirmLabel="네"
        cancelLabel="아니오"
        onConfirm={handleDeletePersonConfirm}
        onCancel={() => setDeletePersonTarget(null)}
      />
    </>
  );
}
