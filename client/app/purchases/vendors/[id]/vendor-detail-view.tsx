"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Building2, Mail, MapPin, CreditCard, User, Plus, Edit2,
  Pencil, Trash2, ExternalLink, ChevronDown, ChevronUp, Loader2,
  MessageSquare, AlertCircle, Paperclip, X, Clock,
  Printer, Download, FileSpreadsheet, Send, Settings, Settings2, Upload,
  ImagePlus, Palette, Layout, FileText, Grid, AlignLeft,
  Cloud, CloudCheck, CloudOff,
} from "lucide-react";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { useOrganization } from "@/contexts/organization-context";
import { organizationApi } from "@/lib/api/organizations";
import { apiFetch } from "@/lib/api/client";

// â”€â”€â”€ date helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function format(date: Date, pattern: string): string {
  const d = date.getDate().toString().padStart(2, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const y = date.getFullYear();
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const H = date.getHours();
  const h = (H % 12 || 12).toString().padStart(2, "0");
  const min = date.getMinutes().toString().padStart(2, "0");
  const ampm = H >= 12 ? "PM" : "AM";

  if (pattern === "dd/MM/yyyy") return `${d}/${m}/${y}`;
  if (pattern === "yyyy-MM-dd") return `${y}-${m}-${d}`;
  if (pattern === "dd MMM yyyy, hh:mm a") return `${d} ${months[date.getMonth()]} ${y}, ${h}:${min} ${ampm}`;
  if (pattern === "dd MMM") return `${d} ${months[date.getMonth()]}`;
  return `${d}/${m}/${y}`;
}

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { DraggableText } from "@/components/ui/draggable-text";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

import { contactApi, type Contact, type ContactPerson, type BankDetail, type ContactComment,
  type ActivityEvent,
} from "@/lib/api/contacts";
import { expenseApi, type Expense } from "@/lib/api/expenses";
import { recurringExpenseApi, type RecurringExpense } from "@/lib/api/recurring-expenses";
import { billApi, type Bill } from "@/lib/api/bills";
import { paymentMadeApi, type PaymentMade } from "@/lib/api/payments-made";
import { purchaseOrderApi, type PurchaseOrder } from "@/lib/api/purchase-orders";
import { recurringBillApi, type RecurringBill } from "@/lib/api/recurring-bills";
import { vendorCreditApi, type VendorCredit } from "@/lib/api/vendor-credits";
import { journalApi, type Journal } from "@/lib/api/journals";
import { smtpApi } from "@/lib/api/smtp";
import * as XLSX from "xlsx";

// â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const fmt = (v?: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(v ?? 0);

const fmtDate = (d?: string) => (d ? format(new Date(d), "dd/MM/yyyy") : "â€”");

function addressLines(addr?: Contact["billingAddress"]): string {
  if (!addr) return "";
  return [addr.attention, addr.street, addr.street2, addr.city, addr.state, addr.zip, addr.country]
    .filter(Boolean)
    .join(", ");
}

function expenseStatus(status: string) {
  const map: Record<string, string> = {
    Draft: "bg-gray-100 text-gray-700",
    Submitted: "bg-blue-100 text-blue-700",
    Approved: "bg-green-100 text-green-700",
    Rejected: "bg-red-100 text-red-700",
    Reimbursed: "bg-purple-100 text-purple-700",
  };
  return map[status] ?? "bg-gray-100 text-gray-600";
}

/** Group expenses by month for the last N months / fiscal year */
type ChartPeriod = "6m" | "12m" | "fiscal" | "prev_fiscal";

function getChartMonths(period: ChartPeriod) {
  const now = new Date();
  if (period === "6m") {
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return { year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleString("en-US", { month: "short" }) + " '" + String(d.getFullYear()).slice(-2) };
    });
  } else if (period === "12m") {
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      return { year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleString("en-US", { month: "short" }) + " '" + String(d.getFullYear()).slice(-2) };
    });
  } else if (period === "fiscal") {
    const fyStart = new Date(now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1, 3, 1);
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(fyStart.getFullYear(), fyStart.getMonth() + i, 1);
      return { year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleString("en-US", { month: "short" }) + " '" + String(d.getFullYear()).slice(-2) };
    });
  } else {
    const fyStart = new Date(now.getMonth() >= 3 ? now.getFullYear() - 1 : now.getFullYear() - 2, 3, 1);
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(fyStart.getFullYear(), fyStart.getMonth() + i, 1);
      return { year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleString("en-US", { month: "short" }) + " '" + String(d.getFullYear()).slice(-2) };
    });
  }
}

function getMonthlyData(expenses: Expense[], period: ChartPeriod = "6m") {
  return getChartMonths(period).map(({ year, month, label }) => {
    const total = expenses
      .filter((e) => { const ed = new Date(e.date); return ed.getFullYear() === year && ed.getMonth() === month; })
      .reduce((sum, e) => sum + (e.amount ?? 0), 0);
    return { name: label, total };
  });
}

const PERIOD_LABELS: Record<ChartPeriod, string> = {
  "6m": "Last 6 Months",
  "12m": "Last 12 Months",
  fiscal: "This Fiscal Year",
  prev_fiscal: "Previous Fiscal Year",
};

// â”€â”€â”€ Contact Person Dialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const SALUTATIONS = ["", "Mr.", "Mrs.", "Ms.", "Dr.", "Prof."];

