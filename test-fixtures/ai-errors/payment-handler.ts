/**
 * Test file 2 for context-drift-patterns rule
 * 
 * AI generated this file without seeing user-service.ts
 * Uses different names for the same concepts!
 */

// Same concept as User, but named differently (context drift!)
export interface Customer {
  id: string;
  emailAddress: string;  // Different from User.email
  fullName: string;      // Different from User.name
  createdAt: Date;
  updatedAt: Date;
}

// Same concept as UserProfile but named differently
export interface AccountDetails {
  customerId: string;    // Same as userId
  profilePicture: string; // Same as avatarUrl
  bio: string;           // Same as biography
}

// Same function as getUserById but named differently
export function fetchCustomer(customerId: string): Customer {
  return {
    id: customerId,
    emailAddress: 'test@example.com',
    fullName: 'Test Customer',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// Yet another variation
export interface Account {
  id: string;
  email: string;
  displayName: string;
  created: Date;  // Different name for createdAt
}

export function getAccount(accountId: string): Account {
  return {
    id: accountId,
    email: 'test@example.com',
    displayName: 'Test Account',
    created: new Date(),
  };
}
