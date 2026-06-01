"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useOrganization } from "@/contexts/organization-context";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

import { contactApi, type Contact } from "@/lib/api/contacts";
import { itemApi, type Item } from "@/lib/api/items";
import { getItemTaxForTransaction } from "@/lib/item-tax-linkage";
import {
  recurringInvoiceApi,
  type CreateRecurringInvoiceInput,
  type RecurringInvoice,
  type RecurringInvoiceFrequency,
  type RecurringInvoiceStatus,
  type UpdateRecurringInvoiceInput,
} from "@/lib/api/recurring-invoices";
import {
  settingsApi,
  type PaymentTerms,
  type SalesPerson,
  type Tax,
} from "@/lib/api/settings";
import { toast } from "sonner";
import { formatMoney, multiplyMoney, percentMoney, roundMoney, subtractMoney, sumMoney } from "@/lib/money";

interface RecurringInvoiceFormProps {
  mode: "create" | "edit";
  recurringId?: string;
}

interface LineItem {
  key: number;
  itemId: string;
  name: string;
  description: string;
  hsnSacCode: string;
  quantity: number;
  rate: number;
  discountPercent: number;
  taxId: string;
  taxPercent: number;
  accountId: string;
}

const FREQUENCY_OPTIONS: Array<{
  value: RecurringInvoiceFrequency;
  label: string;
  hint: string;
}> = [
  { value: "weekly", label: "Weekly", hint: "Every 7 days" },
  { value: "every_10_days", label: "Every 10 Days", hint: "Every 10 days" },
  { value: "every_15_days", label: "Every 15 Days", hint: "Every 15 days" },
  { value: "monthly", label: "Monthly", hint: "Same day every month" },
];

let lineKeyCounter = 1;

function newLine(): LineItem {
  return {
    key: lineKeyCounter++,
    itemId: "",
    name: "",
    description: "",
    hsnSacCode: "",
    quantity: 1,
    rate: 0,
    discountPercent: 0,
    taxId: "",
    taxPercent: 0,
    accountId: "",
  };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function getRefId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "_id" in value) {
    return String((value as { _id: string })._id);
  }
  return "";
}

function calcLineAmount(line: LineItem) {
  const lineTotal = multiplyMoney(line.quantity, line.rate);
  const discountAmount = percentMoney(lineTotal, line.discountPercent);
  return Math.max(0, subtractMoney(lineTotal, discountAmount));
}

function formatCurrency(value: number) {
  return `₹${formatMoney(value)}`;
}

