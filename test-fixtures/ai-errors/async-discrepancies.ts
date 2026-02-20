/**
 * Test fixture: Async Discrepancies
 * 
 * This file contains intentional async/await misuse patterns
 * commonly introduced by AI coding assistants.
 * 
 * Expected violations:
 * - Unnecessary async functions (no await in body)
 * - Floating promises (async calls without await)
 * - await on non-promise values
 * - Mixed async patterns (await + .then() in same function)
 */

import { UserRepository } from './user-repository';
import { Logger } from './logger';

// ─── 1. Unnecessary async: function doesn't use await ────────────────

// VIOLATION: async keyword is unnecessary
export async function formatUserName(first: string, last: string): string {
  return `${first} ${last}`.trim();
}

// VIOLATION: async with only synchronous operations
export async function calculateDiscount(price: number, percent: number) {
  const discount = price * (percent / 100);
  return price - discount;
}

// OK: async function that properly uses await
export async function fetchUserProfile(userId: string) {
  const user = await UserRepository.findById(userId);
  return user;
}

// ─── 2. Floating promises (unawaited async calls) ───────────────────

export async function processOrder(orderId: string) {
  const order = await getOrderById(orderId);

  // VIOLATION: floating promise — saveAuditLog is async but not awaited
  saveAuditLog('order_processed', orderId);

  // VIOLATION: floating promise — sendNotification is async  
  sendNotification(order.userId, 'Your order has been processed');

  // OK: properly awaited
  await updateOrderStatus(orderId, 'processed');

  return order;
}

// ─── 3. Missing await on known async functions ──────────────────────

export async function createUserWorkflow(userData: any) {
  // VIOLATION: validateUser is async, result will be a Promise<boolean>, not boolean
  const isValid = validateUser(userData);
  if (!isValid) {  // This will always be truthy (Promise is truthy)
    throw new Error('Invalid user');
  }

  const user = await UserRepository.create(userData);
  return user;
}

// ─── 4. await on non-promise values ─────────────────────────────────

export async function processItems(items: string[]) {
  // VIOLATION: await on a string literal
  const greeting = await "hello";

  // VIOLATION: await on a number
  const count = await 42;

  // VIOLATION: await on a boolean
  const flag = await true;

  // OK: await on actual async call
  const result = await processItem(items[0]);

  return result;
}

// ─── 5. Mixed async patterns (await + .then() in same function) ─────

export async function fetchAndProcessData(url: string) {
  // OK: uses await
  const response = await fetch(url);

  // VIOLATION: mixing .then() with await in the same function
  response.json().then(data => {
    console.log('Data received:', data);
    saveData(data);
  });

  // OK: consistent await usage
  const status = await checkStatus();
  return status;
}

// VIOLATION: mixing await with error-first callbacks
export async function readAndUpload(filePath: string) {
  const content = await readFileAsync(filePath);

  // VIOLATION: using callback pattern inside async function
  uploadFile(content, function(err, result) {
    if (err) {
      console.error('Upload failed:', err);
      return;
    }
    console.log('Upload success:', result);
  });
}

// ─── 6. Complex real-world scenario ─────────────────────────────────

export async function syncInventory(warehouseId: string) {
  const items = await getWarehouseItems(warehouseId);

  for (const item of items) {
    // VIOLATION: floating promise inside loop
    updateStockLevel(item.id, item.quantity);
  }

  // VIOLATION: floating promise (no await, no .then/.catch)
  notifyWarehouse(warehouseId, 'sync_complete');

  return { synced: items.length };
}

// ─── Helper async function declarations (for cross-reference) ───────

async function saveAuditLog(action: string, entityId: string): Promise<void> {
  // simulate DB write
  await new Promise(resolve => setTimeout(resolve, 100));
}

async function sendNotification(userId: string, message: string): Promise<void> {
  await fetch('/api/notifications', { method: 'POST', body: JSON.stringify({ userId, message }) });
}

async function updateOrderStatus(orderId: string, status: string): Promise<void> {
  await fetch(`/api/orders/${orderId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

async function getOrderById(orderId: string): Promise<any> {
  const res = await fetch(`/api/orders/${orderId}`);
  return res.json();
}

async function validateUser(data: any): Promise<boolean> {
  const rules = await fetch('/api/validation-rules');
  return true;
}

async function processItem(item: string): Promise<string> {
  return await fetch(`/api/process/${item}`).then(r => r.text());
}

async function checkStatus(): Promise<string> {
  return 'ok';
}

async function readFileAsync(path: string): Promise<string> {
  return '';
}

async function saveData(data: any): Promise<void> {
  await fetch('/api/data', { method: 'POST', body: JSON.stringify(data) });
}

async function getWarehouseItems(warehouseId: string): Promise<any[]> {
  const res = await fetch(`/api/warehouses/${warehouseId}/items`);
  return res.json();
}

async function updateStockLevel(itemId: string, quantity: number): Promise<void> {
  await fetch(`/api/stock/${itemId}`, { method: 'PUT', body: JSON.stringify({ quantity }) });
}

async function notifyWarehouse(warehouseId: string, event: string): Promise<void> {
  await fetch(`/api/warehouses/${warehouseId}/notify`, { method: 'POST', body: JSON.stringify({ event }) });
}

function uploadFile(content: string, callback: (err: Error | null, result?: string) => void): void {
  // callback-style upload
}
