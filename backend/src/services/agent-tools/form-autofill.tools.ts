export async function generateFormAutofillTool(
  organizationId: string,
  args: {
    formType: "invoice" | "bill" | "customer" | "vendor" | "item" | "expense";
    data: Record<string, any>;
    navigationUrl?: string;
  }
) {
  const formUrls: Record<string, string> = {
    invoice: "/sales/invoices/new",
    bill: "/purchases/bills/new",
    customer: "/sales/customers/new",
    vendor: "/purchases/vendors/new",
    item: "/items/new",
    expense: "/purchases/expenses/new",
  };

  const navUrl = args.navigationUrl || formUrls[args.formType] || "/";

  return {
    success: true,
    formAutofill: {
      formType: args.formType,
      data: args.data,
      navigationUrl: navUrl,
    },
    message: `Generated pre-fill payload for ${args.formType} form.`,
  };
}
