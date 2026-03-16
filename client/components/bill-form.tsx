"use client";

import { useEffect, useState, useCallback, useRef, Fragment, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { 
  Plus, Search, Loader2, X, ChevronDown, GripVertical, Settings2, Upload, 
  HelpCircle, Trash2, Info, CircleDot, ExternalLink, ShoppingBag as ShoppingBagIcon 
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { contactApi, type Contact } from "@/lib/api/contacts";
import { accountApi, type Account } from "@/lib/api/accounts";
import { itemApi, type Item } from "@/lib/api/items";
import { settingsApi, type PaymentTerms } from "@/lib/api/settings";
import { billApi, type Bill, type CreateBillInput, type UpdateBillInput, type BillStatus, type DiscountLevel, type BillSourcePurchaseOrder } from "@/lib/api/bills";
import { tdsTaxApi, type TdsTax, type CreateTdsTaxInput, TDS_SECTIONS } from "@/lib/api/tds-taxes";
import { tcsTaxApi, type TcsTax, type CreateTcsTaxInput, TCS_SECTIONS } from "@/lib/api/tcs-taxes";
import { cn } from "@/lib/utils";
import { uploadApi } from "@/lib/api/upload";

// --- Helpers ---
const TODAY = () => new Date().toISOString().slice(0, 10);
const fmt = (v: number) => new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
function getName(v: any): string {
  if (!v) return "";
  if (typeof v === "object") return v.displayName || v.companyName || v.name || "";
  return String(v);
}

// --- Types ---
export interface LineRow {
  id: string;
  isHeader: boolean;
  headerText: string;
  itemId: string;
  itemName: string;
  accountId: string;
  accountName: string;
  description: string;
  quantity: number;
  rate: number;
  discountPercent: number;
  discountAmount: number;
  amount: number;
}

const newRow = (): LineRow => ({
  id: Math.random().toString(36).slice(2),
  isHeader: false,
  headerText: "",
  itemId: "",
  itemName: "",
  accountId: "",
  accountName: "",
  description: "",
  quantity: 1,
  rate: 0,
  discountPercent: 0,
  discountAmount: 0,
  amount: 0,
});

interface BillFormProps {
  initialData?: Bill;
  onSuccess: (bill: Bill) => void;
  onCancel: () => void;
  mode: "create" | "edit";
}

export function BillForm({ initialData, onSuccess, onCancel, mode }: BillFormProps) {
  const searchParams = useSearchParams();
  const cloneId = searchParams.get("clone");
  const [saving, setSaving] = useState(false);
  const [loadingClone, setLoadingClone] = useState(!!cloneId);
  
  // Basic Fields
  const [vendorId, setVendorId] = useState(initialData?.vendorId?._id || initialData?.vendorId || "");
  const [billNumber, setBillNumber] = useState(initialData?.billNumber || "");
  const [orderNumber, setOrderNumber] = useState(initialData?.orderNumber || "");
  const [billDate, setBillDate] = useState(initialData?.billDate ? initialData.billDate.split("T")[0] : TODAY());
  const [dueDate, setDueDate] = useState(initialData?.dueDate ? initialData.dueDate.split("T")[0] : "");
  const [paymentTermsId, setPaymentTermsId] = useState(initialData?.paymentTermsId?._id || initialData?.paymentTermsId || "");
  const [subject, setSubject] = useState(initialData?.subject || "");
  const [discountLevel, setDiscountLevel] = useState<DiscountLevel>(initialData?.discountLevel || "transaction");
  
  // Table Rows
  const [rows, setRows] = useState<LineRow[]>([]);

  // Totals & Taxes
  const [discountPercent, setDiscountPercent] = useState(0);
  const [taxType, setTaxType] = useState<"TDS" | "TCS" | "none">("none");
  const [tdsId, setTdsId] = useState("");
  const [tcsId, setTcsId] = useState("");
  const [adjustmentLabel, setAdjustmentLabel] = useState("Adjustment");
  const [adjustmentAmount, setAdjustmentAmount] = useState(0);

  // Initialize from initialData or newRow
  useEffect(() => {
    if (initialData) {
      setDiscountPercent(initialData.discountPercent || 0);
      setTaxType(initialData.taxType || "none");
      setTdsId(initialData.tdsId?._id || initialData.tdsId || "");
      setTcsId(initialData.tcsId?._id || initialData.tcsId || "");
      setAdjustmentLabel(initialData.adjustmentLabel || "Adjustment");
      setAdjustmentAmount(initialData.adjustmentAmount || 0);
      setRows(initialData.lineItems?.map(li => ({
          id: (li as any)._id || Math.random().toString(36).slice(2),
          isHeader: !!li.isHeader,
          headerText: li.headerText || "",
          itemId: typeof li.itemId === 'object' ? (li.itemId as any)?._id : (li.itemId || ""),
          itemName: typeof li.itemId === 'object' ? (li.itemId as any)?.name : (li.name || ""),
          accountId: typeof li.accountId === 'object' ? (li.accountId as any)?._id : (li.accountId || ""),
          accountName: typeof li.accountId === 'object' ? (li.accountId as any)?.name : "",
          description: li.description || "",
          quantity: li.quantity || 1,
          rate: li.rate || 0,
          discountPercent: li.discountPercent || 0,
          discountAmount: li.discountAmount || 0,
          amount: li.amount || 0,
       })) || [newRow()]);
    } else {
      setRows([newRow()]);
    }
  }, [initialData]);

  // Lists
  const [vendors, setVendors] = useState<Contact[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms[]>([]);
  const [tdsTaxes, setTdsTaxes] = useState<TdsTax[]>([]);
  const [tcsTaxes, setTcsTaxes] = useState<TcsTax[]>([]);

  useEffect(() => {
     const loadData = async () => {
        try {
           const [vRes, iRes, ptRes, accRes, tdsRes, tcsRes] = await Promise.all([
              contactApi.list({ type: "Vendor" }),
              itemApi.list(),
              settingsApi.paymentTerms.list(),
              accountApi.list(),
              tdsTaxApi.list(),
              tcsTaxApi.list(),
           ]);
           setVendors(vRes.data || []);
           setItems(iRes.data || []);
           setPaymentTerms(ptRes.data || []);
           setAccounts(accRes.data || []);
           setTdsTaxes(tdsRes.data || []);
           setTcsTaxes(tcsRes.data || []);

           if (cloneId) {
             const { data: bill } = await billApi.getOne(cloneId);
             setVendorId(bill.vendorId?._id || bill.vendorId || "");
             setOrderNumber(bill.orderNumber || "");
             setSubject(bill.subject || "");
             setDiscountLevel(bill.discountLevel || "transaction");
             setDiscountPercent(bill.discountPercent || 0);
             setTaxType(bill.taxType || "none");
             setTdsId(bill.tdsId?._id || bill.tdsId || "");
             setTcsId(bill.tcsId?._id || bill.tcsId || "");
             setPaymentTermsId(bill.paymentTermsId?._id || bill.paymentTermsId || "");
             setAdjustmentLabel(bill.adjustmentLabel || "Adjustment");
             setAdjustmentAmount(bill.adjustmentAmount || 0);
             setRows(bill.lineItems?.map((li: any) => ({
                id: Math.random().toString(36).slice(2),
                isHeader: !!li.isHeader,
                headerText: li.headerText || "",
                itemId: typeof li.itemId === 'object' ? li.itemId?._id : (li.itemId || ""),
                itemName: typeof li.itemId === 'object' ? li.itemId?.name : (li.name || ""),
                accountId: typeof li.accountId === 'object' ? li.accountId?._id : (li.accountId || ""),
                accountName: typeof li.accountId === 'object' ? li.accountId?.name : "",
                description: li.description || "",
                quantity: li.quantity || 1,
                rate: li.rate || 0,
                discountPercent: li.discountPercent || 0,
                discountAmount: li.discountAmount || 0,
                amount: li.amount || 0,
             })) || [newRow()]);
             setLoadingClone(false);
           }

           if (mode === "create") {
              const numRes = await billApi.getNextNumber();
              setBillNumber(numRes.data.billNumber);
           }
        } catch (err) { toast.error("Failed to load form data"); setLoadingClone(false); }
     };
     loadData();
  }, [mode, cloneId]);

  // Calculations
  const subTotal = rows.reduce((acc, r) => acc + (r.isHeader ? 0 : r.amount), 0);
  const totalDiscount = discountLevel === "transaction" ? (subTotal * discountPercent) / 100 : rows.reduce((acc, r) => acc + (r.discountAmount || 0), 0);
  
  let taxAmount = 0;
  if (taxType === "TDS" && tdsId) {
     const tds = tdsTaxes.find(t => t._id === tdsId);
     if (tds) taxAmount = (subTotal * tds.rate) / 100;
  } else if (taxType === "TCS" && tcsId) {
     const tcs = tcsTaxes.find(t => t._id === tcsId);
     if (tcs) taxAmount = (subTotal * tcs.rate) / 100;
  }
  
  const total = subTotal - (discountLevel === "transaction" ? totalDiscount : 0) + (taxType === "TCS" ? taxAmount : 0) + adjustmentAmount;

  async function handleSubmit(status: BillStatus = "Draft") {
     if (!vendorId) return toast.error("Please select a vendor");
     setSaving(true);
     try {
        const payload: CreateBillInput = {
           vendorId, billNumber, billDate, dueDate, paymentTermsId, subject, 
           discountLevel, discountPercent, taxType, tdsId, tcsId, adjustmentLabel, adjustmentAmount,
           lineItems: rows.map(r => ({
              isHeader: r.isHeader,
              headerText: r.headerText,
              itemId: r.itemId || null,
              name: r.itemName,
              accountId: r.accountId || null,
              description: r.description,
              quantity: r.quantity,
              rate: r.rate,
              discountPercent: r.discountPercent,
              discountAmount: r.discountAmount,
              amount: r.amount,
           })),
           status
        };
        
        let res;
        if (mode === "edit" && initialData) {
           res = await billApi.update(initialData._id, payload as UpdateBillInput);
           toast.success("Bill updated successfully");
        } else {
           res = await billApi.create(payload);
           toast.success("Bill created successfully");
        }
        onSuccess(res.data);
     } catch (err) { toast.error("Failed to save bill"); } finally { setSaving(false); }
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto bg-white rounded-xl border shadow-sm my-8">
       <div className="flex justify-between items-center border-b pb-4">
          <h1 className="text-xl font-bold text-gray-800">{mode === "create" ? "New Bill" : `Edit Bill ${billNumber}`}</h1>
          <Button variant="ghost" size="icon" onClick={onCancel}><X className="h-4 w-4" /></Button>
       </div>
       
       <div className="grid grid-cols-2 gap-x-12 gap-y-6">
          <div className="space-y-2">
             <Label>Vendor Name <span className="text-red-500">*</span></Label>
             <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger><SelectValue placeholder="Select Vendor" /></SelectTrigger>
                <SelectContent>
                   {vendors.map(v => <SelectItem key={v._id} value={v._id}>{v.displayName}</SelectItem>)}
                </SelectContent>
             </Select>
          </div>
          <div className="space-y-2">
             <Label>Bill#</Label>
             <Input value={billNumber} onChange={e => setBillNumber(e.target.value)} />
          </div>
          <div className="space-y-2">
             <Label>Bill Date</Label>
             <Input type="date" value={billDate} onChange={e => setBillDate(e.target.value)} />
          </div>
          <div className="space-y-2">
             <Label>Due Date</Label>
             <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
       </div>

       <div className="border rounded-lg overflow-hidden mt-4">
          <table className="w-full text-sm">
             <thead className="bg-gray-50 border-b">
                <tr>
                   <th className="px-4 py-2 text-left font-semibold">Item Details</th>
                   <th className="px-4 py-2 text-right font-semibold w-24">Quantity</th>
                   <th className="px-4 py-2 text-right font-semibold w-32">Rate</th>
                   <th className="px-4 py-2 text-right font-semibold w-32">Amount</th>
                   <th className="w-10"></th>
                </tr>
             </thead>
             <tbody>
                {rows.map((row, idx) => (
                   <tr key={row.id} className="border-b last:border-0 hover:bg-gray-50/30">
                      <td className="px-4 py-3">
                         <Input 
                            value={row.itemName} 
                            onChange={e => {
                               const newRows = [...rows];
                               newRows[idx].itemName = e.target.value;
                               setRows(newRows);
                            }}
                            placeholder="Type item name..."
                         />
                      </td>
                      <td className="px-4 py-3">
                         <Input 
                            type="number" 
                            className="text-right"
                            value={row.quantity} 
                            onChange={e => {
                               const newRows = [...rows];
                               newRows[idx].quantity = parseFloat(e.target.value) || 0;
                               newRows[idx].amount = newRows[idx].quantity * newRows[idx].rate;
                               setRows(newRows);
                            }}
                         />
                      </td>
                      <td className="px-4 py-3">
                         <Input 
                            type="number" 
                            className="text-right"
                            value={row.rate} 
                            onChange={e => {
                               const newRows = [...rows];
                               newRows[idx].rate = parseFloat(e.target.value) || 0;
                               newRows[idx].amount = newRows[idx].quantity * newRows[idx].rate;
                               setRows(newRows);
                            }}
                         />
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                         {fmt(row.amount)}
                      </td>
                      <td className="px-2">
                         <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-600" onClick={() => setRows(rows.filter(r => r.id !== row.id))}>
                            <Trash2 className="h-4 w-4" />
                         </Button>
                      </td>
                   </tr>
                ))}
             </tbody>
          </table>
          <div className="p-3 bg-gray-50/50 border-t">
             <Button variant="outline" size="sm" className="gap-2" onClick={() => setRows([...rows, newRow()])}>
                <Plus className="h-4 w-4" /> Add Line
             </Button>
          </div>
       </div>

       <div className="flex justify-end mt-4">
          <div className="w-72 space-y-3">
             <div className="flex justify-between text-sm">
                <span className="text-gray-500">Sub Total</span>
                <span className="font-medium text-gray-900">{fmt(subTotal)}</span>
             </div>
             <Separator />
             <div className="flex justify-between text-lg font-bold border-t pt-2">
                <span>Total</span>
                <span className="text-blue-600">₹{fmt(total)}</span>
             </div>
          </div>
       </div>

       <div className="flex justify-end gap-3 border-t pt-6 mt-4">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button variant="secondary" onClick={() => handleSubmit("Draft")} disabled={saving}>Save as Draft</Button>
          <Button onClick={() => handleSubmit("Open")} disabled={saving} className="bg-blue-600 hover:bg-blue-700 min-w-[120px]">
             {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
             Save as Open
          </Button>
       </div>
    </div>
  );
}
