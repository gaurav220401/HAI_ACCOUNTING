"use client";
import React, { useState, useRef } from "react";
import { ChevronDown, Settings2, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { QuoteTemplateConfig, EditTemplateTab } from "./config";

function Sec({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border rounded-lg overflow-hidden">
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium hover:bg-muted/20 transition-colors text-left">
          {title}
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 pt-2 space-y-3 border-t bg-background">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function CP({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <Input className="h-7 text-xs font-mono w-20" value={value} onChange={(e) => onChange(e.target.value)} />
      <input type="color" className="h-7 w-8 rounded border cursor-pointer p-0.5 shrink-0"
        value={value.startsWith("#") && value.length >= 7 ? value.slice(0, 7) : "#000000"}
        onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

interface Props {
  tab: EditTemplateTab;
  config: QuoteTemplateConfig;
  update: (p: Partial<QuoteTemplateConfig>) => void;
  updateMargin: (k: keyof QuoteTemplateConfig["margins"], v: number) => void;
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
            <Label className="text-xs mb-1.5 block">Template Name <span className="text-destructive">*</span></Label>
            <Input className="h-8 text-sm" value={config.templateName} onChange={(e) => update({ templateName: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs mb-2 block">Paper Size</Label>
            <div className="flex items-center gap-5">
              {(["A5","A4","Letter"] as const).map((s) => (
                <label key={s} className="flex items-center gap-1.5 cursor-pointer text-sm">
                  <input type="radio" name="paperSize" checked={config.paperSize===s} onChange={()=>update({paperSize:s})} className="h-3.5 w-3.5 accent-teal-600" />{s}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs mb-2 block">Orientation</Label>
            <div className="flex items-center gap-5">
              {(["Portrait","Landscape"] as const).map((o) => (
                <label key={o} className="flex items-center gap-1.5 cursor-pointer text-sm">
                  <input type="radio" name="orientation" checked={config.orientation===o} onChange={()=>update({orientation:o})} className="h-3.5 w-3.5 accent-teal-600" />{o}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs mb-2 block">Margins (inches)</Label>
            <div className="grid grid-cols-4 gap-2">
              {(["top","bottom","left","right"] as const).map((k) => (
                <div key={k}>
                  <Label className="text-xs text-muted-foreground mb-1 block capitalize">{k}</Label>
                  <Input type="number" step="0.05" min="0" max="3" className="h-8 text-sm" value={config.margins[k]} onChange={(e)=>updateMargin(k,parseFloat(e.target.value)||0)} />
                </div>
              ))}
            </div>
          </div>
          <Sec title="Font" defaultOpen={false}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Font Family</Label>
                <Select value={config.fontFamily} onValueChange={(v)=>update({fontFamily:v})}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Inter, sans-serif">Inter</SelectItem>
                    <SelectItem value="Arial, sans-serif">Arial</SelectItem>
                    <SelectItem value="'Times New Roman', serif">Times New Roman</SelectItem>
                    <SelectItem value="Helvetica, sans-serif">Helvetica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Font Size (pt)</Label>
                <Select value={String(config.fontSize)} onValueChange={(v)=>update({fontSize:parseInt(v)})}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{[8,9,10,11,12,13,14].map((s)=>(<SelectItem key={s} value={String(s)}>{s}</SelectItem>))}</SelectContent>
                </Select>
              </div>
            </div>
          </Sec>
          <Sec title="Background" defaultOpen={false}>
            <div><Label className="text-xs mb-1.5 block">Background Color</Label><CP value={config.backgroundColor} onChange={(v)=>update({backgroundColor:v})} /></div>
          </Sec>
        </div>
      )}

      {tab === "header_footer" && (
        <div className="space-y-3">
          <Sec title="Header" defaultOpen={true}>
            <label className="flex items-center gap-2 cursor-pointer flex-wrap">
              <input type="checkbox" checked={config.headerBgColorEnabled} onChange={(e)=>update({headerBgColorEnabled:e.target.checked})} className="h-4 w-4 rounded" />
              <span className="text-sm">Background Color</span>
              <CP value={config.headerBgColor} onChange={(v)=>update({headerBgColor:v})} />
            </label>
            <label className="flex items-center gap-2 cursor-pointer flex-wrap">
              <input type="checkbox" checked={config.showHeaderDivider} onChange={(e)=>update({showHeaderDivider:e.target.checked})} className="h-4 w-4 rounded" />
              <span className="text-sm">Divider Line</span>
              <CP value={config.headerDividerColor} onChange={(v)=>update({headerDividerColor:v})} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Header Font Size</Label>
                <div className="flex items-center gap-1.5">
                  <Input type="number" min="6" max="14" className="h-7 text-xs w-16" value={config.headerFontSize} onChange={(e)=>update({headerFontSize:parseFloat(e.target.value)||7.5})} />
                  <span className="text-xs text-muted-foreground">pt</span>
                </div>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Header Font Color</Label>
                <CP value={config.headerTextColor} onChange={(v)=>update({headerTextColor:v})} />
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={config.showOrgLogo} onChange={(e)=>update({showOrgLogo:e.target.checked})} className="h-4 w-4 rounded" /><span className="text-sm font-medium">Show Logo</span></label>
              {config.showOrgLogo && (
                <div className="ml-6 space-y-2">
                  <div className="border-2 border-dashed border-border rounded overflow-hidden bg-muted/10 flex items-center justify-center" style={{width:`${config.orgLogoSize}px`,height:`${Math.round(config.orgLogoSize*0.75)}px`,minWidth:"60px",minHeight:"45px"}}>
                    {orgLogo ? <img src={orgLogo} alt={orgName} style={{width:"100%",height:"100%",objectFit:"contain",padding:"4px"}} /> : <span style={{fontSize:"8pt",color:"#9ca3af"}}>No logo</span>}
                  </div>
                  {onLogoUpload && (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={logoUploading || logoUploadDisabled}
                        onClick={() => logoInputRef.current?.click()}
                      >
                        {logoUploading ? "Uploading..." : "Upload Logo"}
                      </Button>
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/gif,image/bmp"
                        className="hidden"
                        onChange={handleLogoFileChange}
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground shrink-0">Resize</span><input type="range" min="30" max="120" step="5" value={config.orgLogoSize} onChange={(e)=>update({orgLogoSize:parseInt(e.target.value)})} className="flex-1 accent-teal-600" /><span className="text-xs text-muted-foreground w-10 text-right">{config.orgLogoSize}px</span></div>
                </div>
              )}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="flex items-center gap-2 cursor-pointer shrink-0"><input type="checkbox" checked={config.showOrgName} onChange={(e)=>update({showOrgName:e.target.checked})} className="h-4 w-4 rounded" /><span className="text-sm">Org Name</span></label>
                  {config.showOrgName && <><CP value={config.orgNameColor} onChange={(v)=>update({orgNameColor:v})} /><div className="flex items-center gap-1"><Input type="number" min="6" max="24" className="h-7 text-xs w-12" value={config.orgNameFontSize} onChange={(e)=>update({orgNameFontSize:parseInt(e.target.value)||10})} /><span className="text-xs text-muted-foreground">pt</span></div></>}
                </div>
                {config.showOrgName && (
                  <div className="ml-6">
                    <Input className="h-7 text-xs" value={config.orgNameOverride !== "" ? config.orgNameOverride : orgName} onChange={(e)=>update({orgNameOverride:e.target.value})} placeholder="Rename Organization Name" />
                  </div>
                )}
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Header Fields</p>
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer w-28 shrink-0"><input type="checkbox" checked={config.showGstin} onChange={(e)=>update({showGstin:e.target.checked})} className="h-4 w-4 rounded" /><span className="text-sm">GSTIN</span></label>
                  <Input className="h-7 text-xs flex-1" value={config.gstinLabel} onChange={(e)=>update({gstinLabel:e.target.value})} placeholder="Label" />
                </div>
                {config.showGstin && (
                  <div className="ml-8"><Input className="h-7 text-xs" value={config.gstinValueOverride !== "" ? config.gstinValueOverride : orgTaxId} onChange={(e)=>update({gstinValueOverride:e.target.value})} placeholder="Rename GSTIN" /></div>
                )}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer w-28 shrink-0"><input type="checkbox" checked={config.showContact} onChange={(e)=>update({showContact:e.target.checked})} className="h-4 w-4 rounded" /><span className="text-sm">Contact</span></label>
                  <Input className="h-7 text-xs flex-1" value={config.contactLabel} onChange={(e)=>update({contactLabel:e.target.value})} placeholder="Label" />
                </div>
                {config.showContact && (
                  <div className="ml-8"><Input className="h-7 text-xs" value={config.contactValueOverride !== "" ? config.contactValueOverride : orgPhone} onChange={(e)=>update({contactValueOverride:e.target.value})} placeholder="Rename Contact Number" /></div>
                )}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer w-28 shrink-0"><input type="checkbox" checked={config.showEmail} onChange={(e)=>update({showEmail:e.target.checked})} className="h-4 w-4 rounded" /><span className="text-sm">Email</span></label>
                  <Input className="h-7 text-xs flex-1" value={config.emailLabel} onChange={(e)=>update({emailLabel:e.target.value})} placeholder="Label" />
                </div>
                {config.showEmail && (
                  <div className="ml-8"><Input className="h-7 text-xs" value={config.emailValueOverride !== "" ? config.emailValueOverride : orgEmail} onChange={(e)=>update({emailValueOverride:e.target.value})} placeholder="Rename Email" /></div>
                )}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer w-28 shrink-0"><input type="checkbox" checked={config.showOrgAddress} onChange={(e)=>update({showOrgAddress:e.target.checked})} className="h-4 w-4 rounded" /><span className="text-sm">Factory</span></label>
                  <Input className="h-7 text-xs flex-1" value={config.factoryLabel} onChange={(e)=>update({factoryLabel:e.target.value})} placeholder="Label" />
                </div>
                {config.showOrgAddress && (
                  <div className="ml-8"><Input className="h-7 text-xs" value={config.factoryValueOverride !== "" ? config.factoryValueOverride : orgAddressText} onChange={(e)=>update({factoryValueOverride:e.target.value})} placeholder="Rename Factory Address" /></div>
                )}
              </div>
            </div>
          </Sec>
          <Sec title="Footer" defaultOpen={false}>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={config.showFooter} onChange={(e)=>update({showFooter:e.target.checked})} className="h-4 w-4 rounded" />
              <span className="text-sm font-medium">Show Footer</span>
            </label>
            {config.showFooter && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={config.showFooterPageNumber} onChange={(e)=>update({showFooterPageNumber:e.target.checked})} className="h-4 w-4 rounded" />
                    <span className="text-sm">Show Page Number</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={config.showFooterLines} onChange={(e)=>update({showFooterLines:e.target.checked})} className="h-4 w-4 rounded" />
                    <span className="text-sm">Show Footer Lines</span>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs mb-1 block">Font Size</Label><div className="flex items-center gap-1.5"><Input type="number" min="6" max="24" className="h-7 text-xs w-16" value={config.footerFontSize} onChange={(e)=>update({footerFontSize:parseInt(e.target.value)||9})} /><span className="text-xs text-muted-foreground">pt</span></div></div>
                  <div><Label className="text-xs mb-1 block">Font Color</Label><CP value={config.footerFontColor} onChange={(v)=>update({footerFontColor:v})} /></div>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Divider Line Color</Label>
                  <CP value={config.footerDividerColor} onChange={(v)=>update({footerDividerColor:v})} />
                </div>
                <label className="flex items-center gap-2 cursor-pointer flex-wrap">
                  <input type="checkbox" checked={config.footerBgColorEnabled} onChange={(e)=>update({footerBgColorEnabled:e.target.checked})} className="h-4 w-4 rounded" />
                  <span className="text-sm">Background Color</span>
                  <CP value={config.footerBgColor} onChange={(v)=>update({footerBgColor:v})} />
                </label>
                {config.showFooterLines && (
                  <div className="space-y-2">
                    <div><Label className="text-xs mb-1 block">Footer Line 1</Label><Input className="h-7 text-xs" value={config.footerLine1} onChange={(e)=>update({footerLine1:e.target.value})} /></div>
                    <div><Label className="text-xs mb-1 block">Footer Line 2</Label><Input className="h-7 text-xs" value={config.footerLine2} onChange={(e)=>update({footerLine2:e.target.value})} /></div>
                    <div><Label className="text-xs mb-1 block">Footer Line 3</Label><Input className="h-7 text-xs" value={config.footerLine3} onChange={(e)=>update({footerLine3:e.target.value})} /></div>
                    <div><Label className="text-xs mb-1 block">Footer Line 4</Label><Input className="h-7 text-xs" value={config.footerLine4} onChange={(e)=>update({footerLine4:e.target.value})} placeholder="e.g. Additional info / address" /></div>
                    <div><Label className="text-xs mb-1 block">Footer Line 5</Label><Input className="h-7 text-xs" value={config.footerLine5} onChange={(e)=>update({footerLine5:e.target.value})} placeholder="e.g. Additional details" /></div>
                  </div>
                )}
                <div><Label className="text-xs mb-1 block">Footer Text</Label><Textarea className="text-sm resize-none" rows={2} value={config.footerCustomContent} onChange={(e)=>update({footerCustomContent:e.target.value})} placeholder="e.g. Computer-generated quotation" /></div>
              </>
            )}
          </Sec>
        </div>
      )}

      {tab === "quote_details" && (
        <div className="space-y-3">
          <Sec title="Organization Details" defaultOpen={true}>
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={config.showOrgLogo} onChange={(e)=>update({showOrgLogo:e.target.checked})} className="h-4 w-4 rounded" /><span className="text-sm font-medium">Show Logo</span></label>
              {config.showOrgLogo && (
                <div className="ml-6 space-y-2">
                  <div className="border-2 border-dashed border-border rounded overflow-hidden bg-muted/10 flex items-center justify-center" style={{width:`${config.orgLogoSize}px`,height:`${Math.round(config.orgLogoSize*0.75)}px`,minWidth:"60px",minHeight:"45px"}}>
                    {orgLogo ? <img src={orgLogo} alt={orgName} style={{width:"100%",height:"100%",objectFit:"contain",padding:"4px"}} /> : <span style={{fontSize:"8pt",color:"#9ca3af"}}>No logo</span>}
                  </div>
                  {onLogoUpload && (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={logoUploading || logoUploadDisabled}
                        onClick={() => logoInputRef.current?.click()}
                      >
                        {logoUploading ? "Uploading..." : "Upload Logo"}
                      </Button>
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/gif,image/bmp"
                        className="hidden"
                        onChange={handleLogoFileChange}
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground shrink-0">Resize</span><input type="range" min="30" max="120" step="5" value={config.orgLogoSize} onChange={(e)=>update({orgLogoSize:parseInt(e.target.value)})} className="flex-1 accent-teal-600" /><span className="text-xs text-muted-foreground w-10 text-right">{config.orgLogoSize}px</span></div>
                </div>
              )}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="flex items-center gap-2 cursor-pointer shrink-0"><input type="checkbox" checked={config.showOrgName} onChange={(e)=>update({showOrgName:e.target.checked})} className="h-4 w-4 rounded" /><span className="text-sm">Org Name</span></label>
                  {config.showOrgName && <><CP value={config.orgNameColor} onChange={(v)=>update({orgNameColor:v})} /><div className="flex items-center gap-1"><Input type="number" min="6" max="24" className="h-7 text-xs w-12" value={config.orgNameFontSize} onChange={(e)=>update({orgNameFontSize:parseInt(e.target.value)||10})} /><span className="text-xs text-muted-foreground">pt</span></div></>}
                </div>
                {config.showOrgName && (
                  <div className="ml-6">
                    <Input className="h-7 text-xs" value={config.orgNameOverride !== "" ? config.orgNameOverride : orgName} onChange={(e)=>update({orgNameOverride:e.target.value})} placeholder="Rename Organization Name" />
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={config.showOrgAddress} onChange={(e)=>update({showOrgAddress:e.target.checked})} className="h-4 w-4 rounded" /><span className="text-sm">Show Address</span></label>
              {config.showOrgAddress && (
                <div className="ml-6"><Input className="h-7 text-xs" value={config.factoryValueOverride !== "" ? config.factoryValueOverride : orgAddressText} onChange={(e)=>update({factoryValueOverride:e.target.value})} placeholder="Rename Factory Address" /></div>
              )}
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={config.showGstin} onChange={(e)=>update({showGstin:e.target.checked})} className="h-4 w-4 rounded" /><span className="text-sm">Show GSTIN</span></label>
              {config.showGstin && (
                <div className="ml-6"><Input className="h-7 text-xs" value={config.gstinValueOverride !== "" ? config.gstinValueOverride : orgTaxId} onChange={(e)=>update({gstinValueOverride:e.target.value})} placeholder="Rename GSTIN" /></div>
              )}
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={config.showContact} onChange={(e)=>update({showContact:e.target.checked})} className="h-4 w-4 rounded" /><span className="text-sm">Show Contact</span></label>
              {config.showContact && (
                <div className="ml-6"><Input className="h-7 text-xs" value={config.contactValueOverride !== "" ? config.contactValueOverride : orgPhone} onChange={(e)=>update({contactValueOverride:e.target.value})} placeholder="Rename Contact Number" /></div>
              )}
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={config.showEmail} onChange={(e)=>update({showEmail:e.target.checked})} className="h-4 w-4 rounded" /><span className="text-sm">Show Email</span></label>
              {config.showEmail && (
                <div className="ml-6"><Input className="h-7 text-xs" value={config.emailValueOverride !== "" ? config.emailValueOverride : orgEmail} onChange={(e)=>update({emailValueOverride:e.target.value})} placeholder="Rename Email" /></div>
              )}
            </div>
          </Sec>
          <Sec title="Customer Details" defaultOpen={false}>
            <div className="space-y-3">
              <div><Label className="text-xs mb-1.5 block">Customer Name</Label>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-1.5"><span className="text-xs text-muted-foreground">Color</span><CP value={config.customerNameFontColor} onChange={(v)=>update({customerNameFontColor:v})} /></div>
                  <div className="flex items-center gap-1"><span className="text-xs text-muted-foreground">Size</span><Input type="number" min="6" max="24" className="h-7 text-xs w-12 ml-1" value={config.customerNameFontSize} onChange={(e)=>update({customerNameFontSize:parseInt(e.target.value)||9})} /><span className="text-xs text-muted-foreground">pt</span></div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer shrink-0"><input type="checkbox" checked={config.showBillTo} onChange={(e)=>update({showBillTo:e.target.checked})} className="h-4 w-4 rounded" /><span className="text-sm">Bill To Label</span></label>
                {config.showBillTo && <Input className="h-7 text-xs flex-1" value={config.billToLabel} onChange={(e)=>update({billToLabel:e.target.value})} />}
              </div>
            </div>
          </Sec>
          <Sec title="Document Details" defaultOpen={false}>
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer shrink-0"><input type="checkbox" checked={config.showDocTitle} onChange={(e)=>update({showDocTitle:e.target.checked})} className="h-4 w-4 rounded" /><span className="text-sm">Title</span></label>
                {config.showDocTitle && <Input className="h-7 text-xs flex-1" value={config.docTitle} onChange={(e)=>update({docTitle:e.target.value})} />}
              </div>
              {config.showDocTitle && (
                <div className="flex items-center gap-4 ml-6 flex-wrap">
                  <div className="flex items-center gap-1"><span className="text-xs text-muted-foreground">Size</span><Input type="number" min="8" max="40" className="h-7 text-xs w-12 ml-1" value={config.docTitleFontSize} onChange={(e)=>update({docTitleFontSize:parseInt(e.target.value)||18})} /><span className="text-xs text-muted-foreground">pt</span></div>
                  <div className="flex items-center gap-1.5"><span className="text-xs text-muted-foreground">Color</span><CP value={config.docTitleFontColor} onChange={(v)=>update({docTitleFontColor:v})} /></div>
                </div>
              )}
              <Separator />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Labels</p>
              {([["quoteNumberLabel","Quote Number"],["quoteDateLabel","Quote Date"],["expiryDateLabel","Expiry Date"]] as [keyof QuoteTemplateConfig,string][]).map(([k,ph])=>(
                <div key={String(k)}><Label className="text-xs mb-1 block">{ph}</Label><Input className="h-7 text-xs" value={config[k] as string} onChange={(e)=>update({[k]:e.target.value})} placeholder={ph} /></div>
              ))}
              <Separator />
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer shrink-0"><input type="checkbox" checked={config.showSignature} onChange={(e)=>update({showSignature:e.target.checked})} className="h-4 w-4 rounded" /><span className="text-sm">Signature</span></label>
                {config.showSignature && <Input className="h-7 text-xs flex-1" value={config.signatureLabel} onChange={(e)=>update({signatureLabel:e.target.value})} />}
              </div>
            </div>
          </Sec>
        </div>
      )}

      {tab === "table" && (
        <div className="space-y-4">
          <p className="text-sm font-semibold">Item Table</p>
          <div className="flex border-b gap-0">
            {(["labels","layout"] as const).map((sub)=>(
            <button key={sub} onClick={()=>setTableSubTab(sub)} className={`px-5 py-2 text-sm capitalize transition-colors border-b-2 -mb-px ${tableSubTab===sub?"border-teal-600 text-teal-700 font-medium":"border-transparent text-muted-foreground hover:text-foreground"}`}>{sub}</button>
            ))}
          </div>
          {tableSubTab === "labels" && (
            <div className="space-y-2">
              {([
                {ck:"colItem" as const,lk:"itemLabel" as const,l:"Item"},
                {ck:"colHsn" as const,lk:"hsnLabel" as const,l:"HSN/SAC"},
                {ck:"colQty" as const,lk:"qtyLabel" as const,l:"Quantity"},
                {ck:"colRate" as const,lk:"rateLabel" as const,l:"Rate"},
                {ck:"colDiscount" as const,lk:"discountLabel" as const,l:"Discount"},
                {ck:"colTax" as const,lk:"taxLabel" as const,l:"Tax"},
                {ck:"colAmount" as const,lk:"amountLabel" as const,l:"Amount"},
              ]).map(({ck,lk,l})=>(
                <div key={ck} className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer w-36 shrink-0"><input type="checkbox" checked={config[ck]} onChange={(e)=>update({[ck]:e.target.checked})} className="h-4 w-4 rounded" /><span className="text-sm">{l}</span></label>
                  <Input className="h-7 text-xs flex-1" value={config[lk]} onChange={(e)=>update({[lk]:e.target.value})} />
                </div>
              ))}
            </div>
          )}
          {tableSubTab === "layout" && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Table Header</p>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3"><span className="text-xs text-muted-foreground w-28 shrink-0">Font Size</span><div className="flex items-center gap-1"><Input type="number" min="6" max="24" className="h-7 text-xs w-14" value={config.tableHeaderFontSize} onChange={(e)=>update({tableHeaderFontSize:parseInt(e.target.value)||9})} /><span className="text-xs text-muted-foreground">pt</span></div></div>
                  <div className="flex items-center gap-3"><span className="text-xs text-muted-foreground w-28 shrink-0">Background</span><CP value={config.tableHeaderBgColor} onChange={(v)=>update({tableHeaderBgColor:v})} /></div>
                  <div className="flex items-center gap-3"><span className="text-xs text-muted-foreground w-28 shrink-0">Font Color</span><CP value={config.tableHeaderFontColor} onChange={(v)=>update({tableHeaderFontColor:v})} /></div>
                </div>
              </div>
              <Separator />
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Table Row</p>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3"><span className="text-xs text-muted-foreground w-28 shrink-0">Odd Row</span><CP value={config.oddRowColor} onChange={(v)=>update({oddRowColor:v})} /></div>
                  <div className="flex items-center gap-3"><span className="text-xs text-muted-foreground w-28 shrink-0">Even Row</span><CP value={config.evenRowColor} onChange={(v)=>update({evenRowColor:v})} /></div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "other" && (
        <div className="space-y-3">
          <Sec title="Notes" defaultOpen={true}>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer shrink-0"><input type="checkbox" checked={config.showNotes} onChange={(e)=>update({showNotes:e.target.checked})} className="h-4 w-4 rounded" /><span className="text-sm">Show Notes</span></label>
              {config.showNotes && <Input className="h-7 text-xs flex-1" value={config.notesLabel} onChange={(e)=>update({notesLabel:e.target.value})} />}
            </div>
          </Sec>
          <Sec title="Terms & Conditions" defaultOpen={true}>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer shrink-0"><input type="checkbox" checked={config.showTerms} onChange={(e)=>update({showTerms:e.target.checked})} className="h-4 w-4 rounded" /><span className="text-sm">Show Terms</span></label>
              {config.showTerms && <Input className="h-7 text-xs flex-1" value={config.termsLabel} onChange={(e)=>update({termsLabel:e.target.value})} />}
            </div>
          </Sec>
        </div>
      )}
    </div>
  );
}
