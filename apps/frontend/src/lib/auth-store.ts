import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { clearCompanyWorkspaceAvatarCache } from '@/lib/company-workspace-avatar-cache';

export type UserRole =
  | 'SUPER_ADMIN'
  | 'DIRECTOR'
  | 'QUALITY_MANAGER'
  | 'AUDITOR'
  | 'OPERATOR'
  | 'C_LEVEL';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: UserRole;
  isVerified: boolean;
  isActive: boolean;
  companyId?: string;
  company?: {
    id: string;
    name: string;
    /** Workspace invite code (QUR + 5), shown on Profile for sharing with teammates */
    companyCode?: string | null;
    field?: string;
    /** Company logo in MinIO; load via GET /api/company/avatar/image */
    avatarKey?: string | null;
  };
  /** @deprecated Prefer hasCustomAvatar + useAvatarBlobUrl */
  avatarUrl?: string | null;
  /** True when a custom photo exists (load via GET /api/auth/profile/avatar/image with JWT). */
  hasCustomAvatar?: boolean;
  /** MinIO key; changes when photo is replaced: used to refetch the blob URL. */
  avatarKey?: string | null;
}

interface AuthStore {
  user: User | null;
  token: string | null;
  /** Long-lived refresh JWT; used to obtain new access tokens without re-login. */
  refreshToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, token: string, refreshToken?: string | null) => void;
  /** Update tokens after silent refresh (keeps current user). */
  setTokens: (token: string, refreshToken: string) => void;
  updateUser: (data: Partial<User>) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      setAuth: (user, token, refreshToken = null) =>
        set({ user, token, refreshToken: refreshToken ?? null, isAuthenticated: true }),
      setTokens: (token, refreshToken) => set({ token, refreshToken }),
      updateUser: (data) => set((s) => ({ user: s.user ? { ...s.user, ...data } : null })),
      logout: () => {
        clearCompanyWorkspaceAvatarCache();
        set({ user: null, token: null, refreshToken: null, isAuthenticated: false });
      },
    }),
    {
      name: 'qurelio-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
