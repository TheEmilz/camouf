/**
 * Shared User types - the canonical source of truth
 * 
 * These are the correct function signatures and type definitions
 * that both client and server should use consistently.
 */

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user' | 'guest';
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserDTO {
  email: string;
  name: string;
  password: string;
  role?: 'admin' | 'user' | 'guest';
}

export interface UpdateUserDTO {
  name?: string;
  email?: string;
  role?: 'admin' | 'user' | 'guest';
}

export interface UserListResponse {
  users: User[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Canonical functions - AI agents should call these with these exact names
 */
export function getUserById(id: string): Promise<User> {
  return Promise.resolve({} as User);
}

export function createUser(dto: CreateUserDTO): Promise<User> {
  return Promise.resolve({} as User);
}

export function updateUser(id: string, dto: UpdateUserDTO): Promise<User> {
  return Promise.resolve({} as User);
}

export function deleteUser(id: string): Promise<void> {
  return Promise.resolve();
}

export function listUsers(page: number, pageSize: number): Promise<UserListResponse> {
  return Promise.resolve({} as UserListResponse);
}
