import { searchContactsTool, createCustomerTool, createVendorTool } from "./contact.tools";
import { createInvoiceTool, searchInvoicesTool } from "./invoice.tools";
import { createItemTool, searchItemsTool } from "./item.tools";
import { createExpenseTool } from "./expense.tools";
import { generateFormAutofillTool } from "./form-autofill.tools";

export const AGENT_FUNCTION_DECLARATIONS = [
  {
    name: "search_contacts",
    description: "Search for existing customers or vendors by name, company, email, or GSTIN.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: { type: "STRING", description: "Search query string (name, email, GSTIN)" },
        contactType: { type: "STRING", enum: ["Customer", "Vendor", "Both"], description: "Type of contact to search" },
      },
    },
  },
  {
    name: "create_customer",
    description: "Create a new customer profile in the organization.",
    parameters: {
      type: "OBJECT",
      properties: {
        displayName: { type: "STRING", description: "Customer full name or business name (Required)" },
        companyName: { type: "STRING", description: "Company name if applicable" },
        email: { type: "STRING", description: "Customer email address" },
        phone: { type: "STRING", description: "Contact phone number" },
        gstin: { type: "STRING", description: "15-digit GSTIN tax ID" },
        placeOfSupply: { type: "STRING", description: "State or location of supply" },
      },
      required: ["displayName"],
    },
  },
  {
    name: "create_vendor",
    description: "Create a new vendor profile in the organization.",
    parameters: {
      type: "OBJECT",
      properties: {
        displayName: { type: "STRING", description: "Vendor full name or vendor company name (Required)" },
        companyName: { type: "STRING", description: "Vendor business name" },
        email: { type: "STRING", description: "Vendor email" },
        phone: { type: "STRING", description: "Vendor phone number" },
        gstin: { type: "STRING", description: "Vendor GSTIN" },
      },
      required: ["displayName"],
    },
  },
  {
    name: "create_invoice",
    description: "Create a sales tax invoice for a customer.",
    parameters: {
      type: "OBJECT",
      properties: {
        customerName: { type: "STRING", description: "Name of customer (Required)" },
        itemName: { type: "STRING", description: "Item description or product name" },
        amount: { type: "NUMBER", description: "Total billing amount in INR" },
        rate: { type: "NUMBER", description: "Item rate" },
        quantity: { type: "NUMBER", description: "Quantity of items" },
        description: { type: "STRING", description: "Line item description" },
        invoiceNumber: { type: "STRING", description: "Custom invoice number" },
        status: { type: "STRING", enum: ["Draft", "Sent", "Paid"], description: "Invoice status" },
      },
      required: ["customerName"],
    },
  },
  {
    name: "search_invoices",
    description: "Search invoices by status or invoice number query.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: { type: "STRING", description: "Invoice number query" },
        status: { type: "STRING", description: "Invoice status (e.g. Overdue, Sent, Draft)" },
      },
    },
  },
  {
    name: "create_item",
    description: "Create a new inventory item or service product.",
    parameters: {
      type: "OBJECT",
      properties: {
        name: { type: "STRING", description: "Item product name (Required)" },
        itemType: { type: "STRING", enum: ["Goods", "Service"], description: "Type of item" },
        sku: { type: "STRING", description: "SKU code" },
        sellingPrice: { type: "NUMBER", description: "Selling price in INR" },
        purchasePrice: { type: "NUMBER", description: "Cost purchase price in INR" },
        stockOnHand: { type: "NUMBER", description: "Initial physical stock count" },
        hsnSacCode: { type: "STRING", description: "HSN/SAC Code" },
      },
      required: ["name"],
    },
  },
  {
    name: "search_items",
    description: "Search for inventory items by name or SKU.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: { type: "STRING", description: "Item search query" },
      },
    },
  },
  {
    name: "create_expense",
    description: "Record and log a business expense.",
    parameters: {
      type: "OBJECT",
      properties: {
        amount: { type: "NUMBER", description: "Expense amount in INR (Required)" },
        category: { type: "STRING", description: "Expense category or description" },
        notes: { type: "STRING", description: "Notes or description" },
        vendorName: { type: "STRING", description: "Vendor paid to" },
        date: { type: "STRING", description: "Expense date (YYYY-MM-DD)" },
      },
      required: ["amount"],
    },
  },
  {
    name: "generate_form_autofill",
    description: "Generate a pre-filled form payload for client UI form navigation when the user asks to prepare a form.",
    parameters: {
      type: "OBJECT",
      properties: {
        formType: { type: "STRING", enum: ["invoice", "bill", "customer", "vendor", "item", "expense"], description: "Form type" },
        data: { type: "OBJECT", description: "Key-value pair field data for the form" },
        navigationUrl: { type: "STRING", description: "Target UI navigation URL" },
      },
      required: ["formType", "data"],
    },
  },
];

export async function executeAgentTool(
  toolName: string,
  args: any,
  organizationId: string
): Promise<any> {
  switch (toolName) {
    case "search_contacts":
      return await searchContactsTool(organizationId, args);

    case "create_customer":
      return await createCustomerTool(organizationId, args);

    case "create_vendor":
      return await createVendorTool(organizationId, args);

    case "create_invoice":
      return await createInvoiceTool(organizationId, args);

    case "search_invoices":
      return await searchInvoicesTool(organizationId, args);

    case "create_item":
      return await createItemTool(organizationId, args);

    case "search_items":
      return await searchItemsTool(organizationId, args);

    case "create_expense":
      return await createExpenseTool(organizationId, args);

    case "generate_form_autofill":
      return await generateFormAutofillTool(organizationId, args);

    default:
      throw new Error(`Unknown agent tool function: "${toolName}"`);
  }
}
