/**
 * Client-side payment handler
 * 
 * AI-generated with signature mismatches compared to shared/payment.types.ts
 */

import type { Payment, CreatePaymentDTO } from '../shared/payment.types';

export class PaymentClient {
  // ❌ Calls createPayment() but shared defines processPayment()
  async submitPayment(data: CreatePaymentDTO): Promise<Payment> {
    const result = await createPayment(data);
    return result;
  }

  // ❌ Calls fetchPayment() but shared defines getPaymentById()
  async loadPayment(paymentId: string): Promise<Payment> {
    const payment = await fetchPayment(paymentId);
    return payment;
  }

  // ❌ Calls requestRefund() but shared defines refundPayment()
  async startRefund(id: string, reason: string): Promise<Payment> {
    const refund = await requestRefund(id, reason);
    return refund;
  }
}

// Mismatched function implementations
async function createPayment(paymentData: CreatePaymentDTO): Promise<Payment> {
  const response = await fetch('/api/payments', {
    method: 'POST',
    body: JSON.stringify(paymentData),
  });
  return response.json();
}

async function fetchPayment(paymentId: string): Promise<Payment> {
  const response = await fetch(`/api/payments/${paymentId}`);
  return response.json();
}

async function requestRefund(id: string, refundReason: string): Promise<Payment> {
  const response = await fetch(`/api/payments/${id}/refund`, {
    method: 'POST',
    body: JSON.stringify({ reason: refundReason }),
  });
  return response.json();
}
