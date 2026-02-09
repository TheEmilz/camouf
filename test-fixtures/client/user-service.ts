/**
 * Client-side user service
 * 
 * AI-generated with mismatches! Uses wrong function names and parameter names
 * compared to the shared types. These are typical AI context-drift errors.
 */

import type { User, CreateUserDTO, UpdateUserDTO, UserListResponse } from '../shared/user.types';

// Simulating an AI agent that "remembers" the shared API but gets names wrong

export class UserService {
  // ❌ Calls getUser() but shared defines getUserById()
  async loadProfile(userId: string): Promise<User> {
    const user = await getUser(userId);
    return user;
  }

  // ❌ Calls addNewUser() but shared defines createUser()
  async register(data: CreateUserDTO): Promise<User> {
    const created = await addNewUser(data);
    return created;
  }

  // ❌ Calls removeUser() but shared defines deleteUser()
  async deactivate(userId: string): Promise<void> {
    await removeUser(userId);
  }

  // ❌ Calls fetchUsers() but shared defines listUsers(), wrong params
  async getPage(pageNum: number, limit: number): Promise<UserListResponse> {
    const result = await fetchUsers(pageNum, limit);
    return result;
  }

  // ❌ Calls updateProfile() but shared defines updateUser()
  async changeProfile(userId: string, data: UpdateUserDTO): Promise<User> {
    const updated = await updateProfile(userId, data);
    return updated;
  }
}

// These are the mismatched function implementations the AI created
// instead of importing from shared
async function getUser(userId: string): Promise<User> {
  const response = await fetch(`/api/users/${userId}`);
  return response.json();
}

async function addNewUser(data: CreateUserDTO): Promise<User> {
  const response = await fetch('/api/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.json();
}

async function removeUser(userId: string): Promise<void> {
  await fetch(`/api/users/${userId}`, { method: 'DELETE' });
}

async function fetchUsers(pageNum: number, limit: number): Promise<UserListResponse> {
  const response = await fetch(`/api/users?page=${pageNum}&size=${limit}`);
  return response.json();
}

async function updateProfile(userId: string, data: UpdateUserDTO): Promise<User> {
  const response = await fetch(`/api/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return response.json();
}
