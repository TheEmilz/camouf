/**
 * Shared Order types - Single Source of Truth
 * 
 * These types define the canonical API contract.
 * Both frontend and backend MUST use these exact signatures.
 */

export interface Order {
  id: string;
  customerId: string;
  items: OrderItem[];
  totalAmount: number;
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered';
  createdAt: Date;
}

export interface OrderItem {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateOrderDTO {
  customerId: string;
  items: OrderItem[];
  shippingAddress: string;
  paymentMethod: 'credit_card' | 'paypal' | 'bank_transfer';
}

export interface OrderFilter {
  status?: Order['status'];
  customerId?: string;
  fromDate?: Date;
  toDate?: Date;
}

// ── Canonical Functions ──────────────────────────────────────────────

export function getOrderById(orderId: string): Promise<Order> {
  return Promise.resolve({} as Order);
}

export function createOrder(dto: CreateOrderDTO): Promise<Order> {
  return Promise.resolve({} as Order);
}

export function listOrders(filter: OrderFilter): Promise<Order[]> {
  return Promise.resolve([]);
}

export function cancelOrder(orderId: string, reason: string): Promise<void> {
  return Promise.resolve();
}

export function calculateOrderTotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}
