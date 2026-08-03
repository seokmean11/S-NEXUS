import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input, Select } from '@/components/ui/Input';
import { useApp } from '@/context/AppContext';
import type { Division, Team, WebAccessRole } from '@/types';
import {
  buildPersonnelRows,
  filterPersonnelRows,
  EXECUTIVE_DIVISION_FILTER,
  getDivisionOptions,
  getPersonnelDivisionOptions,
  getTeamOptions,
  parseDivisionHeadRowId,
  parseTeamHeadRowId,
  type PersonnelFilters,
  type PersonnelRow,
} from '@/utils/personnelSearch';
import {
  WEB_ACCESS_ROLE_OPTIONS,
  accessRoleBadgeClass,
} from '@/utils/webAccessRole';
import {
  exportPersonnelSearchResults,
  PERSONNEL_EXPORT_FORMAT_OPTIONS,
  type PersonnelExportFormat,
} from '@/utils/personnelExport';

type ManageEntity = 'executive' | 'division' | 'team' | 'employee';
type CreateMode = ManageEntity | 'division_head' | 'team_head';

const EMPTY_FILTERS: PersonnelFilters = {
  keyword: '',
  divisionId: '',
  teamId: '',
};

const EMPTY_EMPLOYEE_FORM = {
  name: '',
  rank: '',
  accessRole: '직원' as WebAccessRole,
  divisionId: '',
  teamId: '',
};

const EMPTY_EXECUTIVE_FORM = {
  name: '',
  rank: '',
  accessRole: '경영진' as WebAccessRole,
};

const EMPTY_DIVISION_FORM = {
  name: '',
  headName: '',
  headRank: '',
};

const EMPTY_TEAM_FORM = {
  name: '',
  divisionId: '',
  headName: '',
  headRank: '',
};

const ENTITY_LABELS: Record<ManageEntity, string> = {
  executive: '경영진',
  division: '사업본부',
  team: '팀',
  employee: '팀원',
};

function filterDivisions(divisions: Division[], filters: PersonnelFilters): Division[] {
  const keyword = filters.keyword.trim().toLowerCase();

  return divisions.filter((division) => {
    if (filters.divisionId && filters.divisionId !== EXECUTIVE_DIVISION_FILTER) {
      if (division.id !== filters.divisionId) return false;
    }
    if (filters.teamId) return false;

    if (!keyword) return true;

    const haystack = [division.name, division.headName, division.headRank].join(' ').toLowerCase();
    return haystack.includes(keyword);
  });
}