function ContactPersonDialog({
  open, onClose, onSave, initial,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (p: ContactPerson) => void;
  initial?: ContactPerson;
}) {
  const [salutation, setSalutation] = useState(initial?.salutation ?? "");
  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [workPhone, setWorkPhone] = useState(initial?.workPhone ?? "");
  const [mobile, setMobile] = useState(initial?.mobile ?? "");
  const [designation, setDesignation] = useState(initial?.designation ?? "");
  const [department, setDepartment] = useState(initial?.department ?? "");
  const [skypeName, setSkypeName] = useState(initial?.skypeName ?? "");
  const [photoUrl, setPhotoUrl] = useState(initial?.photoUrl ?? "");
  const [isPrimary, setIsPrimary] = useState(initial?.isPrimary ?? false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const profileImageInputRef = useRef<HTMLInputElement>(null);

  // Sync state when initial prop changes
  useEffect(() => {
    if (open) {
      setSalutation(initial?.salutation ?? "");
      setFirstName(initial?.firstName ?? "");
      setLastName(initial?.lastName ?? "");
      setEmail(initial?.email ?? "");
      setWorkPhone(initial?.workPhone ?? "");
      setMobile(initial?.mobile ?? "");
      setDesignation(initial?.designation ?? "");
      setDepartment(initial?.department ?? "");
      setSkypeName(initial?.skypeName ?? "");
      setPhotoUrl(initial?.photoUrl ?? "");
      setIsPrimary(initial?.isPrimary ?? false);
    }
  }, [initial, open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  async function handleProfileImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Profile image must be 5MB or less");
      return;
    }

    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await apiFetch<{ data: { url: string; publicId: string } }>(
        "/upload?folder=contacts/contact-persons&resourceType=image",
        { method: "POST", body: formData },
      );

      setPhotoUrl(res.data.url);
      toast.success("Profile image uploaded");
    } catch {
      toast.error("Failed to upload profile image");
    } finally {
      setUploadingImage(false);
      if (profileImageInputRef.current) profileImageInputRef.current.value = "";
    }
  }

  function handleSave() {
    const name = [salutation, firstName, lastName].filter((s) => s && s !== "__").join(" ");
    if (!firstName && !lastName) { toast.error("Please enter at least a first or last name"); return; }
    onSave({
      salutation: salutation === "__" ? "" : salutation,
      firstName,
      lastName,
      name,
      email,
      workPhone,
      mobile,
      designation,
      department,
      skypeName,
      photoUrl,
      isPrimary,
    });
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-2 sm:p-6">
      <div className="absolute inset-0 bg-black/35" onClick={onClose} />

      <div className="relative z-10 w-[min(1100px,98vw)] max-h-[92vh] overflow-hidden rounded-md border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-3xl font-normal tracking-tight">{initial ? "Edit Contact Person" : "New Contact Person"}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-red-400 transition hover:bg-red-50 hover:text-red-500"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid max-h-[calc(92vh-130px)] overflow-hidden lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="overflow-y-auto p-6">
            <div className="space-y-4">
              <div className="grid gap-2 md:grid-cols-[170px_minmax(0,1fr)] md:items-center md:gap-4">
                <Label className="text-sm font-normal">Name</Label>
                <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)]">
                  <Select value={salutation} onValueChange={setSalutation}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="Mr." /></SelectTrigger>
                    <SelectContent>
                      {SALUTATIONS.map((s) => <SelectItem key={s || "__"} value={s || "__"}>{s || "—"}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input className="h-11" placeholder="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  <Input className="h-11" placeholder="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-[170px_minmax(0,1fr)] md:items-center md:gap-4">
                <Label className="text-sm font-normal">Email Address</Label>
                <Input className="h-11" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>

              <div className="grid gap-2 md:grid-cols-[170px_minmax(0,1fr)] md:items-start md:gap-4">
                <Label className="text-sm font-normal md:mt-3">Phone</Label>
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-[86px_minmax(0,1fr)]">
                    <Select defaultValue="+91">
                      <SelectTrigger className="h-11"><SelectValue placeholder="+91" /></SelectTrigger>
                      <SelectContent><SelectItem value="+91">+91</SelectItem></SelectContent>
                    </Select>
                    <Input className="h-11" placeholder="Mobile Number" value={mobile} onChange={(e) => setMobile(e.target.value)} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[86px_minmax(0,1fr)]">
                    <Select defaultValue="Mobile">
                      <SelectTrigger className="h-11"><SelectValue placeholder="Mobile" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Mobile">Mobile</SelectItem>
                        <SelectItem value="Work">Work</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input className="h-11" placeholder="Work Number" value={workPhone} onChange={(e) => setWorkPhone(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-[170px_minmax(0,1fr)] md:items-center md:gap-4">
                <Label className="text-sm font-normal">Skype Name/Number</Label>
                <Input className="h-11" placeholder="Skype Name/Number" value={skypeName} onChange={(e) => setSkypeName(e.target.value)} />
              </div>

              <div className="grid gap-2 md:grid-cols-[170px_minmax(0,1fr)] md:items-center md:gap-4">
                <Label className="text-sm font-normal">Other Details</Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input className="h-11" placeholder="Designation" value={designation} onChange={(e) => setDesignation(e.target.value)} />
                  <Input className="h-11" placeholder="Department" value={department} onChange={(e) => setDepartment(e.target.value)} />
                </div>
              </div>

              <div className="grid gap-2 pt-1 md:grid-cols-[170px_minmax(0,1fr)] md:items-center md:gap-4">
                <div />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isPrimary}
                    onChange={(e) => setIsPrimary(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Set as primary contact
                </label>
              </div>
            </div>
          </div>

          <div className="border-t bg-muted/10 p-6 lg:border-l lg:border-t-0">
            <Label className="mb-4 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Profile Image</Label>
            <div
              className="rounded-md border border-dashed border-blue-400 bg-background p-6 text-center transition hover:bg-blue-50/40"
              onClick={() => profileImageInputRef.current?.click()}
            >
              {photoUrl ? (
                <div className="flex flex-col items-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoUrl} className="h-28 w-28 rounded-full border object-cover" alt="Profile" />
                  <p className="mt-3 text-sm text-muted-foreground">Click to change</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-4">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-white">
                    {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  </div>
                  <p className="text-xl font-medium">Drag &amp; Drop Profile Image</p>
                  <p className="mt-1 text-sm text-muted-foreground">Supported Files: jpg, jpeg, png, gif, bmp</p>
                  <p className="text-sm text-muted-foreground">Maximum File Size: 5MB</p>
                  <p className="mt-6 text-lg underline">Upload File</p>
                </div>
              )}
            </div>
            <input
              ref={profileImageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleProfileImageUpload}
            />
          </div>
        </div>

        <div className="border-t bg-muted/20 px-6 py-4">
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={handleSave} className="bg-blue-500 hover:bg-blue-600">Save</Button>
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ Bank Account Dialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function BankAccountDialog({
  open, onClose, onSave, initial,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (b: BankDetail) => void;
  initial?: BankDetail;
}) {
  const [bankName, setBankName] = useState(initial?.bankName ?? "");
  const [accountNumber, setAccountNumber] = useState(initial?.accountNumber ?? "");
  const [accountHolderName, setAccountHolderName] = useState(initial?.accountHolderName ?? "");
  const [ifscCode, setIfscCode] = useState(initial?.ifscCode ?? "");
  const [branchName, setBranchName] = useState(initial?.branchName ?? "");
  const [upiId, setUpiId] = useState(initial?.upiId ?? "");
  const [isPrimary, setIsPrimary] = useState(initial?.isPrimary ?? false);

  function handleSave() {
    if (!bankName || !accountNumber) { toast.error("Bank name and account number are required"); return; }
    onSave({ bankName, accountNumber, accountHolderName, ifscCode, branchName, upiId, isPrimary });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add Bank Account</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-4">
          <div>
            <Label className="text-xs mb-1 block">Bank Name *</Label>
            <Input className="h-8 text-sm" value={bankName} onChange={(e) => setBankName(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Account Number *</Label>
            <Input className="h-8 text-sm" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Account Holder Name</Label>
            <Input className="h-8 text-sm" value={accountHolderName} onChange={(e) => setAccountHolderName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs mb-1 block">IFSC Code</Label>
              <Input className="h-8 text-sm" value={ifscCode} onChange={(e) => setIfscCode(e.target.value.toUpperCase())} />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Branch</Label>
              <Input className="h-8 text-sm" value={branchName} onChange={(e) => setBranchName(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs mb-1 block">UPI ID</Label>
            <Input className="h-8 text-sm" value={upiId} onChange={(e) => setUpiId(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} className="h-4 w-4" />
            Set as primary account
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// â”€â”€â”€ Section wrapper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function Section({
  title, children, action, defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border rounded-lg mb-4">
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-muted/30 rounded-t-lg">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
          <div className="flex items-center gap-2">
            {action && <span onClick={(e) => e.stopPropagation()}>{action}</span>}
            {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Separator />
        <div className="p-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function InfoRow({ label, value }: { label: string; value?: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-3 gap-2 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="col-span-2 font-medium">{value}</span>
    </div>
  );
}

// â”€â”€â”€ Statement computation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface StatementRow {
  date: string; type: string; details: string;
  amount: number; payments: number; balance: number;
}

// ─── Template Config ─────────────────────────────────────────────────────────

interface TemplateConfig {
  templateId: string;
  templateName: string;
  paperSize: "A4" | "A5" | "Letter";
  orientation: "Portrait" | "Landscape";
  margins: { top: number; bottom: number; left: number; right: number };
  fontFamily: string;
  fontSize: number;
  backgroundColor: string;
  // Header
  headerBgImage: string;
  headerBgPosition: string;
  headerBgColor: string;
  headerBgColorEnabled: boolean;
  headerApplyFirstPageOnly: boolean;
  headerCustomContent: string;
  // Footer
  showFooter: boolean;
  footerFontSize: number;
  footerFontColor: string;
  footerBgImage: string;
  footerBgPosition: string;
  footerBgColor: string;
  footerBgColorEnabled: boolean;
  footerCustomContent: string;
  // Transaction Details — Org
  showOrgLogo: boolean;
  orgLogoSize: number;
  showOrgName: boolean;
  orgNameColor: string;
  orgNameFontSize: number;
  showOrgAddress: boolean;
  // Transaction Details — Vendor
  vendorNameFontColor: string;
  vendorNameFontSize: number;
  showBillTo: boolean;
  billToLabel: string;
  // Transaction Details — Document
  showDocTitle: boolean;
  docTitle: string;
  docTitleFontSize: number;
  docTitleFontColor: string;
  docPhone: string;
  docFax: string;
  showRefField: boolean;
  refFieldLabel: string;
  showAccountSummary: boolean;
  accountSummaryLabel: string;
  showOpeningBalance: boolean;
  openingBalanceLabel: string;
  showInvoicedAmount: boolean;
  invoicedAmountLabel: string;
  showAmountPaid: boolean;
  amountPaidLabel: string;
  showBalanceDue: boolean;
  balanceDueLabel: string;
  // Table — Columns
  colDate: boolean;
  dateLabel: string;
  colTransactionType: boolean;
  transactionTypeLabel: string;
  colTransactionDetails: boolean;
  transactionDetailsLabel: string;
  showNotes: boolean;
  colAmount: boolean;
  amountLabel: string;
  colPayments: boolean;
  paymentsLabel: string;
  colBalance: boolean;
  balanceLabel: string;
  // Table — Layout
  tableHeaderFontSize: number;
  tableHeaderBgColor: string;
  tableHeaderFontColor: string;
  oddRowColor: string;
  evenRowColor: string;
  // Other Details
  annexureContent: string;
  // Color theme
  colorTheme: string;
  // Legacy
  primaryColor: string;
  tableStyle: "striped" | "bordered" | "minimal";
}

const DEFAULT_TEMPLATE_CONFIG: TemplateConfig = {
  templateId: "standard",
  templateName: "Standard",
  paperSize: "A4",
  orientation: "Portrait",
  margins: { top: 0.7, bottom: 0.7, left: 0.55, right: 0.4 },
  fontFamily: "Inter, sans-serif",
  fontSize: 12,
  backgroundColor: "#ffffff",
  // Header
  headerBgImage: "",
  headerBgPosition: "center center",
  headerBgColor: "#ffffff",
  headerBgColorEnabled: true,
  headerApplyFirstPageOnly: false,
  headerCustomContent: "",
  // Footer
  showFooter: true,
  footerFontSize: 9,
  footerFontColor: "#666666",
  footerBgImage: "",
  footerBgPosition: "center center",
  footerBgColor: "#ffffff",
  footerBgColorEnabled: false,
  footerCustomContent: "This is a computer-generated statement.",
  // Org
  showOrgLogo: true,
  orgLogoSize: 60,
  showOrgName: true,
  orgNameColor: "#333333",
  orgNameFontSize: 10,
  showOrgAddress: true,
  // Vendor
  vendorNameFontColor: "#333333",
  vendorNameFontSize: 9,
  showBillTo: true,
  billToLabel: "To",
  // Document
  showDocTitle: true,
  docTitle: "Statement of Accounts",
  docTitleFontSize: 16,
  docTitleFontColor: "#000000",
  docPhone: "",
  docFax: "",
  showRefField: false,
  refFieldLabel: "Ref",
  showAccountSummary: true,
  accountSummaryLabel: "Account Summary",
  showOpeningBalance: true,
  openingBalanceLabel: "Opening Balance",
  showInvoicedAmount: true,
  invoicedAmountLabel: "Billed Amount",
  showAmountPaid: true,
  amountPaidLabel: "Amount Paid",
  showBalanceDue: true,
  balanceDueLabel: "Balance Due",
  // Table columns
  colDate: true,
  dateLabel: "Date",
  colTransactionType: true,
  transactionTypeLabel: "Transactions",
  colTransactionDetails: true,
  transactionDetailsLabel: "Details",
  showNotes: false,
  colAmount: true,
  amountLabel: "Amount",
  colPayments: true,
  paymentsLabel: "Payments",
  colBalance: true,
  balanceLabel: "Balance",
  // Table layout
  tableHeaderFontSize: 9,
  tableHeaderBgColor: "#3c3d3a",
  tableHeaderFontColor: "#ffffff",
  oddRowColor: "#ffffff",
  evenRowColor: "#f6f5f5",
  // Other
  annexureContent: "",
  colorTheme: "default",
  // Legacy
  primaryColor: "#1a1a1a",
  tableStyle: "striped",
};

// ─── ChooseTemplateDialog ────────────────────────────────────────────────────
// TODO: Add more templates here as the product grows.
// Future templates to consider: Modern, Minimal, Classic, Compact, Colorful, Government

const STATEMENT_TEMPLATES = [
  { id: "standard", name: "Standard", desc: "Clean, professional layout suitable for all use cases" },
  // Future: { id: "modern", name: "Modern", desc: "..." },
  // Future: { id: "minimal", name: "Minimal", desc: "..." },
];

function ChooseTemplateDialog({
  open, onClose, selected, onSelect,
}: {
  open: boolean; onClose: () => void; selected: string; onSelect: (id: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Choose Template</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2 mb-2">
          Select a statement template. More templates will be available in future updates.
        </p>
        <div className="grid grid-cols-2 gap-4 py-2">
          {STATEMENT_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => { onSelect(tpl.id); onClose(); }}
              className={`relative border-2 rounded-lg p-4 text-left transition-all hover:border-primary/60 ${
                selected === tpl.id ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              {selected === tpl.id && (
                <span className="absolute top-2 right-2 text-[10px] font-semibold bg-primary text-white px-1.5 py-0.5 rounded">
                  SELECTED
                </span>
              )}
              {/* Template preview mockup */}
              <div className="w-full aspect-[0.707] bg-white border rounded mb-3 overflow-hidden p-2">
                <div className="flex justify-between mb-1">
                  <div className="h-3 w-3 bg-gray-300 rounded" />
                  <div className="h-2.5 w-10 bg-gray-200 rounded" />
                </div>
                <div className="h-px bg-gray-200 mb-1.5" />
                <div className="h-1.5 w-2/3 bg-gray-200 rounded mb-1" />
                <div className="h-1 w-1/2 bg-gray-100 rounded mb-2" />
                <div className="border rounded overflow-hidden">
                  <div className="h-2 bg-gray-700 w-full" />
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className={`flex gap-1 px-1 py-0.5 ${i % 2 === 0 ? "bg-gray-50" : "bg-white"}`}>
                      <div className="flex-1 h-1 bg-gray-200 rounded" />
                      <div className="flex-1 h-1 bg-gray-200 rounded" />
                      <div className="flex-1 h-1 bg-gray-200 rounded" />
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-sm font-semibold">{tpl.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{tpl.desc}</p>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── EditTemplatePanel ───────────────────────────────────────────────────────

const COLOR_THEMES = [
  { id: "default", label: "default", colors: ["#000000", "#ffffff"] },
  { id: "vibrant-blue", label: "Blue", colors: ["#1a56db", "#e1effe"] },
  { id: "vibrant-green", label: "Green", colors: ["#057a55", "#def7ec"] },
  { id: "vibrant-orange", label: "Orange", colors: ["#e3a008", "#fdf3cc"] },
  { id: "vibrant-red", label: "Red", colors: ["#e02424", "#fde8e8"] },
  { id: "vibrant-teal", label: "Teal", colors: ["#0694a2", "#d5f5f6"] },
  { id: "vibrant-purple", label: "Purple", colors: ["#7e3af2", "#edebfe"] },
];

function EtCollapsible({
  title, defaultOpen = true, children,
}: {
  title: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border rounded-lg overflow-hidden">
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium hover:bg-muted/20 transition-colors text-left">
          {title}
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 pt-2 space-y-3 border-t bg-background">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <Input
        className="h-7 text-xs font-mono w-20"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <input
        type="color"
        className="h-7 w-8 rounded border cursor-pointer p-0.5 shrink-0"
        value={value.startsWith("#") && value.length >= 7 ? value.slice(0, 7) : "#000000"}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

type EditTemplateTab = "general" | "header_footer" | "transaction" | "table" | "other";

function EditTemplatePanel({
  open, onClose, config, onChange,
}: {
  open: boolean; onClose: () => void; config: TemplateConfig; onChange: (c: TemplateConfig) => void;
}) {
  const [etTab, setEtTab] = useState<EditTemplateTab>("general");
  const [local, setLocal] = useState<TemplateConfig>(config);
  const [tableSubTab, setTableSubTab] = useState<"labels" | "layout">("labels");
  const fileInputRefHeader = useRef<HTMLInputElement>(null);
  const fileInputRefFooter = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) { setLocal(config); setEtTab("general"); } }, [config, open]);

  const update = (patch: Partial<TemplateConfig>) => {
    setLocal((prev) => {
      const next = { ...prev, ...patch };
      onChange(next);
      return next;
    });
  };

  const updateMargin = (k: keyof TemplateConfig["margins"], v: number) => {
    setLocal((prev) => {
      const next = { ...prev, margins: { ...prev.margins, [k]: v } };
      onChange(next);
      return next;
    });
  };

  const etTabs: { id: EditTemplateTab; label: string; icon: React.ReactNode }[] = [
    { id: "general", label: "General", icon: <Settings2 className="h-4 w-4" /> },
    { id: "header_footer", label: "Header & Footer", icon: <Layout className="h-4 w-4" /> },
    { id: "transaction", label: "Transaction Details", icon: <FileText className="h-4 w-4" /> },
    { id: "table", label: "Table", icon: <Grid className="h-4 w-4" /> },
    { id: "other", label: "Other Details", icon: <AlignLeft className="h-4 w-4" /> },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden gap-0 h-[640px]">
        <div className="flex h-full">
          {/* Left sidebar */}
          <div className="w-52 border-r bg-muted/30 flex flex-col shrink-0">
            <div className="px-4 py-3 border-b">
              <p className="text-sm font-semibold">Edit Template</p>
              <p className="text-xs text-muted-foreground mt-0.5">{local.templateName}</p>
            </div>
            <nav className="flex-1 py-2">
              {etTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setEtTab(tab.id)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors text-left ${
                    etTab === tab.id
                      ? "bg-primary/10 text-primary font-medium border-r-2 border-primary"
                      : "text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Right content area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-5 space-y-4">

              {/* ── GENERAL TAB ── */}
              {etTab === "general" && (
                <div className="space-y-5">
                  {/* Template Name */}
                  <div>
                    <Label className="text-xs mb-1.5 block">
                      Template Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      className="h-8 text-sm"
                      value={local.templateName}
                      onChange={(e) => update({ templateName: e.target.value })}
                    />
                  </div>

                  {/* Paper Size */}
                  <div>
                    <Label className="text-xs mb-2 block">
                      Paper Size <span className="text-muted-foreground text-[10px] ml-1">ⓘ</span>
                    </Label>
                    <div className="flex items-center gap-5">
                      {(["A5", "A4", "Letter"] as const).map((size) => (
                        <label key={size} className="flex items-center gap-1.5 cursor-pointer text-sm">
                          <input
                            type="radio"
                            name="paperSize"
                            value={size}
                            checked={local.paperSize === size}
                            onChange={() => update({ paperSize: size })}
                            className="h-3.5 w-3.5 accent-primary"
                          />
                          {size}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Orientation */}
                  <div>
                    <Label className="text-xs mb-2 block">Orientation</Label>
                    <div className="flex items-center gap-5">
                      {(["Portrait", "Landscape"] as const).map((orient) => (
                        <label key={orient} className="flex items-center gap-1.5 cursor-pointer text-sm">
                          <input
                            type="radio"
                            name="orientation"
                            value={orient}
                            checked={local.orientation === orient}
                            onChange={() => update({ orientation: orient })}
                            className="h-3.5 w-3.5 accent-primary"
                          />
                          {orient}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Margins */}
                  <div>
                    <Label className="text-xs mb-2 block">Margins (inches)</Label>
                    <div className="grid grid-cols-4 gap-2">
                      {(["top", "bottom", "left", "right"] as const).map((k) => (
                        <div key={k}>
                          <Label className="text-xs text-muted-foreground mb-1 block capitalize">{k}</Label>
                          <Input
                            type="number" step="0.05" min="0" max="3"
                            className="h-8 text-sm"
                            value={local.margins[k]}
                            onChange={(e) => updateMargin(k, parseFloat(e.target.value) || 0)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Font (collapsible) */}
                  <EtCollapsible title="Font" defaultOpen={false}>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs mb-1 block">Font Family</Label>
                        <Select value={local.fontFamily} onValueChange={(v) => update({ fontFamily: v })}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Inter, sans-serif">Inter</SelectItem>
                            <SelectItem value="Arial, sans-serif">Arial</SelectItem>
                            <SelectItem value="'Times New Roman', serif">Times New Roman</SelectItem>
                            <SelectItem value="Helvetica, sans-serif">Helvetica</SelectItem>
                            <SelectItem value="Georgia, serif">Georgia</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs mb-1 block">Font Size (pt)</Label>
                        <Select value={String(local.fontSize)} onValueChange={(v) => update({ fontSize: parseInt(v) })}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[8, 9, 10, 11, 12, 13, 14].map((s) => (
                              <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </EtCollapsible>

                  {/* Background (collapsible) */}
                  <EtCollapsible title="Background" defaultOpen={false}>
                    <div>
                      <Label className="text-xs mb-1.5 block">Background Color</Label>
                      <ColorPicker value={local.backgroundColor} onChange={(v) => update({ backgroundColor: v })} />
                    </div>
                  </EtCollapsible>
                </div>
              )}

              {/* ── HEADER & FOOTER TAB ── */}
              {etTab === "header_footer" && (
                <div className="space-y-3">
                  {/* Header section */}
                  <EtCollapsible title="Header" defaultOpen={true}>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Background Image</p>
                      <div
                        className="border-2 border-dashed border-blue-300 rounded-lg p-5 text-center bg-blue-50/30 cursor-pointer hover:bg-blue-50/60 transition-colors"
                        onClick={() => fileInputRefHeader.current?.click()}
                      >
                        <Upload className="h-6 w-6 text-blue-400 mx-auto mb-1.5" />
                        <p className="text-xs text-blue-600 font-medium">Drag and drop or Upload file</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Maximum size: 1 MB</p>
                        <p className="text-[10px] text-muted-foreground">Supported Formats: GIF, PNG, JPEG, JPG, BMP</p>
                        <Button variant="outline" size="sm" className="mt-2 h-6 text-xs pointer-events-none">
                          Choose from Gallery
                        </Button>
                      </div>
                      <input ref={fileInputRefHeader} type="file" accept="image/*" className="hidden" />
                    </div>

                    <div>
                      <Label className="text-xs mb-1 block">Image Position</Label>
                      <Select value={local.headerBgPosition} onValueChange={(v) => update({ headerBgPosition: v })}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["center center", "top left", "top center", "top right", "bottom left", "bottom center", "bottom right"].map((p) => (
                            <SelectItem key={p} value={p}>{p}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer flex-wrap">
                      <input
                        type="checkbox"
                        checked={local.headerBgColorEnabled}
                        onChange={(e) => update({ headerBgColorEnabled: e.target.checked })}
                        className="h-4 w-4 rounded"
                      />
                      <span className="text-sm">Background Color</span>
                      <ColorPicker value={local.headerBgColor} onChange={(v) => update({ headerBgColor: v })} />
                    </label>

                    <Button variant="outline" size="sm" className="w-full h-8 text-xs justify-start gap-2">
                      <Settings2 className="h-3.5 w-3.5" />Customize your header content
                    </Button>

                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={local.headerApplyFirstPageOnly}
                        onChange={(e) => update({ headerApplyFirstPageOnly: e.target.checked })}
                        className="h-4 w-4 rounded"
                      />
                      Apply to first page only
                    </label>
                  </EtCollapsible>

                  {/* Footer section */}
                  <EtCollapsible title="Footer" defaultOpen={false}>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs mb-1 block">Font Size</Label>
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number" min="6" max="24"
                            className="h-7 text-xs w-16"
                            value={local.footerFontSize}
                            onChange={(e) => update({ footerFontSize: parseInt(e.target.value) || 9 })}
                          />
                          <span className="text-xs text-muted-foreground">pt</span>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs mb-1 block">Font Color</Label>
                        <ColorPicker value={local.footerFontColor} onChange={(v) => update({ footerFontColor: v })} />
                      </div>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Background Image</p>
                      <div
                        className="border-2 border-dashed border-blue-300 rounded-lg p-4 text-center bg-blue-50/30 cursor-pointer hover:bg-blue-50/60 transition-colors"
                        onClick={() => fileInputRefFooter.current?.click()}
                      >
                        <Upload className="h-5 w-5 text-blue-400 mx-auto mb-1" />
                        <p className="text-xs text-blue-600 font-medium">Drag and drop or Upload file</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Maximum size: 1 MB · GIF, PNG, JPEG, JPG, BMP</p>
                        <Button variant="outline" size="sm" className="mt-1.5 h-6 text-xs pointer-events-none">Choose from Gallery</Button>
                      </div>
                      <input ref={fileInputRefFooter} type="file" accept="image/*" className="hidden" />
                    </div>

                    <div>
                      <Label className="text-xs mb-1 block">Image Position</Label>
                      <Select value={local.footerBgPosition} onValueChange={(v) => update({ footerBgPosition: v })}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["center center", "top left", "top center", "top right", "bottom left", "bottom center", "bottom right"].map((p) => (
                            <SelectItem key={p} value={p}>{p}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer flex-wrap">
                      <input
                        type="checkbox"
                        checked={local.footerBgColorEnabled}
                        onChange={(e) => update({ footerBgColorEnabled: e.target.checked })}
                        className="h-4 w-4 rounded"
                      />
                      <span className="text-sm">Background Color</span>
                      <ColorPicker value={local.footerBgColor} onChange={(v) => update({ footerBgColor: v })} />
                    </label>

                    <div>
                      <Label className="text-xs mb-1 block">Footer Text</Label>
                      <Textarea
                        className="text-sm resize-none"
                        rows={2}
                        value={local.footerCustomContent}
                        onChange={(e) => update({ footerCustomContent: e.target.value })}
                        placeholder="e.g. This is a computer-generated statement"
                      />
                    </div>

                    <Button variant="outline" size="sm" className="w-full h-8 text-xs justify-start gap-2">
                      <Settings2 className="h-3.5 w-3.5" />Customize your footer content
                    </Button>
                  </EtCollapsible>
                </div>
              )}

              {/* ── TRANSACTION DETAILS TAB ── */}
              {etTab === "transaction" && (
                <div className="space-y-3">
                  {/* Organization Details */}
                  <EtCollapsible title="Organization Details" defaultOpen={true}>
                    <div className="space-y-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={local.showOrgLogo}
                          onChange={(e) => update({ showOrgLogo: e.target.checked })}
                          className="h-4 w-4 rounded"
                        />
                        <span className="text-sm font-medium">Show Organization Logo</span>
                      </label>

                      {local.showOrgLogo && (
                        <div className="ml-6 space-y-2">
                          <div className="w-20 h-16 border-2 border-dashed border-border rounded flex items-center justify-center bg-muted/20">
                            <ImagePlus className="h-6 w-6 text-muted-foreground/40" />
                          </div>
                          <p className="text-[10px] text-orange-500 italic">
                            ℹ You can change the logo in Organization Profile.
                          </p>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground shrink-0">Resize Logo</span>
                            <input
                              type="range" min="30" max="120" step="5"
                              value={local.orgLogoSize}
                              onChange={(e) => update({ orgLogoSize: parseInt(e.target.value) })}
                              className="flex-1 accent-primary"
                            />
                            <span className="text-xs text-muted-foreground w-10 text-right">{local.orgLogoSize}px</span>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="flex items-center gap-2 cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={local.showOrgName}
                            onChange={(e) => update({ showOrgName: e.target.checked })}
                            className="h-4 w-4 rounded"
                          />
                          <span className="text-sm">Show Organization Name</span>
                        </label>
                        {local.showOrgName && (
                          <div className="flex items-center gap-2 ml-auto">
                            <ColorPicker value={local.orgNameColor} onChange={(v) => update({ orgNameColor: v })} />
                            <div className="flex items-center gap-1">
                              <Input
                                type="number" min="6" max="24"
                                className="h-7 text-xs w-12"
                                value={local.orgNameFontSize}
                                onChange={(e) => update({ orgNameFontSize: parseInt(e.target.value) || 10 })}
                              />
                              <span className="text-xs text-muted-foreground">pt</span>
                            </div>
                          </div>
                        )}
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={local.showOrgAddress}
                          onChange={(e) => update({ showOrgAddress: e.target.checked })}
                          className="h-4 w-4 rounded"
                        />
                        <span className="text-sm">Show Organization Address</span>
                      </label>
                    </div>
                  </EtCollapsible>

                  {/* Vendor Details */}
                  <EtCollapsible title="Vendor Details" defaultOpen={false}>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs mb-1.5 block">Vendor Name</Label>
                        <div className="flex items-center gap-4 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">Font Color</span>
                            <ColorPicker value={local.vendorNameFontColor} onChange={(v) => update({ vendorNameFontColor: v })} />
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">Font Size</span>
                            <Input
                              type="number" min="6" max="24"
                              className="h-7 text-xs w-12 ml-1"
                              value={local.vendorNameFontSize}
                              onChange={(e) => update({ vendorNameFontSize: parseInt(e.target.value) || 9 })}
                            />
                            <span className="text-xs text-muted-foreground">pt</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={local.showBillTo}
                            onChange={(e) => update({ showBillTo: e.target.checked })}
                            className="h-4 w-4 rounded"
                          />
                          <span className="text-sm">Bill To</span>
                        </label>
                        {local.showBillTo && (
                          <Input
                            className="h-7 text-xs flex-1"
                            value={local.billToLabel}
                            onChange={(e) => update({ billToLabel: e.target.value })}
                            placeholder="To"
                          />
                        )}
                      </div>
                    </div>
                  </EtCollapsible>

                  {/* Document Details */}
                  <EtCollapsible title="Document Details" defaultOpen={false}>
                    <div className="space-y-3">
                      {/* Document Title */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="flex items-center gap-2 cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={local.showDocTitle}
                            onChange={(e) => update({ showDocTitle: e.target.checked })}
                            className="h-4 w-4 rounded"
                          />
                          <span className="text-sm">Show Document Title</span>
                        </label>
                        {local.showDocTitle && (
                          <Input
                            className="h-7 text-xs flex-1"
                            value={local.docTitle}
                            onChange={(e) => update({ docTitle: e.target.value })}
                          />
                        )}
                      </div>
                      {local.showDocTitle && (
                        <div className="flex items-center gap-4 ml-6 flex-wrap">
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">Font Size</span>
                            <Input
                              type="number" min="8" max="40"
                              className="h-7 text-xs w-12 ml-1"
                              value={local.docTitleFontSize}
                              onChange={(e) => update({ docTitleFontSize: parseInt(e.target.value) || 16 })}
                            />
                            <span className="text-xs text-muted-foreground">pt</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">Font Color</span>
                            <ColorPicker value={local.docTitleFontColor} onChange={(v) => update({ docTitleFontColor: v })} />
                          </div>
                        </div>
                      )}

                      <Separator />

                      {/* Phone & Fax */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs mb-1 block">Phone</Label>
                          <Input className="h-7 text-xs" placeholder="Phone" value={local.docPhone} onChange={(e) => update({ docPhone: e.target.value })} />
                        </div>
                        <div>
                          <Label className="text-xs mb-1 block">Fax Number</Label>
                          <Input className="h-7 text-xs" placeholder="Fax" value={local.docFax} onChange={(e) => update({ docFax: e.target.value })} />
                        </div>
                      </div>

                      <Separator />

                      {/* Reference Field */}
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Document Information</p>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={local.showRefField}
                            onChange={(e) => update({ showRefField: e.target.checked })}
                            className="h-4 w-4 rounded"
                          />
                          <span className="text-sm">Reference Field</span>
                        </label>
                        {local.showRefField && (
                          <Input className="h-7 text-xs flex-1" value={local.refFieldLabel} onChange={(e) => update({ refFieldLabel: e.target.value })} />
                        )}
                      </div>

                      <Separator />

                      {/* Account Summary */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <label className="flex items-center gap-2 cursor-pointer shrink-0">
                            <input
                              type="checkbox"
                              checked={local.showAccountSummary}
                              onChange={(e) => update({ showAccountSummary: e.target.checked })}
                              className="h-4 w-4 rounded"
                            />
                            <span className="text-sm font-semibold">Total Account Summary</span>
                          </label>
                          {local.showAccountSummary && (
                            <Input
                              className="h-7 text-xs flex-1"
                              value={local.accountSummaryLabel}
                              onChange={(e) => update({ accountSummaryLabel: e.target.value })}
                            />
                          )}
                        </div>
                        {local.showAccountSummary && (
                          <div className="ml-6 space-y-1.5">
                            {([
                              ["showOpeningBalance", "openingBalanceLabel", "Opening Balance"],
                              ["showInvoicedAmount", "invoicedAmountLabel", "Invoiced Amount"],
                              ["showAmountPaid", "amountPaidLabel", "Amount Paid"],
                              ["showBalanceDue", "balanceDueLabel", "Balance Due"],
                            ] as [keyof TemplateConfig, keyof TemplateConfig, string][]).map(([checkKey, labelKey, placeholder]) => (
                              <div key={String(checkKey)} className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={local[checkKey] as boolean}
                                  onChange={(e) => update({ [checkKey]: e.target.checked })}
                                  className="h-4 w-4 rounded"
                                />
                                <Input
                                  className="h-7 text-xs flex-1"
                                  value={local[labelKey] as string}
                                  onChange={(e) => update({ [labelKey]: e.target.value })}
                                  placeholder={placeholder}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </EtCollapsible>
                </div>
              )}

              {/* ── TABLE TAB ── */}
              {etTab === "table" && (
                <div className="space-y-4">
                  <p className="text-sm font-semibold">Statement Table</p>
                  {/* Sub-tab toggle */}
                  <div className="flex border-b gap-0">
                    {(["labels", "layout"] as const).map((sub) => (
                      <button
                        key={sub}
                        onClick={() => setTableSubTab(sub)}
                        className={`px-5 py-2 text-sm capitalize transition-colors border-b-2 -mb-px ${
                          tableSubTab === sub
                            ? "border-primary text-primary font-medium"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {sub.charAt(0).toUpperCase() + sub.slice(1)}
                      </button>
                    ))}
                  </div>

                  {/* Labels sub-tab */}
                  {tableSubTab === "labels" && (
                    <div className="space-y-2">
                      {([
                        { checkKey: "colDate" as const, labelKey: "dateLabel" as const, label: "Date" },
                        { checkKey: "colTransactionType" as const, labelKey: "transactionTypeLabel" as const, label: "Transaction Type" },
                        { checkKey: "colTransactionDetails" as const, labelKey: "transactionDetailsLabel" as const, label: "Transaction Details" },
                        { checkKey: "colAmount" as const, labelKey: "amountLabel" as const, label: "Amount" },
                        { checkKey: "colPayments" as const, labelKey: "paymentsLabel" as const, label: "Payments" },
                        { checkKey: "colBalance" as const, labelKey: "balanceLabel" as const, label: "Balance" },
                      ]).map(({ checkKey, labelKey, label }) => (
                        <div key={checkKey} className="flex items-center gap-3">
                          <label className="flex items-center gap-2 cursor-pointer w-44 shrink-0">
                            <input
                              type="checkbox"
                              checked={local[checkKey]}
                              onChange={(e) => update({ [checkKey]: e.target.checked })}
                              className="h-4 w-4 rounded"
                            />
                            <span className="text-sm">{label}</span>
                          </label>
                          <Input
                            className="h-7 text-xs flex-1"
                            value={local[labelKey]}
                            onChange={(e) => update({ [labelKey]: e.target.value })}
                          />
                          {checkKey === "colTransactionDetails" && (
                            <label className="flex items-center gap-1.5 shrink-0 cursor-pointer text-xs text-muted-foreground whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={local.showNotes}
                                onChange={(e) => update({ showNotes: e.target.checked })}
                                className="h-3.5 w-3.5 rounded"
                              />
                              Show Notes
                            </label>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Layout sub-tab */}
                  {tableSubTab === "layout" && (
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Table Header</p>
                        <div className="space-y-2.5">
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground w-28 shrink-0">Font Size</span>
                            <div className="flex items-center gap-1">
                              <Input
                                type="number" min="6" max="24"
                                className="h-7 text-xs w-14"
                                value={local.tableHeaderFontSize}
                                onChange={(e) => update({ tableHeaderFontSize: parseInt(e.target.value) || 9 })}
                              />
                              <span className="text-xs text-muted-foreground">pt</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground w-28 shrink-0">Background Color</span>
                            <ColorPicker value={local.tableHeaderBgColor} onChange={(v) => update({ tableHeaderBgColor: v })} />
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground w-28 shrink-0">Font Color</span>
                            <ColorPicker value={local.tableHeaderFontColor} onChange={(v) => update({ tableHeaderFontColor: v })} />
                          </div>
                        </div>
                      </div>
                      <Separator />
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Statement Table Row</p>
                        <div className="space-y-2.5">
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground w-28 shrink-0">Odd Row Color</span>
                            <ColorPicker value={local.oddRowColor} onChange={(v) => update({ oddRowColor: v })} />
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground w-28 shrink-0">Even Row Color</span>
                            <ColorPicker value={local.evenRowColor} onChange={(v) => update({ evenRowColor: v })} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── OTHER DETAILS TAB ── */}
              {etTab === "other" && (
                <div className="space-y-3">
                  <EtCollapsible title="Annexure" defaultOpen={true}>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Click{" "}
                      <span className="font-medium text-foreground">Add Annexure Content</span>{" "}
                      to enter additional information apart from your Terms &amp; Conditions.
                      It can include by-laws, clauses and other details pertaining to your organization.
                      This will be included on a separate page at the end of every{" "}
                      <span className="font-medium text-foreground">Vendor Statement</span>.
                    </p>
                    <Button
                      variant="outline" size="sm"
                      className="w-full h-8 text-xs justify-start gap-2"
                      onClick={() => update({ annexureContent: local.annexureContent || "\n" })}
                    >
                      <Settings2 className="h-3.5 w-3.5" />Add Annexure Content
                    </Button>
                    {local.annexureContent.trim() && (
                      <Textarea
                        className="text-sm resize-none mt-1"
                        rows={5}
                        value={local.annexureContent}
                        onChange={(e) => update({ annexureContent: e.target.value })}
                        placeholder="Enter annexure content..."
                      />
                    )}
                  </EtCollapsible>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t px-5 py-3 flex justify-end gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" onClick={() => { onChange(local); onClose(); }}>Apply Changes</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}




// ─── LogoAddressDialog ───────────────────────────────────────────────────────

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
  "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal", "Delhi", "Jammu & Kashmir", "Ladakh",
  "Puducherry", "Chandigarh", "Andaman & Nicobar Islands",
  "Dadra & Nagar Haveli and Daman & Diu", "Lakshadweep",
];

const INDUSTRIES = [
  "Agriculture", "Automotive", "Banking", "Construction", "Education",
  "Entertainment", "Food & Beverage", "Healthcare", "IT & Technology",
  "Legal", "Manufacturing", "Media", "Pharmaceuticals", "Real Estate",
  "Retail", "Services", "Telecommunications", "Transportation", "Other",
];

interface OrgLogoAddress {
  logo: string;
  address: { street?: string; street2?: string; city?: string; state?: string; zip?: string; phone?: string; fax?: string; website?: string };
  industry: string;
}

function LogoAddressDialog({
  open, onClose, orgId, initial, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  orgId: string;
  initial: OrgLogoAddress;
  onSaved: (data: OrgLogoAddress) => void;
}) {
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState(initial.logo);
  const [logoUrl, setLogoUrl] = useState(initial.logo);
  const [street, setStreet] = useState(initial.address.street ?? "");
  const [street2, setStreet2] = useState(initial.address.street2 ?? "");
  const [city, setCity] = useState(initial.address.city ?? "");
  const [addrState, setAddrState] = useState(initial.address.state ?? "");
  const [zip, setZip] = useState(initial.address.zip ?? "");
  const [phone, setPhone] = useState(initial.address.phone ?? "");
  const [fax, setFax] = useState(initial.address.fax ?? "");
  const [website, setWebsite] = useState(initial.address.website ?? "");
  const [industry, setIndustry] = useState(initial.industry);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setLogoPreview(initial.logo);
    setLogoUrl(initial.logo);
    setLogoFile(null);
    setStreet(initial.address.street ?? "");
    setStreet2(initial.address.street2 ?? "");
    setCity(initial.address.city ?? "");
    setAddrState(initial.address.state ?? "");
    setZip(initial.address.zip ?? "");
    setPhone(initial.address.phone ?? "");
    setFax(initial.address.fax ?? "");
    setWebsite(initial.address.website ?? "");
    setIndustry(initial.industry);
  }, [open]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/bmp"];
    if (!allowed.includes(file.type)) { toast.error("Only JPG, PNG, GIF, or BMP allowed"); return; }
    if (file.size > 1 * 1024 * 1024) { toast.error("Image must be less than 1 MB"); return; }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  async function handleSave() {
    setSaving(true);
    try {
      let finalLogoUrl = logoUrl;
      if (logoFile) {
        const formData = new FormData();
        formData.append("file", logoFile);
        const uploadRes = await apiFetch<{ data: { url: string } }>("/upload?folder=logos", {
          method: "POST",
          body: formData,
        });
        finalLogoUrl = uploadRes.data.url;
      }
      const address = { street, street2, city, state: addrState, zip, phone, fax, website };
      await organizationApi.update(orgId, { logo: finalLogoUrl, address: address as any, industry } as any);
      onSaved({ logo: finalLogoUrl, address, industry });
      toast.success("Organization details saved");
      onClose();
    } catch {
      toast.error("Failed to save organization details");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Update Logo & Address</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-5 py-2 pr-1">
          {/* Logo */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Organization Logo</p>
            <div className="flex items-start gap-4">
              <div
                className="w-24 h-24 border-2 border-dashed border-border rounded-lg flex items-center justify-center bg-muted/10 overflow-hidden shrink-0 cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-1" />
                ) : (
                  <ImagePlus className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1">
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/gif,image/bmp" className="hidden" onChange={handleFileChange} />
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5 mr-1.5" />Upload Logo
                </Button>
                <p className="text-xs text-muted-foreground mt-2">Supported: JPG, JPEG, PNG, GIF, BMP · Max 1 MB</p>
                {logoPreview && (
                  <button onClick={() => { setLogoFile(null); setLogoPreview(""); setLogoUrl(""); }} className="text-xs text-destructive mt-1 hover:underline">
                    Remove logo
                  </button>
                )}
              </div>
            </div>
          </div>
          <Separator />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Organization Address</p>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs mb-1 block">Street 1</Label><Input className="h-8 text-sm" value={street} onChange={(e) => setStreet(e.target.value)} /></div>
              <div><Label className="text-xs mb-1 block">Street 2</Label><Input className="h-8 text-sm" value={street2} onChange={(e) => setStreet2(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs mb-1 block">City</Label><Input className="h-8 text-sm" value={city} onChange={(e) => setCity(e.target.value)} /></div>
              <div><Label className="text-xs mb-1 block">Pin Code</Label><Input className="h-8 text-sm" value={zip} onChange={(e) => setZip(e.target.value)} /></div>
              <div>
                <Label className="text-xs mb-1 block">State</Label>
                <Select value={addrState} onValueChange={setAddrState}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select state" /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {INDIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs mb-1 block">Phone</Label><Input className="h-8 text-sm" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
              <div><Label className="text-xs mb-1 block">Fax Number</Label><Input className="h-8 text-sm" value={fax} onChange={(e) => setFax(e.target.value)} /></div>
            </div>
            <div><Label className="text-xs mb-1 block">Website URL</Label><Input className="h-8 text-sm" type="url" placeholder="https://" value={website} onChange={(e) => setWebsite(e.target.value)} /></div>
            <div>
              <Label className="text-xs mb-1 block">Select Industry</Label>
              <Select value={industry} onValueChange={setIndustry}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select industry" /></SelectTrigger>
                <SelectContent>{INDUSTRIES.map((ind) => <SelectItem key={ind} value={ind}>{ind}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter className="shrink-0 border-t pt-3">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function computeStatement(
  expenses: Expense[],
  bills: Bill[],
  payments: PaymentMade[],
  credits: VendorCredit[],
  openingBalance: number,
  startDate: Date,
  endDate: Date
) {
  const rows: StatementRow[] = [];
  const from = new Date(startDate);
  from.setHours(0, 0, 0, 0);
  const to = new Date(endDate);
  to.setHours(23, 59, 59, 999);

  let runningBalance = openingBalance;

  // Calculate opening balance at startDate by including all historical transactions before startDate
  for (const exp of expenses) {
    if (new Date(exp.date) < from && exp.status !== "Draft" && exp.status !== "Rejected") {
      runningBalance += exp.amount;
    }
  }
  for (const bill of bills) {
    if (new Date(bill.billDate) < from && bill.status !== "Void" && bill.status !== "Draft") {
      runningBalance += bill.total;
    }
  }
  for (const p of payments) {
    if (new Date(p.payment_date) < from && p.status === "PAID") {
      runningBalance -= p.total_amount_paid;
    }
  }
  for (const c of credits) {
    if (new Date(c.vendorCreditDate) < from && c.status !== "VOID" && c.status !== "DRAFT") {
      runningBalance -= c.total;
    }
  }

  // Add opening balance row
  rows.push({
    date: format(startDate, "dd/MM/yyyy"),
    type: "***Opening Balance***",
    details: "",
    amount: runningBalance,
    payments: 0,
    balance: runningBalance,
  });

  const initialBalanceForCalculations = runningBalance;

  // Collect all matching items in range
  const items: Array<{
    date: Date;
    dateStr: string;
    type: string;
    details: string;
    amount: number;
    payments: number;
  }> = [];

  for (const exp of expenses) {
    const d = new Date(exp.date);
    if (d >= from && d <= to && exp.status !== "Draft" && exp.status !== "Rejected") {
      items.push({
        date: d,
        dateStr: fmtDate(exp.date),
        type: "Expense",
        details: exp.expenseNumber,
        amount: exp.amount,
        payments: 0,
      });
    }
  }

  for (const bill of bills) {
    const d = new Date(bill.billDate);
    if (d >= from && d <= to && bill.status !== "Void" && bill.status !== "Draft") {
      items.push({
        date: d,
        dateStr: fmtDate(bill.billDate),
        type: "Bill",
        details: bill.billNumber,
        amount: bill.total,
        payments: 0,
      });
    }
  }

  for (const p of payments) {
    const d = new Date(p.payment_date);
    if (d >= from && d <= to && p.status === "PAID") {
      items.push({
        date: d,
        dateStr: fmtDate(p.payment_date),
        type: p.payment_type === "vendor-advance" ? "Vendor Advance" : "Payment Made",
        details: p.payment_number,
        amount: 0,
        payments: p.total_amount_paid,
      });
    }
  }

  for (const c of credits) {
    const d = new Date(c.vendorCreditDate);
    if (d >= from && d <= to && c.status !== "VOID" && c.status !== "DRAFT") {
      items.push({
        date: d,
        dateStr: fmtDate(c.vendorCreditDate),
        type: "Vendor Credit",
        details: c.vendorCreditNumber,
        amount: 0,
        payments: c.total,
      });
    }
  }

  // Sort items chronologically
  items.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Calculate balances
  for (const item of items) {
    if (item.amount > 0) {
      runningBalance += item.amount;
    } else {
      runningBalance -= item.payments;
    }
    rows.push({
      date: item.dateStr,
      type: item.type,
      details: item.details,
      amount: item.amount,
      payments: item.payments,
      balance: runningBalance,
    });
  }

  const totalBilled = items.reduce((s, x) => s + x.amount, 0);
  const totalPaid = items.reduce((s, x) => s + x.payments, 0);

  return {
    rows,
    openingBalance: initialBalanceForCalculations,
    totalBilled,
    totalPaid,
    balanceDue: runningBalance,
  };
}

// â”€â”€â”€ ExpensesSection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ExpensesSection({ expenses, loading }: { expenses: Expense[]; loading: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  return (
    <div className="border rounded-lg mb-4">
      <div className="flex items-center justify-between px-4 py-3 bg-muted/20 rounded-t-lg">
        <button type="button" className="inline-flex items-center gap-2" onClick={() => setOpen((v) => !v)}>
          <span className="text-sm font-semibold">Expenses</span>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => router.push(`/purchases/expenses/new`)}>
          <Plus className="h-3 w-3 mr-1" />New
        </Button>
      </div>
      {open && (
        <>
          <Separator />
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              No expenses found.{" "}
              <button className="text-primary underline" onClick={() => router.push(`/purchases/expenses/new`)}>Add New</button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead>Date</TableHead><TableHead>Expense #</TableHead><TableHead>Account</TableHead>
                  <TableHead>Paid Through</TableHead><TableHead>Customer</TableHead>
                  <TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((e) => {
                  const account = typeof e.expenseAccountId === "object" && e.expenseAccountId ? e.expenseAccountId.name : "â€”";
                  const paidThrough = typeof e.paidThroughAccountId === "object" && e.paidThroughAccountId ? e.paidThroughAccountId.name : "â€”";
                  const customer = typeof e.customerId === "object" && e.customerId ? e.customerId.displayName : "â€”";
                  return (
                    <TableRow key={e._id} className="text-sm cursor-pointer hover:bg-muted/30" onClick={() => router.push(`/purchases/expenses/${e.expenseNumber}`)}>
                      <TableCell>{fmtDate(e.date)}</TableCell>
                      <TableCell className="font-mono text-xs text-primary">{e.expenseNumber}</TableCell>
                      <TableCell>{account}</TableCell><TableCell>{paidThrough}</TableCell><TableCell>{customer}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(e.amount, e.currency)}</TableCell>
                      <TableCell>
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${expenseStatus(e.status)}`}>{e.status}</span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </>
      )}
    </div>
  );
}

function BillsSection({ bills, loading }: { bills: Bill[]; loading: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  return (
    <div className="border rounded-lg mb-4">
      <div className="flex items-center justify-between px-4 py-3 bg-muted/20 rounded-t-lg">
        <button type="button" className="inline-flex items-center gap-2" onClick={() => setOpen((v) => !v)}>
          <span className="text-sm font-semibold">Bills</span>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => router.push("/purchases/bills/new")}>
          <Plus className="h-3 w-3 mr-1" />New
        </Button>
      </div>
      {open && (
      <>
      <Separator />
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : bills.length === 0 ? (
        <div className="text-center py-5 text-sm text-muted-foreground">No data to display</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Bill #</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead><TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bills.map((b) => (
              <TableRow key={b._id} className="text-sm cursor-pointer hover:bg-muted/30" onClick={() => router.push(`/purchases/bills/${b._id}/edit`)}>
                <TableCell className="font-medium text-primary">{b.billNumber}</TableCell>
                <TableCell>{fmtDate(b.billDate)}</TableCell>
                <TableCell>{b.status}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(b.total, "INR")}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(b.balanceDue, "INR")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      </>
      )}
    </div>
  );
}

function BillPaymentsSection({ payments, loading }: { payments: PaymentMade[]; loading: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  return (
    <div className="border rounded-lg mb-4">
      <div className="flex items-center justify-between px-4 py-3 bg-muted/20 rounded-t-lg">
        <button type="button" className="inline-flex items-center gap-2" onClick={() => setOpen((v) => !v)}>
          <span className="text-sm font-semibold">Bill Payments</span>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => router.push("/purchases/payments-made/new")}>
          <Plus className="h-3 w-3 mr-1" />New
        </Button>
      </div>
      {open && (
      <>
      <Separator />
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : payments.length === 0 ? (
        <div className="text-center py-5 text-sm text-muted-foreground">No data to display</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Payment Voucher Number</TableHead><TableHead>Date</TableHead><TableHead>Mode</TableHead>
              <TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((p) => (
              <TableRow key={p._id} className="text-sm cursor-pointer hover:bg-muted/30" onClick={() => router.push(`/purchases/payments-made/${p._id}/edit`)}>
                <TableCell className="font-medium text-primary">{p.payment_number}</TableCell>
                <TableCell>{fmtDate(p.payment_date)}</TableCell>
                <TableCell>{p.payment_mode}</TableCell>
                <TableCell>{p.status}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(p.total_amount_paid, "INR")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      </>
      )}
    </div>
  );
}

function RecurringBillsSection({ recurringBills, loading }: { recurringBills: RecurringBill[]; loading: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  return (
    <div className="border rounded-lg mb-4">
      <div className="flex items-center justify-between px-4 py-3 bg-muted/20 rounded-t-lg">
        <button type="button" className="inline-flex items-center gap-2" onClick={() => setOpen((v) => !v)}>
          <span className="text-sm font-semibold">Recurring Bills</span>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => router.push("/purchases/recurring-bills/new")}>
          <Plus className="h-3 w-3 mr-1" />New
        </Button>
      </div>
      {open && (
      <>
      <Separator />
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : recurringBills.length === 0 ? (
        <div className="text-center py-5 text-sm text-muted-foreground">No data to display</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Profile</TableHead><TableHead>Frequency</TableHead><TableHead>Status</TableHead><TableHead>Next Bill</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recurringBills.map((rb) => (
              <TableRow key={rb._id} className="text-sm cursor-pointer hover:bg-muted/30" onClick={() => router.push(`/purchases/recurring-bills/${rb._id}/edit`)}>
                <TableCell className="font-medium text-primary">{rb.profileName}</TableCell>
                <TableCell>{rb.repeatEvery === 1 ? rb.frequency : `Every ${rb.repeatEvery} ${rb.frequency}`}</TableCell>
                <TableCell>{rb.status}</TableCell>
                <TableCell>{fmtDate(rb.nextBillDate ?? undefined)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      </>
      )}
    </div>
  );
}

function RecurringExpensesSection({ recurringExpenses, loading }: { recurringExpenses: RecurringExpense[]; loading: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  return (
    <div className="border rounded-lg mb-4">
      <div className="flex items-center justify-between px-4 py-3 bg-muted/20 rounded-t-lg">
        <button type="button" className="inline-flex items-center gap-2" onClick={() => setOpen((v) => !v)}>
          <span className="text-sm font-semibold">Recurring Expenses</span>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => router.push("/purchases/recurring-expenses/new")}>
          <Plus className="h-3 w-3 mr-1" />New
        </Button>
      </div>
      {open && (
      <>
      <Separator />
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : recurringExpenses.length === 0 ? (
        <div className="text-center py-5 text-sm text-muted-foreground">No data to display</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Profile</TableHead><TableHead>Frequency</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recurringExpenses.map((re) => (
              <TableRow key={re._id} className="text-sm cursor-pointer hover:bg-muted/30" onClick={() => router.push(`/purchases/recurring-expenses/${re._id}/edit`)}>
                <TableCell className="font-medium text-primary">{re.profileName}</TableCell>
                <TableCell>{re.repeatEvery === 1 ? re.frequency : `Every ${re.repeatEvery} ${re.frequency}`}</TableCell>
                <TableCell>{re.status}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(re.amount, re.currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      </>
      )}
    </div>
  );
}

function PurchaseOrdersSection({ purchaseOrders, loading }: { purchaseOrders: PurchaseOrder[]; loading: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  return (
    <div className="border rounded-lg mb-4">
      <div className="flex items-center justify-between px-4 py-3 bg-muted/20 rounded-t-lg">
        <button type="button" className="inline-flex items-center gap-2" onClick={() => setOpen((v) => !v)}>
          <span className="text-sm font-semibold">Purchase Orders</span>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => router.push("/purchases/orders/new")}>
          <Plus className="h-3 w-3 mr-1" />New
        </Button>
      </div>
      {open && (
      <>
      <Separator />
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : purchaseOrders.length === 0 ? (
        <div className="text-center py-5 text-sm text-muted-foreground">No data to display</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>PO #</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchaseOrders.map((po) => (
              <TableRow key={po._id} className="text-sm cursor-pointer hover:bg-muted/30" onClick={() => router.push(`/purchases/orders/${po._id}/edit`)}>
                <TableCell className="font-medium text-primary">{po.purchaseOrderNumber}</TableCell>
                <TableCell>{fmtDate(po.purchaseOrderDate)}</TableCell>
                <TableCell>{po.status}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(po.total, "INR")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      </>
      )}
    </div>
  );
}

function VendorCreditsSection({ vendorCredits, loading }: { vendorCredits: VendorCredit[]; loading: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  return (
    <div className="border rounded-lg mb-4">
      <div className="flex items-center justify-between px-4 py-3 bg-muted/20 rounded-t-lg">
        <button type="button" className="inline-flex items-center gap-2" onClick={() => setOpen((v) => !v)}>
          <span className="text-sm font-semibold">Vendor Credits</span>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => router.push("/purchases/vendor-credits/new")}>
          <Plus className="h-3 w-3 mr-1" />New
        </Button>
      </div>
      {open && (
      <>
      <Separator />
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : vendorCredits.length === 0 ? (
        <div className="text-center py-5 text-sm text-muted-foreground">No data to display</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Credit #</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead><TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendorCredits.map((vc) => (
              <TableRow key={vc._id} className="text-sm cursor-pointer hover:bg-muted/30" onClick={() => router.push(`/purchases/vendor-credits/${vc._id}/edit`)}>
                <TableCell className="font-medium text-primary">{vc.vendorCreditNumber}</TableCell>
                <TableCell>{fmtDate(vc.vendorCreditDate)}</TableCell>
                <TableCell>{vc.status}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(vc.total, "INR")}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(vc.balanceAmount, "INR")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      </>
      )}
    </div>
  );
}

function JournalsSection({ journals, loading }: { journals: Journal[]; loading: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border rounded-lg mb-4">
      <div className="flex items-center justify-between px-4 py-3 bg-muted/20 rounded-t-lg">
        <button type="button" className="inline-flex items-center gap-2" onClick={() => setOpen((v) => !v)}>
          <span className="text-sm font-semibold">Journals</span>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
      </div>
      {open && (
      <>
      <Separator />
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : journals.length === 0 ? (
        <div className="text-center py-5 text-sm text-muted-foreground">No data to display</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Journal #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Credit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {journals.map((j) => (
              <TableRow key={j._id} className="text-sm">
                <TableCell className="font-medium">{j.journalNumber}</TableCell>
                <TableCell>{fmtDate(j.date)}</TableCell>
                <TableCell>{j.description || "-"}</TableCell>
                <TableCell>{j.status}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(j.totalDebit, "INR")}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(j.totalCredit, "INR")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      </>
      )}
    </div>
  );
}

function EmptySection({ title }: { title: string }) {
  return (
    <div className="border rounded-lg mb-4">
      <div className="flex items-center justify-between px-4 py-3 bg-muted/20 rounded-t-lg">
        <span className="text-sm font-semibold">{title}</span>
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled><Plus className="h-3 w-3 mr-1" />New</Button>
      </div>
      <Separator />
      <div className="text-center py-5 text-sm text-muted-foreground">No data to display</div>
    </div>
  );
}

// â”€â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface VendorDetailViewProps {
  vendor: Contact;
  onVendorUpdate: (v: Contact) => void;
  onClose?: () => void;
  initialTab?: string;
}

const TMPL_KEY = (id: string) => `stmt-tmpl-config-${id}`;

export function VendorDetailView({ vendor: initialVendor, onVendorUpdate, onClose, initialTab }: VendorDetailViewProps) {
  const router = useRouter();
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  const [vendor, setVendor] = useState<Contact>(initialVendor);
  const [saving, setSaving] = useState(false);

  const [cpDialogOpen, setCpDialogOpen] = useState(false);
  const [editingCpIdx, setEditingCpIdx] = useState<number | null>(null);
  const [bankDialogOpen, setBankDialogOpen] = useState(false);

  const [attachmentPopupOpen, setAttachmentPopupOpen] = useState(false);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [linkCustomerDialogOpen, setLinkCustomerDialogOpen] = useState(false);
  const [associateTemplatesDialogOpen, setAssociateTemplatesDialogOpen] = useState(false);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeTargetVendorId, setMergeTargetVendorId] = useState("");
  const [mergeCandidates, setMergeCandidates] = useState<Contact[]>([]);
  const [merging, setMerging] = useState(false);

  const [commentText, setCommentText] = useState("");
  const [addingComment, setAddingComment] = useState(false);
  const [comments, setComments] = useState<ContactComment[]>(vendor.comments ?? []);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [bills, setBills] = useState<Bill[]>([]);
  const [paymentsMade, setPaymentsMade] = useState<PaymentMade[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [recurringBills, setRecurringBills] = useState<RecurringBill[]>([]);
  const [txRecurringExpenses, setTxRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [vendorCredits, setVendorCredits] = useState<VendorCredit[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);

  const [recurringProfiles, setRecurringProfiles] = useState<RecurringExpense[]>([]);
  const [recurringLoading, setRecurringLoading] = useState(false);

  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("6m");
  const [chartMode, setChartMode] = useState<"accrual" | "cash">("accrual");

  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  const [activeTab, setActiveTab] = useState(initialTab ?? "overview");

  // In standalone mode, read the ?tab= param from URL after mount (avoids SSR window issues)
  useEffect(() => {
    if (!onClose && typeof window !== "undefined") {
      const tabFromUrl = new URLSearchParams(window.location.search).get("tab");
      if (tabFromUrl) setActiveTab(tabFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [stmtStart, setStmtStart] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [stmtEnd, setStmtEnd] = useState(new Date());

  // Statement customization
  const [templateConfig, setTemplateConfig] = useState<TemplateConfig>(DEFAULT_TEMPLATE_CONFIG);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [logoAddressOpen, setLogoAddressOpen] = useState(false);
  const [templateSyncStatus, setTemplateSyncStatus] = useState<"idle" | "saving" | "synced" | "error">("idle");
  const templateSyncResetTimeout = useRef<NodeJS.Timeout | null>(null);

  // Org logo/address (local state, loaded from activeOrganization context)
  const { activeOrganization, refreshOrganizations } = useOrganization();
  const [orgLogoOverride, setOrgLogoOverride] = useState<string | null>(null);
  const [orgAddressOverride, setOrgAddressOverride] = useState<OrgLogoAddress["address"] | null>(null);
  const [orgIndustryOverride, setOrgIndustryOverride] = useState<string | null>(null);

  const orgLogo = orgLogoOverride ?? activeOrganization?.logo ?? "";
  const orgName = activeOrganization?.name ?? "";
  const orgAddress = orgAddressOverride ?? (activeOrganization?.address as OrgLogoAddress["address"] | undefined);

  // Sync when vendor prop changes (e.g. navigating between items in the list)
  useEffect(() => {
    setVendor(initialVendor);
    setComments(initialVendor.comments ?? []);
    setExpenses([]);
    setActivityEvents([]);
    if (onClose) setActiveTab("overview"); // reset tab only in split-panel
  }, [initialVendor._id]);

  // Guard: prevent the save effect from overwriting localStorage before the load effect has run.
  // IMPORTANT: hasLoadedConfigRef is set to true INSIDE the setTemplateConfig callback so it
  // only becomes true on the re-render AFTER the loaded config is applied — not on the same
  // render where save effect would fire with the stale DEFAULT config.
  const hasLoadedConfigRef = useRef(false);

  // Load statement template config from vendor data or localStorage when vendor changes
  useEffect(() => {
    if (!vendor._id) return;
    hasLoadedConfigRef.current = false;

    if (vendor.statementTemplate) {
      setTemplateConfig((prev) => {
        hasLoadedConfigRef.current = true;
        return { ...prev, ...vendor.statementTemplate };
      });
      return;
    }

    try {
      const stored = localStorage.getItem(TMPL_KEY(vendor._id));
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<TemplateConfig>;
        setTemplateConfig((prev) => {
          hasLoadedConfigRef.current = true;
          return { ...prev, ...parsed, margins: { ...prev.margins, ...(parsed.margins ?? {}) } };
        });
      } else {
        hasLoadedConfigRef.current = true;
      }
    } catch {
      hasLoadedConfigRef.current = true;
    }
  }, [vendor._id, vendor.statementTemplate]);

  // Also reload from localStorage whenever the statement tab becomes active.
  // This ensures that changes saved in the edit-template page are picked up
  // even if the component was cached and did not fully remount.
  useEffect(() => {
    if (activeTab !== "statement" || !vendor._id) return;
    try {
      const stored = localStorage.getItem(TMPL_KEY(vendor._id));
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<TemplateConfig>;
        setTemplateConfig((prev) => ({ ...prev, ...parsed, margins: { ...prev.margins, ...(parsed.margins ?? {}) } }));
      }
    } catch { /* ignore */ }
  }, [activeTab, vendor._id]);

  const saveTemplateTimeout = useRef<NodeJS.Timeout | null>(null);

  // Save template config to localStorage + server-side vendor statementTemplate
  useEffect(() => {
    if (!vendor._id || !hasLoadedConfigRef.current) return;

    try {
      localStorage.setItem(TMPL_KEY(vendor._id), JSON.stringify(templateConfig));
    } catch { /* ignore */ }

    setTemplateSyncStatus("saving");

    if (saveTemplateTimeout.current) {
      clearTimeout(saveTemplateTimeout.current);
    }

    saveTemplateTimeout.current = setTimeout(async () => {
      try {
        await contactApi.update(vendor._id, { statementTemplate: { ...templateConfig } as Record<string, unknown> });
        setTemplateSyncStatus("synced");

        if (templateSyncResetTimeout.current) {
          clearTimeout(templateSyncResetTimeout.current);
        }
        templateSyncResetTimeout.current = setTimeout(() => setTemplateSyncStatus("idle"), 2000);
      } catch {
        setTemplateSyncStatus("error");
      }
    }, 500);

    return () => {
      if (saveTemplateTimeout.current) clearTimeout(saveTemplateTimeout.current);
      if (templateSyncResetTimeout.current) clearTimeout(templateSyncResetTimeout.current);
    };
  }, [templateConfig, vendor._id]);

  useEffect(() => {
    if (!vendor._id) return;
    setExpensesLoading(true);
    expenseApi
      .list({ vendorId: vendor._id, limit: 200 })
      .then((res) => setExpenses(res.data ?? []))
      .catch(() => {})
      .finally(() => setExpensesLoading(false));
  }, [vendor._id]);

  useEffect(() => {
    if (activeTab !== "recurring" || !vendor._id) return;
    setRecurringLoading(true);
    recurringExpenseApi
      .list({ vendorId: vendor._id, limit: 200 })
      .then((res) => setRecurringProfiles(res.data ?? []))
      .catch(() => {})
      .finally(() => setRecurringLoading(false));
  }, [activeTab, vendor._id]);

  useEffect(() => {
    if (!vendor._id) return;
    setTransactionsLoading(true);
    Promise.all([
      billApi.list({ vendorId: vendor._id, limit: 200 }),
      paymentMadeApi.list({ vendor_id: vendor._id, limit: 200 }),
      purchaseOrderApi.list({ vendorId: vendor._id, limit: 200 }),
      recurringBillApi.list({ vendorId: vendor._id, limit: 200 }),
      recurringExpenseApi.list({ vendorId: vendor._id, limit: 200 }),
      vendorCreditApi.list({ vendorId: vendor._id, limit: 200 }),
      journalApi.list({ vendorId: vendor._id, limit: 200 }),
    ])
      .then(([billsRes, paymentsRes, poRes, recBillsRes, recExpRes, creditsRes, journalsRes]) => {
        setBills(billsRes.data ?? []);
        setPaymentsMade(paymentsRes.data ?? []);
        setPurchaseOrders(poRes.data ?? []);
        setRecurringBills(recBillsRes.data ?? []);
        setTxRecurringExpenses(recExpRes.data ?? []);
        setVendorCredits(creditsRes.data ?? []);
        setJournals(journalsRes.data ?? []);
      })
      .catch(() => {})
      .finally(() => setTransactionsLoading(false));
  }, [vendor._id]);

  useEffect(() => {
    if (!vendor._id) return;
    setActivityLoading(true);
    contactApi
      .getActivity(vendor._id)
      .then((res) => setActivityEvents((res as any).data ?? []))
      .catch(() => {})
      .finally(() => setActivityLoading(false));
  }, [vendor._id]);

  // â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  
  async function handleAttachmentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    const files = Array.from(e.target.files);
    
    // Check limits: max 10 files, 10MB each
    const currentCount = vendor.documents?.length || 0;
    if (currentCount + files.length > 10) {
      toast.error("Maximum 10 files allowed");
      return;
    }
    const oversize = files.find(f => f.size > 10 * 1024 * 1024);
    if (oversize) {
      toast.error("File size cannot exceed 10MB");
      return;
    }

    setAttachmentUploading(true);
    try {
      const formData = new FormData();
      files.forEach(f => formData.append("files", f));
      
      const res = await fetch(`/api/upload?folder=vendors/${vendor._id}`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      
      const newDocs = data.urls.map((u: any, i: number) => ({
        name: files[i].name,
        url: u.url,
        publicId: u.publicId,
        size: files[i].size,
        mimeType: files[i].type
      }));

      const updatedDocs = [...(vendor.documents || []), ...newDocs];
      const updateRes = await contactApi.update(vendor._id, { documents: updatedDocs } as any);
      const u = (updateRes as any).data ?? updateRes;
      setVendor(u); onVendorUpdate(u);
      toast.success("Files uploaded successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to upload files");
    } finally {
      setAttachmentUploading(false);
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    }
  }

  async function handleRemoveAttachment(idx: number) {
    if (!confirm("Remove this attachment?")) return;
    try {
      const updatedDocs = (vendor.documents || []).filter((_, i) => i !== idx);
      const res = await contactApi.update(vendor._id, { documents: updatedDocs } as any);
      const u = (res as any).data ?? res;
      setVendor(u); onVendorUpdate(u);
      toast.success("Attachment removed");
    } catch {
      toast.error("Failed to remove attachment");
    }
  }

  async function handleCloneVendor() {
    try {
      const res = await contactApi.clone(vendor._id);
      const cloned = (res as any).data ?? res;
      toast.success("Vendor cloned successfully");
      router.push(`/purchases/vendors/${cloned._id}/edit`);
    } catch {
      toast.error("Failed to clone vendor");
    }
  }

  async function saveContactPersons(updated: ContactPerson[]) {
    setSaving(true);
    try {
      const res = await contactApi.update(vendor._id, { contactPersons: updated });
      const u = (res as any).data ?? res;
      setVendor(u); onVendorUpdate(u);
      toast.success("Contact persons updated");
    } catch { toast.error("Failed to save contact persons"); }
    finally { setSaving(false); }
  }

  async function saveBankDetails(updated: BankDetail[]) {
    setSaving(true);
    try {
      const res = await contactApi.update(vendor._id, { bankDetails: updated });
      const u = (res as any).data ?? res;
      setVendor(u); onVendorUpdate(u);
      toast.success("Bank details updated");
    } catch { toast.error("Failed to save bank details"); }
    finally { setSaving(false); }
  }

  function handleAddContactPerson(p: ContactPerson) {
    const persons = [...(vendor.contactPersons ?? [])];
    if (editingCpIdx !== null) persons[editingCpIdx] = p; else persons.push(p);
    setEditingCpIdx(null);
    saveContactPersons(persons);
  }

  function handleRemoveContactPerson(idx: number) {
    saveContactPersons((vendor.contactPersons ?? []).filter((_, i) => i !== idx));
  }

  function handleAddBankDetail(b: BankDetail) {
    saveBankDetails([...(vendor.bankDetails ?? []), b]);
  }

  function handleRemoveBankDetail(idx: number) {
    saveBankDetails((vendor.bankDetails ?? []).filter((_, i) => i !== idx));
  }

  async function handleAddComment() {
    if (!commentText.trim()) return;
    setAddingComment(true);
    try {
      const res = await contactApi.addComment(vendor._id, commentText.trim());
      setComments((res as any).data ?? []);
      setCommentText("");
      toast.success("Comment added");
    } catch { toast.error("Failed to add comment"); }
    finally { setAddingComment(false); }
  }

  async function handleToggleActive() {
    const nextState = !vendor.isActive;
    try {
      const res = await contactApi.update(vendor._id, { isActive: nextState });
      const u = (res as any).data ?? res;
      setVendor(u); onVendorUpdate(u);
      toast.success(`Vendor marked as ${nextState ? "active" : "inactive"}`);
    } catch {
      toast.error("Failed to update vendor");
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete vendor "${vendor.displayName}"? This cannot be undone.`)) return;
    try {
      await contactApi.remove(vendor._id);
      toast.success("Vendor deleted");
      onClose?.();
      router.push("/purchases/vendors");
    } catch { toast.error("Failed to delete vendor"); }
  }

  async function openMergeDialog() {
    setMergeTargetVendorId("");
    setMergeDialogOpen(true);
    try {
      const res = await contactApi.list({ type: "Vendor", page: 1, limit: 500 });
      const candidates = (res.data ?? []).filter((c) => c._id !== vendor._id && c.isActive !== false);
      setMergeCandidates(candidates);
    } catch {
      setMergeCandidates([]);
      toast.error("Failed to load vendors for merge");
    }
  }

  async function handleMergeVendors() {
    if (!mergeTargetVendorId) {
      toast.error("Please select a vendor to merge into");
      return;
    }
    setMerging(true);
    try {
      await contactApi.mergeVendors(vendor._id, mergeTargetVendorId);
      toast.success("Vendor merged successfully");
      setMergeDialogOpen(false);
      onClose?.();
      router.push("/purchases/vendors");
    } catch {
      toast.error("Failed to merge vendors");
    } finally {
      setMerging(false);
    }
  }

  // â”€â”€ Computed: monthly chart data & activity timeline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const monthlyData = useMemo(() => getMonthlyData(expenses, chartPeriod), [expenses, chartPeriod]);
  const chartTotal = useMemo(() => monthlyData.reduce((s, d) => s + d.total, 0), [monthlyData]);

  // â”€â”€ Derived display values â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const primaryContact = vendor.contactPersons?.find((p) => p.isPrimary) ?? vendor.contactPersons?.[0];
  const primaryContactIndex = useMemo(() => {
    if (!vendor.contactPersons?.length || !primaryContact) return -1;
    const byPrimary = vendor.contactPersons.findIndex((p) => p.isPrimary);
    if (byPrimary >= 0) return byPrimary;
    return vendor.contactPersons.findIndex(
      (p) => p.name === primaryContact.name && p.email === primaryContact.email,
    );
  }, [primaryContact, vendor.contactPersons]);
  const stmt = computeStatement(expenses, bills, paymentsMade, vendorCredits, vendor.openingBalance ?? 0, stmtStart, stmtEnd);

  // ── Email dialog state ────────────────────────────────────────────────────
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [smtpConfigured, setSmtpConfigured] = useState<boolean | null>(null);

  async function openEmailDialog() {
    const vendorEmail = vendor.email ?? vendor.contactPersons?.find((p) => p.isPrimary)?.email ?? vendor.contactPersons?.[0]?.email ?? "";
    setEmailTo(vendorEmail);
    setEmailSubject(`Statement of Accounts - ${vendor.displayName}`);
    setEmailBody(`Dear ${vendor.displayName},\n\nPlease find your statement of accounts from ${format(stmtStart, "dd/MM/yyyy")} to ${format(stmtEnd, "dd/MM/yyyy")}.\n\nKind regards,\n${orgName}`);
    setEmailDialogOpen(true);
    if (smtpConfigured === null && activeOrganization?._id) {
      try {
        const res = await smtpApi.get(activeOrganization._id);
        const s = (res as any)?.data;
        setSmtpConfigured(!!(s?.host && s?.user && s?.pass));
      } catch { setSmtpConfigured(false); }
    }
  }

  async function handleSendEmail() {
    if (!emailTo.trim()) { toast.error("Please enter a recipient email"); return; }
    if (!activeOrganization?._id) return;
    setEmailSending(true);
    try {
      await apiFetch(`/organizations/${activeOrganization._id}/send-email`, {
        method: "POST",
        body: JSON.stringify({ to: emailTo, subject: emailSubject, body: emailBody, vendorName: vendor.displayName }),
      });
      toast.success("Statement emailed successfully");
      setEmailDialogOpen(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to send email");
    } finally {
      setEmailSending(false);
    }
  }

  function handlePrint() {
    const el = document.querySelector(".statement-print-area") as HTMLElement | null;
    if (!el) { window.print(); return; }
    const win = window.open("", "_blank", "width=900,height=750");
    if (!win) { window.print(); return; }
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <title>Statement - ${vendor.displayName}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #f3f4f6; font-family: ${templateConfig.fontFamily}; }
        .statement-print-area { display: flex !important; flex-direction: column !important;
          background: white; margin: 0 auto; }
        table { border-collapse: collapse; width: 100%; }
        img { max-width: 100%; display: block; }
        @page { size: A4 portrait; margin: 0; }
        @media print { body { background: white; } .statement-print-area { box-shadow: none !important; } }
      </style>
      </head><body>${el.outerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 600);
  }

  function handlePDF() {
    handlePrint(); // user selects "Save as PDF" in print dialog
  }

  function handleXLS() {
    const currency = vendor.currency ?? "INR";
    const fmtAmt = (v: number) =>
      new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: 2 }).format(v);
    const orgShortName = (orgName || "ORG").split(" ")[0];
    const dateRange = `From ${format(stmtStart, "dd/MM/yyyy")} To ${format(stmtEnd, "dd/MM/yyyy")}`;

    const wsData: (string | number)[][] = [
      [orgShortName, orgName, "Vendor Statement", dateRange, "", ""],
      [],
      [templateConfig.accountSummaryLabel, "", "", "", "", ""],
      [templateConfig.openingBalanceLabel, fmtAmt(stmt.openingBalance), "", "", "", ""],
      [templateConfig.invoicedAmountLabel, fmtAmt(stmt.totalBilled), "", "", "", ""],
      [templateConfig.amountPaidLabel, fmtAmt(stmt.totalPaid), "", "", "", ""],
      [templateConfig.balanceDueLabel, fmtAmt(stmt.balanceDue), "", "", "", ""],
      [],
      [
        templateConfig.dateLabel,
        templateConfig.transactionTypeLabel,
        templateConfig.transactionDetailsLabel,
        templateConfig.amountLabel,
        templateConfig.paymentsLabel,
        templateConfig.balanceLabel,
      ],
      ...stmt.rows.map((r) => [r.date, r.type, r.details ?? "", r.amount, r.payments, r.balance] as (string | number)[]),
      ["", templateConfig.balanceDueLabel, "", "", "", fmtAmt(stmt.balanceDue)],
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{ wch: 14 }, { wch: 32 }, { wch: 22 }, { wch: 16 }, { wch: 14 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Statement");
    XLSX.writeFile(wb, `${vendor.displayName}_statement.xlsx`);
  }

  const langMap: Record<string, string> = {
    en: "English", hi: "Hindi", bn: "Bengali", ta: "Tamil",
    te: "Telugu", mr: "Marathi", gu: "Gujarati",
  };

  const unusedAdvances = useMemo(() => {
    return paymentsMade.reduce((sum, p) => sum + (p.status === "PAID" ? p.amount_in_excess || 0 : 0), 0);
  }, [paymentsMade]);

  const unusedCredits = useMemo(() => {
    return vendorCredits.reduce((sum, c) => sum + (c.status === "OPEN" ? c.balanceAmount || 0 : 0), 0);
  }, [vendorCredits]);

  return (
    <div className="flex h-full min-h-0 flex-col flex-1 overflow-hidden">
      {/* â”€â”€ Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex items-center justify-between px-5 py-3 border-b bg-background shrink-0 gap-3">
        <div className="min-w-0 max-w-xl">
          <h1 className="text-base font-semibold max-w-full overflow-hidden">
            <DraggableText className="text-base font-semibold">{vendor.displayName}</DraggableText>
          </h1>
          {vendor.companyName && vendor.companyName !== vendor.displayName && (
            <DraggableText className="text-xs text-muted-foreground max-w-full">{vendor.companyName}</DraggableText>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Edit */}
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => router.push(`/purchases/vendors/${vendor._id}/edit`)}>
            <Edit2 className="h-3.5 w-3.5 mr-1" />Edit
          </Button>

          {/* Attachment count with popup */}
          <DropdownMenu open={attachmentPopupOpen} onOpenChange={setAttachmentPopupOpen}>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs px-2">
                <Paperclip className="h-3.5 w-3.5" />
                <span>{vendor.documents?.length ?? 0}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 p-0" onCloseAutoFocus={(e) => e.preventDefault()}>
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <span className="text-sm font-semibold">Attachments</span>
                <button onClick={() => setAttachmentPopupOpen(false)} className="text-destructive hover:text-destructive/80">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="px-4 py-3">
                {(vendor.documents?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-3">No Files Attached</p>
                ) : (
                  <div className="space-y-2 mb-3 max-h-40 overflow-y-auto">
                    {vendor.documents?.map((doc, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm bg-muted/30 rounded px-2.5 py-1.5">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <a href={doc.url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-teal-700 hover:text-teal-800 hover:underline text-xs font-semibold">{doc.name}</a>
                        <button onClick={() => handleRemoveAttachment(idx)} className="text-destructive hover:text-destructive/80 shrink-0">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  className="flex items-center justify-center gap-2 w-full py-2.5 text-sm text-teal-700 hover:bg-teal-50/50 rounded-md border border-dashed border-teal-200 transition-colors cursor-pointer"
                  onClick={() => attachmentInputRef.current?.click()}
                  disabled={attachmentUploading}
                >
                  {attachmentUploading ? (
                    <><Loader2 className="h-4 w-4 animate-spin text-teal-600" /> Uploading...</>
                  ) : (
                    <><Upload className="h-4 w-4 text-teal-600" /> Upload your Files <span className="text-teal-700 font-semibold">✓</span></>
                  )}
                </button>
                <input
                  ref={attachmentInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleAttachmentUpload}
                />
                <p className="text-[10px] text-muted-foreground text-center mt-2">You can upload a maximum of 10 files, 10MB each</p>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* New Transaction dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-8 text-xs bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md">
                New Transaction <ChevronDown className="h-3.5 w-3.5 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Purchases</p>
              <DropdownMenuItem onClick={() => router.push(`/purchases/bills/new?vendorId=${vendor._id}`)}>
                Bill
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push(`/purchases/payments-made/new?vendorId=${vendor._id}`)}>
                Bill Payment
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push(`/purchases/expenses/new?vendorId=${vendor._id}`)}>
                Expense
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push(`/purchases/orders/new?vendorId=${vendor._id}`)}>
                Purchase Order
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push(`/purchases/vendor-credits/new?vendorId=${vendor._id}`)}>
                Vendor Credit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push(`/accountant/journal-entries/new?vendorId=${vendor._id}`)}>
                Journal
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* More dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 text-xs">
                More <ChevronDown className="h-3.5 w-3.5 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => setAssociateTemplatesDialogOpen(true)}>Associate Templates</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setBankDialogOpen(true)}>
                Add Bank Account
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLinkCustomerDialogOpen(true)}>Link to Customer</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleCloneVendor}>Clone</DropdownMenuItem>
              <DropdownMenuItem onClick={openMergeDialog}>Merge Vendors</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={handleToggleActive}
              >
                {vendor.isActive ? "Mark as Inactive" : "Mark as Active"}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={handleDelete}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Close button (when used in split-panel) */}
          {onClose && (
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* â”€â”€ Tabs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Tabs
        value={activeTab}
        onValueChange={(tab) => {
          setActiveTab(tab);
          if (!onClose) {
            router.replace(`/purchases/vendors/${vendor._id}?tab=${tab}`, { scroll: false });
          }
        }}
        className="flex h-full min-h-0 flex-col flex-1 overflow-hidden"
      >
        <TabsList className="shrink-0 w-full justify-start rounded-none border-b bg-transparent px-5 h-10">
          {[
            { value: "overview", label: "Overview" },
            { value: "comments", label: "Comments" },
            { value: "transactions", label: "Transactions" },
            { value: "recurring", label: "Recurring Expenses" },
            { value: "mails", label: "Mails" },
            { value: "statement", label: "Statement" },
          ].map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-teal-600 data-[state=active]:bg-transparent data-[state=active]:text-teal-700 data-[state=active]:font-bold h-full px-4 text-sm transition-all duration-150"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* â•â• OVERVIEW â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        <TabsContent value="overview" className="mt-0 flex-1 min-h-0 overflow-hidden">
          <div className="flex h-full min-h-0 overflow-hidden">
            {/* â”€â”€ LEFT column: contact info, addresses, details â”€â”€ */}
            <div className="flex-1 overflow-y-auto px-5 py-4 border-r min-w-0">
              {/* Profile Section */}
              <div className="mb-6 flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="h-16 w-16 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 border border-teal-100 shadow-sm overflow-hidden">
                    {primaryContact?.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={primaryContact.photoUrl} alt={primaryContact.name} className="h-full w-full object-cover" />
                    ) : vendor.companyName ? (
                      <span className="text-2xl font-bold text-teal-700">{vendor.companyName.charAt(0).toUpperCase()}</span>
                    ) : (
                      <User className="h-8 w-8 text-teal-600" />
                    )}
                  </div>
                  <div className="pt-1 min-w-0 max-w-xs overflow-hidden">
                    {vendor.companyName && (
                      <DraggableText className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">{vendor.companyName}</DraggableText>
                    )}
                    <div className="flex items-center gap-2 mb-1 max-w-full overflow-hidden">
                      <h2 className="text-xl font-semibold leading-none max-w-full overflow-hidden flex-1">
                        <DraggableText className="text-xl font-semibold leading-tight">{primaryContact?.name ?? "No Primary Contact"}</DraggableText>
                      </h2>
                      {primaryContact && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="text-muted-foreground hover:text-primary transition-colors active:scale-95">
                              <Settings className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-32">
                            <DropdownMenuItem onClick={() => {
                              const pIdx = primaryContactIndex;
                              setEditingCpIdx(typeof pIdx === "number" && pIdx >= 0 ? pIdx : null);
                              setCpDialogOpen(true);
                            }}>
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                const idx = primaryContactIndex;
                                if (typeof idx === "number" && idx >= 0) handleRemoveContactPerson(idx);
                              }}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                    {primaryContact?.email && <p className="text-sm text-muted-foreground mb-0.5">{primaryContact.email}</p>}
                    {(primaryContact?.mobile || primaryContact?.workPhone) && (
                      <p className="text-sm text-muted-foreground">{primaryContact.mobile || primaryContact.workPhone}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* ADDRESS */}
              <Section title="Address">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-muted-foreground">Billing Address</p>
                      <button className="text-muted-foreground hover:text-primary transition-colors" onClick={() => router.push(`/purchases/vendors/${vendor._id}/edit`)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {vendor.billingAddress?.street ? (
                      <div className="text-sm space-y-0.5">
                        {vendor.billingAddress.attention && <p className="font-medium">{vendor.billingAddress.attention}</p>}
                        {[vendor.billingAddress.street, vendor.billingAddress.street2].filter(Boolean).map((l, i) => <p key={i}>{l}</p>)}
                        {[vendor.billingAddress.city, vendor.billingAddress.state].filter(Boolean).join(", ") && (
                          <p>{[vendor.billingAddress.city, vendor.billingAddress.state].filter(Boolean).join(", ")}</p>
                        )}
                        {vendor.billingAddress.zip && <p>{vendor.billingAddress.zip}</p>}
                        {vendor.billingAddress.country && <p>{vendor.billingAddress.country}</p>}
                      </div>
                    ) : <p className="text-sm text-muted-foreground">No billing address</p>}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Shipping Address</p>
                    {vendor.shippingAddress?.street ? (
                      <div className="text-sm space-y-0.5">
                        {[vendor.shippingAddress.street, vendor.shippingAddress.street2].filter(Boolean).map((l, i) => <p key={i}>{l}</p>)}
                        {[vendor.shippingAddress.city, vendor.shippingAddress.state].filter(Boolean).join(", ") && (
                          <p>{[vendor.shippingAddress.city, vendor.shippingAddress.state].filter(Boolean).join(", ")}</p>
                        )}
                        {vendor.shippingAddress.zip && <p>{vendor.shippingAddress.zip}</p>}
                        {vendor.shippingAddress.country && <p>{vendor.shippingAddress.country}</p>}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">
                        No Shipping Address â€”{" "}
                        <button className="text-primary underline not-italic" onClick={() => router.push(`/purchases/vendors/${vendor._id}/edit`)}>
                          New Address
                        </button>
                      </p>
                    )}
                  </div>
                </div>
              </Section>

              {/* OTHER DETAILS */}
              <Section title="Other Details">
                <InfoRow label="Default Currency" value={vendor.currency ?? "INR"} />
                <InfoRow label="PAN" value={vendor.pan} />
                <InfoRow label="GSTIN" value={vendor.gstin} />
                <InfoRow label="Tax Treatment" value={vendor.taxTreatment} />
                <InfoRow label="TDS Category" value={vendor.tdsCategory} />
                <InfoRow label="Portal Status"
                  value={
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${vendor.portalEnabled ? "text-green-600" : "text-red-500"}`}>
                      <span className={`h-2 w-2 rounded-full ${vendor.portalEnabled ? "bg-green-500" : "bg-red-400"}`} />
                      {vendor.portalEnabled ? "Enabled" : "Disabled"}
                    </span>
                  }
                />
                <InfoRow label="Vendor Language" value={langMap[vendor.language ?? "en"] ?? vendor.language} />
                {vendor.msmeRegistered && <InfoRow label="MSME Registered" value="Yes" />}
                {vendor.websiteUrl && (
                  <InfoRow label="Website"
                    value={
                      <a href={vendor.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline flex items-center gap-1">
                        {vendor.websiteUrl} <ExternalLink className="h-3 w-3" />
                      </a>
                    }
                  />
                )}
                {vendor.email && <InfoRow label="Email" value={vendor.email} />}
                {vendor.phone && <InfoRow label="Phone" value={vendor.phone} />}
                {vendor.mobile && <InfoRow label="Mobile" value={vendor.mobile} />}
              </Section>

              {/* CONTACT PERSONS */}
              <Section title="Contact Persons"
                action={
                  <button className="flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                    onClick={() => { setEditingCpIdx(null); setCpDialogOpen(true); }}>
                    <Plus className="h-3.5 w-3.5" />Add
                  </button>
                }
              >
                {!vendor.contactPersons?.length ? (
                  <p className="text-sm text-muted-foreground text-center py-2">No contact persons found.</p>
                ) : (
                  <div className="space-y-3">
                    {vendor.contactPersons.map((cp, idx) => (
                      <div key={idx} className="flex items-start justify-between bg-muted/20 rounded-lg px-3 py-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{cp.name}</span>
                            {cp.isPrimary && <Badge variant="secondary" className="text-xs h-4">Primary</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 space-x-3">
                            {cp.email && <span>{cp.email}</span>}
                            {cp.workPhone && <span>{cp.workPhone}</span>}
                            {cp.mobile && <span>{cp.mobile}</span>}
                            {cp.designation && <span className="italic">{cp.designation}</span>}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingCpIdx(idx); setCpDialogOpen(true); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleRemoveContactPerson(idx)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* BANK ACCOUNT DETAILS */}
              <Section title="Bank Account Details"
                action={
                  <button className="flex items-center gap-1 text-xs text-primary hover:underline font-medium" onClick={() => setBankDialogOpen(true)}>
                    <Plus className="h-3.5 w-3.5" />Add
                  </button>
                }
              >
                {!vendor.bankDetails?.length ? (
                  <p className="text-sm text-muted-foreground text-center py-2">No bank account added yet</p>
                ) : (
                  <div className="space-y-3">
                    {vendor.bankDetails.map((b, idx) => (
                      <div key={idx} className="flex items-start justify-between bg-muted/20 rounded-lg px-3 py-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <CreditCard className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{b.bankName}</span>
                            {b.isPrimary && <Badge variant="secondary" className="text-xs h-4">Primary</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 space-x-3">
                            {b.accountNumber && <span>A/C: â€¢â€¢â€¢â€¢{b.accountNumber.slice(-4)}</span>}
                            {b.ifscCode && <span>IFSC: {b.ifscCode}</span>}
                            {b.branchName && <span>{b.branchName}</span>}
                            {b.upiId && <span>UPI: {b.upiId}</span>}
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleRemoveBankDetail(idx)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* RECORD INFO */}
              <Section title="Record Info" defaultOpen={false}>
                <InfoRow label="Vendor ID" value={<span className="font-mono text-xs">{vendor._id}</span>} />
                <InfoRow label="Created On" value={fmtDate(vendor.createdAt)} />
                <InfoRow label="Type" value={vendor.contactType} />
                <InfoRow label="Status" value={
                  <span className={vendor.isActive ? "text-green-600" : "text-red-500"}>
                    {vendor.isActive ? "Active" : "Inactive"}
                  </span>
                } />
              </Section>
            </div>

            {/* â”€â”€ RIGHT column: payables, chart, timeline â”€â”€ */}
            <div className="w-[420px] shrink-0 overflow-y-auto px-4 py-4 space-y-4 border-l bg-muted/5">
              {/* Payment Due Period */}
              <div className="border rounded-lg p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Payment Due</p>
                <p className="text-sm font-medium">
                  {vendor.paymentTermsId ? "Custom Terms" : "Due on Receipt"}
                </p>
              </div>

              {/* Payables */}
              <div className="border rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b bg-muted/10">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payables</p>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/20">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Currency</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Outstanding</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Unused Credits</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-3 py-2 font-medium">{vendor.currency ?? "INR"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmt(vendor.outstandingPayable ?? 0, vendor.currency ?? "INR")}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmt(unusedAdvances + unusedCredits, vendor.currency ?? "INR")}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div className="px-4 py-2 border-t">
                  <button
                    className="text-xs text-primary underline"
                    onClick={() => router.push(`/purchases/vendors/${vendor._id}/edit`)}
                  >
                    Enter Opening Balance
                  </button>
                </div>
              </div>

              {/* Expenses Bar Chart */}
              <div className="bg-white dark:bg-card border rounded-xl overflow-hidden shadow-sm">
                <div className="px-4 py-3 border-b">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">Expenses</p>
                      <p className="text-xs text-muted-foreground">Displayed in base currency</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="flex items-center gap-1 text-xs text-primary hover:underline font-medium">
                            {PERIOD_LABELS[chartPeriod]} <ChevronDown className="h-3 w-3" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          {(Object.entries(PERIOD_LABELS) as [ChartPeriod, string][]).map(([key, label]) => (
                            <DropdownMenuItem key={key} onClick={() => setChartPeriod(key as ChartPeriod)}
                              className={chartPeriod === key ? "bg-primary/10 text-primary" : ""}>
                              {label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <span className="text-muted-foreground text-xs">|</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="flex items-center gap-1 text-xs text-primary hover:underline font-medium">
                            {chartMode === "accrual" ? "Accrual" : "Cash"} <ChevronDown className="h-3 w-3" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setChartMode("accrual")}
                            className={chartMode === "accrual" ? "bg-primary/10 text-primary" : ""}>
                            Accrual
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setChartMode("cash")}
                            className={chartMode === "cash" ? "bg-primary/10 text-primary" : ""}>
                            Cash
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <p className="text-lg font-bold mt-1 tabular-nums">{fmt(chartTotal, vendor.currency ?? "INR")}</p>
                </div>
                <div className="px-2 py-3">
                  {expensesLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={monthlyData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                        <YAxis
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)} K` : String(v)}
                        />
                        <Tooltip
                          formatter={(val: number) => [fmt(val, vendor.currency ?? "INR"), "Expenses"]}
                          contentStyle={{ fontSize: 11, borderRadius: 6, border: "1px solid #e5e7eb" }}
                        />
                        <Bar dataKey="total" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={48} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              

              {/* Activity Timeline */}
              <div className="bg-white dark:bg-card border rounded-xl overflow-hidden shadow-sm">
                <div className="px-4 py-3 border-b">
                  <p className="text-sm font-semibold">Activity</p>
                </div>
                <div className="py-2">
                  {activityLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : activityEvents.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">No activity yet.</p>
                  ) : (
                    <div className="relative">
                      <div className="absolute left-[72px] top-0 bottom-0 w-0.5 bg-blue-100" />
                      <div>
                        {activityEvents.map((ev, i) => {
                          const isExpense = ev.type === "expense_added";
                          const dt = new Date(ev.timestamp);
                          return (
                            <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                              <div className="w-14 shrink-0 text-right">
                                <p className="text-[10px] font-semibold text-blue-600 leading-tight">{format(dt, "dd/MM/yyyy")}</p>
                                <p className="text-[10px] text-muted-foreground leading-tight">{format(dt, "dd MMM yyyy, hh:mm a").split(", ")[1]}</p>
                              </div>
                              <div className="shrink-0 mt-1.5 relative z-10">
                                <div className={`h-3.5 w-3.5 rounded-full border-2 border-white shadow ${isExpense ? "bg-amber-400" : "bg-green-500"}`} />
                              </div>
                              <div className="flex-1 bg-muted/30 border rounded-lg px-3 py-2 mb-1 min-w-0">
                                <p className="text-xs font-semibold">{isExpense ? "Expense added" : "Contact added"}</p>
                                {isExpense && ev.amount != null ? (
                                  <p className="text-xs text-amber-600 mt-0.5">
                                    Amount: {fmt(ev.amount, ev.currency ?? vendor.currency ?? "INR")}
                                  </p>
                                ) : (
                                  <p className="text-xs text-muted-foreground mt-0.5">Contact created</p>
                                )}
                                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                  {ev.userName && <span className="text-[10px] text-muted-foreground">by {ev.userName}</span>}
                                  {isExpense && ev.ref && (
                                    <>
                                      <span className="text-[10px] text-muted-foreground">·</span>
                                      <button
                                        className="text-[10px] text-primary hover:underline font-medium"
                                        onClick={() => router.push(`/purchases/expenses/${ev.ref}`)}
                                      >
                                        View Details
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* â•â• COMMENTS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        <TabsContent value="comments" className="mt-0 flex-1 min-h-0 overflow-y-auto px-6 py-4">
          <div className="max-w-2xl space-y-4">
            <div className="border rounded-lg overflow-hidden">
              <div className="flex gap-3 px-3 py-2 border-b bg-muted/20">
                <button className="text-xs font-bold px-1.5 py-0.5 border rounded hover:bg-muted">B</button>
                <button className="text-xs italic px-1.5 py-0.5 border rounded hover:bg-muted">I</button>
                <button className="text-xs underline px-1.5 py-0.5 border rounded hover:bg-muted">U</button>
              </div>
              <Textarea
                className="border-0 rounded-none min-h-[100px] resize-none focus-visible:ring-0 text-sm"
                placeholder="Write a comment..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
              />
              <div className="px-3 py-2 border-t flex justify-end">
                <Button size="sm" disabled={!commentText.trim() || addingComment} onClick={handleAddComment} className="h-7 text-xs">
                  {addingComment && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  Add Comment
                </Button>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">All Comments</p>
              {comments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-lg">No comments yet.</p>
              ) : (
                <div className="space-y-3">
                  {[...comments].reverse().map((c) => (
                    <div key={c._id} className="flex gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-semibold text-primary">{(c.userName ?? "?")[0].toUpperCase()}</span>
                      </div>
                      <div className="flex-1 bg-muted/20 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold">{c.userName ?? "Unknown"}</span>
                          <span className="text-xs text-muted-foreground">
                            {c.createdAt ? format(new Date(c.createdAt), "dd MMM yyyy, hh:mm a") : ""}
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{c.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* â•â• TRANSACTIONS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        <TabsContent value="transactions" className="mt-0 flex-1 min-h-0 overflow-y-auto px-6 py-4">
          <div className="max-w-5xl">
            <BillsSection bills={bills} loading={transactionsLoading} />
            <BillPaymentsSection payments={paymentsMade} loading={transactionsLoading} />
            <ExpensesSection expenses={expenses} loading={expensesLoading || transactionsLoading} />
            <RecurringBillsSection recurringBills={recurringBills} loading={transactionsLoading} />
            <RecurringExpensesSection recurringExpenses={txRecurringExpenses} loading={transactionsLoading} />
            <PurchaseOrdersSection purchaseOrders={purchaseOrders} loading={transactionsLoading} />
            <VendorCreditsSection vendorCredits={vendorCredits} loading={transactionsLoading} />
            <JournalsSection journals={journals} loading={transactionsLoading} />
          </div>
        </TabsContent>

        {/* RECURRING EXPENSES */}
        <TabsContent value="recurring" className="mt-0 flex-1 min-h-0 overflow-y-auto px-6 py-4">
          <div className="max-w-3xl">
            <div className="border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b bg-muted/10 flex items-center justify-between">
                <p className="text-sm font-semibold">Recurring Expense Profiles</p>
                <button
                  className="text-xs text-primary hover:underline font-medium flex items-center gap-1"
                  onClick={() => router.push("/purchases/recurring-expenses/new")}
                >
                  <Plus className="h-3.5 w-3.5" /> New
                </button>
              </div>
              {recurringLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : recurringProfiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                  <Clock className="h-8 w-8 opacity-30" />
                  <p className="text-sm">No recurring expenses linked to this vendor.</p>
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/20">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Profile Name</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Frequency</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Amount</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Status</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Next Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recurringProfiles.map((rp) => (
                      <tr
                        key={rp._id}
                        className="border-b hover:bg-muted/20 cursor-pointer"
                        onClick={() => router.push(`/purchases/recurring-expenses/${rp._id}/edit`)}
                      >
                        <td className="px-4 py-2.5 font-medium text-primary">{rp.profileName}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {rp.repeatEvery === 1 ? rp.frequency : `Every ${rp.repeatEvery} ${rp.frequency}`}
                        </td>
                        <td className="px-4 py-2.5 font-medium tabular-nums">
                          {fmt(rp.amount, rp.currency)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium ${rp.status === "Active" ? "text-green-600" : rp.status === "Expired" ? "text-amber-600" : "text-gray-500"}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${rp.status === "Active" ? "bg-green-500" : rp.status === "Expired" ? "bg-amber-500" : "bg-gray-400"}`} />
                            {rp.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(rp.nextExpenseDate ?? undefined)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </TabsContent>

        {/* â•â• MAILS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        <TabsContent value="mails" className="mt-0 flex-1 min-h-0 overflow-y-auto px-6 py-4">
          <div className="max-w-2xl">
            <div className="border rounded-lg">
              <div className="px-4 py-3 border-b bg-muted/20">
                <span className="text-sm font-semibold">System Mails</span>
              </div>
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                <MessageSquare className="h-8 w-8 opacity-30" />
                <p className="text-sm">No emails sent.</p>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ══ STATEMENT ══════════════════════════════════════════════ */}
        <TabsContent value="statement" className="mt-0 flex flex-1 min-h-0 flex-col overflow-hidden">
          {/* Action bar */}
          <div className="px-5 py-3 border-b bg-background flex items-center gap-2 flex-wrap shrink-0 print:hidden">
            <div className="flex items-center gap-1.5 border rounded px-2.5 py-1.5 text-xs bg-muted/20">
              <span className="text-muted-foreground">From</span>
              <input
                type="date"
                className="bg-transparent outline-none text-xs w-28"
                value={format(stmtStart, "yyyy-MM-dd")}
                onChange={(e) => setStmtStart(e.target.value ? new Date(e.target.value) : stmtStart)}
              />
              <span className="text-muted-foreground mx-1">&#8212;</span>
              <span className="text-muted-foreground">To</span>
              <input
                type="date"
                className="bg-transparent outline-none text-xs w-28"
                value={format(stmtEnd, "yyyy-MM-dd")}
                onChange={(e) => setStmtEnd(e.target.value ? new Date(e.target.value) : stmtEnd)}
              />
            </div>
            <div className="flex items-center gap-2 text-xs">
              {templateSyncStatus === "saving" && (
                <span className="flex items-center gap-1 text-blue-600">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Syncing
                </span>
              )}
              {templateSyncStatus === "synced" && (
                <span className="flex items-center gap-1 text-green-600">
                  <CloudCheck className="h-3.5 w-3.5" />
                  Saved
                </span>
              )}
              {templateSyncStatus === "error" && (
                <span className="flex items-center gap-1 text-rose-600">
                  <CloudOff className="h-3.5 w-3.5" />
                  Save failed
                </span>
              )}
              {templateSyncStatus === "idle" && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Cloud className="h-3.5 w-3.5" />
                  Up to date
                </span>
              )}
            </div>
            <div className="flex-1" />
            {/* Color Theme Selector */}
            <Select
              value={templateConfig.colorTheme}
              onValueChange={(v) => {
                const theme = COLOR_THEMES.find((t) => t.id === v);
                setTemplateConfig((prev) => ({
                  ...prev,
                  colorTheme: v,
                  tableHeaderBgColor: theme ? theme.colors[0] : prev.tableHeaderBgColor,
                }));
              }}
            >
              <SelectTrigger className="h-8 text-xs w-44 shrink-0">
                <SelectValue placeholder="Select Color Theme" />
              </SelectTrigger>
              <SelectContent>
                {COLOR_THEMES.map((theme) => (
                  <SelectItem key={theme.id} value={theme.id}>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-0.5">
                        {theme.colors.map((c, ci) => (
                          <div key={ci} className="w-3 h-3 rounded-sm border border-border" style={{ backgroundColor: c }} />
                        ))}
                      </div>
                      <span>{theme.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5 mr-1.5" />Print
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handlePDF}>
              <Download className="h-3.5 w-3.5 mr-1.5" />PDF
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleXLS}>
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />XLS
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={openEmailDialog}>
              <Send className="h-3.5 w-3.5 mr-1.5" />Email
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs">
                  <Settings2 className="h-3.5 w-3.5 mr-1.5" />Customize <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => setTemplateOpen(true)}>
                  <Layout className="h-3.5 w-3.5 mr-2" />Change Template
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push(`/purchases/vendors/${vendor._id}/edit-template`)}>
                  <Palette className="h-3.5 w-3.5 mr-2" />Edit Template
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setLogoAddressOpen(true)}>
                  <ImagePlus className="h-3.5 w-3.5 mr-2" />Update Logo & Address
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* A4 Preview */}
          <div className="flex-1 overflow-y-auto bg-gray-100 print:bg-white print:overflow-visible py-6 px-4 print:p-0">
            <div
              className="statement-print-area bg-white mx-auto shadow-sm print:shadow-none flex flex-col"
              style={{
                width: templateConfig.paperSize === "A5" ? "148mm" : templateConfig.paperSize === "Letter" ? "216mm" : "210mm",
                minHeight: templateConfig.paperSize === "A5" ? "210mm" : templateConfig.paperSize === "Letter" ? "279mm" : "297mm",
                fontFamily: templateConfig.fontFamily,
                fontSize: `${templateConfig.fontSize}pt`,
                backgroundColor: templateConfig.backgroundColor,
              }}
            >
              {/* ── Main content (flex-1 pushes footer to bottom) ── */}
              <div style={{ flex: 1, padding: `${templateConfig.margins.top}in ${templateConfig.margins.right}in 0 ${templateConfig.margins.left}in` }}>

                {/* Row 1: Logo (left) | Org name+address (right) */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
                  <div style={{ maxWidth: "45%" }}>
                    {templateConfig.showOrgLogo && orgLogo && (
                      <img
                        src={orgLogo}
                        alt={orgName}
                        style={{ height: `${templateConfig.orgLogoSize}px`, width: "auto", objectFit: "contain", display: "block" }}
                      />
                    )}
                    {templateConfig.showOrgLogo && !orgLogo && (
                      <div style={{
                        width: `${templateConfig.orgLogoSize}px`, height: `${templateConfig.orgLogoSize}px`,
                        border: "2px dashed #d1d5db", borderRadius: "6px",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        backgroundColor: "#f9fafb",
                      }}>
                        <span style={{ fontSize: "7pt", color: "#9ca3af", textAlign: "center", padding: "4px" }}>Logo</span>
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "right", maxWidth: "50%" }}>
                    {templateConfig.showOrgName && (
                      <p style={{ fontWeight: "700", color: templateConfig.orgNameColor, fontSize: `${templateConfig.orgNameFontSize}pt`, margin: 0, lineHeight: 1.3 }}>
                        {orgName}
                      </p>
                    )}
                    {templateConfig.showOrgAddress && orgAddress && (
                      <>
                        {(orgAddress.city || orgAddress.state) && (
                          <p style={{ fontSize: "8.5pt", color: "#6b7280", margin: "2px 0 0" }}>
                            {[orgAddress.city, orgAddress.state].filter(Boolean).join(", ")}
                          </p>
                        )}
                        {orgAddress.zip && (
                          <p style={{ fontSize: "8.5pt", color: "#6b7280", margin: "1px 0 0" }}>{orgAddress.zip}</p>
                        )}
                        {orgAddress.street && (
                          <p style={{ fontSize: "8.5pt", color: "#6b7280", margin: "1px 0 0" }}>{orgAddress.street}</p>
                        )}
                        {orgAddress.phone && (
                          <p style={{ fontSize: "8.5pt", color: "#6b7280", margin: "1px 0 0" }}>Ph: {orgAddress.phone}</p>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Row 2: "To" vendor (left) | Statement title + period (right) */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
                  <div style={{ maxWidth: "50%" }}>
                    {templateConfig.showBillTo && (
                      <p style={{ fontSize: "8pt", fontWeight: "600", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 3px" }}>
                        {templateConfig.billToLabel}
                      </p>
                    )}
                    <p style={{ fontWeight: "600", color: templateConfig.vendorNameFontColor, fontSize: `${templateConfig.vendorNameFontSize}pt`, margin: 0, lineHeight: 1.35 }}>
                      {vendor.displayName}
                    </p>
                    {vendor.companyName && vendor.companyName !== vendor.displayName && (
                      <p style={{ fontSize: "8.5pt", color: "#6b7280", margin: "2px 0 0" }}>{vendor.companyName}</p>
                    )}
                    {vendor.billingAddress && addressLines(vendor.billingAddress) && (
                      <p style={{ fontSize: "8.5pt", color: "#6b7280", margin: "2px 0 0" }}>{addressLines(vendor.billingAddress)}</p>
                    )}
                    {vendor.email && (
                      <p style={{ fontSize: "8.5pt", color: "#6b7280", margin: "2px 0 0" }}>{vendor.email}</p>
                    )}
                  </div>
                  <div style={{ textAlign: "right", maxWidth: "48%" }}>
                    {templateConfig.showDocTitle && (
                      <h1 style={{ fontWeight: "700", color: templateConfig.docTitleFontColor, fontSize: `${templateConfig.docTitleFontSize}pt`, margin: 0, lineHeight: 1.2 }}>
                        {templateConfig.docTitle}
                      </h1>
                    )}
                    <p style={{ fontSize: "8.5pt", color: "#6b7280", margin: "4px 0 0" }}>
                      {format(stmtStart, "dd/MM/yyyy")} To {format(stmtEnd, "dd/MM/yyyy")}
                    </p>
                  </div>
                </div>

                {/* Divider */}
                <div style={{ borderTop: `2px solid ${templateConfig.tableHeaderBgColor}`, marginBottom: "16px" }} />

                {/* Account Summary */}
                {templateConfig.showAccountSummary && (
                  <div style={{ marginBottom: "18px" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9pt" }}>
                      <thead>
                        <tr style={{ backgroundColor: templateConfig.tableHeaderBgColor, color: templateConfig.tableHeaderFontColor }}>
                          <th colSpan={2} style={{ padding: "6px 10px", textAlign: "left", fontWeight: "600", fontSize: `${templateConfig.tableHeaderFontSize}pt` }}>
                            {templateConfig.accountSummaryLabel}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {([
                          [templateConfig.showOpeningBalance, templateConfig.openingBalanceLabel, stmt.openingBalance],
                          [templateConfig.showInvoicedAmount, templateConfig.invoicedAmountLabel, stmt.totalBilled],
                          [templateConfig.showAmountPaid, templateConfig.amountPaidLabel, stmt.totalPaid],
                          [templateConfig.showBalanceDue, templateConfig.balanceDueLabel, stmt.balanceDue],
                        ] as [boolean, string, number][]).filter(([show]) => show).map(([, label, value], i) => (
                          <tr key={String(label)} style={{ backgroundColor: i % 2 === 0 ? templateConfig.evenRowColor : templateConfig.oddRowColor }}>
                            <td style={{ padding: "5px 10px", color: "#4b5563", width: "60%" }}>{label as string}</td>
                            <td style={{ padding: "5px 10px", fontWeight: "500", textAlign: "right" }}>{fmt(value as number, vendor.currency ?? "INR")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Transactions table */}
                <div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9pt" }}>
                    <thead>
                      <tr style={{ backgroundColor: templateConfig.tableHeaderBgColor, color: templateConfig.tableHeaderFontColor, fontSize: `${templateConfig.tableHeaderFontSize}pt` }}>
                        {templateConfig.colDate && <th style={{ padding: "7px 10px", textAlign: "left", fontWeight: "600" }}>{templateConfig.dateLabel}</th>}
                        {templateConfig.colTransactionType && <th style={{ padding: "7px 10px", textAlign: "left", fontWeight: "600" }}>{templateConfig.transactionTypeLabel}</th>}
                        {templateConfig.colTransactionDetails && <th style={{ padding: "7px 10px", textAlign: "left", fontWeight: "600" }}>{templateConfig.transactionDetailsLabel}</th>}
                        {templateConfig.colAmount && <th style={{ padding: "7px 10px", textAlign: "right", fontWeight: "600" }}>{templateConfig.amountLabel}</th>}
                        {templateConfig.colPayments && <th style={{ padding: "7px 10px", textAlign: "right", fontWeight: "600" }}>{templateConfig.paymentsLabel}</th>}
                        {templateConfig.colBalance && <th style={{ padding: "7px 10px", textAlign: "right", fontWeight: "600" }}>{templateConfig.balanceLabel}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {stmt.rows.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ padding: "20px", textAlign: "center", color: "#9ca3af" }}>No transactions in this period</td>
                        </tr>
                      ) : stmt.rows.map((row, i) => (
                        <tr
                          key={i}
                          style={{
                            backgroundColor: i === 0 ? "transparent" : (i % 2 === 0 ? templateConfig.evenRowColor : templateConfig.oddRowColor),
                            fontStyle: i === 0 ? "italic" : "normal",
                            color: i === 0 ? "#6b7280" : "inherit",
                          }}
                        >
                          {templateConfig.colDate && <td style={{ padding: "5px 10px" }}>{row.date}</td>}
                          {templateConfig.colTransactionType && <td style={{ padding: "5px 10px" }}>{row.type}</td>}
                          {templateConfig.colTransactionDetails && <td style={{ padding: "5px 10px", fontFamily: "monospace", fontSize: "8.5pt" }}>{row.details}</td>}
                          {templateConfig.colAmount && <td style={{ padding: "5px 10px", textAlign: "right" }}>{row.amount > 0 ? fmt(row.amount, vendor.currency ?? "INR") : "—"}</td>}
                          {templateConfig.colPayments && <td style={{ padding: "5px 10px", textAlign: "right" }}>{row.payments > 0 ? fmt(row.payments, vendor.currency ?? "INR") : "—"}</td>}
                          {templateConfig.colBalance && <td style={{ padding: "5px 10px", textAlign: "right", fontWeight: "500" }}>{fmt(row.balance, vendor.currency ?? "INR")}</td>}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ fontWeight: "700", borderTop: `2px solid ${templateConfig.tableHeaderBgColor}` }}>
                        <td colSpan={5} style={{ padding: "7px 10px", textAlign: "right" }}>{templateConfig.balanceDueLabel}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right" }}>{fmt(stmt.balanceDue, vendor.currency ?? "INR")}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* ── Footer (pinned to bottom of paper) ── */}
              <div style={{ padding: `8px ${templateConfig.margins.right}in ${templateConfig.margins.bottom}in ${templateConfig.margins.left}in` }}>
                {templateConfig.showFooter && (
                  <>
                    <div style={{ borderTop: "1px solid #d1d5db", marginBottom: "6px" }} />
                    <p style={{ fontSize: `${templateConfig.footerFontSize}pt`, color: templateConfig.footerFontColor, textAlign: "center", margin: 0 }}>
                      {templateConfig.footerCustomContent || "This is a computer-generated statement."}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <ContactPersonDialog
        open={cpDialogOpen}
        onClose={() => { setCpDialogOpen(false); setEditingCpIdx(null); }}
        onSave={handleAddContactPerson}
        initial={editingCpIdx !== null ? vendor.contactPersons?.[editingCpIdx] : undefined}
      />
      <BankAccountDialog
        open={bankDialogOpen}
        onClose={() => setBankDialogOpen(false)}
        onSave={handleAddBankDetail}
      />

      {/* Statement dialogs */}
      <ChooseTemplateDialog
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        selected={templateConfig.templateId}
        onSelect={(id) => setTemplateConfig((prev) => ({ ...prev, templateId: id }))}
      />
      {activeOrganization && (
        <LogoAddressDialog
          open={logoAddressOpen}
          onClose={() => setLogoAddressOpen(false)}
          orgId={activeOrganization._id}
          initial={{
            logo: orgLogo,
            address: orgAddress ?? {},
            industry: orgIndustryOverride ?? activeOrganization.industry ?? "",
          }}
          onSaved={(data) => {
            setOrgLogoOverride(data.logo);
            setOrgAddressOverride(data.address);
            setOrgIndustryOverride(data.industry);
            refreshOrganizations();
          }}
        />
      )}

      {/* ── Email Dialog ── */}
      <Dialog open={emailDialogOpen} onOpenChange={(o) => !emailSending && setEmailDialogOpen(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Email Statement</DialogTitle>
          </DialogHeader>
          {smtpConfigured === false ? (
            <div className="py-4 text-center space-y-3">
              <AlertCircle className="h-10 w-10 mx-auto text-orange-500" />
              <p className="text-sm font-medium">Email not configured</p>
              <p className="text-xs text-muted-foreground">
                Set up your SMTP settings in <strong>Settings → Email</strong> to send emails.
              </p>
              <Button size="sm" variant="outline" onClick={() => { setEmailDialogOpen(false); router.push("/settings?tab=email"); }}>
                Go to Email Settings
              </Button>
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              <div>
                <Label className="text-xs">To</Label>
                <Input
                  className="mt-1 h-8 text-sm"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="vendor@example.com"
                />
              </div>
              <div>
                <Label className="text-xs">Subject</Label>
                <Input
                  className="mt-1 h-8 text-sm"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Message</Label>
                <Textarea
                  className="mt-1 text-sm resize-none"
                  rows={5}
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                />
              </div>
            </div>
          )}
          {smtpConfigured !== false && (
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setEmailDialogOpen(false)} disabled={emailSending}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSendEmail} disabled={emailSending}>
                {emailSending ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Sending…</> : <><Send className="h-3.5 w-3.5 mr-1.5" />Send</>}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
      
      <LinkCustomerDialog 
        open={linkCustomerDialogOpen} 
        onClose={() => setLinkCustomerDialogOpen(false)} 
        vendor={vendor} 
        onSave={async (customerId) => {
          try {
            await contactApi.update(vendor._id, { linkedContactId: customerId } as any);
            toast.success("Vendor linked to customer successfully");
          } catch {
            toast.error("Failed to link vendor");
          }
        }} 
      />
      <AssociateTemplatesDialog open={associateTemplatesDialogOpen} onClose={() => setAssociateTemplatesDialogOpen(false)} />

      <Dialog open={mergeDialogOpen} onOpenChange={(open) => { if (!merging) setMergeDialogOpen(open); }}>
        <DialogContent className="max-w-[900px] p-0 overflow-hidden">
          <div className="flex items-center justify-between border-b px-6 py-4">
            <h3 className="text-3xl font-normal">Merge Vendors</h3>
            <button
              type="button"
              className="text-red-500 hover:text-red-600 disabled:opacity-50"
              onClick={() => setMergeDialogOpen(false)}
              disabled={merging}
              aria-label="Close"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          <div className="px-6 py-8">
            <p className="text-lg leading-relaxed text-foreground/90">
              Select a vendor profile with whom you'd like to merge <strong>{vendor.displayName}</strong>. Once merged,
              the transactions of <strong>{vendor.displayName}</strong> will be transferred, and this vendor record will be marked as inactive.
            </p>
            <div className="mt-8">
              <Select value={mergeTargetVendorId} onValueChange={setMergeTargetVendorId}>
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue placeholder="Select Vendor" />
                </SelectTrigger>
                <SelectContent>
                  {mergeCandidates.map((candidate) => (
                    <SelectItem key={candidate._id} value={candidate._id}>
                      {candidate.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="border-t px-6 py-6">
            <div className="flex items-center gap-3">
              <Button
                className="h-10 px-5 bg-teal-600 hover:bg-teal-700 text-white"
                onClick={handleMergeVendors}
                disabled={merging || !mergeTargetVendorId}
              >
                {merging ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Merging...</> : "Continue"}
              </Button>
              <Button variant="outline" className="h-10 px-5" onClick={() => setMergeDialogOpen(false)} disabled={merging}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LinkCustomerDialog({ open, onClose, vendor, onSave }: { open: boolean, onClose: () => void, vendor: Contact, onSave: (customerId: string) => void }) {
  const [customers, setCustomers] = useState<{_id: string, displayName: string}[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
       setLoading(true);
       contactApi.list({ type: "Customer" }).then(res => {
         setCustomers(res.data || []);
         setLoading(false);
       }).catch(() => setLoading(false));
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Link {vendor.displayName} to Customer</DialogTitle>
        </DialogHeader>
        <div className="py-2 text-sm text-muted-foreground space-y-4">
          <p>You're about to link this vendor to a customer. As a result the vendor profile of the contact will be linked to the customer profile of the other contact. This process will allow you to view receivables and payables for the contact from the contact's overview section.</p>
          <div>
            <Label>Customer</Label>
            <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
              <SelectTrigger className="w-full mt-1.5"><SelectValue placeholder="Select Customer" /></SelectTrigger>
              <SelectContent>
                {customers.map(c => <SelectItem key={c._id} value={c._id}>{c.displayName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!selectedCustomerId || loading} onClick={() => { onSave(selectedCustomerId); onClose(); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssociateTemplatesDialog({ open, onClose }: { open: boolean, onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Associate Templates</DialogTitle>
        </DialogHeader>
        <div className="py-2 text-sm text-muted-foreground space-y-6 max-h-[70vh] overflow-y-auto pr-2">
          <p>You can associate specific templates for transaction PDFs and emails that will be sent to your vendors.</p>
          
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-medium text-foreground">PDF Templates</h3>
              <Button variant="ghost" size="sm" className="h-8 text-primary"><Plus className="w-4 h-4 mr-1" />New PDF Template</Button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-[200px_1fr] items-center gap-4">
                <span className="text-foreground">Vendor Statement</span>
                <Select defaultValue="standard"><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="standard">Standard</SelectItem></SelectContent></Select>
              </div>
              <div className="grid grid-cols-[200px_1fr] items-center gap-4">
                <span className="text-foreground">Purchase Order</span>
                <Select defaultValue="standard"><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="standard">Standard Template</SelectItem></SelectContent></Select>
              </div>
              <div className="grid grid-cols-[200px_1fr] items-center gap-4">
                <span className="text-foreground">Bills</span>
                <Select defaultValue="standard"><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="standard">Standard Template</SelectItem></SelectContent></Select>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-medium text-foreground">Email Notifications</h3>
              <Button variant="ghost" size="sm" className="h-8 text-primary"><Plus className="w-4 h-4 mr-1" />New Email Template</Button>
            </div>
            <div className="mb-4 text-xs font-medium flex items-center text-primary">
              <Settings className="w-3.5 h-3.5 mr-1.5" />Vendor Language: English
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-[200px_1fr] items-center gap-4">
                <span className="text-foreground">Purchase Order</span>
                <Select defaultValue="default"><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="default">Default</SelectItem></SelectContent></Select>
              </div>
              <div className="grid grid-cols-[200px_1fr] items-center gap-4">
                <span className="text-foreground">Payments Made</span>
                <Select defaultValue="default"><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="default">Default</SelectItem></SelectContent></Select>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={onClose}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
