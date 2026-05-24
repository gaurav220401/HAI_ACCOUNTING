import {
  Home,
  BarChart3,
  TrendingUp,
  Wallet,
  CreditCard,
  FileText,
  ShoppingCart,
  Package,
  Activity,
} from "lucide-react";

export interface ReportDef {
  id: string;
  name: string;
  category: string;
  apiCall: string;
  columns: { key: string; label: string; align?: "left" | "right"; format?: "currency" | "date" | "number" }[];
  useDateRange?: boolean;
  useAsOf?: boolean;
  useAgingBuckets?: boolean;
  statusOptions?: string[];
  partyFilter?: "vendor" | "customer";
}

export const REPORT_CATEGORIES = [
  { id: "all", label: "All Reports", icon: Home },
  { id: "financial-statements", label: "Financial Statements", icon: BarChart3 },
  { id: "sales", label: "Sales", icon: TrendingUp },
  { id: "receivables", label: "Receivables", icon: Wallet },
  { id: "payments-received", label: "Payments Received", icon: CreditCard },
  { id: "payables", label: "Payables", icon: FileText },
  { id: "purchases-expenses", label: "Purchases & Expenses", icon: ShoppingCart },
  { id: "inventory", label: "Inventory", icon: Package },
  { id: "inventory-valuation", label: "Inventory Valuation", icon: Package },
  { id: "activity", label: "Activity", icon: Activity },
];

