import { Outlet } from 'react-router-dom';

export function ProjectManagementLayout() {
  return (
    <div className="project-management-page">
      <Outlet />
    </div>
  );
}
