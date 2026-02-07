/**
 * Test file for orphaned-functions rule
 * 
 * AI generated helper functions that are never used
 */

// This function IS used - should NOT be flagged
export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

// Internal helper that IS used - should NOT be flagged
function validateNumber(n: number): boolean {
  return !isNaN(n) && isFinite(n);
}

// Main function that uses the above
export function calculatePrice(base: number, tax: number): string {
  if (validateNumber(base) && validateNumber(tax)) {
    return formatCurrency(base + tax);
  }
  return '$0.00';
}

// ============================================
// ORPHANED FUNCTIONS - AI generated but never called
// ============================================

// AI generated this helper but forgot to use it
function sanitizeInput(input: string): string {
  return input.trim().toLowerCase();
}

// AI generated validation helper, never called
function validateEmail(email: string): boolean {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

// AI generated formatting helper, never used
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// AI generated logging utility, never called
function logDebug(message: string, data?: unknown): void {
  if (process.env.DEBUG) {
    console.log(`[DEBUG] ${message}`, data);
  }
}

// AI generated error handler, never used
function handleError(error: Error): { message: string; code: number } {
  return {
    message: error.message,
    code: 500,
  };
}

// AI generated transform function, never called
function transformUserData(user: { name: string; email: string }) {
  return {
    displayName: user.name.toUpperCase(),
    contactEmail: user.email.toLowerCase(),
  };
}

// AI generated array helper, never used
function uniqueArray<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

// AI generated debounce utility, never called
function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}
