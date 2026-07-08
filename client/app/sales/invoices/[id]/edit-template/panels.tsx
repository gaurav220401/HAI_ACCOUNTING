"use client";
import React, { useState, useRef } from "react";
import { ChevronDown, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { InvoiceTemplateConfig, EditTemplateTab } from "./config";

function Sec({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold hover:bg-slate-50 transition-colors text-left text-slate-700 bg-slate-50/50">
          {title}
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 pt-2 space-y-3 border-t border-slate-200 bg-white">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function CP({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <Input className="h-7 text-xs font-mono w-20 border-slate-200 focus-visible:ring-teal-600" value={value} onChange={(e) => onChange(e.target.value)} />
      <input type="color" className="h-7 w-8 rounded border border-slate-200 cursor-pointer p-0.5 shrink-0"
        value={value.startsWith("#") && value.length >= 7 ? value.slice(0, 7) : "#000000"}
        onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

interface Props {
  tab: EditTemplateTab;
  config: InvoiceTemplateConfig;
  update: (p: Partial<InvoiceTemplateConfig>) => void;
  updateMargin: (k: keyof InvoiceTemplateConfig["margins"], v: number) => void;
  orgLogo: string;
  orgName: string;
  onLogoUpload?: (file: File) => void;
  logoUploading?: boolean;
  logoUploadDisabled?: boolean;
  orgTaxId?: string;
  orgPhone?: string;
  orgEmail?: string;
  orgAddressText?: string;
}

export function SettingsPanel({
  tab,
  config,
  update,
  updateMargin,
  orgLogo,
  orgName,
  onLogoUpload,
  logoUploading = false,
  logoUploadDisabled = false,
  orgTaxId = "",
  orgPhone = "",
  orgEmail = "",
  orgAddressText = "",
}: Props) {
  const [tableSubTab, setTableSubTab] = useState<"labels"|"layout">("labels");
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  function handleLogoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !onLogoUpload) return;
    onLogoUpload(file);
    e.currentTarget.value = "";
  }

  return (
    <div className="p-4 space-y-4">
      {tab === "general" && (
        <div className="space-y-5">
          <div>
            <Label className="text-xs font-bold text-slate-700 mb-1.5 block">Template Name <span className="text-rose-500">*</span></Label>
            <Input className="h-8 text-sm border-slate-200 focus-visible:ring-teal-600" value={config.templateName} onChange={(e) => update({ templateName: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs font-bold text-slate-700 mb-2 block">Paper Size</Label>
            <div className="flex items-center gap-5">
              {(["A5","A4","Letter"] as const).map((s) => (
                <label key={s} className="flex items-center gap-1.5 cursor-pointer text-sm text-slate-600">
                  <input type="radio" name="paperSize" checked={config.paperSize===s} onChange={()=>update({paperSize:s})} className="h-3.5 w-3.5 accent-teal-600" />{s}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs font-bold text-slate-700 mb-2 block">Orientation</Label>
            <div className="flex items-center gap-5">
              {(["Portrait","Landscape"] as const).map((o) => (
                <label key={o} className="flex items-center gap-1.5 cursor-pointer text-sm text-slate-600">
                  <input type="radio" name="orientation" checked={config.orientation===o} onChange={()=>update({orientation:o})} className="h-3.5 w-3.5 accent-teal-600" />{o}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs font-bold text-slate-700 mb-2 block">Margins (inches)</Label>
            <div className="grid grid-cols-4 gap-2">
              {(["top","bottom","left","right"] as const).map((k) => (
                <div key={k}>
                  <Label className="text-[10px] font-semibold text-slate-400 mb-1 block capitalize">{k}</Label>
                  <Input type="number" step="0.05" min="0" max="3" className="h-8 text-sm border-slate-200 focus-visible:ring-teal-600" value={config.margins[k]} onChange={(e)=>updateMargin(k,parseFloat(e.target.value)||0)} />
                </div>
              ))}
            </div>
          </div>
          <Sec title="Font" defaultOpen={false}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Font Family</Label>
                <Select value={config.fontFamily} onValueChange={(v)=>update({fontFamily:v})}>
                  <SelectTrigger className="h-8 text-xs border-slate-200 focus:ring-teal-600"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Inter, sans-serif">Inter</SelectItem>
                    <SelectItem value="Arial, sans-serif">Arial</SelectItem>
                    <SelectItem value="'Times New Roman', serif">Times New Roman</SelectItem>
                    <SelectItem value="Helvetica, sans-serif">Helvetica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Font Size (pt)</Label>
                <Select value={String(config.fontSize)} onValueChange={(v)=>update({fontSize:parseInt(v)})}>
                  <SelectTrigger className="h-8 text-xs border-slate-200 focus:ring-teal-600"><SelectValue /></SelectTrigger>
                  <SelectContent>{[8,9,10,11,12,13,14].map((s)=>(<SelectItem key={s} value={String(s)}>{s}</SelectItem>))}</SelectContent>
                </Select>
              </div>
            </div>
          </Sec>
          <Sec title="Background" defaultOpen={false}>
            <div><Label className="text-xs font-semibold text-slate-600 mb-1.5 block">Background Color</Label><CP value={config.backgroundColor} onChange={(v)=>update({backgroundColor:v})} /></div>
          </Sec>
        </div>
      )}

      {tab === "organization" && (
        <div className="space-y-3">
          <Sec title="Logo & Name" defaultOpen={true}>
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer text-slate-600"><input type="checkbox" checked={config.showOrgLogo} onChange={(e)=>update({showOrgLogo:e.target.checked})} className="h-4 w-4 rounded accent-teal-600" /><span className="text-sm font-semibold">Show Logo</span></label>
              {config.showOrgLogo && (
                <div className="ml-6 space-y-2">
                  <div className="border-2 border-dashed border-slate-200 rounded overflow-hidden bg-slate-50 flex items-center justify-center" style={{width:`${config.orgLogoSize}px`,height:`${Math.round(config.orgLogoSize*0.75)}px`,minWidth:"60px",minHeight:"45px"}}>
                    {orgLogo ? <img src={orgLogo} alt={orgName} style={{width:"100%",height:"100%",objectFit:"contain",padding:"4px"}} /> : <span style={{fontSize:"8pt",color:"#9ca3af"}}>No logo</span>}
                  </div>
                  {onLogoUpload && (
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" size="sm" className="h-7 text-xs border-slate-200 text-slate-600 hover:bg-slate-50" disabled={logoUploading || logoUploadDisabled} onClick={() => logoInputRef.current?.click()}>
                        {logoUploading ? "Uploading..." : "Upload Logo"}
                      </Button>
                      <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/gif,image/bmp" className="hidden" onChange={handleLogoFileChange} />
                    </div>
                  )}
                  <div className="flex items-center gap-2"><span className="text-[10px] font-semibold text-slate-400 shrink-0">Resize</span><input type="range" min="30" max="120" step="5" value={config.orgLogoSize} onChange={(e)=>update({orgLogoSize:parseInt(e.target.value)})} className="flex-1 accent-teal-600" /><span className="text-[10px] font-semibold text-slate-500 w-10 text-right">{config.orgLogoSize}px</span></div>
                </div>
              )}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="flex items-center gap-2 cursor-pointer shrink-0 text-slate-600"><input type="checkbox" checked={config.showOrgName} onChange={(e)=>update({showOrgName:e.target.checked})} className="h-4 w-4 rounded accent-teal-600" /><span className="text-sm font-semibold">Org Name</span></label>
                  {config.showOrgName && <><CP value={config.orgNameColor} onChange={(v)=>update({orgNameColor:v})} /><div className="flex items-center gap-1"><Input type="number" min="6" max="24" className="h-7 text-xs w-12 border-slate-200 focus-visible:ring-teal-600" value={config.orgNameFontSize} onChange={(e)=>update({orgNameFontSize:parseInt(e.target.value)||10})} /><span className="text-[10px] text-slate-400">pt</span></div></>}
                </div>
                {config.showOrgName && (
                  <div className="ml-6"><Input className="h-7 text-xs border-slate-200 focus-visible:ring-teal-600" value={config.orgNameOverride !== "" ? config.orgNameOverride : orgName} onChange={(e)=>update({orgNameOverride:e.target.value})} placeholder="Rename Organization Name" /></div>
                )}
              </div>
            </div>
          </Sec>
          <Sec title="Contact Info" defaultOpen={true}>
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer text-slate-600"><input type="checkbox" checked={config.showOrgAddress} onChange={(e)=>update({showOrgAddress:e.target.checked})} className="h-4 w-4 rounded accent-teal-600" /><span className="text-sm font-semibold">Show Address</span></label>
              {config.showOrgAddress && (
                <div className="ml-6"><Input className="h-7 text-xs border-slate-200 focus-visible:ring-teal-600" value={config.factoryValueOverride !== "" ? config.factoryValueOverride : orgAddressText} onChange={(e)=>update({factoryValueOverride:e.target.value})} placeholder="Rename Address" /></div>
              )}
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer w-28 shrink-0 text-slate-600"><input type="checkbox" checked={config.showGstin} onChange={(e)=>update({showGstin:e.target.checked})} className="h-4 w-4 rounded accent-teal-600" /><span className="text-sm font-semibold">GSTIN</span></label>
                  <Input className="h-7 text-xs flex-1 border-slate-200 focus-visible:ring-teal-600" value={config.gstinLabel} onChange={(e)=>update({gstinLabel:e.target.value})} placeholder="Label" />
                </div>
                {config.showGstin && <div className="ml-8"><Input className="h-7 text-xs border-slate-200 focus-visible:ring-teal-600" value={config.gstinValueOverride !== "" ? config.gstinValueOverride : orgTaxId} onChange={(e)=>update({gstinValueOverride:e.target.value})} placeholder="Rename GSTIN" /></div>}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer w-28 shrink-0 text-slate-600"><input type="checkbox" checked={config.showContact} onChange={(e)=>update({showContact:e.target.checked})} className="h-4 w-4 rounded accent-teal-600" /><span className="text-sm font-semibold">Contact</span></label>
                  <Input className="h-7 text-xs flex-1 border-slate-200 focus-visible:ring-teal-600" value={config.contactLabel} onChange={(e)=>update({contactLabel:e.target.value})} placeholder="Label" />
                </div>
                {config.showContact && <div className="ml-8"><Input className="h-7 text-xs border-slate-200 focus-visible:ring-teal-600" value={config.contactValueOverride !== "" ? config.contactValueOverride : orgPhone} onChange={(e)=>update({contactValueOverride:e.target.value})} placeholder="Rename Contact Number" /></div>}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer w-28 shrink-0 text-slate-600"><input type="checkbox" checked={config.showEmail} onChange={(e)=>update({showEmail:e.target.checked})} className="h-4 w-4 rounded accent-teal-600" /><span className="text-sm font-semibold">Email</span></label>
                  <Input className="h-7 text-xs flex-1 border-slate-200 focus-visible:ring-teal-600" value={config.emailLabel} onChange={(e)=>update({emailLabel:e.target.value})} placeholder="Label" />
                </div>
                {config.showEmail && <div className="ml-8"><Input className="h-7 text-xs border-slate-200 focus-visible:ring-teal-600" value={config.emailValueOverride !== "" ? config.emailValueOverride : orgEmail} onChange={(e)=>update({emailValueOverride:e.target.value})} placeholder="Rename Email" /></div>}
              </div>
            </div>
          </Sec>
        </div>
      )}

      {tab === "invoice_meta" && (
        <div className="space-y-3">
          <Sec title="Invoice References" defaultOpen={true}>
            <div className="space-y-2">
              {([
                ["invoiceNoLabel","Invoice No."],
                ["datedLabel","Dated"],
                ["deliveryNoteLabel","Delivery Note"],
                ["modeOfPaymentLabel","Mode/Terms of Payment"],
                ["referenceNoLabel","Reference No. & Date"],
                ["otherReferencesLabel","Other References"],
                ["buyersOrderNoLabel","Buyer's Order No."],
                ["dispatchDocNoLabel","Dispatch Doc No."],
                ["deliveryNoteDateLabel","Delivery Note Date"],
                ["dispatchedThroughLabel","Dispatched through"],
                ["destinationLabel","Destination"],
                ["billOfLadingLabel","Bill of Lading/LR-RR No."],
                ["motorVehicleNoLabel","Motor Vehicle No."],
                ["termsOfDeliveryLabel","Terms of Delivery"],
              ] as [keyof InvoiceTemplateConfig,string][]).map(([k,ph])=>(
                <div key={String(k)}><Label className="text-xs font-semibold text-slate-600 mb-1 block">{ph}</Label><Input className="h-7 text-xs border-slate-200 focus-visible:ring-teal-600" value={config[k] as string} onChange={(e)=>update({[k]:e.target.value})} placeholder={ph} /></div>
              ))}
            </div>
          </Sec>
          <Sec title="Customer Labels" defaultOpen={false}>
            <div className="space-y-3">
              <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Consignee Label</Label><Input className="h-7 text-xs border-slate-200 focus-visible:ring-teal-600" value={config.consigneeLabel} onChange={(e)=>update({consigneeLabel:e.target.value})} /></div>
              <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Buyer Label</Label><Input className="h-7 text-xs border-slate-200 focus-visible:ring-teal-600" value={config.buyerLabel} onChange={(e)=>update({buyerLabel:e.target.value})} /></div>
              <div>
                <Label className="text-xs font-semibold text-slate-600 mb-1.5 block">Customer Name Font</Label>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-1.5"><span className="text-xs text-slate-400">Color</span><CP value={config.customerNameFontColor} onChange={(v)=>update({customerNameFontColor:v})} /></div>
                  <div className="flex items-center gap-1"><span className="text-xs text-slate-400">Size</span><Input type="number" min="6" max="24" className="h-7 text-xs w-12 ml-1 border-slate-200 focus-visible:ring-teal-600" value={config.customerNameFontSize} onChange={(e)=>update({customerNameFontSize:parseInt(e.target.value)||9})} /><span className="text-[10px] text-slate-400">pt</span></div>
                </div>
              </div>
            </div>
          </Sec>
        </div>
      )}

      {tab === "table" && (
        <div className="space-y-4">
          <p className="text-sm font-bold text-slate-700">Item Table</p>
          <div className="flex border-b border-slate-200 gap-0">
            {(["labels","layout"] as const).map((sub)=>(
              <button key={sub} onClick={()=>setTableSubTab(sub)} className={`px-5 py-2 text-xs capitalize transition-colors border-b-2 -mb-px font-bold ${tableSubTab===sub?"border-teal-600 text-teal-700":"border-transparent text-slate-400 hover:text-slate-700"}`}>{sub}</button>
            ))}
          </div>
          {tableSubTab === "labels" && (
            <div className="space-y-2">
              {([
                {ck:"colSlNo" as const,lk:"slNoLabel" as const,l:"Sl No."},
                {ck:"colDescription" as const,lk:"descriptionLabel" as const,l:"Description"},
                {ck:"colHsn" as const,lk:"hsnLabel" as const,l:"HSN/SAC"},
                {ck:"colQty" as const,lk:"qtyLabel" as const,l:"Quantity"},
                {ck:"colRate" as const,lk:"rateLabel" as const,l:"Rate"},
                {ck:"colPer" as const,lk:"perLabel" as const,l:"per"},
                {ck:"colAmount" as const,lk:"amountLabel" as const,l:"Amount"},
              ]).map(({ck,lk,l})=>(
                <div key={ck} className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer w-36 shrink-0 text-slate-600"><input type="checkbox" checked={config[ck]} onChange={(e)=>update({[ck]:e.target.checked})} className="h-4 w-4 rounded accent-teal-600" /><span className="text-sm">{l}</span></label>
                  <Input className="h-7 text-xs flex-1 border-slate-200 focus-visible:ring-teal-600" value={config[lk]} onChange={(e)=>update({[lk]:e.target.value})} />
                </div>
              ))}
            </div>
          )}
          {tableSubTab === "layout" && (
            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-3">Table Header</p>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3"><span className="text-xs text-slate-500 w-28 shrink-0 font-medium">Font Size</span><div className="flex items-center gap-1"><Input type="number" min="6" max="24" className="h-7 text-xs w-14 border-slate-200 focus-visible:ring-teal-600" value={config.tableHeaderFontSize} onChange={(e)=>update({tableHeaderFontSize:parseInt(e.target.value)||9})} /><span className="text-[10px] text-slate-400">pt</span></div></div>
                  <div className="flex items-center gap-3"><span className="text-xs text-slate-500 w-28 shrink-0 font-medium">Background</span><CP value={config.tableHeaderBgColor} onChange={(v)=>update({tableHeaderBgColor:v})} /></div>
                  <div className="flex items-center gap-3"><span className="text-xs text-slate-500 w-28 shrink-0 font-medium">Font Color</span><CP value={config.tableHeaderFontColor} onChange={(v)=>update({tableHeaderFontColor:v})} /></div>
                </div>
              </div>
              <Separator />
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-3">Table Row</p>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3"><span className="text-xs text-slate-500 w-28 shrink-0 font-medium">Odd Row</span><CP value={config.oddRowColor} onChange={(v)=>update({oddRowColor:v})} /></div>
                  <div className="flex items-center gap-3"><span className="text-xs text-slate-500 w-28 shrink-0 font-medium">Even Row</span><CP value={config.evenRowColor} onChange={(v)=>update({evenRowColor:v})} /></div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "footer" && (
        <div className="space-y-3">
          <Sec title="Totals block" defaultOpen={true}>
            <div className="space-y-2">
              <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Amount Words Label</Label><Input className="h-7 text-xs border-slate-200 focus-visible:ring-teal-600" value={config.amountChargeableWordsLabel} onChange={(e)=>update({amountChargeableWordsLabel:e.target.value})} /></div>
              <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Tax Amount Words Label</Label><Input className="h-7 text-xs border-slate-200 focus-visible:ring-teal-600" value={config.taxAmountWordsLabel} onChange={(e)=>update({taxAmountWordsLabel:e.target.value})} /></div>
            </div>
          </Sec>
          <Sec title="Declaration" defaultOpen={true}>
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer shrink-0 text-slate-600"><input type="checkbox" checked={config.showDeclaration} onChange={(e)=>update({showDeclaration:e.target.checked})} className="h-4 w-4 rounded accent-teal-600" /><span className="text-sm font-semibold">Show Declaration</span></label>
              {config.showDeclaration && (
                <>
                  <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Label</Label><Input className="h-7 text-xs border-slate-200 focus-visible:ring-teal-600" value={config.declarationLabel} onChange={(e)=>update({declarationLabel:e.target.value})} /></div>
                  <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Text</Label><Textarea className="text-xs resize-none border-slate-200 focus-visible:ring-teal-600" rows={3} value={config.declarationText} onChange={(e)=>update({declarationText:e.target.value})} /></div>
                </>
              )}
            </div>
          </Sec>
          <Sec title="Signatures" defaultOpen={true}>
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer shrink-0 text-slate-600"><input type="checkbox" checked={config.showSignature} onChange={(e)=>update({showSignature:e.target.checked})} className="h-4 w-4 rounded accent-teal-600" /><span className="text-sm font-semibold">Show Signatures</span></label>
              {config.showSignature && (
                <>
                  <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Customer Seal Label</Label><Input className="h-7 text-xs border-slate-200 focus-visible:ring-teal-600" value={config.customerSealLabel} onChange={(e)=>update({customerSealLabel:e.target.value})} /></div>
                  <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Auth Signatory Label</Label><Input className="h-7 text-xs border-slate-200 focus-visible:ring-teal-600" value={config.authSignatoryLabel} onChange={(e)=>update({authSignatoryLabel:e.target.value})} /></div>
                </>
              )}
            </div>
          </Sec>
        </div>
      )}
    </div>
  );
}
