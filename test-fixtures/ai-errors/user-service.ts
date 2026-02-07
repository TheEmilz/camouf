/**
 * Test file 1 for context-drift-patterns rule
 * 
 * Defines User interface - this is the "canonical" definition
 */

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile {
  userId: string;
  avatarUrl: string;
  biography: string;
}

export function getUserById(id: string): User {
  // Implementation
  return {
    id,
    email: 'test@example.com',
    name: 'Test User',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function updateUser(user: User): User {
  return { ...user, updatedAt: new Date() };
}
