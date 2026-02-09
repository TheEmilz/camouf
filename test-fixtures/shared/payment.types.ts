/**
 * Shared Payment types - canonical source of truth
 */

export interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  userId: string;
  createdAt: Date;
}

export interface CreatePaymentDTO {
  amount: number;
  currency: string;
  userId: string;
  description?: string;
}

export function processPayment(dto: CreatePaymentDTO): Promise<Payment> {
  return Promise.resolve({} as Payment);
}

export function getPaymentById(id: string): Promise<Payment> {
  return Promise.resolve({} as Payment);
}

export function refundPayment(paymentId: string, reason: string): Promise<Payment> {
  return Promise.resolve({} as Payment);
}
