/**
 * 내선전화표(2026.08) PDF 좌표 기반 조직 파서
 * 규칙: <팀명> 헤더 아래(동일 열·아래쪽) 인원 = 해당 팀 소속
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFParse } from 'pdf-parse';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF_PATH =
  process.argv[2] ?? 'c:/Users/seosm/Downloads/내선전화표(2026.08).pdf';
const OUT_RAW = path.join(__dirname, '../src/data/orgPhoneDirectory202608.raw.json');

const DIVISIONS = [
  { id: 'div-exec', name: '임원실' },
  { id: 'div-plan', name: '경영기획본부' },
  { id: 'div-os', name: '해외사업실' },
  { id: 'div-ex', name: '전시사업본부' },
  { id: 'div-in', name: '인테리어사업본부' },
  { id: 'div-nm', name: '뉴미디어사업실' },
];

const COLUMN_DIVISION_IDS = ['div-exec', 'div-plan', 'div-os', 'div-ex', 'div-in', 'div-nm'];
const COL_CENTERS = [58, 126, 207, 281, 352, 432];

const DIVISION_TEAMS = {
  'div-exec': ['임원실'],
  'div-plan': ['경영지원팀', '재경팀', '사업관리팀'],
  'div-os': ['해외영업팀', '해외디자인팀'],
  'div-ex': ['전시디자인1팀', '전시디자인2팀', '전시컨설팅팀', 'CX디자인팀', '제작연출팀'],
  'div-in': ['인테리어디자인팀', '사업1팀', '사업2팀', '사업3팀'],
  'div-nm': ['문화기술연구소', '스튜디오스페이스타임'],
};

const TEAM_ALIASES = {
  회장실: '임원실',
  관리팀: '경영지원팀',
  '재 경 팀': '재경팀',
  재경팀: '재경팀',
  경영지원팀: '경영지원팀',
  사업관리팀: '사업관리팀',
  구매팀: '사업관리팀',
  견적팀: '사업관리팀',
  자금팀: '재경팀',
  회계팀: '재경팀',
  인사총무팀: '경영지원팀',
  안전관리실: '경영지원팀',
  해외영업팀: '해외영업팀',
  해외디자인팀: '해외디자인팀',
  셀프스토리지사업팀: '해외영업팀',
  '전시디자인 1 팀': '전시디자인1팀',
  전시디자인1팀: '전시디자인1팀',
  '전시디자인 2 팀': '전시디자인2팀',
  전시디자인2팀: '전시디자인2팀',
  전시컨설팅팀: '전시컨설팅팀',
  'CX 디자인팀': 'CX디자인팀',
  CX디자인팀: 'CX디자인팀',
  제작연출팀: '제작연출팀',
  헤리티지사업팀: '전시컨설팅팀',
  '인테리어디자인팀': '인테리어디자인팀',
  인테리어디자인팀: '인테리어디자인팀',
  '사업 1 팀': '사업1팀',
  사업1팀: '사업1팀',
  '사업 2 팀': '사업2팀',
  사업2팀: '사업2팀',
  '사업 3 팀': '사업3팀',
  사업3팀: '사업3팀',
  문화기술연구소: '문화기술연구소',
  스튜디오스페이스타임: '스튜디오스페이스타임',
  임원실: '임원실',
};

const COLUMN_DEFAULT_TEAMS = [
  '임원실',
  '경영지원팀',
  '해외영업팀',
  '전시디자인1팀',
  '인테리어디자인팀',
  '문화기술연구소',
];

const RANKS =
  /^(회장|부회장|부사장|전무|상무|상무보|사업실장|본부장|실장|팀장|수석|책임|선임|사원|인턴|감사|대표이사|사장|차장|과장|대리)$/;

const AFFILIATE_EMPLOYEE_NAMES = new Set([
  '허주환', '현준우', '김형준', '장재영', '문희아', '윤지예', '우해준', '이안나', '이두연',
  '김효진', '노영준', '이성준', '한정화', '박재용', '이영미', '이정수', '최현규',
]);

const SKIP_TEXT =
  /^\d{3,4}$|^대표번호$|^\(4F\)$|^4F$|^\(주\)|기준일자|아이스크림|판교사옥|시공문화|미래전략|\d{2}-\d{3}|^104$|경영관리실|^\[|\]$|^\($|^\)$/;

function slugify(v) {
  return v.replace(/[^\w가-힣]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

function normalizeTeamRaw(raw) {
  return raw.replace(/\s+/g, ' ').trim();
}

function normalizeTeamName(rawTeam, divisionId) {
  const key = normalizeTeamRaw(rawTeam);
  const aliased = TEAM_ALIASES[key] ?? key.replace(/\s/g, '');
  const allowed = DIVISION_TEAMS[divisionId] ?? [];
  if (allowed.includes(aliased)) return aliased;
  for (const [alias, canon] of Object.entries(TEAM_ALIASES)) {
    if (key.includes(alias.replace(/\s/g, '')) || alias.replace(/\s/g, '') === key.replace(/\s/g, '')) {
      if (allowed.includes(canon)) return canon;
    }
  }
  return allowed[0] ?? aliased;
}

function inferAccessRole(rank, name) {
  if (name === '서석민') return '개발자';
  if (/본부장|사업실장/.test(rank)) return '본부장';
  if (/회장|부회장|부사장|전무|상무|상무보|감사|사장|대표/.test(rank)) return '경영진';
  if (/팀장|실장/.test(rank)) return '팀장';
  return '직원';
}

function columnForTeam(rawTeam) {
  const key = normalizeTeamRaw(rawTeam);
  const aliased = TEAM_ALIASES[key] ?? key.replace(/\s/g, '');
  for (let col = 0; col < COLUMN_DIVISION_IDS.length; col++) {
    if (DIVISION_TEAMS[COLUMN_DIVISION_IDS[col]]?.includes(aliased)) return col;
  }
  return null;
}

function colForX(x) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < COL_CENTERS.length; i++) {
    const d = Math.abs(x - COL_CENTERS[i]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return bestD <= 52 ? best : -1;
}

function extractTeamNames(text) {
  const names = [];
  const re = /<\s*([^>]+?)\s*>/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const name = normalizeTeamRaw(m[1]);
    if (name && !/^\d+$/.test(name)) names.push(name);
  }
  return names;
}

function extractPersons(text) {
  const persons = [];
  const re =
    /(회장|부회장|부사장|전무|상무|상무보|사업실장|본부장|실장|팀장|수석|책임|선임|사원|인턴|감사|대표이사|사장|차장|과장|대리)\s+([가-힣]{2,}(?:\d)?)(?:\s+\d{3,4})?/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (['사장', '대표이사'].includes(m[1]) && m[2].length <= 2) continue;
    persons.push({ rank: m[1], name: m[2] });
  }
  return persons;
}

async function loadPdfItems() {
  const buffer = fs.readFileSync(PDF_PATH);
  const parser = new PDFParse({ data: buffer });
  const textResult = await parser.getText();
  await parser.destroy();

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();

  return content.items
    .filter((i) => i.str && i.str.trim())
    .map((i) => ({
      str: i.str.trim(),
      x: Math.round(i.transform[4]),
      y: Math.round(i.transform[5]),
    }));
}

function buildPdfColumnStreams(items) {
  const byY = new Map();
  for (const it of items) {
    const yKey = Math.round(it.y / 3) * 3;
    if (!byY.has(yKey)) byY.set(yKey, []);
    byY.get(yKey).push(it);
  }

  /** @type {{ y: number, col: number, type: 'team'|'person', name?: string, person?: { rank: string, name: string } }[][]} */
  const streams = Array.from({ length: 6 }, () => []);

  const sortedLines = [...byY.entries()].sort((a, b) => b[0] - a[0]);

  for (const [y, rowItems] of sortedLines) {
    if (y > 710 || y < 75) continue;

    const colTexts = Array.from({ length: 6 }, () => '');
    const fullLineText = rowItems
      .sort((a, b) => a.x - b.x)
      .map((it) => it.str)
      .join(' ');

    for (const it of rowItems.sort((a, b) => a.x - b.x)) {
      const col = colForX(it.x);
      if (col < 0 || SKIP_TEXT.test(it.str)) continue;
      colTexts[col] += (colTexts[col] ? ' ' : '') + it.str;
    }

    // <> 팀명은 열 경계를 넘을 수 있어 행 전체 텍스트에서 추출
    for (const teamName of extractTeamNames(fullLineText)) {
      const teamCol = columnForTeam(teamName);
      if (teamCol == null) continue;
      streams[teamCol].push({ y, col: teamCol, type: 'team', name: teamName });
    }

    for (let col = 0; col < 6; col++) {
      const text = colTexts[col].trim();
      if (!text) continue;

      const personText = text.replace(/<\s*[^>]+?\s*>/g, ' ');
      for (const person of extractPersons(personText)) {
        if (AFFILIATE_EMPLOYEE_NAMES.has(person.name)) continue;
        streams[col].push({ y, col, type: 'person', person });
      }
    }
  }

  for (const stream of streams) {
    stream.sort((a, b) => b.y - a.y || (a.type === 'team' ? -1 : 1));
  }

  return streams;
}

