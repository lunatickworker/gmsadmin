import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type UserRole =
  | 'system_admin'
  | 'operator'
  | 'head_office'
  | 'sub_office'
  | 'distributor'
  | 'store'
  | 'member';

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  level: number;
  levelName: string;
  orgId: string;
  orgPath: string;
  hierarchyPath: string[];
  depth: number;
  balance: number;
  points: number;
}

export const ROLE_TO_LEVEL: Record<UserRole, number> = {
  system_admin: 1,
  operator:     2,
  head_office:  3,
  sub_office:   4,
  distributor:  5,
  store:        6,
  member:       7,
};

export const LEVEL_NAMES: Record<number, string> = {
  1: '시스템 관리자',
  2: '운영사',
  3: '본사',
  4: '부본사',
  5: '총판',
  6: '매장',
  7: '회원',
};

export function getCreatableLevels(myLevel: number): { value: string; label: string }[] {
  const result = [];
  for (let l = myLevel + 1; l <= 6; l++) {
    result.push({ value: String(l), label: LEVEL_NAMES[l] });
  }
  return result;
}

// DB row → User 변환
export function mapDbUserToUser(dbUser: any): User {
  const level = ROLE_TO_LEVEL[dbUser.role as UserRole] ?? 7;
  return {
    id: dbUser.id,
    username: dbUser.username,
    name: dbUser.name ?? dbUser.username,
    role: dbUser.role,
    level,
    levelName: LEVEL_NAMES[level] ?? '회원',
    orgId: dbUser.id,
    orgPath: (dbUser.hierarchy_path ?? []).join('/'),
    hierarchyPath: dbUser.hierarchy_path ?? [],
    depth: dbUser.depth ?? 0,
    balance: Number(dbUser.balance ?? 0),
    points: Number(dbUser.points ?? 0),
  };
}

const STORAGE_KEY = 'benz_casino_user';

interface AuthContextType {
  user: User | null;
  login: (userData: User) => void;
  logout: () => void;
  canManage: (targetLevel: number) => boolean;
  isInMyOrg: (targetOrgPath: string) => boolean;
  hasPermission: (requiredLevel: number) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [user]);

  const login = (userData: User) => setUser(userData);

  const logout = () => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const canManage = (targetLevel: number): boolean => {
    if (!user) return false;
    return targetLevel > user.level;
  };

  const isInMyOrg = (targetOrgPath: string): boolean => {
    if (!user) return false;
    if (user.level === 1) return true;
    return targetOrgPath === user.orgPath || targetOrgPath.startsWith(user.orgPath + '/');
  };

  const hasPermission = (requiredLevel: number): boolean => {
    if (!user) return false;
    return user.level <= requiredLevel;
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, canManage, isInMyOrg, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
