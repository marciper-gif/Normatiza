import { ProfilePermissions, UserAccount, ATR, POP, IT, Employee } from '../types';

export type PermissionFlags = {
  canSeeAllDocs: boolean;
  canSeeEmployees: boolean;
  canSeeSectors: boolean;
  canEditEmployees: boolean;
  canEditDocs: boolean;
  canUploadDocuments: boolean;
  canManageRetention: boolean;
  canDeleteDocuments: boolean;
};

const NO_PERMISSIONS: PermissionFlags = {
  canSeeAllDocs: false,
  canSeeEmployees: false,
  canSeeSectors: false,
  canEditEmployees: false,
  canEditDocs: false,
  canUploadDocuments: false,
  canManageRetention: false,
  canDeleteDocuments: false
};

const ADMIN_PERMISSIONS: PermissionFlags = {
  canSeeAllDocs: true,
  canSeeEmployees: true,
  canSeeSectors: true,
  canEditEmployees: true,
  canEditDocs: true,
  canUploadDocuments: true,
  canManageRetention: true,
  canDeleteDocuments: true
};

export const DEFAULT_PROFILE_PERMISSIONS: ProfilePermissions = {
  colaborador: {
    canSeeAllDocs: true,
    canSeeEmployees: true,
    canSeeSectors: true,
    canEditEmployees: false,
    canEditDocs: false,
    canUploadDocuments: false,
    canManageRetention: false,
    canDeleteDocuments: false
  },
  gestor: {
    canSeeAllDocs: true,
    canSeeEmployees: true,
    canSeeSectors: true,
    canEditEmployees: true,
    canEditDocs: true,
    canUploadDocuments: true,
    canManageRetention: true,
    canDeleteDocuments: false
  },
  lider: {
    canSeeAllDocs: true,
    canSeeEmployees: true,
    canSeeSectors: true,
    canEditEmployees: true,
    canEditDocs: true,
    canUploadDocuments: true,
    canManageRetention: true,
    canDeleteDocuments: false
  }
} as ProfilePermissions;

/** Carga inicial das permissões de perfil a partir do localStorage. */
export function loadStoredProfilePermissions(): ProfilePermissions {
  const saved = localStorage.getItem('ms-profile-permissions');
  if (!saved) {
    localStorage.setItem('ms-profile-permissions', JSON.stringify(DEFAULT_PROFILE_PERMISSIONS));
    return DEFAULT_PROFILE_PERMISSIONS;
  }
  try {
    const parsed = JSON.parse(saved);
    if (!parsed.gestor) {
      parsed.gestor = parsed.lider || DEFAULT_PROFILE_PERMISSIONS.gestor;
    }
    // Garante que as flags de visibilidade sejam true quando indefinidas
    if (parsed.colaborador) {
      if (parsed.colaborador.canSeeAllDocs === undefined) parsed.colaborador.canSeeAllDocs = true;
      if (parsed.colaborador.canSeeSectors === undefined) parsed.colaborador.canSeeSectors = true;
      if (parsed.colaborador.canSeeEmployees === undefined) parsed.colaborador.canSeeEmployees = true;
    }
    return parsed;
  } catch (e) {
    return DEFAULT_PROFILE_PERMISSIONS;
  }
}

/** Permissões efetivas do usuário logado (admin tem tudo; sem login, nada). */
export function resolveUserPermissions(
  currentUser: UserAccount | null,
  profilePermissions: ProfilePermissions
): PermissionFlags {
  if (!currentUser) return NO_PERMISSIONS;
  if (currentUser.role === 'admin') return ADMIN_PERMISSIONS;
  const roleKey = currentUser.role === 'lider' ? 'gestor' : currentUser.role;
  return (profilePermissions as any)[roleKey] || NO_PERMISSIONS;
}

/**
 * Colaborador = só o explicitamente vinculado; gestor/lider = vinculado +
 * documentos do próprio setor; admin = tudo.
 */
export function userHasAccessToDocument(
  currentUser: UserAccount | null,
  profilePermissions: ProfilePermissions,
  employees: Employee[],
  doc: ATR | POP | IT,
  docType: 'atr' | 'pop' | 'it'
): boolean {
  if (!currentUser) return false;
  if (currentUser.role === 'admin') return true;

  const roleKey = currentUser.role === 'lider' ? 'gestor' : currentUser.role;
  const perms = (profilePermissions as any)[roleKey];
  if (perms?.canSeeAllDocs) return true;

  const matchedEmployee = employees.find(emp => emp.id === currentUser.employeeId);
  if (!matchedEmployee) return perms?.canSeeAllDocs ?? true;

  let isExplicitlyAssociated = false;
  if (docType === 'atr') {
    isExplicitlyAssociated = matchedEmployee.associatedATRs?.includes(doc.id) || false;
  } else if (docType === 'pop') {
    isExplicitlyAssociated = matchedEmployee.associatedPOPs?.includes(doc.id) || false;
  } else if (docType === 'it') {
    isExplicitlyAssociated = matchedEmployee.associatedITs?.includes(doc.id) || false;
  }
  if (isExplicitlyAssociated) return true;

  if (currentUser.role === 'gestor' || currentUser.role === 'lider') {
    if (doc.sector && matchedEmployee.sector && doc.sector.toLowerCase() === matchedEmployee.sector.toLowerCase()) {
      return true;
    }
  }
  return false;
}
