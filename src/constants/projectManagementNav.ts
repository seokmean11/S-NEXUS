export const PROJECT_MANAGEMENT_SUB_ITEMS = [
  { path: '/project/register', label: '프로젝트 등록' },
  { path: '/project/allocation', label: 'PM 인력 배분' },
] as const;

export function isProjectManagementSectionPath(pathname: string): boolean {
  return (
    pathname.startsWith('/project') ||
    pathname === '/admin' ||
    pathname === '/allocation'
  );
}