function addDays(dateString: string, days: number) {
  const next = new Date(dateString);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

function addMonthly(dateString: string) {
  const current = new Date(dateString);
  const preferredDay = current.getDate();
  const targetMonth = current.getMonth() + 1;
  const targetYear = current.getFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = targetMonth % 12;
  const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  return new Date(targetYear, normalizedMonth, Math.min(preferredDay, lastDay))
    .toISOString()
    .slice(0, 10);
}

function getNextRunPreview(
  startDate: string,
  frequency: RecurringInvoiceFrequency,
) {
  if (!startDate) return "";
  switch (frequency) {
    case "weekly":
      return addDays(startDate, 7);
    case "every_10_days":
      return addDays(startDate, 10);
    case "every_15_days":
      return addDays(startDate, 15);
    case "monthly":
      return addMonthly(startDate);
    default:
      return "";
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function RecurringInvoiceForm({
  mode,
  recurringId,
}: RecurringInvoiceFormProps) {
  const router = useRouter();
  const { activeOrganization } = useOrganization();
  const isEdit = mode === "edit";

  const [masterLoading, setMasterLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [customers, setCustomers] = useState<Contact[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [salesPersons, setSalesPersons] = useState<SalesPerson[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [paymentTermsList, setPaymentTermsList] = useState<PaymentTerms[]>([]);

  const [customerId, setCustomerId] = useState("");
  const [profileName, setProfileName] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState("");
  const [neverExpires, setNeverExpires] = useState(true);
  const [frequency, setFrequency] =
    useState<RecurringInvoiceFrequency>("weekly");
  const [paymentTermsId, setPaymentTermsId] = useState("");
  const [salesPersonId, setSalesPersonId] = useState("");
  const [subject, setSubject] = useState("");
  const [lines, setLines] = useState<LineItem[]>([newLine()]);
  const [discountType, setDiscountType] = useState<"percent" | "amount">(
    "percent",
  );
  const [discountValue, setDiscountValue] = useState(0);
  const [taxType, setTaxType] = useState<"TDS" | "TCS" | "none">("TDS");
  const [totalTaxId, setTotalTaxId] = useState("");
  const [adjustmentLabel, setAdjustmentLabel] = useState("Adjustment");
  const [adjustmentAmount, setAdjustmentAmount] = useState(0);
  const [customerNotes, setCustomerNotes] = useState(
    "Thanks for your business.",
  );
  const [termsAndConditions, setTermsAndConditions] = useState("");
  const [emailContactsInput, setEmailContactsInput] = useState("");
  const [deliveryMode, setDeliveryMode] = useState<"draft" | "send">("draft");
  const [status, setStatus] = useState<RecurringInvoiceStatus>("active");

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setMasterLoading(true);
      try {
        const requests = await Promise.allSettled([
          contactApi.list({ type: "Customer", page: 1, limit: 500 }),
          itemApi.list({ page: 1, limit: 500 }),
          settingsApi.salesPersons.list(),
          settingsApi.taxes.list(),
          settingsApi.paymentTerms.list(),
          isEdit && recurringId ?
            recurringInvoiceApi.getById(recurringId)
          : Promise.resolve(null),
        ]);

        if (cancelled) return;

        const [
          customersRes,
          itemsRes,
          salesPersonsRes,
          taxesRes,
          paymentTermsRes,
          recurringRes,
        ] = requests;

        if (customersRes.status === "fulfilled") {
          setCustomers(customersRes.value.data ?? []);
        }
        if (itemsRes.status === "fulfilled") {
          setItems(itemsRes.value.data ?? []);
        }
        if (salesPersonsRes.status === "fulfilled") {
          setSalesPersons(salesPersonsRes.value.data ?? []);
        }
        if (taxesRes.status === "fulfilled") {
          setTaxes(taxesRes.value.data ?? []);
        }
        if (paymentTermsRes.status === "fulfilled") {
          setPaymentTermsList(paymentTermsRes.value.data ?? []);
        }

        if (
          recurringRes &&
          recurringRes.status === "fulfilled" &&
          recurringRes.value
        ) {
          const recurring = recurringRes.value.data as RecurringInvoice;
          setCustomerId(getRefId(recurring.customerId));
          setProfileName(recurring.profileName || "");
          setReferenceNumber(recurring.referenceNumber || "");
          setOrderNumber(recurring.orderNumber || "");
          setStartDate(formatDateInput(recurring.startDate) || todayISO());
          setEndDate(formatDateInput(recurring.endDate));
          setNeverExpires(recurring.neverExpires);
          setFrequency(recurring.frequency);
          setPaymentTermsId(getRefId(recurring.paymentTermsId));
          setSalesPersonId(getRefId(recurring.salesPersonId));
          setSubject(recurring.subject || "");
          setDiscountType(recurring.discountType || "percent");
          setDiscountValue(recurring.discountValue || 0);
          setTaxType(recurring.taxType || "none");
          setTotalTaxId(getRefId(recurring.taxId));
          setAdjustmentLabel(recurring.adjustmentLabel || "Adjustment");
          setAdjustmentAmount(recurring.adjustmentAmount || 0);
          setCustomerNotes(recurring.customerNotes || "");
          setTermsAndConditions(recurring.termsAndConditions || "");
          setEmailContactsInput((recurring.emailContacts || []).join(", "));
          setDeliveryMode(recurring.deliveryMode || "draft");
          setStatus(recurring.status || "active");

          if (recurring.items?.length) {
            setLines(
              recurring.items.map((item) => ({
                key: lineKeyCounter++,
                itemId: getRefId(item.itemId),
                name: item.name,
                description: item.description || "",
                hsnSacCode: item.hsnSacCode || "",
                quantity: item.quantity || 1,
                rate: item.rate || 0,
                discountPercent: item.discountPercent || 0,
                taxId: getRefId(item.taxId),
                taxPercent: item.taxPercent || 0,
                accountId: getRefId(item.accountId),
              })),
            );
          }
        }
      } catch (error: unknown) {
        toast.error(
          getErrorMessage(error, "Failed to load recurring invoice form"),
        );
      } finally {
        if (!cancelled) setMasterLoading(false);
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [isEdit, recurringId]);

  useEffect(() => {
    if (!customerId || emailContactsInput.trim()) return;
    const customer = customers.find((entry) => entry._id === customerId);
    if (customer?.email) {
      setEmailContactsInput(customer.email);
    }
  }, [customerId, customers, emailContactsInput]);

  function updateLine(
    key: number,
    field: keyof LineItem,
    value: string | number,
  ) {
    setLines((current) =>
      current.map((line) =>
        line.key === key ? { ...line, [field]: value } : line,
      ),
    );
  }

  function removeLine(key: number) {
    setLines((current) => {
      const next = current.filter((line) => line.key !== key);
      return next.length > 0 ? next : [newLine()];
    });
  }

  function addLine() {
    setLines((current) => [...current, newLine()]);
  }

  const selectedCustomer = customers.find((entry) => entry._id === customerId);

  function handleItemSelect(key: number, itemId: string) {
    const selectedItem = items.find((item) => item._id === itemId);
    if (!selectedItem) return;

    const linkedTax = getItemTaxForTransaction({
      item: selectedItem,
      contact: selectedCustomer,
      organizationState: activeOrganization?.address?.state,
      taxes,
    });

    setLines((current) =>
      current.map((line) =>
        line.key === key ?
          {
            ...line,
            itemId: selectedItem._id,
            name: selectedItem.name,
            description: selectedItem.description || "",
            hsnSacCode: selectedItem.hsnSacCode || "",
            rate: selectedItem.sellingPrice || 0,
            taxId: linkedTax.taxId,
            taxPercent: linkedTax.taxPercent,
          }
        : line,
      ),
    );
  }

  useEffect(() => {
    if (!lines.some((line) => line.itemId)) return;
    setLines((current) => {
      let changed = false;
      const next = current.map((line) => {
        if (!line.itemId) return line;
        const item = items.find((entry) => entry._id === line.itemId);
        if (!item) return line;
        const linkedTax = getItemTaxForTransaction({
          item,
          contact: selectedCustomer,
          organizationState: activeOrganization?.address?.state,
          taxes,
        });
        if (line.taxId === linkedTax.taxId && Number(line.taxPercent || 0) === Number(linkedTax.taxPercent || 0)) {
          return line;
        }
        changed = true;
        return {
          ...line,
          taxId: linkedTax.taxId,
          taxPercent: linkedTax.taxPercent,
        };
      });
      return changed ? next : current;
    });
  }, [customerId, selectedCustomer, activeOrganization?.address?.state, items, taxes]);

  const subTotal = sumMoney(lines.map((line) => multiplyMoney(line.quantity, line.rate)));
  const discountAmount =
    discountType === "percent" ?
      percentMoney(subTotal, discountValue)
    : roundMoney(discountValue);
  const selectedTax = taxes.find((tax) => tax._id === totalTaxId);
  const taxAmount =
    selectedTax ? percentMoney(subTotal, selectedTax.rate || 0) : 0;
  const taxSignedAmount =
    taxType === "TCS" ? taxAmount
    : taxType === "TDS" ? -taxAmount
    : 0;
  const total = sumMoney([subTotal, -discountAmount, taxSignedAmount, adjustmentAmount]);
  const nextRunPreview = getNextRunPreview(startDate, frequency);

  async function handleSave() {
    if (!profileName.trim()) {
      toast.error("Profile name is required");
      return;
    }
    if (!customerId) {
      toast.error("Please select a customer");
      return;
    }

    const validLines = lines.filter((line) => line.name.trim());
    if (validLines.length === 0) {
      toast.error("Please add at least one line item");
      return;
    }

    if (!neverExpires && endDate && endDate < startDate) {
      toast.error("End date cannot be before the start date");
      return;
    }

    setSaving(true);
    try {
      const payload: CreateRecurringInvoiceInput = {
        profileName: profileName.trim(),
        referenceNumber: referenceNumber.trim() || undefined,
        orderNumber: orderNumber.trim() || undefined,
        customerId,
        startDate,
        endDate: neverExpires ? null : endDate || null,
        neverExpires,
        frequency,
        paymentTermsId: paymentTermsId || null,
        salesPersonId: salesPersonId || null,
        subject: subject.trim() || undefined,
        items: validLines.map((line) => ({
          itemId: line.itemId || null,
          name: line.name,
          description: line.description,
          hsnSacCode: line.hsnSacCode,
          quantity: line.quantity,
          rate: line.rate,
          discountPercent: line.discountPercent,
          taxId: line.taxId || null,
          taxPercent: line.taxPercent,
          accountId: line.accountId || null,
          projectId: null,
        })),
        discountType,
        discountValue,
        taxType,
        taxId: totalTaxId || null,
        taxAmount,
        adjustmentLabel,
        adjustmentAmount,
        customerNotes,
        termsAndConditions,
        emailContacts: emailContactsInput
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        deliveryMode,
        status,
      };

      if (isEdit && recurringId) {
        const updatePayload: UpdateRecurringInvoiceInput = payload;
        await recurringInvoiceApi.update(recurringId, updatePayload);
        toast.success("Recurring invoice profile updated");
        router.push(`/sales/recurring-invoices/${recurringId}`);
      } else {
        const response = await recurringInvoiceApi.create(payload);
        toast.success("Recurring invoice profile created");
        router.push(`/sales/recurring-invoices/${response.data._id}`);
      }
    } catch (error: unknown) {
      toast.error(
        getErrorMessage(error, "Failed to save recurring invoice profile"),
      );
    } finally {
      setSaving(false);
    }
  }

  if (masterLoading) {
    return (
      <div className="flex min-h-80 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Recurring Profile</CardTitle>
            <CardDescription>
              Define when invoices should be generated and how they should be
              delivered.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select
                value={customerId || undefined}
                onValueChange={setCustomerId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer._id} value={customer._id}>
                      {customer.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Profile Name</Label>
              <Input
                value={profileName}
                onChange={(event) => setProfileName(event.target.value)}
                placeholder="Website Retainer"
              />
            </div>

            <div className="space-y-2">
              <Label>Reference Number</Label>
              <Input
                value={referenceNumber}
                onChange={(event) => setReferenceNumber(event.target.value)}
                placeholder="Optional reference"
              />
            </div>

            <div className="space-y-2">
              <Label>Order Number</Label>
              <Input
                value={orderNumber}
                onChange={(event) => setOrderNumber(event.target.value)}
                placeholder="Optional order number"
              />
            </div>

            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select
                value={frequency}
                onValueChange={(value) =>
                  setFrequency(value as RecurringInvoiceFrequency)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {
                  FREQUENCY_OPTIONS.find((option) => option.value === frequency)
                    ?.hint
                }
              </p>
            </div>

            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>End Date</Label>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Switch
                    checked={neverExpires}
                    onCheckedChange={setNeverExpires}
                    size="sm"
                  />
                  Never expires
                </div>
              </div>
              <Input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                disabled={neverExpires}
              />
            </div>

            <div className="space-y-2">
              <Label>Payment Terms</Label>
              <Select
                value={paymentTermsId || "__none"}
                onValueChange={(value) =>
                  setPaymentTermsId(value === "__none" ? "" : value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payment terms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {paymentTermsList.map((term) => (
                    <SelectItem key={term._id} value={term._id}>
                      {term.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Salesperson</Label>
              <Select
                value={salesPersonId || "__none"}
                onValueChange={(value) =>
                  setSalesPersonId(value === "__none" ? "" : value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select salesperson" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {salesPersons.map((salesPerson) => (
                    <SelectItem key={salesPerson._id} value={salesPerson._id}>
                      {salesPerson.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Subject</Label>
              <Input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="What the recurring invoice is for"
              />
            </div>

            <div className="space-y-2">
              <Label>Delivery Mode</Label>
              <Select
                value={deliveryMode}
                onValueChange={(value) =>
                  setDeliveryMode(value as "draft" | "send")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">
                    Create child invoices as drafts
                  </SelectItem>
                  <SelectItem value="send">
                    Create and email child invoices
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Profile Status</Label>
              <Select
                value={status}
                onValueChange={(value) =>
                  setStatus(value as RecurringInvoiceStatus)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="stopped">Stopped</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Email Recipients</Label>
              <Input
                value={emailContactsInput}
                onChange={(event) => setEmailContactsInput(event.target.value)}
                placeholder="customer@example.com, accounts@example.com"
              />
              <p className="text-xs text-muted-foreground">
                Used when delivery mode is set to auto-send.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invoice Template</CardTitle>
            <CardDescription>
              These line items and totals are copied into each generated
              invoice.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-60">Item</TableHead>
                    <TableHead className="min-w-55">Description</TableHead>
                    <TableHead className="w-22.5">Qty</TableHead>
                    <TableHead className="w-27.5">Rate</TableHead>
                    <TableHead className="w-27.5">Disc %</TableHead>
                    <TableHead className="w-30 text-right">Amount</TableHead>
                    <TableHead className="w-14" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.key}>
                      <TableCell className="space-y-2 align-top">
                        <Select
                          value={line.itemId || "__custom"}
                          onValueChange={(value) => {
                            if (value === "__custom") {
                              updateLine(line.key, "itemId", "");
                              return;
                            }
                            handleItemSelect(line.key, value);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select item" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__custom">
                              Custom line
                            </SelectItem>
                            {items.map((item) => (
                              <SelectItem key={item._id} value={item._id}>
                                {item.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          value={line.name}
                          onChange={(event) =>
                            updateLine(line.key, "name", event.target.value)
                          }
                          placeholder="Line item name"
                        />
                      </TableCell>
                      <TableCell className="align-top">
                        <Textarea
                          value={line.description}
                          onChange={(event) =>
                            updateLine(
                              line.key,
                              "description",
                              event.target.value,
                            )
                          }
                          placeholder="Description"
                          className="min-h-24"
                        />
                      </TableCell>
                      <TableCell className="align-top">
                        <Input
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(event) =>
                            updateLine(
                              line.key,
                              "quantity",
                              Number(event.target.value) || 1,
                            )
                          }
                        />
                      </TableCell>
                      <TableCell className="align-top">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.rate}
                          onChange={(event) =>
                            updateLine(
                              line.key,
                              "rate",
                              Number(event.target.value) || 0,
                            )
                          }
                        />
                      </TableCell>
                      <TableCell className="align-top">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.discountPercent}
                          onChange={(event) =>
                            updateLine(
                              line.key,
                              "discountPercent",
                              Number(event.target.value) || 0,
                            )
                          }
                        />
                      </TableCell>
                      <TableCell className="align-top text-right font-medium">
                        {formatCurrency(calcLineAmount(line))}
                      </TableCell>
                      <TableCell className="align-top">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLine(line.key)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <Button type="button" variant="outline" onClick={addLine}>
              <Plus className="mr-2 h-4 w-4" />
              Add New Row
            </Button>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label>Discount Type</Label>
                <Select
                  value={discountType}
                  onValueChange={(value) =>
                    setDiscountType(value as "percent" | "amount")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percent</SelectItem>
                    <SelectItem value="amount">Amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Discount Value</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={discountValue}
                  onChange={(event) =>
                    setDiscountValue(Number(event.target.value) || 0)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Tax Type</Label>
                <Select
                  value={taxType}
                  onValueChange={(value) =>
                    setTaxType(value as "TDS" | "TCS" | "none")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TDS">TDS</SelectItem>
                    <SelectItem value="TCS">TCS</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Total Tax</Label>
                <Select
                  value={totalTaxId || "__none"}
                  onValueChange={(value) =>
                    setTotalTaxId(value === "__none" ? "" : value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select tax" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">None</SelectItem>
                    {taxes.map((tax) => (
                      <SelectItem key={tax._id} value={tax._id}>
                        {tax.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Adjustment Label</Label>
                <Input
                  value={adjustmentLabel}
                  onChange={(event) => setAdjustmentLabel(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Adjustment Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={adjustmentAmount}
                  onChange={(event) =>
                    setAdjustmentAmount(Number(event.target.value) || 0)
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
            <CardDescription>
              These notes appear on each generated invoice.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Customer Notes</Label>
              <Textarea
                value={customerNotes}
                onChange={(event) => setCustomerNotes(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Terms and Conditions</Label>
              <Textarea
                value={termsAndConditions}
                onChange={(event) => setTermsAndConditions(event.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="xl:sticky xl:top-6">
          <CardHeader>
            <CardTitle>Summary</CardTitle>
            <CardDescription>
              Review the schedule and amount before saving the profile.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(subTotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span>{formatCurrency(discountAmount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {taxType === "none" ? "Tax" : taxType}
                </span>
                <span>{formatCurrency(taxSignedAmount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Adjustment</span>
                <span>{formatCurrency(adjustmentAmount)}</span>
              </div>
            </div>

            <Separator />

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between font-medium">
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Frequency</span>
                <span>
                  {FREQUENCY_OPTIONS.find(
                    (option) => option.value === frequency,
                  )?.label || "Weekly"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Starts</span>
                <span>{startDate || "-"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Next cycle</span>
                <span>{nextRunPreview || "-"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Delivery</span>
                <span>
                  {deliveryMode === "send" ? "Auto-send" : "Draft only"}
                </span>
              </div>
            </div>

            <Separator />

            <div className="flex flex-col gap-3">
              <Button onClick={handleSave} disabled={saving}>
                {saving ?
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : null}
                {isEdit ? "Update Profile" : "Create Profile"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  router.push(
                    isEdit && recurringId ?
                      `/sales/recurring-invoices/${recurringId}`
                    : "/sales/recurring-invoices",
                  )
                }
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
