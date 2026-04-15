"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Trash2,
  Settings,
  Upload,
  X,
  ChevronDown,
  ScanBarcode,
  Search,
  Monitor,
  FolderOpen,
  Cloud,
  RefreshCw,
  Image as ImageIcon,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { contactApi, type Contact } from "@/lib/api/contacts";
import { itemApi, type Item, type CreateItemInput } from "@/lib/api/items";
import { getItemTaxForTransaction } from "@/lib/item-tax-linkage";
import { invoiceApi, type CreateInvoiceInput } from "@/lib/api/invoices";
import {
  settingsApi,
  type SalesPerson,
  type Tax,
  type PaymentTerms,
} from "@/lib/api/settings";
import { toast } from "sonner";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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

function calcLineAmount(l: LineItem) {
  const lineTotal = l.quantity * l.rate;
  const discAmt = (lineTotal * l.discountPercent) / 100;
  const afterDisc = lineTotal - discAmt;
  const taxAmt = (afterDisc * l.taxPercent) / 100;
  return { lineTotal, discAmt, afterDisc, taxAmt, amount: afterDisc + taxAmt };
}

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

// ─── New Item Modal ─────────────────────────────────────────────────────

interface NewItemModalProps {
  open: boolean;
  onClose: () => void;
  onItemCreated: (item: Item) => void;
}