export const REPORTS: ReportDef[] = [
  // Financial Statements
  {
    id: "trial-balance", name: "Trial Balance", category: "financial-statements", apiCall: "trialBalance",
    useAsOf: true,
    columns: [
      { key: "code", label: "Code" },
      { key: "name", label: "Account" },
      { key: "rootType", label: "Type" },
      { key: "closingDebit", label: "Debit (INR)", align: "right", format: "currency" },
      { key: "closingCredit", label: "Credit (INR)", align: "right", format: "currency" },
    ],
  },
  {
    id: "profit-loss", name: "Profit & Loss", category: "financial-statements", apiCall: "profitLoss",
    useDateRange: true, columns: [],
  },
  {
    id: "balance-sheet", name: "Balance Sheet", category: "financial-statements", apiCall: "balanceSheet",
    useAsOf: true, columns: [],
  },
  {
    id: "control-reconciliation", name: "Control Reconciliation", category: "financial-statements",
    apiCall: "controlReconciliation", useAsOf: true, columns: [],
  },
  // Activity
  {
    id: "account-transactions", name: "Account Transactions", category: "activity", apiCall: "accountTransactions",
    useDateRange: true,
    columns: [
      { key: "postingDate", label: "Date", format: "date" },
      { key: "accountName", label: "Account" },
      { key: "transactionDetails", label: "Transaction Details" },
      { key: "transactionType", label: "Transaction Type" },
      { key: "transactionNo", label: "Transaction#" },
      { key: "referenceNo", label: "Reference#" },
      { key: "debit", label: "Debit", align: "right", format: "currency" },
      { key: "credit", label: "Credit", align: "right", format: "currency" },
      { key: "amount", label: "Amount", align: "right", format: "currency" },
      { key: "amountSide", label: "Dr/Cr" },
    ],
  },
  // Sales
  {
    id: "sales-by-customer", name: "Sales by Customer", category: "sales", apiCall: "salesByCustomer",
    useDateRange: true,
    columns: [
      { key: "customerName", label: "Customer Name" },
      { key: "invoiceCount", label: "Invoice Count", align: "right", format: "number" },
      { key: "totalSales", label: "Sales", align: "right", format: "currency" },
      { key: "totalWithTax", label: "Sales with Tax", align: "right", format: "currency" },
    ],
  },
  {
    id: "sales-by-item", name: "Sales by Item", category: "sales", apiCall: "salesByItem",
    useDateRange: true,
    columns: [
      { key: "itemName", label: "Item Name" },
      { key: "totalQuantity", label: "Quantity Sold", align: "right", format: "number" },
      { key: "totalAmount", label: "Total Amount", align: "right", format: "currency" },
      { key: "invoiceCount", label: "Invoices", align: "right", format: "number" },
    ],
  },
  {
    id: "sales-by-item-details", name: "Sales by Item Details", category: "sales", apiCall: "salesByItemDetails",
    useDateRange: true,
    columns: [
      { key: "invoiceDate", label: "Date", format: "date" },
      { key: "invoiceNumber", label: "Invoice#" },
      { key: "customerName", label: "Customer Name" },
      { key: "itemName", label: "Item" },
      { key: "quantity", label: "Quantity", align: "right", format: "number" },
      { key: "rate", label: "Rate", align: "right", format: "currency" },
      { key: "amount", label: "Amount", align: "right", format: "currency" },
      { key: "status", label: "Status" },
    ],
  },
  // Receivables
  {
    id: "customer-balance-summary", name: "Customer Balance Summary", category: "receivables",
    apiCall: "customerBalanceSummary", useDateRange: true,
    columns: [
      { key: "customerName", label: "Customer Name" },
      { key: "openingBalance", label: "Opening Balance", align: "right", format: "currency" },
      { key: "outstandingReceivable", label: "Outstanding Receivable", align: "right", format: "currency" },
    ],
  },
  {
    id: "customer-balance-details", name: "Customer Balance Details", category: "receivables",
    apiCall: "customerBalanceDetails", useDateRange: true,
    columns: [
      { key: "customerName", label: "Customer Name" },
      { key: "transactionDate", label: "Date", format: "date" },
      { key: "transactionNo", label: "Transaction#" },
      { key: "transactionType", label: "Type" },
      { key: "debit", label: "Debit", align: "right", format: "currency" },
      { key: "credit", label: "Credit", align: "right", format: "currency" },
      { key: "balance", label: "Balance", align: "right", format: "currency" },
    ],
  },
  {
    id: "ar-aging-summary", name: "AR Aging Summary", category: "receivables",
    apiCall: "arAgingSummary", useAsOf: true, useAgingBuckets: true,
    columns: [
      { key: "customerName", label: "Customer Name" },
      { key: "totalOutstanding", label: "Total Outstanding", align: "right", format: "currency" },
    ],
  },
  {
    id: "ar-aging-details", name: "AR Aging Details", category: "receivables",
    apiCall: "arAgingDetails", useAsOf: true,
    columns: [
      { key: "customerName", label: "Customer Name" },
      { key: "invoiceNumber", label: "Invoice#" },
      { key: "invoiceDate", label: "Date", format: "date" },
      { key: "dueDate", label: "Due Date", format: "date" },
      { key: "ageDays", label: "Age (Days)", align: "right", format: "number" },
      { key: "totalAmount", label: "Amount", align: "right", format: "currency" },
      { key: "balanceDue", label: "Balance Due", align: "right", format: "currency" },
    ],
  },
  // Payments Received
  {
    id: "payments-received-summary", name: "Payments Received Summary", category: "payments-received",
    apiCall: "paymentsReceivedSummary", useDateRange: true,
    columns: [
      { key: "customerName", label: "Customer Name" },
      { key: "paymentCount", label: "Payments", align: "right", format: "number" },
      { key: "totalReceived", label: "Total Received", align: "right", format: "currency" },
      { key: "totalApplied", label: "Total Applied", align: "right", format: "currency" },
      { key: "totalUnapplied", label: "Total Unapplied", align: "right", format: "currency" },
    ],
  },
  // Payables
  {
    id: "vendor-balance-summary", name: "Vendor Balance Summary", category: "payables",
    apiCall: "vendorBalanceSummary",
    columns: [
      { key: "vendorName", label: "Vendor Name" },
      { key: "openingBalance", label: "Opening Balance", align: "right", format: "currency" },
      { key: "outstandingPayable", label: "Outstanding Payable", align: "right", format: "currency" },
    ],
  },
  {
    id: "ap-aging-summary", name: "AP Aging Summary", category: "payables",
    apiCall: "apAgingSummary", useAsOf: true, useAgingBuckets: true,
    columns: [
      { key: "vendorName", label: "Vendor Name" },
      { key: "totalOutstanding", label: "Total Outstanding", align: "right", format: "currency" },
    ],
  },
  // Purchases & Expenses
  {
    id: "purchases-by-vendor", name: "Purchases by Vendor", category: "purchases-expenses",
    apiCall: "purchasesByVendor", useDateRange: true,
    columns: [
      { key: "vendorName", label: "Vendor Name" },
      { key: "billCount", label: "Bill Count", align: "right", format: "number" },
      { key: "totalPurchases", label: "Purchases", align: "right", format: "currency" },
      { key: "totalWithTax", label: "Purchases with Tax", align: "right", format: "currency" },
    ],
  },
  {
    id: "purchases-by-item-details", name: "Purchases by Item Details", category: "purchases-expenses", apiCall: "purchasesByItemDetails",
    useDateRange: true,
    columns: [
      { key: "billDate", label: "Date", format: "date" },
      { key: "billNumber", label: "Bill#" },
      { key: "vendorName", label: "Vendor Name" },
      { key: "itemName", label: "Item" },
      { key: "quantity", label: "Quantity", align: "right", format: "number" },
      { key: "rate", label: "Rate", align: "right", format: "currency" },
      { key: "amount", label: "Amount", align: "right", format: "currency" },
      { key: "status", label: "Status" },
    ],
  },

  {
    id: "expense-details", name: "Expense Details", category: "purchases-expenses",
    apiCall: "expenseDetails", useDateRange: true,
    columns: [
      { key: "expenseDate", label: "Date", format: "date" },
      { key: "expenseAccountName", label: "Expense Account" },
      { key: "vendorName", label: "Vendor" },
      { key: "customerName", label: "Customer" },
      { key: "amount", label: "Amount", align: "right", format: "currency" },
      { key: "taxAmount", label: "Tax", align: "right", format: "currency" },
      { key: "totalAmount", label: "Total", align: "right", format: "currency" },
      { key: "paymentMode", label: "Payment Mode" },
      { key: "referenceNo", label: "Reference#" },
      { key: "status", label: "Status" },
    ],
  },
  // Inventory
  {
    id: "inventory-summary", name: "Inventory Summary", category: "inventory",
    apiCall: "inventorySummary", useAsOf: true,
    columns: [
      { key: "itemName", label: "Item Name" },
      { key: "sku", label: "SKU" },
      { key: "reorderLevel", label: "Reorder Level", align: "right", format: "number" },
      { key: "quantityOrdered", label: "Quantity Ordered", align: "right", format: "number" },
      { key: "quantityIn", label: "Quantity In", align: "right", format: "number" },
      { key: "quantityOut", label: "Quantity Out", align: "right", format: "number" },
      { key: "stockOnHand", label: "Stock On Hand", align: "right", format: "number" },
      { key: "committedStock", label: "Committed", align: "right", format: "number" },
      { key: "availableForSale", label: "Available", align: "right", format: "number" },
      { key: "usageUnit", label: "Usage Unit" },
    ],
  },
  {
    id: "committed-stock-details", name: "Committed Stock Details", category: "inventory",
    apiCall: "committedStockDetails", useDateRange: true,
    columns: [
      { key: "salesOrderNumber", label: "SO #" },
      { key: "orderDate", label: "Order Date", format: "date" },
      { key: "expectedShipmentDate", label: "Expected Shipment", format: "date" },
      { key: "customerName", label: "Customer" },
      { key: "itemName", label: "Item" },
      { key: "sku", label: "SKU" },
      { key: "quantityCommitted", label: "Committed Qty", align: "right", format: "number" },
      { key: "committedAmount", label: "Committed Amount", align: "right", format: "currency" },
      { key: "status", label: "Status" },
    ],
  },
  {
    id: "inventory-aging-summary", name: "Inventory Aging Summary", category: "inventory",
    apiCall: "inventoryAgingSummary", useAsOf: true,
    columns: [
      { key: "bucket", label: "Age Bucket" },
      { key: "itemCount", label: "Item Count", align: "right", format: "number" },
      { key: "totalQuantity", label: "Total Qty", align: "right", format: "number" },
      { key: "totalValue", label: "Total Value", align: "right", format: "currency" },
      { key: "oldestAgeDays", label: "Oldest Age (Days)", align: "right", format: "number" },
    ],
  },
  {
    id: "stock-summary", name: "Stock Summary", category: "inventory",
    apiCall: "stockSummary", useAsOf: true,
    columns: [
      { key: "stockStatus", label: "Stock Status" },
      { key: "itemCount", label: "Items", align: "right", format: "number" },
      { key: "totalQuantity", label: "Stock Qty", align: "right", format: "number" },
      { key: "totalCommittedStock", label: "Committed Qty", align: "right", format: "number" },
      { key: "totalAvailableStock", label: "Available Qty", align: "right", format: "number" },
      { key: "totalValue", label: "Stock Value", align: "right", format: "currency" },
    ],
  },
  {
    id: "inventory-adjustment-summary", name: "Inventory Adjustment Summary", category: "inventory",
    apiCall: "inventoryAdjustmentSummary", useDateRange: true,
    columns: [
      { key: "reason", label: "Reason" },
      { key: "adjustmentCount", label: "Adjustments", align: "right", format: "number" },
      { key: "increaseQty", label: "Increase Qty", align: "right", format: "number" },
      { key: "decreaseQty", label: "Decrease Qty", align: "right", format: "number" },
      { key: "netQty", label: "Net Qty", align: "right", format: "number" },
      { key: "increaseValue", label: "Increase Value", align: "right", format: "currency" },
      { key: "decreaseValue", label: "Decrease Value", align: "right", format: "currency" },
      { key: "netValue", label: "Net Value", align: "right", format: "currency" },
    ],
  },
  {
    id: "inventory-adjustment-details", name: "Inventory Adjustment Details", category: "inventory",
    apiCall: "inventoryAdjustmentDetails", useDateRange: true,
    columns: [
      { key: "adjustedAt", label: "Adjusted At", format: "date" },
      { key: "itemName", label: "Item" },
      { key: "sku", label: "SKU" },
      { key: "warehouseName", label: "Warehouse" },
      { key: "direction", label: "Direction" },
      { key: "reason", label: "Reason" },
      { key: "quantityDelta", label: "Qty Delta", align: "right", format: "number" },
      { key: "valueDelta", label: "Value Delta", align: "right", format: "currency" },
      { key: "resultingStockOnHand", label: "Resulting Stock", align: "right", format: "number" },
      { key: "resultingInventoryValue", label: "Resulting Value", align: "right", format: "currency" },
      { key: "referenceNumber", label: "Reference #" },
    ],
  },
  {
    id: "packing-history", name: "Packing History", category: "inventory",
    apiCall: "packingHistory", useDateRange: true,
    columns: [
      { key: "challanNumber", label: "Challan #" },
      { key: "challanDate", label: "Date", format: "date" },
      { key: "customerName", label: "Customer" },
      { key: "salesOrderNumber", label: "SO #" },
      { key: "itemCount", label: "Items", align: "right", format: "number" },
      { key: "totalQuantity", label: "Packed Qty", align: "right", format: "number" },
      { key: "totalAmount", label: "Amount", align: "right", format: "currency" },
      { key: "status", label: "Status" },
      { key: "invoiceStatus", label: "Invoice Status" },
    ],
  },
  {
    id: "shipment-details", name: "Shipment Details", category: "inventory",
    apiCall: "shipmentDetails", useDateRange: true,
    columns: [
      { key: "challanNumber", label: "Challan #" },
      { key: "challanDate", label: "Date", format: "date" },
      { key: "customerName", label: "Customer" },
      { key: "itemName", label: "Item" },
      { key: "quantity", label: "Qty", align: "right", format: "number" },
      { key: "rate", label: "Rate", align: "right", format: "currency" },
      { key: "amount", label: "Amount", align: "right", format: "currency" },
      { key: "shipmentStatus", label: "Shipment Status" },
      { key: "challanStatus", label: "Challan Status" },
      { key: "invoiceStatus", label: "Invoice Status" },
    ],
  },
  {
    id: "inventory-turnover-by-quantity", name: "Inventory Turnover By Quantity", category: "inventory",
    apiCall: "inventoryTurnoverByQuantity", useDateRange: true,
    columns: [
      { key: "itemName", label: "Item" },
      { key: "sku", label: "SKU" },
      { key: "openingStockQty", label: "Opening Qty", align: "right", format: "number" },
      { key: "purchasedQuantity", label: "Purchased Qty", align: "right", format: "number" },
      { key: "soldQuantity", label: "Sold Qty", align: "right", format: "number" },
      { key: "netAdjustmentQty", label: "Adj Qty", align: "right", format: "number" },
      { key: "closingStockQty", label: "Closing Qty", align: "right", format: "number" },
      { key: "averageInventoryQty", label: "Avg Qty", align: "right", format: "number" },
      { key: "turnoverRatio", label: "Turnover Ratio", align: "right", format: "number" },
      { key: "dailyIssueQty", label: "Daily Issue Qty", align: "right", format: "number" },
    ],
  },
  // Inventory Valuation
  {
    id: "inventory-valuation-summary", name: "Inventory Valuation Summary", category: "inventory-valuation",
    apiCall: "inventoryValuationSummary", useAsOf: true,
    columns: [
      { key: "itemName", label: "Item" },
      { key: "sku", label: "SKU" },
      { key: "valuationMethod", label: "Valuation Method" },
      { key: "stockOnHand", label: "Stock On Hand", align: "right", format: "number" },
      { key: "averageCost", label: "Average Cost", align: "right", format: "currency" },
      { key: "inventoryValue", label: "Inventory Value", align: "right", format: "currency" },
      { key: "valueSharePercent", label: "Value Share %", align: "right", format: "number" },
    ],
  },
  {
    id: "fifo-cost-lot-tracking", name: "FIFO Cost Lot Tracking", category: "inventory-valuation",
    apiCall: "fifoCostLotTracking", useDateRange: true,
    columns: [
      { key: "billNumber", label: "Bill #" },
      { key: "billDate", label: "Bill Date", format: "date" },
      { key: "vendorName", label: "Vendor" },
      { key: "itemName", label: "Item" },
      { key: "sku", label: "SKU" },
      { key: "lotQuantity", label: "Lot Qty", align: "right", format: "number" },
      { key: "unitCost", label: "Unit Cost", align: "right", format: "currency" },
      { key: "lotValue", label: "Lot Value", align: "right", format: "currency" },
      { key: "lotAgeDays", label: "Lot Age (Days)", align: "right", format: "number" },
      { key: "valuationMethod", label: "Method" },
    ],
  },
  {
    id: "abc-classification", name: "ABC Classification", category: "inventory-valuation",
    apiCall: "abcClassification", useDateRange: true,
    columns: [
      { key: "itemName", label: "Item" },
      { key: "sku", label: "SKU" },
      { key: "salesQuantity", label: "Sales Qty", align: "right", format: "number" },
      { key: "salesAmount", label: "Sales Amount", align: "right", format: "currency" },
      { key: "salesSharePercent", label: "Sales Share %", align: "right", format: "number" },
      { key: "cumulativeSharePercent", label: "Cumulative %", align: "right", format: "number" },
      { key: "classification", label: "Class" },
      { key: "currentStockOnHand", label: "Current Stock", align: "right", format: "number" },
      { key: "currentInventoryValue", label: "Current Value", align: "right", format: "currency" },
    ],
  },
  {
    id: "inventory-turnover-by-amount", name: "Inventory Turnover By Amount", category: "inventory-valuation",
    apiCall: "inventoryTurnoverByAmount", useDateRange: true,
    columns: [
      { key: "itemName", label: "Item" },
      { key: "sku", label: "SKU" },
      { key: "soldQuantity", label: "Sold Qty", align: "right", format: "number" },
      { key: "salesAmount", label: "Sales", align: "right", format: "currency" },
      { key: "cogsAmount", label: "COGS", align: "right", format: "currency" },
      { key: "grossMarginAmount", label: "Gross Margin", align: "right", format: "currency" },
      { key: "grossMarginPercent", label: "Margin %", align: "right", format: "number" },
      { key: "openingInventoryValue", label: "Opening Value", align: "right", format: "currency" },
      { key: "purchaseAmount", label: "Purchases", align: "right", format: "currency" },
      { key: "netAdjustmentValue", label: "Adj Value", align: "right", format: "currency" },
      { key: "closingInventoryValue", label: "Closing Value", align: "right", format: "currency" },
      { key: "averageInventoryValue", label: "Average Value", align: "right", format: "currency" },
      { key: "turnoverRatio", label: "Turnover Ratio", align: "right", format: "number" },
    ],
  },
];

export const DATE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "this-week", label: "This Week" },
  { value: "this-month", label: "This Month" },
  { value: "this-quarter", label: "This Quarter" },
  { value: "this-year", label: "This Year" },
  { value: "this-financial-year", label: "This Financial Year" },
  { value: "last-month", label: "Last Month" },
  { value: "last-quarter", label: "Last Quarter" },
  { value: "last-year", label: "Last Year" },
  { value: "custom", label: "Custom" },
];