function filterTeams(
  teams: Team[],
  divisionNameById: Map<string, string>,
  filters: PersonnelFilters,
): Team[] {
  const keyword = filters.keyword.trim().toLowerCase();

  return teams.filter((team) => {
    if (filters.divisionId === EXECUTIVE_DIVISION_FILTER) return false;
    if (filters.divisionId && team.divisionId !== filters.divisionId) return false;
    if (filters.teamId && team.id !== filters.teamId) return false;

    if (!keyword) return true;

    const haystack = [
      team.name,
      team.headName,
      team.headRank,
      divisionNameById.get(team.divisionId),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(keyword);
  });
}

export function PersonnelDashboard({ embedded = false }: { embedded?: boolean }) {
  const {
    executiveOffice,
    divisions,
    teams,
    employees,
    addExecutiveAdmin,
    updateExecutiveAdmin,
    removeExecutiveAdmin,
    addEmployee,
    updateEmployee,
    removeEmployee,
    addDivision,
    updateDivision,
    removeDivision,
    addTeam,
    updateTeam,
    removeTeam,
  } = useApp();

  const [entityType, setEntityType] = useState<ManageEntity>('employee');
  const [filters, setFilters] = useState<PersonnelFilters>(EMPTY_FILTERS);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editingRow, setEditingRow] = useState<PersonnelRow | null>(null);
  const [editingDivision, setEditingDivision] = useState<Division | null>(null);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [employeeForm, setEmployeeForm] = useState(EMPTY_EMPLOYEE_FORM);
  const [executiveForm, setExecutiveForm] = useState(EMPTY_EXECUTIVE_FORM);
  const [divisionForm, setDivisionForm] = useState(EMPTY_DIVISION_FORM);
  const [teamForm, setTeamForm] = useState(EMPTY_TEAM_FORM);
  const [createMode, setCreateMode] = useState<CreateMode | null>(null);
  const [deletePersonTarget, setDeletePersonTarget] = useState<PersonnelRow | null>(null);
  const [deleteDivisionTarget, setDeleteDivisionTarget] = useState<Division | null>(null);
  const [deleteTeamTarget, setDeleteTeamTarget] = useState<Team | null>(null);
  const [exportFormat, setExportFormat] = useState<PersonnelExportFormat>('excel');
  const [exporting, setExporting] = useState(false);

  const divisionNameById = useMemo(
    () => new Map(divisions.map((division) => [division.id, division.name])),
    [divisions],
  );

  const allPersonRows = useMemo(
    () => buildPersonnelRows(executiveOffice.admins ?? [], employees, divisions, teams),
    [executiveOffice.admins, employees, divisions, teams],
  );

  const filteredPersonRows = useMemo(() => {
    if (entityType === 'executive') {
      const keyword = filters.keyword.trim().toLowerCase();
      return allPersonRows.filter((row) => {
        if (row.kind !== 'executive') return false;
        if (!keyword) return true;
        const haystack = [row.name, row.rank, row.accessRole].join(' ').toLowerCase();
        return haystack.includes(keyword);
      });
    }

    if (entityType === 'employee') {
      return filterPersonnelRows(
        allPersonRows.filter((row) => row.kind !== 'executive'),
        filters,
      );
    }

    return [];
  }, [allPersonRows, entityType, filters]);

  const filteredDivisions = useMemo(
    () => (entityType === 'division' ? filterDivisions(divisions, filters) : []),
    [divisions, entityType, filters],
  );

  const filteredTeams = useMemo(
    () => (entityType === 'team' ? filterTeams(teams, divisionNameById, filters) : []),
    [teams, divisionNameById, entityType, filters],
  );

  const teamOptions = useMemo(
    () => getTeamOptions(teams, employeeForm.divisionId),
    [teams, employeeForm.divisionId],
  );

  const filterTeamOptions = useMemo(() => {
    if (filters.divisionId === EXECUTIVE_DIVISION_FILTER) return [];
    if (filters.divisionId) return getTeamOptions(teams, filters.divisionId);
    return teams.map((team) => ({
      value: team.id,
      label: `${divisionNameById.get(team.divisionId) ?? '-'} · ${team.name}`,
    }));
  }, [teams, filters.divisionId, divisionNameById]);

  const teamFilterDisabled = filters.divisionId === EXECUTIVE_DIVISION_FILTER;

  const resultCount =
    entityType === 'executive' || entityType === 'employee'
      ? filteredPersonRows.length
      : entityType === 'division'
        ? filteredDivisions.length
        : filteredTeams.length;

  const totalCount =
    entityType === 'executive'
      ? (executiveOffice.admins ?? []).length
      : entityType === 'employee'
        ? allPersonRows.filter((row) => row.kind !== 'executive').length
        : entityType === 'division'
          ? divisions.length
          : teams.length;

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
        entityType,
        personRows: filteredPersonRows,
        divisions: filteredDivisions,
        teams: filteredTeams,
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
    setEditingDivision(null);
    setEditingTeam(null);
    setCreateMode(null);
    setEmployeeForm(EMPTY_EMPLOYEE_FORM);
    setExecutiveForm(EMPTY_EXECUTIVE_FORM);
    setDivisionForm(EMPTY_DIVISION_FORM);
    setTeamForm(EMPTY_TEAM_FORM);
  };

  const openCreate = () => {
    setCreateMode(entityType);
    setEditingRow(null);
    setEditingDivision(null);
    setEditingTeam(null);

    if (entityType === 'executive') {
      setExecutiveForm(EMPTY_EXECUTIVE_FORM);
      return;
    }
    if (entityType === 'division') {
      setDivisionForm(EMPTY_DIVISION_FORM);
      return;
    }
    if (entityType === 'team') {
      setTeamForm({
        ...EMPTY_TEAM_FORM,
        divisionId: filters.divisionId && filters.divisionId !== EXECUTIVE_DIVISION_FILTER
          ? filters.divisionId
          : '',
      });
      return;
    }
    setEmployeeForm({
      ...EMPTY_EMPLOYEE_FORM,
      divisionId: filters.divisionId && filters.divisionId !== EXECUTIVE_DIVISION_FILTER
        ? filters.divisionId
        : '',
      teamId: filters.teamId ?? '',
    });
  };

  const openEditPerson = (row: PersonnelRow) => {
    setCreateMode(null);
    setEditingDivision(null);
    setEditingTeam(null);
    setEditingRow(row);

    if (row.kind === 'executive') {
      setExecutiveForm({ name: row.name, rank: row.rank, accessRole: row.accessRole });
      return;
    }

    setEmployeeForm({
      name: row.name,
      rank: row.rank,
      accessRole: row.accessRole,
      divisionId: row.divisionId ?? '',
      teamId: row.teamId ?? '',
    });
  };

  const openEditDivision = (division: Division) => {
    setCreateMode(null);
    setEditingRow(null);
    setEditingTeam(null);
    setEditingDivision(division);
    setDivisionForm({
      name: division.name,
      headName: division.headName ?? '',
      headRank: division.headRank ?? '',
    });
  };

  const openEditTeam = (team: Team) => {
    setCreateMode(null);
    setEditingRow(null);
    setEditingDivision(null);
    setEditingTeam(team);
    setTeamForm({
      name: team.name,
      divisionId: team.divisionId,
      headName: team.headName ?? '',
      headRank: team.headRank ?? '',
    });
  };

  const handleSavePersonEdit = () => {
    if (!editingRow) return;

    if (editingRow.kind === 'executive') {
      const name = executiveForm.name.trim();
      const rank = executiveForm.rank.trim();
      if (!name || !rank) {
        showError('이름과 직급을 입력해 주세요.');
        return;
      }
      updateExecutiveAdmin(editingRow.id, {
        name,
        rank,
        accessRole: executiveForm.accessRole,
      });
      showMessage('경영진 정보가 저장되었습니다.');
      closeEditor();
      return;
    }

    if (editingRow.kind === 'division_head') {
      const divisionId = parseDivisionHeadRowId(editingRow.id);
      const name = employeeForm.name.trim();
      const rank = employeeForm.rank.trim();
      if (!divisionId || !name || !rank) {
        showError('이름과 직급을 입력해 주세요.');
        return;
      }
      updateDivision(divisionId, { headName: name, headRank: rank });
      showMessage('본부장 정보가 저장되었습니다.');
      closeEditor();
      return;
    }

    if (editingRow.kind === 'team_head') {
      const teamId = parseTeamHeadRowId(editingRow.id);
      const name = employeeForm.name.trim();
      const rank = employeeForm.rank.trim();
      if (!teamId || !name || !rank) {
        showError('이름과 직급을 입력해 주세요.');
        return;
      }
      updateTeam(teamId, { headName: name, headRank: rank });
      showMessage('팀장 정보가 저장되었습니다.');
      closeEditor();
      return;
    }

    const name = employeeForm.name.trim();
    const rank = employeeForm.rank.trim();
    if (!name || !rank) {
      showError('이름과 직급을 입력해 주세요.');
      return;
    }
    if (!employeeForm.teamId) {
      showError('소속 팀을 선택해 주세요.');
      return;
    }

    updateEmployee(editingRow.id, {
      name,
      role: rank,
      accessRole: employeeForm.accessRole,
      teamId: employeeForm.teamId,
    });
    showMessage('팀원 정보가 저장되었습니다.');
    closeEditor();
  };

  const handleSaveDivisionEdit = () => {
    if (!editingDivision) return;
    const name = divisionForm.name.trim();
    if (!name) {
      showError('사업본부명을 입력해 주세요.');
      return;
    }
    updateDivision(editingDivision.id, {
      name,
      headName: divisionForm.headName.trim(),
      headRank: divisionForm.headRank.trim(),
    });
    showMessage('사업본부 정보가 저장되었습니다.');
    closeEditor();
  };

  const handleSaveTeamEdit = () => {
    if (!editingTeam) return;
    const name = teamForm.name.trim();
    if (!name) {
      showError('팀명을 입력해 주세요.');
      return;
    }
    updateTeam(editingTeam.id, {
      name,
      headName: teamForm.headName.trim(),
      headRank: teamForm.headRank.trim(),
    });
    showMessage('팀 정보가 저장되었습니다.');
    closeEditor();
  };

  const handleCreate = () => {
    if (createMode === 'executive') {
      const name = executiveForm.name.trim();
      const rank = executiveForm.rank.trim();
      if (!name || !rank) {
        showError('이름과 직급을 입력해 주세요.');
        return;
      }
      addExecutiveAdmin(name, rank, executiveForm.accessRole);
      showMessage('경영진이 등록되었습니다.');
      closeEditor();
      return;
    }

    if (createMode === 'division') {
      const name = divisionForm.name.trim();
      if (!name) {
        showError('사업본부명을 입력해 주세요.');
        return;
      }
      const divisionId = addDivision(name);
      if (divisionForm.headName.trim() || divisionForm.headRank.trim()) {
        updateDivision(divisionId, {
          headName: divisionForm.headName.trim(),
          headRank: divisionForm.headRank.trim(),
        });
      }
      showMessage('사업본부가 등록되었습니다.');
      closeEditor();
      return;
    }

    if (createMode === 'team') {
      const name = teamForm.name.trim();
      if (!teamForm.divisionId) {
        showError('사업본부를 선택해 주세요.');
        return;
      }
      if (!name) {
        showError('팀명을 입력해 주세요.');
        return;
      }
      const teamId = addTeam(teamForm.divisionId, name);
      if (teamForm.headName.trim() || teamForm.headRank.trim()) {
        updateTeam(teamId, {
          headName: teamForm.headName.trim(),
          headRank: teamForm.headRank.trim(),
        });
      }
      showMessage('팀이 등록되었습니다.');
      closeEditor();
      return;
    }

    if (createMode === 'employee') {
      const name = employeeForm.name.trim();
      const rank = employeeForm.rank.trim();
      if (!name || !rank) {
        showError('이름과 직급을 입력해 주세요.');
        return;
      }
      if (!employeeForm.teamId) {
        showError('소속 팀을 선택해 주세요.');
        return;
      }
      addEmployee(employeeForm.teamId, name, rank, employeeForm.accessRole);
      showMessage('팀원이 등록되었습니다.');
      closeEditor();
    }
  };

  const handleDeletePersonConfirm = () => {
    if (!deletePersonTarget) return;

    if (deletePersonTarget.kind === 'executive') {
      removeExecutiveAdmin(deletePersonTarget.id);
      showMessage('경영진이 삭제되었습니다.');
    } else if (deletePersonTarget.kind === 'division_head') {
      const divisionId = parseDivisionHeadRowId(deletePersonTarget.id);
      if (divisionId) updateDivision(divisionId, { headName: '', headRank: '' });
      showMessage('본부장 정보가 삭제되었습니다.');
    } else if (deletePersonTarget.kind === 'team_head') {
      const teamId = parseTeamHeadRowId(deletePersonTarget.id);
      if (teamId) updateTeam(teamId, { headName: '', headRank: '' });
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

  const handleDeleteDivisionConfirm = () => {
    if (!deleteDivisionTarget) return;
    const result = removeDivision(deleteDivisionTarget.id);
    if (!result.ok) {
      showError(result.reason ?? '삭제할 수 없습니다.');
      setDeleteDivisionTarget(null);
      return;
    }
    showMessage(`"${deleteDivisionTarget.name}" 사업본부가 삭제되었습니다.`);
    if (editingDivision?.id === deleteDivisionTarget.id) closeEditor();
    setDeleteDivisionTarget(null);
  };

  const handleDeleteTeamConfirm = () => {
    if (!deleteTeamTarget) return;
    const result = removeTeam(deleteTeamTarget.id);
    if (!result.ok) {
      showError(result.reason ?? '삭제할 수 없습니다.');
      setDeleteTeamTarget(null);
      return;
    }
    showMessage(`"${deleteTeamTarget.name}" 팀이 삭제되었습니다.`);
    if (editingTeam?.id === deleteTeamTarget.id) closeEditor();
    setDeleteTeamTarget(null);
  };

  const editorOpen = !!(editingRow || editingDivision || editingTeam || createMode);

  const editorTitle = (() => {
    if (createMode === 'executive') return '경영진 등록';
    if (createMode === 'division') return '사업본부 등록';
    if (createMode === 'team') return '팀 등록';
    if (createMode === 'employee') return '팀원 등록';
    if (editingRow?.kind === 'executive') return '경영진 수정';
    if (editingRow?.kind === 'division_head') return '본부장 수정';
    if (editingRow?.kind === 'team_head') return '팀장 수정';
    if (editingDivision) return '사업본부 수정';
    if (editingTeam) return '팀 수정';
    if (editingRow) return '팀원 수정 · 전출';
    return '';
  })();

  const handleEditorSave = () => {
    if (createMode) {
      handleCreate();
      return;
    }
    if (editingDivision) {
      handleSaveDivisionEdit();
      return;
    }
    if (editingTeam) {
      handleSaveTeamEdit();
      return;
    }
    handleSavePersonEdit();
  };

  return (
    <>
      <Card
        title="인원검색"
        subtitle="경영진 · 사업본부 · 팀 · 팀원 통합 조회 및 관리"
        className={embedded ? 'personnel-dashboard--embedded' : undefined}
      >
        {message && <div className="toast toast--success no-print">{message}</div>}
        {error && <div className="toast toast--error no-print">{error}</div>}

        <div className="personnel-dashboard__entity-tabs no-print">
          {(Object.keys(ENTITY_LABELS) as ManageEntity[]).map((key) => (
            <Button
              key={key}
              variant={entityType === key ? 'primary' : 'outline'}
              size="sm"
              onClick={() => {
                setEntityType(key);
                closeEditor();
              }}
            >
              {ENTITY_LABELS[key]}
            </Button>
          ))}
        </div>

        <div className="personnel-dashboard__filters no-print">
          <Select
            label="사업본부"
            value={filters.divisionId}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                divisionId: e.target.value,
                teamId: '',
              }))
            }
            options={[{ value: '', label: '전체' }, ...getPersonnelDivisionOptions(divisions)]}
          />
          <Select
            label="팀"
            value={filters.teamId}
            disabled={teamFilterDisabled}
            onChange={(e) => setFilters((prev) => ({ ...prev, teamId: e.target.value }))}
            options={[
              { value: '', label: teamFilterDisabled ? '해당 없음' : '전체' },
              ...filterTeamOptions,
            ]}
          />
          <Input
            label="이름·직급 검색"
            value={filters.keyword}
            onChange={(e) => setFilters((prev) => ({ ...prev, keyword: e.target.value }))}
            placeholder={
              entityType === 'division'
                ? '예: 건축사업본부, 본부장'
                : entityType === 'team'
                  ? '예: 건축1팀, 팀장'
                  : '예: 홍길동, 팀장'
            }
          />
          <div className="personnel-dashboard__filter-actions">
            <Button variant="primary" size="sm" onClick={openCreate}>
              {ENTITY_LABELS[entityType]} 추가
            </Button>
          </div>
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
          {(entityType === 'executive' || entityType === 'employee') && (
            <table className="personnel-table">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>직급</th>
                  <th>권한</th>
                  {entityType === 'employee' && (
                    <>
                      <th>사업본부</th>
                      <th>팀</th>
                    </>
                  )}
                  <th className="personnel-table__actions">관리</th>
                </tr>
              </thead>
              <tbody>
                {filteredPersonRows.length === 0 ? (
                  <tr>
                    <td colSpan={entityType === 'employee' ? 6 : 4} className="personnel-table__empty">
                      검색 결과가 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredPersonRows.map((row) => (
                    <tr key={`${row.kind}-${row.id}`}>
                      <td>{row.name}</td>
                      <td>{row.rank}</td>
                      <td>
                        <span className={`access-role-badge ${accessRoleBadgeClass(row.accessRole)}`}>
                          {row.accessRole}
                        </span>
                      </td>
                      {entityType === 'employee' && (
                        <>
                          <td>{row.divisionName}</td>
                          <td>{row.teamName}</td>
                        </>
                      )}
                      <td className="personnel-table__actions">
                        <div className="personnel-table__action-group">
                          <Button variant="outline" size="sm" onClick={() => openEditPerson(row)}>
                            수정
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => setDeletePersonTarget(row)}>
                            삭제
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {entityType === 'division' && (
            <table className="personnel-table">
              <thead>
                <tr>
                  <th>사업본부</th>
                  <th>본부장</th>
                  <th>본부장 직급</th>
                  <th className="personnel-table__actions">관리</th>
                </tr>
              </thead>
              <tbody>
                {filteredDivisions.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="personnel-table__empty">
                      검색 결과가 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredDivisions.map((division) => (
                    <tr key={division.id}>
                      <td>{division.name}</td>
                      <td>{division.headName ?? '-'}</td>
                      <td>{division.headRank ?? '-'}</td>
                      <td className="personnel-table__actions">
                        <div className="personnel-table__action-group">
                          <Button variant="outline" size="sm" onClick={() => openEditDivision(division)}>
                            수정
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => setDeleteDivisionTarget(division)}>
                            삭제
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {entityType === 'team' && (
            <table className="personnel-table">
              <thead>
                <tr>
                  <th>사업본부</th>
                  <th>팀</th>
                  <th>팀장</th>
                  <th>팀장 직급</th>
                  <th className="personnel-table__actions">관리</th>
                </tr>
              </thead>
              <tbody>
                {filteredTeams.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="personnel-table__empty">
                      검색 결과가 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredTeams.map((team) => (
                    <tr key={team.id}>
                      <td>{divisionNameById.get(team.divisionId) ?? '-'}</td>
                      <td>{team.name}</td>
                      <td>{team.headName ?? '-'}</td>
                      <td>{team.headRank ?? '-'}</td>
                      <td className="personnel-table__actions">
                        <div className="personnel-table__action-group">
                          <Button variant="outline" size="sm" onClick={() => openEditTeam(team)}>
                            수정
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => setDeleteTeamTarget(team)}>
                            삭제
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {editorOpen && (
        <Card title={editorTitle} className="personnel-editor-card no-print">
          {(createMode === 'executive' || editingRow?.kind === 'executive') && (
            <div className="personnel-editor-grid">
              <Input
                label="이름"
                value={executiveForm.name}
                onChange={(e) => setExecutiveForm((prev) => ({ ...prev, name: e.target.value }))}
              />
              <Input
                label="직급"
                value={executiveForm.rank}
                onChange={(e) => setExecutiveForm((prev) => ({ ...prev, rank: e.target.value }))}
              />
              <Select
                label="권한"
                value={executiveForm.accessRole}
                onChange={(e) =>
                  setExecutiveForm((prev) => ({
                    ...prev,
                    accessRole: e.target.value as WebAccessRole,
                  }))
                }
                options={WEB_ACCESS_ROLE_OPTIONS}
              />
            </div>
          )}

          {(createMode === 'division' || editingDivision) && (
            <div className="personnel-editor-grid">
              <Input
                label="사업본부명"
                value={divisionForm.name}
                onChange={(e) => setDivisionForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="예: 건축사업본부"
              />
              <Input
                label="본부장"
                value={divisionForm.headName}
                onChange={(e) => setDivisionForm((prev) => ({ ...prev, headName: e.target.value }))}
                placeholder="예: 홍길동"
              />
              <Input
                label="본부장 직급"
                value={divisionForm.headRank}
                onChange={(e) => setDivisionForm((prev) => ({ ...prev, headRank: e.target.value }))}
                placeholder="예: 상무, 이사"
              />
            </div>
          )}

          {(createMode === 'team' || editingTeam) && (
            <div className="personnel-editor-grid">
              {createMode === 'team' && (
                <Select
                  label="사업본부"
                  value={teamForm.divisionId}
                  onChange={(e) => setTeamForm((prev) => ({ ...prev, divisionId: e.target.value }))}
                  options={[{ value: '', label: '선택' }, ...getDivisionOptions(divisions)]}
                />
              )}
              <Input
                label="팀명"
                value={teamForm.name}
                onChange={(e) => setTeamForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="예: 건축1팀"
              />
              <Input
                label="팀장"
                value={teamForm.headName}
                onChange={(e) => setTeamForm((prev) => ({ ...prev, headName: e.target.value }))}
                placeholder="예: 홍길동"
              />
              <Input
                label="팀장 직급"
                value={teamForm.headRank}
                onChange={(e) => setTeamForm((prev) => ({ ...prev, headRank: e.target.value }))}
                placeholder="예: 수석매니저"
              />
            </div>
          )}

          {(createMode === 'employee' ||
            (editingRow &&
              editingRow.kind !== 'executive' &&
              !editingDivision &&
              !editingTeam)) && (
            <div className="personnel-editor-grid">
              <Input
                label="이름"
                value={employeeForm.name}
                onChange={(e) => setEmployeeForm((prev) => ({ ...prev, name: e.target.value }))}
              />
              <Input
                label="직급"
                value={employeeForm.rank}
                onChange={(e) => setEmployeeForm((prev) => ({ ...prev, rank: e.target.value }))}
              />
              {editingRow?.kind === 'employee' || createMode === 'employee' ? (
                <Select
                  label="권한"
                  value={employeeForm.accessRole}
                  onChange={(e) =>
                    setEmployeeForm((prev) => ({
                      ...prev,
                      accessRole: e.target.value as WebAccessRole,
                    }))
                  }
                  options={WEB_ACCESS_ROLE_OPTIONS}
                />
              ) : (
                <Input label="권한" value={employeeForm.accessRole} readOnly disabled />
              )}
              {(createMode === 'employee' || editingRow?.kind === 'employee') && (
                <>
                  <Select
                    label="사업본부"
                    value={employeeForm.divisionId}
                    onChange={(e) =>
                      setEmployeeForm((prev) => ({
                        ...prev,
                        divisionId: e.target.value,
                        teamId: '',
                      }))
                    }
                    options={[{ value: '', label: '선택' }, ...getDivisionOptions(divisions)]}
                  />
                  <Select
                    label="팀"
                    value={employeeForm.teamId}
                    onChange={(e) => setEmployeeForm((prev) => ({ ...prev, teamId: e.target.value }))}
                    options={[{ value: '', label: '선택' }, ...teamOptions]}
                  />
                </>
              )}
            </div>
          )}

          <div className="personnel-editor-actions">
            <Button variant="primary" onClick={handleEditorSave}>
              {createMode ? '등록' : '저장'}
            </Button>
            <Button variant="ghost" onClick={closeEditor}>
              취소
            </Button>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={deletePersonTarget !== null}
        title="인원 삭제"
        message={deletePersonTarget ? `${deletePersonTarget.name} 님을 삭제하시겠습니까?` : ''}
        confirmLabel="네"
        cancelLabel="아니오"
        onConfirm={handleDeletePersonConfirm}
        onCancel={() => setDeletePersonTarget(null)}
      />

      <ConfirmDialog
        open={deleteDivisionTarget !== null}
        title="사업본부 삭제"
        message={
          deleteDivisionTarget
            ? `"${deleteDivisionTarget.name}" 사업본부를 삭제하시겠습니까?`
            : ''
        }
        confirmLabel="네"
        cancelLabel="아니오"
        onConfirm={handleDeleteDivisionConfirm}
        onCancel={() => setDeleteDivisionTarget(null)}
      />

      <ConfirmDialog
        open={deleteTeamTarget !== null}
        title="팀 삭제"
        message={deleteTeamTarget ? `"${deleteTeamTarget.name}" 팀을 삭제하시겠습니까?` : ''}
        confirmLabel="네"
        cancelLabel="아니오"
        onConfirm={handleDeleteTeamConfirm}
        onCancel={() => setDeleteTeamTarget(null)}
      />
    </>
  );
}
