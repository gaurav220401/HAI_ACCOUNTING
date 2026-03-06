import { apiFetch } from "./client";

export interface PayUConfig {
  _id: string;
  organizationId: string;
  merchantKey: string;
  environment: 'test' | 'production';
  isActive: boolean;
  successUrl: string;
  failureUrl: string;
  cancelUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface PayUPaymentRequest {
  invoiceId: string;
  customerPhone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
}

export interface PayUPaymentResponse {
  paymentId: string;
  transactionId: string;
  checkoutUrl: string;
  amount: number;
}

export interface PayUVerificationResponse {
  paymentId: string;
  transactionId: string;
  status: 'pending' | 'success' | 'failure' | 'cancelled';
  amount: number;
  mihpayId?: string;
  paymentMode?: string;
  bankReferenceNumber?: string;
}

export const payUApi = {
  // Get PayU configuration
  getConfig: () =>
    apiFetch<{ data: PayUConfig | null }>('/payu/config'),

  // Update PayU configuration
  updateConfig: (data: {
    merchantKey: string;
    merchantSecret: string;
    environment?: 'test' | 'production';
    successUrl: string;
    failureUrl: string;
    cancelUrl?: string;
    isActive?: boolean;
  }) =>
    apiFetch<{ data: PayUConfig }>('/payu/config', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Initiate payment
  initiatePayment: (data: PayUPaymentRequest) =>
    apiFetch<{ data: PayUPaymentResponse }>('/payu/initiate-payment', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Verify payment
  verifyPayment: (transactionId: string) =>
    apiFetch<{ data: PayUVerificationResponse }>('/payu/verify-payment', {
      method: 'POST',
      body: JSON.stringify({ transactionId }),
    }),
};
