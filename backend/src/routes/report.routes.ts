import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import {
  trialBalance,
  profitAndLoss,
  balanceSheet,
  controlReconciliation,
  accountTransactionsReport,
  vendorBalanceSummary,
  billDetails,
  paymentsMadeReport,
  vendorCreditDetails,
  purchaseOrderDetails,
  payableSummary,
  customerBalanceSummary,
  invoiceDetails,
  receivableSummary,
  expenseDetails,
  expensesByCategory,
  purchasesByItem,
  salesByCustomer,
  salesByItem,
  paymentsReceivedReport,
} from "../controllers/report.controller";

const router = Router();
router.use(authenticate);

// Financial Statements
router.get("/trial-balance", trialBalance);
router.get("/profit-loss", profitAndLoss);
router.get("/balance-sheet", balanceSheet);
router.get("/control-reconciliation", controlReconciliation);

// Activity
router.get("/account-transactions", accountTransactionsReport);

// Payables
router.get("/vendor-balance-summary", vendorBalanceSummary);
router.get("/bill-details", billDetails);
router.get("/payments-made", paymentsMadeReport);
router.get("/vendor-credit-details", vendorCreditDetails);
router.get("/purchase-order-details", purchaseOrderDetails);
router.get("/payable-summary", payableSummary);

// Receivables
router.get("/customer-balance-summary", customerBalanceSummary);
router.get("/invoice-details", invoiceDetails);
router.get("/receivable-summary", receivableSummary);

// Purchases & Expenses
router.get("/expense-details", expenseDetails);
router.get("/expenses-by-category", expensesByCategory);
router.get("/purchases-by-item", purchasesByItem);

// Sales
router.get("/sales-by-customer", salesByCustomer);
router.get("/sales-by-item", salesByItem);

// Payments Received
router.get("/payments-received", paymentsReceivedReport);

export default router;