function assignFromStreams(streams) {
  const bucket = new Map();

  for (let col = 0; col < 6; col++) {
    const divId = COLUMN_DIVISION_IDS[col];
    let currentTeam = COLUMN_DEFAULT_TEAMS[col];

    for (const item of streams[col]) {
      if (item.type === 'team') {
        currentTeam = normalizeTeamName(item.name, divId);
      } else {
        const key = `${divId}::${currentTeam}`;
        if (!bucket.has(key)) bucket.set(key, []);
        bucket.get(key).push({ ...item.person, divisionId: divId, teamName: currentTeam });
      }
    }
  }

  return bucket;
}

function buildOrgFromStreams(streams) {
  const bucket = assignFromStreams(streams);

  const teams = [];
  const teamByKey = new Map();
  for (const [divId, teamNames] of Object.entries(DIVISION_TEAMS)) {
    for (const teamName of teamNames) {
      const team = {
        id: `team-${slugify(divId)}-${slugify(teamName)}`,
        name: teamName,
        divisionId: divId,
      };
      teams.push(team);
      teamByKey.set(`${divId}::${teamName}`, team);
    }
  }

  const employees = [];
  const divisionHeads = new Map();
  const teamHeads = new Map();
  const seenNames = new Set();

  for (const [key, members] of bucket.entries()) {
    const [divId, teamName] = key.split('::');
    const team = teamByKey.get(`${divId}::${teamName}`);
    if (!team) continue;
    const division = DIVISIONS.find((d) => d.id === divId);

    for (const m of members) {
      const dedupe = `${m.name}::${team.id}`;
      if (seenNames.has(dedupe)) continue;
      seenNames.add(dedupe);

      if (/본부장|사업실장/.test(m.rank)) divisionHeads.set(divId, { name: m.name, rank: m.rank });
      if (/^팀장$|^실장$/.test(m.rank)) teamHeads.set(team.id, { name: m.name, rank: m.rank });

      employees.push({
        id: `emp-${slugify(m.name)}-${slugify(teamName)}`,
        name: m.name,
        divisionId: divId,
        divisionName: division.name,
        teamId: team.id,
        teamName: team.name,
        role: m.name === '서석민' ? '개발관리자' : m.rank,
        accessRole: inferAccessRole(m.rank, m.name),
      });
    }
  }

  const divisions = DIVISIONS.map((d) => {
    const head = divisionHeads.get(d.id);
    return head ? { ...d, headName: head.name, headRank: head.rank } : d;
  });

  for (const team of teams) {
    const head = teamHeads.get(team.id);
    if (head) {
      team.headName = head.name;
      team.headRank = head.rank;
    }
  }

  const execSeen = new Set();
  const admins = [];
  for (const e of employees) {
    if (e.divisionId !== 'div-exec' && e.accessRole !== '경영진' && e.accessRole !== '본부장') continue;
    if (execSeen.has(e.name)) continue;
    execSeen.add(e.name);
    admins.push({
      id: `exec-${slugify(e.name)}`,
      name: e.name,
      rank: e.role,
      accessRole: e.accessRole === '본부장' ? '본부장' : '경영진',
    });
  }

  employees.sort(
    (a, b) =>
      a.divisionName.localeCompare(b.divisionName, 'ko') ||
      a.teamName.localeCompare(b.teamName, 'ko') ||
      a.name.localeCompare(b.name, 'ko'),
  );

  return {
    source: '내선전화표(2026.08)',
    generatedAt: new Date().toISOString(),
    executiveOffice: { admins },
    divisions,
    teams,
    employees,
    stats: {
      divisions: divisions.length,
      teams: teams.length,
      employees: employees.length,
      executives: admins.length,
    },
  };
}

const items = await loadPdfItems();
const streams = buildPdfColumnStreams(items);
const org = buildOrgFromStreams(streams);

fs.writeFileSync(OUT_RAW, JSON.stringify(org, null, 2), 'utf8');
console.log('Raw org written:', org.stats);
const byDiv = {};
org.employees.forEach((e) => {
  byDiv[e.divisionName] = byDiv[e.divisionName] || {};
  byDiv[e.divisionName][e.teamName] = (byDiv[e.divisionName][e.teamName] || 0) + 1;
});
console.log(JSON.stringify(byDiv, null, 2));