function NewItemModal({ open, onClose, onItemCreated }: NewItemModalProps) {
  const [name, setName] = useState("");
  const [itemType, setItemType] = useState<"Goods" | "Service">("Goods");
  const [unit, setUnit] = useState("");
  const [sellingPrice, setSellingPrice] = useState<number | "">("");
  const [salesDescription, setSalesDescription] = useState("");
  const [costPrice, setCostPrice] = useState<number | "">("");
  const [purchaseDescription, setPurchaseDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [hasSalesInfo, setHasSalesInfo] = useState(true);
  const [hasPurchaseInfo, setHasPurchaseInfo] = useState(true);

  function reset() {
    setName("");
    setItemType("Goods");
    setUnit("");
    setSellingPrice("");
    setSalesDescription("");
    setCostPrice("");
    setPurchaseDescription("");
    setHasSalesInfo(true);
    setHasPurchaseInfo(true);
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Item name is required");
      return;
    }
    if (hasSalesInfo && sellingPrice === "") {
      toast.error("Selling price is required");
      return;
    }
    setSaving(true);
    try {
      const payload: CreateItemInput = {
        name: name.trim(),
        itemType,
        unit: unit || undefined,
        sellingPrice:
          hasSalesInfo && sellingPrice !== "" ?
            Number(sellingPrice)
          : undefined,
        description: salesDescription || undefined,
        costPrice:
          hasPurchaseInfo && costPrice !== "" ? Number(costPrice) : undefined,
      };
      const res = await itemApi.create(payload);
      onItemCreated(res.data);
      reset();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Failed to create item");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Item</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Top section: Name, Type, Unit + Image */}
          <div className="grid grid-cols-[1fr_240px] gap-6">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-red-600">
                  Name<span className="text-red-500">*</span>
                </Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter item name"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="newItemType"
                      value="Goods"
                      checked={itemType === "Goods"}
                      onChange={() => setItemType("Goods")}
                      className="accent-primary"
                    />
                    Goods
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="newItemType"
                      value="Service"
                      checked={itemType === "Service"}
                      onChange={() => setItemType("Service")}
                      className="accent-primary"
                    />
                    Service
                  </label>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Input
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="Select or type to add"
                />
              </div>
            </div>

            {/* Image upload placeholder */}
            <div className="flex items-start justify-center">
              <div className="w-48 h-40 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <ImageIcon className="h-10 w-10 opacity-40" />
                <span className="text-xs text-center">
                  Drag image(s) here or
                </span>
                <Button variant="link" size="sm" className="text-xs h-auto p-0">
                  Browse images
                </Button>
              </div>
            </div>
          </div>

          <Separator />

          {/* Sales Information */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="salesInfo"
                checked={hasSalesInfo}
                onCheckedChange={(c) => setHasSalesInfo(c === true)}
              />
              <Label
                htmlFor="salesInfo"
                className="font-semibold cursor-pointer"
              >
                Sales Information
              </Label>
            </div>
            {hasSalesInfo && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-red-600">
                    Selling Price<span className="text-red-500">*</span>
                  </Label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 bg-muted text-sm text-muted-foreground">
                      INR
                    </span>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="rounded-l-none"
                      value={sellingPrice}
                      onChange={(e) =>
                        setSellingPrice(
                          e.target.value === "" ?
                            ""
                          : parseFloat(e.target.value),
                        )
                      }
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-red-600">
                    Account<span className="text-red-500">*</span>
                  </Label>
                  <Select defaultValue="sales">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sales">Sales</SelectItem>
                      <SelectItem value="other-income">Other Income</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Description</Label>
                  <textarea
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[60px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                    value={salesDescription}
                    onChange={(e) => setSalesDescription(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Purchase Information */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="purchaseInfo"
                checked={hasPurchaseInfo}
                onCheckedChange={(c) => setHasPurchaseInfo(c === true)}
              />
              <Label
                htmlFor="purchaseInfo"
                className="font-semibold cursor-pointer"
              >
                Purchase Information
              </Label>
            </div>
            {hasPurchaseInfo && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-red-600">
                    Cost Price<span className="text-red-500">*</span>
                  </Label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 bg-muted text-sm text-muted-foreground">
                      INR
                    </span>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="rounded-l-none"
                      value={costPrice}
                      onChange={(e) =>
                        setCostPrice(
                          e.target.value === "" ?
                            ""
                          : parseFloat(e.target.value),
                        )
                      }
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-red-600">
                    Account<span className="text-red-500">*</span>
                  </Label>
                  <Select defaultValue="cogs">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cogs">Cost of Goods Sold</SelectItem>
                      <SelectItem value="expense">Expense</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <textarea
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[60px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                    value={purchaseDescription}
                    onChange={(e) => setPurchaseDescription(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Preferred Vendor</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">None</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 pt-4">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Save
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Items in Bulk Modal ────────────────────────────────────────────

interface BulkItemsModalProps {
  open: boolean;
  onClose: () => void;
  items: Item[];
  onAddItems: (selectedItems: Item[]) => void;
}

function BulkItemsModal({
  open,
  onClose,
  items,
  onAddItems,
}: BulkItemsModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filtered = items.filter(
    (item) =>
      !searchQuery ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.sku?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  function toggleItem(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleAdd() {
    const selected = items.filter((i) => selectedIds.has(i._id));
    onAddItems(selected);
    setSelectedIds(new Set());
    setSearchQuery("");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            Add Items in Bulk
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-[1fr_1fr] gap-4 min-h-[400px]">
          {/* Left: Search & Item List */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Type to search or scan the barcode of the item"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="border rounded-lg h-[340px] overflow-y-auto">
              {filtered.length === 0 ?
                <div className="flex items-center justify-center h-full text-sm text-orange-500">
                  No results found. Try a different keyword.
                </div>
              : <div className="divide-y">
                  {filtered.map((item) => (
                    <label
                      key={item._id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedIds.has(item._id)}
                        onCheckedChange={() => toggleItem(item._id)}
                      />
                      <div>
                        <div className="text-sm font-medium">{item.name}</div>
                        {item.sku && (
                          <div className="text-xs text-muted-foreground">
                            SKU: {item.sku}
                          </div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              }
            </div>
          </div>

          {/* Right: Selected Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">
                Selected Items{" "}
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs">
                  {selectedIds.size}
                </span>
              </span>
              <span className="text-sm text-muted-foreground">
                Total Quantity: {selectedIds.size}
              </span>
            </div>
            <div className="border rounded-lg h-[340px] overflow-y-auto">
              {selectedIds.size === 0 ?
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground px-4 text-center">
                  Click the item names from the left pane to select them
                </div>
              : <div className="divide-y">
                  {items
                    .filter((i) => selectedIds.has(i._id))
                    .map((item) => (
                      <div
                        key={item._id}
                        className="flex items-center justify-between px-3 py-2"
                      >
                        <span className="text-sm">{item.name}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => toggleItem(item._id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                </div>
              }
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button onClick={handleAdd} disabled={selectedIds.size === 0}>
            Add Items
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Send Email Modal ───────────────────────────────────────────────────

interface SendEmailModalProps {
  open: boolean;
  onClose: () => void;
  invoiceNumber: string;
  customerName: string;
  customerEmail: string;
  total: number;
  invoiceDate: string;
  onSend: (data: {
    to: string[];
    cc: string[];
    subject: string;
    body: string;
    attachPdf: boolean;
  }) => void;
  sending: boolean;
}

function SendEmailModal({
  open,
  onClose,
  invoiceNumber,
  customerName,
  customerEmail,
  total,
  invoiceDate,
  onSend,
  sending,
}: SendEmailModalProps) {
  const { activeOrganization } = useOrganization();
  const [to, setTo] = useState(customerEmail);
  const [cc, setCc] = useState("");
  const [showBcc, setShowBcc] = useState(false);
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState(`Invoice - ${invoiceNumber} from HAI`);
  const [attachPdf, setAttachPdf] = useState(true);
  const [attachStatement, setAttachStatement] = useState(false);

  useEffect(() => {
    setTo(customerEmail);
    setCc("");
    setSubject(`Invoice - ${invoiceNumber} from HAI`);
  }, [customerEmail, invoiceNumber]);

  const formattedTotal = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(total);

  const formattedDate = new Date(invoiceDate).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Email To {customerName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* From */}
          <div className="grid grid-cols-[80px_1fr] items-center gap-2 text-sm">
            <span className="text-muted-foreground">From</span>
            <span className="text-foreground font-medium">
              {activeOrganization?.name || "Your Organization"}{" "}
              <span className="text-xs text-muted-foreground">
                (via SMTP settings)
              </span>
            </span>
          </div>

          {/* To */}
          <div className="grid grid-cols-[80px_1fr] items-center gap-2 text-sm">
            <Label className="text-muted-foreground text-sm font-normal">
              Send To
            </Label>
            <div className="space-y-1">
              <Input
                type="email"
                placeholder="customer@example.com"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-8 text-sm"
              />
              {!to && (
                <p className="text-xs text-red-500">
                  No email on record for this customer. Enter the recipient
                  email above.
                </p>
              )}
            </div>
          </div>

          {/* Cc */}
          <div className="grid grid-cols-[80px_1fr] items-center gap-2 text-sm">
            <Label className="text-muted-foreground text-sm font-normal">
              Cc
            </Label>
            <Input
              type="email"
              placeholder="optional@example.com"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          {/* Bcc */}
          {showBcc && (
            <div className="grid grid-cols-[80px_1fr] items-center gap-2 text-sm">
              <span className="text-muted-foreground">Bcc</span>
              <Input
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                placeholder="Enter email"
                className="h-8 text-sm"
              />
            </div>
          )}

          {/* Subject */}
          <div className="grid grid-cols-[80px_1fr] items-center gap-2 text-sm">
            <span className="text-muted-foreground">Subject</span>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          {/* Email Body Preview */}
          <div className="border rounded-lg overflow-hidden">
            {/* Toolbar placeholder */}
            <div className="flex items-center gap-1 px-3 py-2 border-b bg-muted/30">
              <span className="text-xs text-muted-foreground font-medium">
                B
              </span>
              <span className="text-xs text-muted-foreground italic">I</span>
              <span className="text-xs text-muted-foreground underline">U</span>
              <span className="text-xs text-muted-foreground line-through">
                S
              </span>
              <Separator orientation="vertical" className="h-3 mx-1" />
              <span className="text-xs text-muted-foreground">16px</span>
              <span className="text-xs text-muted-foreground ml-2">Arial</span>
            </div>

            {/* Email content */}
            <div className="p-6 space-y-4 bg-gray-50">
              {/* Invoice Header Banner */}
              <div className="bg-blue-600 text-white text-center py-4 rounded">
                <h2 className="text-lg font-semibold">
                  Invoice #{invoiceNumber}
                </h2>
              </div>

              <p className="text-sm">Dear {customerName},</p>
              <p className="text-sm">
                Thank you for your business. Your invoice can be viewed, printed
                and downloaded as PDF from the link below. You can also choose
                to pay it online.
              </p>

              {/* Invoice Summary Card */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center space-y-3">
                <div className="text-xs font-bold uppercase tracking-wide text-gray-600">
                  Invoice Amount
                </div>
                <div className="text-2xl font-bold text-red-600">
                  {formattedTotal}
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-2 text-xs text-left max-w-xs mx-auto">
                  <span className="text-muted-foreground">Invoice No</span>
                  <span className="font-semibold text-right">
                    {invoiceNumber}
                  </span>
                  <span className="text-muted-foreground">Invoice Date</span>
                  <span className="font-semibold text-right">
                    {formattedDate}
                  </span>
                  <span className="text-muted-foreground">Due Date</span>
                  <span className="font-semibold text-right">
                    {formattedDate}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Attachments */}
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={attachStatement}
                onCheckedChange={(c) => setAttachStatement(c === true)}
              />
              Attach Customer Statement
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={attachPdf}
                onCheckedChange={(c) => setAttachPdf(c === true)}
              />
              Attach Invoice PDF
              {attachPdf && (
                <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="text-red-500">&#x25A0;</span> {invoiceNumber}
                </span>
              )}
            </label>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button
            onClick={() =>
              onSend({
                to: to ? [to] : [],
                cc: cc ? [cc] : [],
                subject,
                body: "",
                attachPdf,
              })
            }
            disabled={sending}
          >
            {sending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Send
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────

export default function NewInvoicePage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization } = useOrganization();

  // Master data
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [salesPersons, setSalesPersons] = useState<SalesPerson[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [paymentTermsList, setPaymentTermsList] = useState<PaymentTerms[]>([]);
  const [masterLoading, setMasterLoading] = useState(true);

  // Form state
  const [customerId, setCustomerId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(todayISO());
  const [paymentTermsId, setPaymentTermsId] = useState("");
  const [salesPersonId, setSalesPersonId] = useState("");
  const [subject, setSubject] = useState("");

  // Items table
  const [lines, setLines] = useState<LineItem[]>([newLine()]);

  // Totals section
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

  // Extra sections
  const [paymentReceived, setPaymentReceived] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [emailContacts, setEmailContacts] = useState<string[]>([]);
  const [newEmailContact, setNewEmailContact] = useState("");

  // Modals
  const [showNewItemModal, setShowNewItemModal] = useState(false);
  const [showBulkItemsModal, setShowBulkItemsModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showAttachDropdown, setShowAttachDropdown] = useState(false);
  const [savedInvoiceId, setSavedInvoiceId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  const itemsById = useMemo(
    () => new Map(items.map((item) => [item._id, item])),
    [items],
  );

  // Load master data
  useEffect(() => {
    if (!firebaseUser || loading || orgLoading || !activeOrganization) return;
    setMasterLoading(true);
    Promise.allSettled([
      contactApi.list({ type: "Customer", page: 1, limit: 500 }),
      itemApi.list({ page: 1, limit: 500 }),
      settingsApi.salesPersons.list(),
      settingsApi.taxes.list(),
      settingsApi.paymentTerms.list(),
      invoiceApi.getNextNumber(),
    ])
      .then((results) => {
        const [
          customersRes,
          itemsRes,
          salesPeopleRes,
          taxesRes,
          termsRes,
          nextNumberRes,
        ] = results;

        if (customersRes.status === "fulfilled") {
          setCustomers(customersRes.value.data ?? []);
        }
        if (itemsRes.status === "fulfilled") {
          setItems(itemsRes.value.data ?? []);
        }
        if (salesPeopleRes.status === "fulfilled") {
          setSalesPersons(salesPeopleRes.value.data ?? []);
        }
        if (taxesRes.status === "fulfilled") {
          setTaxes(taxesRes.value.data ?? []);
        }
        if (termsRes.status === "fulfilled") {
          setPaymentTermsList(termsRes.value.data ?? []);
        }
        if (nextNumberRes.status === "fulfilled") {
          setInvoiceNumber(
            nextNumberRes.value.data?.invoiceNumber ?? "INV-000001",
          );
        } else {
          toast.warning(
            "Unable to fetch next invoice number. Using default sequence.",
          );
          setInvoiceNumber("INV-000001");
        }
      })
      .finally(() => setMasterLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, loading, orgLoading, activeOrganization]);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup)
      router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  // Auto-add customer email to email contacts
  useEffect(() => {
    if (customerId) {
      const customer = customers.find((c) => c._id === customerId);
      if (customer?.email && !emailContacts.includes(customer.email)) {
        setEmailContacts((prev) => [...prev, customer.email!]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  // ─── Line item helpers ────────────────────────────────────────────

  const selectedCustomer = customers.find((entry) => entry._id === customerId);

  const updateLine = useCallback(
    (key: number, field: keyof LineItem, value: any) => {
      setLines((prev) =>
        prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)),
      );
    },
    [],
  );

  const removeLine = useCallback((key: number) => {
    setLines((prev) => {
      const next = prev.filter((l) => l.key !== key);
      return next.length === 0 ? [newLine()] : next;
    });
  }, []);

  const handleItemSelect = useCallback(
    (key: number, itemId: string) => {
      const item = items.find((i) => i._id === itemId);
      if (!item) return;
      const linkedTax = getItemTaxForTransaction({
        item,
        contact: selectedCustomer,
        organizationState: activeOrganization?.address?.state,
        taxes,
      });
      setLines((prev) =>
        prev.map((l) =>
          l.key === key ?
            {
              ...l,
              itemId: item._id,
              name: item.name,
              description: item.description || "",
              rate: item.sellingPrice || 0,
              taxId: linkedTax.taxId,
              taxPercent: linkedTax.taxPercent,
            }
          : l,
        ),
      );
    },
    [items, selectedCustomer, activeOrganization?.address?.state, taxes],
  );

  const handleBulkAdd = useCallback((selectedItems: Item[]) => {
    const newLines: LineItem[] = selectedItems.map((item) => {
      const linkedTax = getItemTaxForTransaction({
        item,
        contact: selectedCustomer,
        organizationState: activeOrganization?.address?.state,
        taxes,
      });
      return {
        key: lineKeyCounter++,
        itemId: item._id,
        name: item.name,
        description: item.description || "",
        hsnSacCode: "",
        quantity: 1,
        rate: item.sellingPrice || 0,
        discountPercent: 0,
        taxId: linkedTax.taxId,
        taxPercent: linkedTax.taxPercent,
        accountId: "",
      };
    });
    setLines((prev) => {
      // Remove empty lines
      const existing = prev.filter((l) => l.name.trim());
      return [...existing, ...newLines];
    });
  }, [selectedCustomer, activeOrganization?.address?.state, taxes]);

  const handleNewItemCreated = useCallback((item: Item) => {
    setItems((prev) => [...prev, item]);
    const linkedTax = getItemTaxForTransaction({
      item,
      contact: selectedCustomer,
      organizationState: activeOrganization?.address?.state,
      taxes,
    });
    // Add to current lines
    setLines((prev) => {
      const emptyIdx = prev.findIndex((l) => !l.name.trim());
      if (emptyIdx >= 0) {
        return prev.map((l, i) =>
          i === emptyIdx ?
            {
              ...l,
              itemId: item._id,
              name: item.name,
              description: item.description || "",
              rate: item.sellingPrice || 0,
              taxId: linkedTax.taxId,
              taxPercent: linkedTax.taxPercent,
            }
          : l,
        );
      }
      return [
        ...prev,
        {
          key: lineKeyCounter++,
          itemId: item._id,
          name: item.name,
          description: item.description || "",
          hsnSacCode: "",
          quantity: 1,
          rate: item.sellingPrice || 0,
          discountPercent: 0,
          taxId: linkedTax.taxId,
          taxPercent: linkedTax.taxPercent,
          accountId: "",
        },
      ];
    });
  }, [selectedCustomer, activeOrganization?.address?.state, taxes]);

  useEffect(() => {
    if (!lines.some((line) => line.itemId)) return;
    setLines((prev) => {
      let changed = false;
      const next = prev.map((line) => {
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
      return changed ? next : prev;
    });
  }, [customerId, selectedCustomer, activeOrganization?.address?.state, items, taxes]);

  // ─── Calculations ────────────────────────────────────────────────

  const subTotal = lines.reduce((s, l) => s + l.quantity * l.rate, 0);
  const discountAmount =
    discountType === "percent" ?
      (subTotal * discountValue) / 100
    : discountValue;
  const selectedTax = taxes.find((t) => t._id === totalTaxId);
  const taxAmount =
    selectedTax ? (subTotal * (selectedTax.rate || 0)) / 100 : 0;
  const taxSignedAmount =
    taxType === "TCS" ? taxAmount
    : taxType === "TDS" ? -taxAmount
    : 0;
  const total = subTotal - discountAmount + taxSignedAmount + adjustmentAmount;

  // ─── Submit ──────────────────────────────────────────────────────

  async function handleSave(status: "Draft" | "Sent") {
    if (!customerId) {
      toast.error("Please select a customer");
      return;
    }
    const hasItems = lines.some((l) => l.name.trim());
    if (!hasItems) {
      toast.error("Please add at least one item");
      return;
    }

    setSaving(true);
    try {
      const payload: CreateInvoiceInput = {
        invoiceNumber,
        orderNumber,
        customerId,
        invoiceDate,
        dueDate: dueDate || null,
        paymentTermsId: paymentTermsId === "__receipt" || !paymentTermsId ? null : paymentTermsId,
        salesPersonId: salesPersonId === "__none" || !salesPersonId ? null : salesPersonId,
        subject,
        items: lines
          .filter((l) => l.name.trim())
          .map((l) => ({
            itemId: l.itemId || null,
            name: l.name,
            description: l.description,
            hsnSacCode: l.hsnSacCode,
            quantity: l.quantity,
            rate: l.rate,
            discountPercent: l.discountPercent,
            taxId: l.taxId || null,
            taxPercent: l.taxPercent,
            accountId: l.accountId || null,
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
        status,
        emailContacts,
        paymentReceived,
      };
      // When the user chooses "Save and Send", create the invoice as Draft
      // first so cancelling the email modal doesn't leave a Sent invoice.
      // The backend sendInvoiceEmail endpoint marks it as Sent after the
      // email is actually transmitted.
      const createPayload = {
        ...payload,
        status: status === "Sent" ? ("Draft" as const) : status,
      };
      const res = await invoiceApi.create(createPayload);

      if (status === "Sent") {
        setSavedInvoiceId(res.data._id);
        setShowEmailModal(true);
        setSaving(false);
        return;
      }

      router.push("/sales/invoices");
    } catch (e: any) {
      toast.error(e.message || "Failed to save invoice");
    } finally {
      setSaving(false);
    }
  }

  async function handleSendEmail(data: {
    to: string[];
    cc: string[];
    subject: string;
    body: string;
    attachPdf: boolean;
  }) {
    if (!savedInvoiceId) {
      toast.error("Invoice was not saved — please close and try again.");
      return;
    }
    if (data.to.length === 0) {
      toast.error("Please enter at least one recipient email address");
      return;
    }
    setSendingEmail(true);
    try {
      await invoiceApi.sendEmailWithFiles(
        savedInvoiceId,
        {
          to: data.to,
          cc: data.cc,
          subject: data.subject,
          body: data.body,
          attachInvoicePdf: data.attachPdf,
        },
        attachments, // File[] from the invoice form's file picker
      );
      toast.success("Invoice emailed successfully");
      router.push(`/sales/invoices/${savedInvoiceId}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to send email");
    } finally {
      setSendingEmail(false);
    }
  }

  // File handling
  function handleFileSelect() {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "*/*";
    input.onchange = (e: any) => {
      const files = Array.from(e.target.files || []) as File[];
      setAttachments((prev) => [...prev, ...files].slice(0, 10));
    };
    input.click();
  }

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Sales <span className="mx-1">/</span>
              <button
                className="hover:underline"
                onClick={() => router.push("/sales/invoices")}
              >
                Invoices
              </button>
              <span className="mx-1">/</span>
              <span className="font-medium text-foreground">New Invoice</span>
            </span>
          }
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/sales/invoices")}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          }
        />

        <div className="flex flex-1 flex-col p-6 gap-6 max-w-6xl">
          <h1 className="text-xl font-bold">New Invoice</h1>

          {/* ═══ Header Fields ═══ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-5">
            {/* Customer Name */}
            <div className="space-y-1.5">
              <Label>
                Customer Name<span className="text-red-500">*</span>
              </Label>
              <Select
                value={customerId || undefined}
                onValueChange={(v) => {
                  if (v === "__add_new") {
                    router.push("/sales/customers/new");
                    return;
                  }
                  setCustomerId(v);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select or add a customer" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="__add_new">
                    <span className="text-blue-600 font-medium">
                      + Add a customer
                    </span>
                  </SelectItem>
                  {masterLoading && customers.length === 0 && (
                    <SelectItem value="__loading" disabled>
                      Loading customers...
                    </SelectItem>
                  )}
                  {!masterLoading && customers.length === 0 && (
                    <SelectItem value="__empty" disabled>
                      No customers found
                    </SelectItem>
                  )}
                  {customers.map((c) => (
                    <SelectItem key={c._id} value={c._id}>
                      <div className="flex flex-col">
                        <span className="font-medium">{c.displayName}</span>
                        {c.companyName && (
                          <span className="text-xs text-muted-foreground">
                            {c.companyName}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Empty right */}
            <div />

            {/* Invoice # */}
            <div className="space-y-1.5">
              <Label>
                Invoice#<span className="text-red-500">*</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                />
                <Button variant="outline" size="icon" className="shrink-0">
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Order Number */}
            <div className="space-y-1.5">
              <Label>Order / Challan Number</Label>
              <Input
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="SO-00001 or DC-00001"
              />
            </div>

            {/* Invoice Date */}
            <div className="space-y-1.5">
              <Label className="text-red-600">
                Invoice Date<span className="text-red-500">*</span>
              </Label>
              <Input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </div>

            {/* Payment Terms */}
            <div className="space-y-1.5">
              <Label>Terms</Label>
              <Select
                value={paymentTermsId || undefined}
                onValueChange={(v) => {
                  setPaymentTermsId(v);
                  if (v === "__receipt") {
                    setDueDate(invoiceDate);
                    return;
                  }
                  const pt = paymentTermsList.find((p) => p._id === v);
                  if (pt) {
                    const due = new Date(invoiceDate);
                    due.setDate(due.getDate() + (pt.netDays ?? 0));
                    setDueDate(due.toISOString().slice(0, 10));
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Due on Receipt" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__receipt">Due on Receipt</SelectItem>
                  {paymentTermsList.map((pt) => (
                    <SelectItem key={pt._id} value={pt._id}>
                      {pt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Due Date */}
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            {/* Salesperson */}
            <div className="space-y-1.5">
              <Label>Salesperson</Label>
              <Select
                value={salesPersonId || undefined}
                onValueChange={setSalesPersonId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select or Add Salesperson" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {salesPersons.map((sp) => (
                    <SelectItem key={sp._id} value={sp._id}>
                      {sp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Subject */}
          <div className="space-y-1.5 max-w-xl">
            <Label>Subject</Label>
            <Input
              placeholder="Let your customer know what this Invoice is for"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <Separator />

          {/* ═══ Item Table ═══ */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Item Table</h2>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    /* Scan barcode - placeholder */
                  }}
                >
                  <ScanBarcode className="h-3.5 w-3.5 mr-1" />
                  Scan Item
                </Button>

                {/* Bulk Actions dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="text-xs">
                      <RefreshCw className="h-3.5 w-3.5 mr-1" />
                      Bulk Actions
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem>Bulk Update Line Items</DropdownMenuItem>
                    <DropdownMenuItem>
                      Hide All Additional Information
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[240px]">
                      ITEM DETAILS
                    </TableHead>
                    <TableHead className="w-[100px] text-right">
                      QUANTITY
                    </TableHead>
                    <TableHead className="w-[110px] text-right">STOCK</TableHead>
                    <TableHead className="w-[120px] text-right">RATE</TableHead>
                    <TableHead className="w-[100px] text-right">
                      DISCOUNT %
                    </TableHead>
                    <TableHead className="w-[120px] text-right">
                      AMOUNT
                    </TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => {
                    const { amount } = calcLineAmount(line);
                    const selectedItem = itemsById.get(line.itemId);
                    const stockOnHand =
                      selectedItem?.inventoryTracked ?
                        Number(selectedItem.stockOnHand || 0)
                      : null;
                    const exceedsStock =
                      stockOnHand !== null && Number(line.quantity || 0) > stockOnHand;

                    return (
                      <TableRow key={line.key}>
                        <TableCell>
                          <Select
                            value={line.itemId || undefined}
                            onValueChange={(v) => {
                              if (v === "__new") {
                                setShowNewItemModal(true);
                              } else {
                                handleItemSelect(line.key, v);
                              }
                            }}
                          >
                            <SelectTrigger className="h-8 w-full text-sm">
                              <SelectValue placeholder="Type or click to select an item." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__new">
                                <span className="text-blue-600 font-medium">
                                  + Add new item
                                </span>
                              </SelectItem>
                              {items.length === 0 && (
                                <SelectItem value="__empty" disabled>
                                  No items found
                                </SelectItem>
                              )}
                              {items.map((it) => (
                                <SelectItem key={it._id} value={it._id}>
                                  <div className="flex items-center justify-between gap-3">
                                    <span>
                                      {it.name}
                                      {it.sku ? ` (${it.sku})` : ""}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {it.inventoryTracked ?
                                        `Stock ${Number(it.stockOnHand || 0).toLocaleString("en-IN")}`
                                      : "Non-stock"}
                                    </span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {!line.itemId && (
                            <Input
                              className="mt-1 h-7 text-xs"
                              placeholder="Or type a custom item name"
                              value={line.name}
                              onChange={(e) =>
                                updateLine(line.key, "name", e.target.value)
                              }
                            />
                          )}
                          {line.itemId && (
                            <>
                              <Input
                                className="mt-1 h-7 text-xs"
                                placeholder="Add a description to your item"
                                value={line.description}
                                onChange={(e) =>
                                  updateLine(
                                    line.key,
                                    "description",
                                    e.target.value,
                                  )
                                }
                              />
                              {selectedItem ?
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {selectedItem.sku ? `SKU ${selectedItem.sku} · ` : ""}
                                  {selectedItem.inventoryTracked ?
                                    `Stock on hand ${Number(selectedItem.stockOnHand || 0).toLocaleString("en-IN")}`
                                  : "Inventory not tracked"}
                                </p>
                              : null}
                            </>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            className="h-8 text-right text-sm"
                            value={line.quantity}
                            onChange={(e) =>
                              updateLine(
                                line.key,
                                "quantity",
                                parseFloat(e.target.value) || 0,
                              )
                            }
                          />
                        </TableCell>
                        <TableCell
                          className={`text-right text-sm tabular-nums ${
                            exceedsStock ? "text-destructive font-medium" : ""
                          }`}
                        >
                          {stockOnHand === null ?
                            "N/A"
                          : Number(stockOnHand).toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            className="h-8 text-right text-sm"
                            value={line.rate}
                            onChange={(e) =>
                              updateLine(
                                line.key,
                                "rate",
                                parseFloat(e.target.value) || 0,
                              )
                            }
                          />
                          <button className="text-xs text-blue-600 hover:underline mt-0.5">
                            Recent Transactions
                          </button>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            className="h-8 text-right text-sm"
                            value={line.discountPercent}
                            onChange={(e) =>
                              updateLine(
                                line.key,
                                "discountPercent",
                                parseFloat(e.target.value) || 0,
                              )
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium tabular-nums">
                          {amount.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => removeLine(line.key)}
                            >
                              <X className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Line item account/project/tags row */}
            {lines.some((l) => l.name.trim()) && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground px-1">
                <span className="inline-flex items-center gap-1 cursor-pointer hover:text-foreground">
                  <FolderOpen className="h-3 w-3" /> Sales
                </span>
                <span className="inline-flex items-center gap-1 cursor-pointer hover:text-foreground">
                  <FolderOpen className="h-3 w-3" /> Select a project
                </span>
                <span className="inline-flex items-center gap-1 cursor-pointer hover:text-foreground">
                  Reporting Tags
                </span>
              </div>
            )}

            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add New Row
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    onClick={() => setLines((prev) => [...prev, newLine()])}
                  >
                    Add blank row
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowNewItemModal(true)}>
                    Add new item
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBulkItemsModal(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Items in Bulk
              </Button>
            </div>
          </div>

          <Separator />

          {/* ═══ Totals Section ═══ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left: Notes & Terms */}
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label>Customer Notes</Label>
                <textarea
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[80px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  value={customerNotes}
                  onChange={(e) => setCustomerNotes(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Will be displayed on the invoice
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Terms &amp; Conditions</Label>
                <textarea
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[100px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Enter the terms and conditions of your business to be displayed in your transaction"
                  value={termsAndConditions}
                  onChange={(e) => setTermsAndConditions(e.target.value)}
                />
              </div>
            </div>

            {/* Right: Totals */}
            <div className="space-y-3">
              {/* Sub Total */}
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Sub Total</span>
                <span className="font-medium tabular-nums">
                  {subTotal.toFixed(2)}
                </span>
              </div>

              {/* Discount */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm">Discount</span>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    className="h-8 w-20 text-right text-sm"
                    value={discountValue}
                    onChange={(e) =>
                      setDiscountValue(parseFloat(e.target.value) || 0)
                    }
                  />
                  <Select
                    value={discountType}
                    onValueChange={(v: "percent" | "amount") =>
                      setDiscountType(v)
                    }
                  >
                    <SelectTrigger className="h-8 w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">%</SelectItem>
                      <SelectItem value="amount">&#8377;</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-sm tabular-nums w-20 text-right">
                    {discountAmount.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* TDS / TCS */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 text-sm">
                    <input
                      type="radio"
                      name="invoiceTaxType"
                      value="TDS"
                      checked={taxType === "TDS"}
                      onChange={() => setTaxType("TDS")}
                      className="accent-primary"
                    />
                    TDS
                  </label>
                  <label className="flex items-center gap-1 text-sm">
                    <input
                      type="radio"
                      name="invoiceTaxType"
                      value="TCS"
                      checked={taxType === "TCS"}
                      onChange={() => setTaxType("TCS")}
                      className="accent-primary"
                    />
                    TCS
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={totalTaxId || undefined}
                    onValueChange={setTotalTaxId}
                  >
                    <SelectTrigger className="h-8 w-44">
                      <SelectValue placeholder="Select a Tax" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">None</SelectItem>
                      {taxes.map((t) => (
                        <SelectItem key={t._id} value={t._id}>
                          {t.name} ({t.rate}%)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-sm tabular-nums w-20 text-right">
                    {taxType === "TCS" ? "+" : taxType === "TDS" ? "-" : ""}{" "}
                    {taxAmount.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Adjustment */}
              <div className="flex items-center justify-between gap-3">
                <Input
                  className="h-8 w-32 text-sm"
                  value={adjustmentLabel}
                  onChange={(e) => setAdjustmentLabel(e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    className="h-8 w-24 text-right text-sm"
                    value={adjustmentAmount}
                    onChange={(e) =>
                      setAdjustmentAmount(parseFloat(e.target.value) || 0)
                    }
                  />
                  <span className="text-sm tabular-nums w-20 text-right">
                    {adjustmentAmount.toFixed(2)}
                  </span>
                </div>
              </div>

              <Separator />

              {/* Total */}
              <div className="flex items-center justify-between text-base font-bold">
                <span>Total ( &#8377; )</span>
                <span className="tabular-nums">{total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* ═══ Attach File(s) ═══ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Terms area already shown above */}
            <div />

            <div className="space-y-3">
              <Label>Attach File(s) to Invoice</Label>
              <div className="relative">
                <DropdownMenu
                  open={showAttachDropdown}
                  onOpenChange={setShowAttachDropdown}
                >
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Upload className="h-3.5 w-3.5 mr-1" />
                      Upload File
                      <ChevronDown className="h-3 w-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={handleFileSelect}>
                      <Monitor className="h-4 w-4 mr-2" />
                      Attach From Desktop
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <FolderOpen className="h-4 w-4 mr-2" />
                      Attach From Documents
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Cloud className="h-4 w-4 mr-2" />
                      Attach From Cloud
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <p className="text-xs text-muted-foreground">
                You can upload a maximum of 10 files, 10MB each
              </p>

              {/* Attached files list */}
              {attachments.length > 0 && (
                <div className="space-y-1">
                  {attachments.map((file, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 text-sm bg-muted/50 rounded px-2 py-1"
                    >
                      <span className="truncate flex-1">{file.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {(file.size / 1024).toFixed(0)} KB
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() =>
                          setAttachments((prev) =>
                            prev.filter((_, i) => i !== idx),
                          )
                        }
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* ═══ Payment Gateway Banner ═══ */}
          <div className="bg-muted/30 rounded-lg p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 text-sm font-medium">
                Want to get paid faster?
                <span className="inline-flex gap-1">
                  <span className="w-5 h-3 bg-orange-500 rounded-sm" />
                  <span className="w-5 h-3 bg-blue-700 rounded-sm" />
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Configure payment gateways and receive payments online.{" "}
                <button className="text-blue-600 hover:underline">
                  Set up Payment Gateway
                </button>
              </p>
            </div>
          </div>

          <Separator />

          {/* ═══ Payment Received Checkbox ═══ */}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={paymentReceived}
              onCheckedChange={(c) => setPaymentReceived(c === true)}
            />
            I have received the payment
          </label>

          <Separator />

          {/* ═══ Email Communications ═══ */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold">Email Communications</h3>
              {emailContacts.length > 0 && (
                <button
                  className="text-xs text-red-500 hover:underline"
                  onClick={() => setEmailContacts([])}
                >
                  X Clear Selection
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {/* Inline email input */}
              <div className="flex items-center gap-1.5">
                <Input
                  type="email"
                  className="h-8 w-56 text-sm"
                  placeholder="Enter email address"
                  value={newEmailContact}
                  onChange={(e) => setNewEmailContact(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const email = newEmailContact.trim();
                      if (
                        email &&
                        email.includes("@") &&
                        !emailContacts.includes(email)
                      ) {
                        setEmailContacts((prev) => [...prev, email]);
                        setNewEmailContact("");
                      }
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const email = newEmailContact.trim();
                    if (
                      email &&
                      email.includes("@") &&
                      !emailContacts.includes(email)
                    ) {
                      setEmailContacts((prev) => [...prev, email]);
                      setNewEmailContact("");
                    }
                  }}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add New
                </Button>
              </div>

              {emailContacts.map((email, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 text-sm bg-muted/50 rounded px-3 py-1.5"
                >
                  <Checkbox defaultChecked />
                  <span className="inline-flex items-center gap-1">
                    <span className="w-6 h-6 rounded bg-blue-600 text-white flex items-center justify-center text-xs font-medium">
                      {(selectedCustomer?.displayName ||
                        email)[0]?.toUpperCase()}
                    </span>
                    {selectedCustomer?.displayName || ""} &lt;{email}&gt;
                  </span>
                  <button
                    className="ml-1 text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      setEmailContacts((prev) =>
                        prev.filter((_, i) => i !== idx),
                      )
                    }
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* ═══ Additional Fields Info ═══ */}
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              Additional Fields:
            </span>{" "}
            Start adding custom fields for your invoices by going to{" "}
            <span className="italic">
              Settings &#10140; Sales &#10140; Invoices
            </span>
            .
          </div>

          <Separator />

          {/* ═══ Actions ═══ */}
          <div className="flex items-center justify-between pb-8">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => handleSave("Draft")}
              >
                {saving ?
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                : null}
                Save as Draft
              </Button>

              <div className="flex">
                <Button
                  disabled={saving}
                  onClick={() => handleSave("Sent")}
                  className="rounded-r-none"
                >
                  {saving ?
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  : null}
                  Save and Send
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      disabled={saving}
                      className="rounded-l-none border-l border-l-primary-foreground/20 px-2"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => handleSave("Sent")}>
                      Save and Send
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleSave("Draft")}>
                      Save as Draft
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <Button
                variant="ghost"
                onClick={() => router.push("/sales/invoices")}
              >
                Cancel
              </Button>
            </div>

            {/* Right: Make Recurring + Total */}
            <div className="flex items-center gap-4">
              <button className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                <RefreshCw className="h-3.5 w-3.5" />
                Make Recurring
              </button>
              <div className="text-right">
                <div className="text-sm font-semibold">
                  Total Amount: &#8377; {total.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Total Quantity:{" "}
                  {lines.reduce(
                    (s, l) => s + (l.name.trim() ? l.quantity : 0),
                    0,
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>

      {/* ═══ Modals ═══ */}
      <NewItemModal
        open={showNewItemModal}
        onClose={() => setShowNewItemModal(false)}
        onItemCreated={handleNewItemCreated}
      />

      <BulkItemsModal
        open={showBulkItemsModal}
        onClose={() => setShowBulkItemsModal(false)}
        items={items}
        onAddItems={handleBulkAdd}
      />

      <SendEmailModal
        open={showEmailModal}
        onClose={() => {
          setShowEmailModal(false);
          if (savedInvoiceId) {
            toast.info("Invoice saved as draft — email was not sent.");
            router.push(`/sales/invoices/${savedInvoiceId}`);
          } else {
            router.push("/sales/invoices");
          }
        }}
        invoiceNumber={invoiceNumber}
        customerName={selectedCustomer?.displayName || "Customer"}
        customerEmail={selectedCustomer?.email || ""}
        total={total}
        invoiceDate={invoiceDate}
        onSend={handleSendEmail}
        sending={sendingEmail}
      />
    </SidebarProvider>
  );
}
