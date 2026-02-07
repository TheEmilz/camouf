/**
 * Test file for inconsistent-casing rule
 * 
 * AI alternates between camelCase and snake_case in the same file
 */

// camelCase functions (project standard)
function getUserById(userId: string) {
  return { id: userId };
}

function updateUserProfile(userId: string, data: object) {
  return { userId, ...data };
}

// snake_case functions (AI inconsistency!)
function get_user_settings(user_id: string) {
  return { user_id, settings: {} };
}

function update_user_preferences(user_id: string, prefs: object) {
  return { user_id, ...prefs };
}

// Mixed in variables too
const userService = {
  get_all_users: () => [],  // snake_case method
  createUser: () => ({}),   // camelCase method
  delete_user: () => {},    // snake_case again
};

// Constants mixing styles
const MAX_RETRY_COUNT = 3;      // UPPER_SNAKE (correct for constants)
const defaultUserName = 'Guest'; // camelCase
const api_base_url = '/api/v1';  // snake_case (inconsistent!)

// Interface with mixed property naming
interface UserData {
  userId: string;        // camelCase
  user_email: string;    // snake_case!
  firstName: string;     // camelCase
  last_name: string;     // snake_case!
  created_at: Date;      // snake_case!
  updatedAt: Date;       // camelCase
}

// More functions with mixed naming
function validate_email_address(email: string): boolean {
  return email.includes('@');
}

function sendEmailNotification(userId: string, message: string) {
  console.log(`Sending to ${userId}: ${message}`);
}

function process_payment_request(amount: number) {
  return { amount, processed: true };
}

function calculateTotalAmount(items: number[]): number {
  return items.reduce((a, b) => a + b, 0);
}
