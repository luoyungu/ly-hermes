export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  salt: string;
  displayName: string;
  createdAt: string;
  lastLogin: string;
}

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
}

export interface AuthResult {
  success?: boolean;
  error?: string;
  user?: PublicUser;
}

export interface AuthStore {
  loadUsers(): UserRecord[];
  saveUsers(users: UserRecord[]): void;
}
