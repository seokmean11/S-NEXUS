import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useApp } from '@/context/AppContext';

export function OrgChartForm() {
  const {
    permissions,
    executiveOffice,
    addExecutiveAdmin,
    removeExecutiveAdmin,
    updateExecutiveAdmin,
    divisions,
    teams,
    employees,
    addDivision,
    updateDivision,
    removeDivision,
    addTeam,
    updateTeam,
    removeTeam,
    addEmployee,
    updateEmployee,
    removeEmployee,
  } = useApp();

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [newDivisionName, setNewDivisionName] = useState('');
  const [newTeamNames, setNewTeamNames] = useState<Record<string, string>>({});
  const [newMemberForms, setNewMemberForms] = useState<
    Record<string, { name: string; role: string }>
  >({});
  const [divisionHeadForms, setDivisionHeadForms] = useState<
    Record<string, { name: string; rank: string }>
  >({});
  const [teamHeadForms, setTeamHeadForms] = useState<
    Record<string, { name: string; rank: string }>
  >({});
  const [executiveAdminForm, setExecutiveAdminForm] = useState({ name: '', rank: '' });
  const [editingExecutiveId, setEditingExecutiveId] = useState<string | null>(null);
  const [editingExecutiveForm, setEditingExecutiveForm] = useState({ name: '', rank: '' });

  const [editingDivisionId, setEditingDivisionId] = useState<string | null>(null);
  const [editingDivisionName, setEditingDivisionName] = useState('');
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingTeamName, setEditingTeamName] = useState('');
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [editingEmployeeForm, setEditingEmployeeForm] = useState({ name: '', role: '' });

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

  const handleAddDivision = () => {
    const name = newDivisionName.trim();
    if (!name) {
      showError('사업본부명을 입력해 주세요.');
      return;
    }
    addDivision(name);
    setNewDivisionName('');
    showMessage(`"${name}" 사업본부가 추가되었습니다.`);
  };

  const handleSaveDivision = (id: string) => {
    const name = editingDivisionName.trim();
    if (!name) {
      showError('사업본부명을 입력해 주세요.');
      return;
    }
    updateDivision(id, { name });
    setEditingDivisionId(null);
    showMessage('사업본부명이 수정되었습니다.');
  };

  const handleRemoveDivision = (id: string, name: string) => {
    const result = removeDivision(id);
    if (!result.ok) {
      showError(result.reason ?? '삭제할 수 없습니다.');
      return;
    }
    showMessage(`"${name}" 사업본부가 삭제되었습니다.`);
  };

  const handleAddTeam = (divisionId: string) => {
    const name = (newTeamNames[divisionId] ?? '').trim();
    if (!name) {
      showError('팀명을 입력해 주세요.');
      return;
    }
    addTeam(divisionId, name);
    setNewTeamNames((prev) => ({ ...prev, [divisionId]: '' }));
    showMessage(`"${name}" 팀이 추가되었습니다.`);
  };

  const handleSaveTeam = (id: string) => {
    const name = editingTeamName.trim();
    if (!name) {
      showError('팀명을 입력해 주세요.');
      return;
    }
    updateTeam(id, { name });
    setEditingTeamId(null);
    showMessage('팀명이 수정되었습니다.');
  };

  const handleRemoveTeam = (id: string, name: string) => {
    const result = removeTeam(id);
    if (!result.ok) {
      showError(result.reason ?? '삭제할 수 없습니다.');
      return;
    }
    showMessage(`"${name}" 팀이 삭제되었습니다.`);
  };

  const handleAddExecutiveAdmin = () => {
    const name = executiveAdminForm.name.trim();
    const rank = executiveAdminForm.rank.trim();
    if (!name) {
      showError('총괄관리자 이름을 입력해 주세요.');
      return;
    }
    if (!rank) {
      showError('총괄관리자 직급을 입력해 주세요.');
      return;
    }
    addExecutiveAdmin(name, rank);
    setExecutiveAdminForm({ name: '', rank: '' });
    showMessage(`"${name}" 총괄관리자가 추가되었습니다.`);
  };

  const handleSaveExecutiveAdmin = (id: string) => {
    const name = editingExecutiveForm.name.trim();
    const rank = editingExecutiveForm.rank.trim();
    if (!name || !rank) {
      showError('이름과 직급을 모두 입력해 주세요.');
      return;
    }
    updateExecutiveAdmin(id, { name, rank });
    setEditingExecutiveId(null);
    showMessage('총괄관리자 정보가 수정되었습니다.');
  };

  const handleRemoveExecutiveAdmin = (id: string, name: string) => {
    removeExecutiveAdmin(id);
    if (editingExecutiveId === id) setEditingExecutiveId(null);
    showMessage(`"${name}" 총괄관리자가 삭제되었습니다.`);
  };

  const handleSaveDivisionHead = (divisionId: string) => {
    const form = divisionHeadForms[divisionId] ?? { name: '', rank: '' };
    const name = form.name.trim();
    const rank = form.rank.trim();
    if (!name) {
      showError('본부장 이름을 입력해 주세요.');
      return;
    }
    if (!rank) {
      showError('본부장 직급을 입력해 주세요.');
      return;
    }
    updateDivision(divisionId, { headName: name, headRank: rank });
    showMessage('본부장 정보가 저장되었습니다.');
  };

  const handleSaveTeamHead = (teamId: string) => {
    const form = teamHeadForms[teamId] ?? { name: '', rank: '' };
    const name = form.name.trim();
    const rank = form.rank.trim();
    if (!name) {
      showError('팀장 이름을 입력해 주세요.');
      return;
    }
    if (!rank) {
      showError('팀장 직급을 입력해 주세요.');
      return;
    }
    updateTeam(teamId, { headName: name, headRank: rank });
    showMessage('팀장 정보가 저장되었습니다.');
  };

  const getDivisionHeadForm = (division: { id: string; headName?: string; headRank?: string }) =>
    divisionHeadForms[division.id] ?? {
      name: division.headName ?? '',
      rank: division.headRank ?? '',
    };

  const getTeamHeadForm = (team: { id: string; headName?: string; headRank?: string }) =>
    teamHeadForms[team.id] ?? {
      name: team.headName ?? '',
      rank: team.headRank ?? '',
    };

  const handleAddMember = (teamId: string) => {
    const form = newMemberForms[teamId] ?? { name: '', role: '' };
    const name = form.name.trim();
    const role = form.role.trim();
    if (!name) {
      showError('이름을 입력해 주세요.');
      return;
    }
    if (!role) {
      showError('직급을 입력해 주세요.');
      return;
    }
    addEmployee(teamId, name, role);
    setNewMemberForms((prev) => ({ ...prev, [teamId]: { name: '', role: '' } }));
    showMessage(`"${name}" 팀원이 추가되었습니다.`);
  };

  const handleSaveMember = (id: string) => {
    const name = editingEmployeeForm.name.trim();
    const role = editingEmployeeForm.role.trim();
    if (!name) {
      showError('이름을 입력해 주세요.');
      return;
    }
    if (!role) {
      showError('직급을 입력해 주세요.');
      return;
    }
    updateEmployee(id, { name, role });
    setEditingEmployeeId(null);
    showMessage('팀원 정보가 수정되었습니다.');
  };

  const handleRemoveMember = (id: string, name: string) => {
    const result = removeEmployee(id);
    if (!result.ok) {
      showError(result.reason ?? '삭제할 수 없습니다.');
      return;
    }
    if (editingEmployeeId === id) {
      setEditingEmployeeId(null);
    }
    showMessage(`"${name}" 팀원이 삭제되었습니다.`);
  };

  if (!permissions.canCreateProject) {
    return null;
  }

  return (
    <div className="org-page">
      <div className="page-header no-print">
        <h2>조직관리</h2>
        <p>경영관리 · 총괄관리자 · 사업본부 · 팀 · 팀원 변경은 자동 기록되며 분석 보고서에서 확인할 수 있습니다.</p>
      </div>

      {message && <div className="toast toast--success no-print">{message}</div>}
      {error && <div className="toast toast--error no-print">{error}</div>}

      <Card title="경영관리" className="org-executive-card">
        <p className="org-executive-card__desc">사업본부 상위 조직 · 팀/팀장 없음</p>
        <ul className="org-member-list">
          {executiveOffice.admins?.map((admin) => (
            <li key={admin.id} className="org-member-item">
              {editingExecutiveId === admin.id ? (
                <div className="org-inline-edit org-inline-edit--member">
                  <Input
                    label="이름"
                    value={editingExecutiveForm.name}
                    onChange={(e) =>
                      setEditingExecutiveForm((prev) => ({ ...prev, name: e.target.value }))
                    }
                  />
                  <Input
                    label="직급"
                    value={editingExecutiveForm.rank}
                    onChange={(e) =>
                      setEditingExecutiveForm((prev) => ({ ...prev, rank: e.target.value }))
                    }
                  />
                  <Button variant="primary" size="sm" onClick={() => handleSaveExecutiveAdmin(admin.id)}>
                    저장
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditingExecutiveId(null)}>
                    취소
                  </Button>
                </div>
              ) : (
                <>
                  <span className="org-member-name">{admin.name}</span>
                  <span className="org-member-role">{admin.rank}</span>
                  <div className="org-actions no-print">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingExecutiveId(admin.id);
                        setEditingExecutiveForm({ name: admin.name, rank: admin.rank });
                      }}
                    >
                      수정
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveExecutiveAdmin(admin.id, admin.name)}
                    >
                      삭제
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
        <div className="org-head-section org-head-section--executive no-print">
          <p className="org-head-section__label">총괄관리자 추가</p>
          <div className="org-add-member">
            <Input
              label="이름"
              value={executiveAdminForm.name}
              onChange={(e) =>
                setExecutiveAdminForm((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="예: 홍길동"
            />
            <Input
              label="직급"
              value={executiveAdminForm.rank}
              onChange={(e) =>
                setExecutiveAdminForm((prev) => ({ ...prev, rank: e.target.value }))
              }
              placeholder="예: 전무, 상무"
            />
            <Button variant="primary" size="sm" onClick={handleAddExecutiveAdmin}>
              + 총괄관리자 추가
            </Button>
          </div>
        </div>
      </Card>

      <Card title="사업본부 추가" className="no-print">
        <div className="org-add-row">
          <Input
            label="신규 사업본부명"
            value={newDivisionName}
            onChange={(e) => setNewDivisionName(e.target.value)}
            placeholder="예: 건축사업본부"
          />
          <Button variant="primary" onClick={handleAddDivision}>
            사업본부 추가
          </Button>
        </div>
      </Card>

      <div className="org-tree">
        {divisions.map((division) => {
          const divisionTeams = teams.filter((t) => t.divisionId === division.id);

          return (
            <Card key={division.id} title={division.name} className="org-division-card">
              <div className="org-division-header no-print">
                {editingDivisionId === division.id ? (
                  <div className="org-inline-edit">
                    <Input
                      value={editingDivisionName}
                      onChange={(e) => setEditingDivisionName(e.target.value)}
                    />
                    <Button variant="primary" size="sm" onClick={() => handleSaveDivision(division.id)}>
                      저장
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditingDivisionId(null)}>
                      취소
                    </Button>
                  </div>
                ) : (
                  <div className="org-actions">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingDivisionId(division.id);
                        setEditingDivisionName(division.name);
                      }}
                    >
                      본부명 수정
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleRemoveDivision(division.id, division.name)}
                    >
                      본부 삭제
                    </Button>
                  </div>
                )}
              </div>

              <div className="org-head-section no-print">
                <p className="org-head-section__label">본부장</p>
                <div className="org-add-member">
                  <Input
                    label="이름"
                    value={getDivisionHeadForm(division).name}
                    onChange={(e) =>
                      setDivisionHeadForms((prev) => ({
                        ...prev,
                        [division.id]: {
                          ...getDivisionHeadForm(division),
                          name: e.target.value,
                        },
                      }))
                    }
                    placeholder="예: 홍길동"
                  />
                  <Input
                    label="직급"
                    value={getDivisionHeadForm(division).rank}
                    onChange={(e) =>
                      setDivisionHeadForms((prev) => ({
                        ...prev,
                        [division.id]: {
                          ...getDivisionHeadForm(division),
                          rank: e.target.value,
                        },
                      }))
                    }
                    placeholder="예: 상무, 이사"
                  />
                  <Button variant="secondary" size="sm" onClick={() => handleSaveDivisionHead(division.id)}>
                    본부장 저장
                  </Button>
                </div>
                {division.headName && (
                  <p className="org-head-section__current">
                    현재: {division.headName} · {division.headRank}
                  </p>
                )}
              </div>

              <div className="org-teams">
                {divisionTeams.map((team) => {
                  const teamMembers = employees.filter((e) => e.teamId === team.id);
                  const memberForm = newMemberForms[team.id] ?? { name: '', role: '' };

                  return (
                    <div key={team.id} className="org-team-block">
                      <div className="org-team-header">
                        {editingTeamId === team.id ? (
                          <div className="org-inline-edit">
                            <Input
                              value={editingTeamName}
                              onChange={(e) => setEditingTeamName(e.target.value)}
                            />
                            <Button variant="primary" size="sm" onClick={() => handleSaveTeam(team.id)}>
                              저장
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setEditingTeamId(null)}>
                              취소
                            </Button>
                          </div>
                        ) : (
                          <>
                            <h4 className="org-team-title">{team.name}</h4>
                            <div className="org-actions no-print">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setEditingTeamId(team.id);
                                  setEditingTeamName(team.name);
                                }}
                              >
                                팀명 수정
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleRemoveTeam(team.id, team.name)}
                              >
                                팀 삭제
                              </Button>
                            </div>
                          </>
                        )}
                      </div>

                      <div className="org-head-section org-head-section--team no-print">
                        <p className="org-head-section__label">팀장</p>
                        <div className="org-add-member">
                          <Input
                            label="이름"
                            value={getTeamHeadForm(team).name}
                            onChange={(e) =>
                              setTeamHeadForms((prev) => ({
                                ...prev,
                                [team.id]: {
                                  ...getTeamHeadForm(team),
                                  name: e.target.value,
                                },
                              }))
                            }
                            placeholder="예: 홍길동"
                          />
                          <Input
                            label="직급"
                            value={getTeamHeadForm(team).rank}
                            onChange={(e) =>
                              setTeamHeadForms((prev) => ({
                                ...prev,
                                [team.id]: {
                                  ...getTeamHeadForm(team),
                                  rank: e.target.value,
                                },
                              }))
                            }
                            placeholder="예: 수석매니저, 책임매니저"
                          />
                          <Button variant="secondary" size="sm" onClick={() => handleSaveTeamHead(team.id)}>
                            팀장 저장
                          </Button>
                        </div>
                        {team.headName && (
                          <p className="org-head-section__current">
                            현재: {team.headName} · {team.headRank}
                          </p>
                        )}
                      </div>

                      <ul className="org-member-list">
                        {teamMembers.map((member) => (
                          <li key={member.id} className="org-member-item">
                            {editingEmployeeId === member.id ? (
                              <div className="org-inline-edit org-inline-edit--member">
                                <Input
                                  label="이름"
                                  value={editingEmployeeForm.name}
                                  onChange={(e) =>
                                    setEditingEmployeeForm((prev) => ({ ...prev, name: e.target.value }))
                                  }
                                  placeholder="예: 홍길동"
                                />
                                <Input
                                  label="직급"
                                  value={editingEmployeeForm.role}
                                  onChange={(e) =>
                                    setEditingEmployeeForm((prev) => ({ ...prev, role: e.target.value }))
                                  }
                                  placeholder="예: 대리, 과장"
                                />
                                <Button variant="primary" size="sm" onClick={() => handleSaveMember(member.id)}>
                                  저장
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setEditingEmployeeId(null)}>
                                  취소
                                </Button>
                              </div>
                            ) : (
                              <>
                                <span className="org-member-name">{member.name}</span>
                                <span className="org-member-role">{member.role}</span>
                                <div className="org-actions no-print">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setEditingEmployeeId(member.id);
                                      setEditingEmployeeForm({
                                        name: member.name,
                                        role: member.role,
                                      });
                                    }}
                                  >
                                    수정
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRemoveMember(member.id, member.name)}
                                  >
                                    삭제
                                  </Button>
                                </div>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>

                      <div className="org-add-member no-print">
                        <Input
                          label="이름"
                          value={memberForm.name}
                          onChange={(e) =>
                            setNewMemberForms((prev) => ({
                              ...prev,
                              [team.id]: { ...memberForm, name: e.target.value },
                            }))
                          }
                          placeholder="예: 홍길동"
                        />
                        <Input
                          label="직급"
                          value={memberForm.role}
                          onChange={(e) =>
                            setNewMemberForms((prev) => ({
                              ...prev,
                              [team.id]: { ...memberForm, role: e.target.value },
                            }))
                          }
                          placeholder="예: 대리, 과장"
                        />
                        <Button variant="secondary" size="sm" onClick={() => handleAddMember(team.id)}>
                          + 팀원 추가
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="org-add-team no-print">
                <Input
                  label="팀 추가"
                  value={newTeamNames[division.id] ?? ''}
                  onChange={(e) =>
                    setNewTeamNames((prev) => ({ ...prev, [division.id]: e.target.value }))
                  }
                  placeholder="예: 건축1팀"
                />
                <Button variant="secondary" size="sm" onClick={() => handleAddTeam(division.id)}>
                  + 팀 추가
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {divisions.length === 0 && (
        <Card>
          <p className="empty-state">등록된 사업본부가 없습니다. 위에서 사업본부를 추가해 주세요.</p>
        </Card>
      )}
    </div>
  );
}
