import {
  DIVISIONS,
  EMPLOYEES,
  EXECUTIVE_OFFICE,
  TEAMS,
} from '../src/data/mockData';
import { buildPersonnelRows, verifyPersonnelCoverage } from '../src/utils/personnelSearch';

const report = verifyPersonnelCoverage(
  EXECUTIVE_OFFICE.admins ?? [],
  EMPLOYEES,
  DIVISIONS,
  TEAMS,
);

const rows = buildPersonnelRows(
  EXECUTIVE_OFFICE.admins ?? [],
  EMPLOYEES,
  DIVISIONS,
  TEAMS,
);

console.log('검색 리스트:', report.rowCount, '명');
console.log('포함 여부:', report.ok ? 'OK' : 'MISSING');
if (report.missing.length) {
  console.log('누락:', report.missing);
}
console.log(
  '목록:',
  rows.map((row) => `${row.name}(${row.accessRole}/${row.kind})`).join(', '),
);
