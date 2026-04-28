"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Settings, ScanLine, Plus, UploadCloud, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function NewPutawayPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([{ id: 1, name: "", quantity: "0.00" }]);

  const handleAddItem = () => {
    setItems([...items, { id: Date.now(), name: "", quantity: "0.00" }]);
  };

  const handleGenerate = async () => {
    setLoading(true);
    // Simulate API call
    setTimeout(() => {
      setLoading(false);
      toast.success("Putaway generated successfully!");
      router.push("/inventory/putaways");
    }, 1000);
  };

  return (
    <div className="flex flex-col h-full bg-white relative max-w-5xl mx-auto border-x border-b shadow-sm min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <h1 className="text-xl font-semibold text-slate-800">New Putaway</h1>
        <Button variant="ghost" size="icon" asChild>
          <Link href="/inventory/putaways">
            <X className="h-5 w-5 text-slate-500" />
          </Link>
        </Button>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 space-y-10">
        {/* Form Fields */}
        <div className="max-w-xl space-y-6">
          <div className="grid grid-cols-[160px_1fr] items-center gap-4">
            <Label className="text-rose-600 font-medium text-sm">Putaway#*</Label>
            <div className="relative">
              <Input 
                defaultValue="PA-00001" 
                className="pr-10 bg-blue-50/30 border-blue-200 focus-visible:ring-blue-500" 
              />
              <Button 
                variant="ghost" 
                size="icon" 
                className="absolute right-1 top-1 h-7 w-7 text-blue-500 hover:text-blue-600 hover:bg-blue-50"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-[160px_1fr] items-center gap-4">
            <Label className="font-medium text-slate-700 text-sm">Date</Label>
            <Input type="date" defaultValue="2026-04-28" />
          </div>

          <div className="grid grid-cols-[160px_1fr] items-center gap-4">
            <Label className="text-rose-600 font-medium text-sm">Warehouse Name*</Label>
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="Select a warehouse" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="wh-1">Main Warehouse</SelectItem>
                <SelectItem value="wh-2">Secondary Storage</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-[160px_1fr] items-start gap-4">
            <Label className="font-medium text-slate-700 text-sm pt-2">Internal Notes</Label>
            <Textarea 
              rows={4} 
              placeholder="Add internal notes here..." 
              className="resize-none"
            />
          </div>
        </div>

        {/* Item Details */}
        <div className="space-y-4 pt-4 border-t border-slate-100">
          <div className="flex justify-end mb-2">
            <Button variant="ghost" className="text-blue-500 hover:text-blue-600 hover:bg-blue-50">
              <ScanLine className="h-4 w-4 mr-2" />
              Scan Item
            </Button>
          </div>
          
          <div className="border rounded-md overflow-hidden bg-slate-50/50">
            <div className="grid grid-cols-[1fr_200px] gap-4 p-3 bg-slate-50 border-b text-sm font-medium text-slate-500">
              <div>Item Details</div>
              <div className="text-right">Quantity transferred</div>
            </div>
            
            <div className="p-2 space-y-2">
              {items.map((item, index) => (
                <div key={item.id} className="grid grid-cols-[1fr_200px] gap-4 items-center p-1">
                  <Input 
                    placeholder="Type or click to select an item." 
                    className="bg-white border-slate-200"
                  />
                  <Input 
                    type="number" 
                    defaultValue={item.quantity}
                    className="bg-white border-slate-200 text-right" 
                  />
                </div>
              ))}
            </div>
          </div>
          
          <div>
            <Button 
              variant="ghost" 
              onClick={handleAddItem}
              className="text-blue-500 hover:text-blue-600 hover:bg-blue-50 -ml-4"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Items
            </Button>
          </div>
        </div>

        {/* Attach Files */}
        <div className="space-y-4 pt-4 border-t border-slate-100">
          <h3 className="text-sm font-medium text-slate-700">Attach File(s) to Putaway</h3>
          <div className="flex items-center gap-4">
            <Button variant="outline" className="text-slate-600 border-slate-300 border-dashed">
              <UploadCloud className="h-4 w-4 mr-2" />
              Upload File
            </Button>
            <span className="text-xs text-slate-400">
              You can upload a maximum of 10 files, 10MB each
            </span>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="sticky bottom-0 bg-slate-50 border-t p-4 flex gap-3 px-6">
        <Button 
          className="bg-blue-500 hover:bg-blue-600 text-white min-w-[140px]" 
          onClick={handleGenerate}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Generate putaway
        </Button>
        <Button variant="outline" asChild>
          <Link href="/inventory/putaways">Cancel</Link>
        </Button>
      </div>
    </div>
  );
}
