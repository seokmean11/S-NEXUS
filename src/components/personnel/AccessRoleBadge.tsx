import type { WebAccessRole } from '@/types';
import { accessRoleBadgeClass } from '@/utils/webAccessRole';

interface AccessRoleBadgeProps {
  accessRole: WebAccessRole;
}

export function AccessRoleBadge({ accessRole }: AccessRoleBadgeProps) {
  return (
    <span className={`access-role-badge ${accessRoleBadgeClass(accessRole)}`}>
      권한 {accessRole}
    </span>
  );
}
