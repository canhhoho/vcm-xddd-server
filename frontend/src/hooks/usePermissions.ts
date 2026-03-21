import { useMemo } from 'react';
import type { UserRole, ModuleAccess } from '../types';

export interface PermissionResult {
    isAdmin: boolean;
    canEdit: boolean;
    canView: boolean;
    isBlocked: boolean;
    role: UserRole;
    permissions: {
        contracts: ModuleAccess;
        projects: ModuleAccess;
        targets: ModuleAccess;
        business: ModuleAccess;
        branches: ModuleAccess;
    };
}

export const usePermissions = (): PermissionResult => {
    return useMemo(() => {
        const userStr = localStorage.getItem('user');
        const user = userStr ? JSON.parse(userStr) : null;
        const role: UserRole = user?.role || 'NO_ACCESS';
        // Ensure role is upper case for comparison
        const normalizedRole = (role ? role.toUpperCase() : 'NO_ACCESS') as UserRole;

        return {
            isAdmin: normalizedRole === 'ADMIN',
            canEdit: normalizedRole === 'ADMIN' || normalizedRole === 'EDIT',
            canView: normalizedRole === 'ADMIN' || normalizedRole === 'EDIT' || normalizedRole === 'VIEW',
            isBlocked: normalizedRole === 'NO_ACCESS' || !normalizedRole,
            role: normalizedRole,
            permissions: {
                contracts: (user?.contracts || 'NO_ACCESS').toUpperCase() as ModuleAccess,
                projects: (user?.projects || 'NO_ACCESS').toUpperCase() as ModuleAccess,
                targets: (user?.targets || 'NO_ACCESS').toUpperCase() as ModuleAccess,
                business: (user?.business || 'NO_ACCESS').toUpperCase() as ModuleAccess,
                branches: (user?.branches || 'NO_ACCESS').toUpperCase() as ModuleAccess,
            }
        };
    }, []);
};
