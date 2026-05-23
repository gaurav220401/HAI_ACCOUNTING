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
  customerBalanceDetails,
  arAgingSummary,
  arAgingDetails,
  apAgingSummary,
  expenseDetails,
  expensesByCategory,
  purchasesByItem,
  inventorySummary,
  committedStockDetails,
  inventoryAgingSummary,
  stockSummary,
  inventoryAdjustmentSummary,
  inventoryAdjustmentDetails,
  packingHistory,
  shipmentDetails,
  inventoryTurnoverByQuantity,
  inventoryValuationSummary,
  fifoCostLotTracking,
  abcClassification,
  inventoryTurnoverByAmount,
  salesByCustomer,
  salesByItem,
  salesByItemDetails,
  purchasesByItemDetails,
  itemTransactionHistory,
  paymentsReceivedReport,
  dashboardSummary,
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
router.get("/ap-aging-summary", apAgingSummary);

// Receivables
router.get("/customer-balance-summary", customerBalanceSummary);
router.get("/invoice-details", invoiceDetails);
router.get("/receivable-summary", receivableSummary);
router.get("/customer-balance-details", customerBalanceDetails);
router.get("/ar-aging-summary", arAgingSummary);
router.get("/ar-aging-details", arAgingDetails);

// Purchases & Expenses
router.get("/expense-details", expenseDetails);
router.get("/expenses-by-category", expensesByCategory);
router.get("/purchases-by-item", purchasesByItem);
router.get("/purchases-by-item-details", purchasesByItemDetails);
router.get("/item-transaction-history", itemTransactionHistory);

// Inventory
router.get("/inventory-summary", inventorySummary);
router.get("/committed-stock-details", committedStockDetails);
router.get("/inventory-aging-summary", inventoryAgingSummary);
router.get("/stock-summary", stockSummary);
router.get("/inventory-adjustment-summary", inventoryAdjustmentSummary);
router.get("/inventory-adjustment-details", inventoryAdjustmentDetails);
router.get("/packing-history", packingHistory);
router.get("/shipment-details", shipmentDetails);
router.get("/inventory-turnover-by-quantity", inventoryTurnoverByQuantity);

// Inventory Valuation
router.get("/inventory-valuation-summary", inventoryValuationSummary);
router.get("/fifo-cost-lot-tracking", fifoCostLotTracking);
router.get("/abc-classification", abcClassification);
router.get("/inventory-turnover-by-amount", inventoryTurnoverByAmount);

// Sales
router.get("/sales-by-customer", salesByCustomer);
router.get("/sales-by-item", salesByItem);
router.get("/sales-by-item-details", salesByItemDetails);

// Payments Received
router.get("/payments-received", paymentsReceivedReport);

// Dashboard
router.get("/dashboard-summary", dashboardSummary);

export default router;
