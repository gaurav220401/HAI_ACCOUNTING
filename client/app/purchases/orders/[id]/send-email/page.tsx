"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FileText, Loader2, PlusCircle, Send, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import RichTextEditor from "@/components/ui/rich-text-editor";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { purchaseOrderApi, type PurchaseOrder } from "@/lib/api/purchase-orders";
import { smtpApi } from "@/lib/api/smtp";
import { contactApi, type Contact, type ContactPerson } from "@/lib/api/contacts";
import { apiFetch } from "@/lib/api/client";

const SALUTATION_NONE = "__none__";
const SALUTATIONS = ["Mr.", "Mrs.", "Ms.", "Miss", "Dr."];

function getName(v: any): string {
  if (!v) return "";
  if (typeof v === "object") return v.displayName || v.companyName || v.name || "";
  return String(v);
}

function escapeHtml(v: string): string {
  return v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildDefaultPurchaseOrderBody(params: {
  vendorName: string;
  purchaseOrderNumber: string;
  orderDate: string;
  amountText: string;
  senderName: string;
  organizationName: string;
}) {
  return `
    <p>Dear ${escapeHtml(params.vendorName || "Vendor")},</p>
    <p>The purchase order (<strong>${escapeHtml(params.purchaseOrderNumber)}</strong>) is attached with this email.</p>
    <p>An overview of the purchase order is available below:</p>
    <hr style="border:none;border-top:1px dashed #6b7280;margin:18px 0;" />
    <h2 style="font-size:22px;line-height:1.35;margin:0 0 14px 0;">
      Purchase Order # : <strong>${escapeHtml(params.purchaseOrderNumber)}</strong>
    </h2>
    <hr style="border:none;border-top:1px dashed #6b7280;margin:14px 0;" />
    <table style="border-collapse:collapse;font-size:18px;line-height:1.8;">
      <tr>
        <td style="padding-right:18px;"><strong>Order Date</strong></td>
        <td style="padding-right:18px;">:</td>
        <td><strong>${escapeHtml(params.orderDate)}</strong></td>
      </tr>
      <tr>
        <td style="padding-right:18px;"><strong>Amount</strong></td>
        <td style="padding-right:18px;">:</td>
        <td><strong>${escapeHtml(params.amountText)}</strong></td>
      </tr>
    </table>
    <hr style="border:none;border-top:1px dashed #6b7280;margin:14px 0 20px;" />
    <p>Please go through it and confirm the order. We look forward to working with you again.</p>
    <br />
    <p>Regards,</p>
    <p>${escapeHtml(params.senderName)}<br/>${escapeHtml(params.organizationName)}</p>
  `;
}

export default function SendPurchaseOrderEmailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderId = params.id;

  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization } = useOrganization();

  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [vendor, setVendor] = useState<Contact | null>(null);
  const [fetching, setFetching] = useState(true);
  const [sending, setSending] = useState(false);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");

  const [contactPersons, setContactPersons] = useState<ContactPerson[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [contactsLoading, setContactsLoading] = useState(false);
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [selectedRecipientField, setSelectedRecipientField] = useState<"to" | "cc" | "bcc">("to");

  const [newContactPerson, setNewContactPerson] = useState<ContactPerson>({
    name: "",
    salutation: "",
    firstName: "",
    lastName: "",
    email: "",
    workPhone: "",
    mobile: "",
    skypeName: "",
    designation: "",
    department: "",
    photoUrl: "",
  });

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachPdf, setAttachPdf] = useState(true);
  const [fromEmail, setFromEmail] = useState("");
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false);
  const pdfPreviewUrlRef = useRef<string | null>(null);
  const profileImageInputRef = useRef<HTMLInputElement>(null);
  const [uploadingProfileImage, setUploadingProfileImage] = useState(false);

  function fmt(v: number) {
    return new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v);
  }

  function dateText(d: string) {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    async function loadVendorContacts() {
      if (!order?.vendorId) return;
      setContactsLoading(true);
      try {
        const vendorId = typeof order.vendorId === "string" ? order.vendorId : (order.vendorId as any)?._id;
        if (!vendorId) {
          setContactPersons([]);
          return;
        }

        const vendorRes = await contactApi.getById(vendorId);
        setVendor(vendorRes.data);
        setContactPersons(vendorRes.data.contactPersons || []);
      } catch {
        setContactPersons([]);
      } finally {
        setContactsLoading(false);
      }
    }
    loadVendorContacts();
  }, [order?.vendorId]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!orderId || !firebaseUser || !activeOrganization?._id) return;
      setFetching(true);
      try {
        const res = await purchaseOrderApi.getOne(orderId);
        if (!mounted) return;
        const po = res.data;
        setOrder(po);
        const vendorName = getName(po.vendorId);
        const vendorEmail = (po.vendorId as any)?.email || "";
        setTo(vendorEmail);
        setSubject(`Purchase Order from ${activeOrganization.name} (Purchase Order #: ${po.purchaseOrderNumber})`);

        let senderEmail = "";
        try {
          const smtpRes = await smtpApi.get(activeOrganization._id);
          const smtp = smtpRes.data;
          senderEmail = smtp?.fromEmail || smtp?.user || "";
        } catch {
          senderEmail = (firebaseUser as any)?.email || "";
        }
        setFromEmail(senderEmail);
        const senderName = senderEmail ? senderEmail.split("@")[0] : activeOrganization.name;
        setBody(
          buildDefaultPurchaseOrderBody({
            vendorName: vendorName || "Vendor",
            purchaseOrderNumber: po.purchaseOrderNumber,
            orderDate: dateText(po.purchaseOrderDate),
            amountText: `₹${fmt(po.total)} (in INR)`,
            senderName,
            organizationName: activeOrganization.name,
          }),
        );
      } catch {
        toast.error("Failed to load purchase order");
        router.push("/purchases/orders");
      } finally {
        if (mounted) setFetching(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [orderId, firebaseUser, activeOrganization?._id, activeOrganization?.name, router]);

  useEffect(() => {
    async function loadPdfPreview() {
      if (!order?._id) {
        setPdfPreviewUrl(null);
        return;
      }
      setPdfPreviewLoading(true);
      try {
        const pdfBlob = await purchaseOrderApi.downloadPdf(order._id);
        const nextUrl = URL.createObjectURL(pdfBlob);
        if (pdfPreviewUrlRef.current) URL.revokeObjectURL(pdfPreviewUrlRef.current);
        pdfPreviewUrlRef.current = nextUrl;
        setPdfPreviewUrl(nextUrl);
      } catch {
        setPdfPreviewUrl(null);
      } finally {
        setPdfPreviewLoading(false);
      }
    }

    loadPdfPreview();

    return () => {
      if (pdfPreviewUrlRef.current) {
        URL.revokeObjectURL(pdfPreviewUrlRef.current);
        pdfPreviewUrlRef.current = null;
      }
    };
  }, [order?._id]);

  const title = useMemo(() => {
    if (!order) return "Send Purchase Order Email";
    return `Send Email • ${order.purchaseOrderNumber}`;
  }, [order]);

  const parseRecipients = (value: string) =>
    value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

  const contactOptions = useMemo(() => {
    const list = [...contactPersons];
    const vendorPrimaryEmail = vendor?.email?.trim();
    const vendorDisplayName = vendor?.displayName || vendor?.companyName || "Primary Contact";
    if (
      vendorPrimaryEmail &&
      !list.some((cp) => cp.email?.trim().toLowerCase() === vendorPrimaryEmail.toLowerCase())
    ) {
      list.unshift({
        name: vendorDisplayName,
        email: vendorPrimaryEmail,
      } as ContactPerson);
    }
    return list;
  }, [contactPersons, vendor]);

  const filteredContactPersons = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    if (!q) return contactOptions;
    return contactOptions.filter((cp) =>
      [cp.salutation, cp.firstName, cp.lastName, cp.email, cp.designation, cp.department, cp.skypeName]
        .filter(Boolean)
        .some((field) => field?.toLowerCase().includes(q)),
    );
  }, [contactOptions, contactSearch]);

  const pdfPreviewTemplate = useMemo(() => {
    const cfg = (vendor?.statementTemplate || {}) as Record<string, any>;
    const paperSize = cfg.paperSize === "A5" || cfg.paperSize === "Letter" ? cfg.paperSize : "A4";
    return {
      paperSize,
      width: paperSize === "A5" ? "148mm" : paperSize === "Letter" ? "216mm" : "210mm",
      minHeight: paperSize === "A5" ? "210mm" : paperSize === "Letter" ? "279mm" : "297mm",
      backgroundColor: typeof cfg.backgroundColor === "string" && cfg.backgroundColor ? cfg.backgroundColor : "#ffffff",
      fontFamily: typeof cfg.fontFamily === "string" && cfg.fontFamily ? cfg.fontFamily : "Inter, sans-serif",
      fontSize: typeof cfg.fontSize === "number" ? cfg.fontSize : 12,
    };
  }, [vendor?.statementTemplate]);

  function addEmailToField(field: "to" | "cc" | "bcc", email: string) {
    const normalize = (val: string) => parseRecipients(val);
    const add = (items: string[]) => Array.from(new Set([...items, email]));

    if (field === "to") setTo(add(normalize(to)).join(", "));
    if (field === "cc") setCc(add(normalize(cc)).join(", "));
    if (field === "bcc") setBcc(add(normalize(bcc)).join(", "));
  }

  function openDropdownFor(field: "to" | "cc" | "bcc") {
    setSelectedRecipientField(field);
    setShowContactDropdown(true);
    setContactSearch("");
  }

  useEffect(() => {
    if (!showAddContact) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showAddContact]);

  async function handleProfileImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Profile image must be 5MB or less");
      return;
    }

    setUploadingProfileImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await apiFetch<{ data: { url: string; publicId: string } }>(
        "/upload?folder=contacts/contact-persons&resourceType=image",
        { method: "POST", body: formData },
      );

      setNewContactPerson((prev) => ({ ...prev, photoUrl: res.data.url }));
      toast.success("Profile image uploaded");
    } catch {
      toast.error("Failed to upload profile image");
    } finally {
      setUploadingProfileImage(false);
      if (profileImageInputRef.current) profileImageInputRef.current.value = "";
    }
  }

  async function handleSaveContactPerson() {
    const email = (newContactPerson.email || "").trim();
    const firstName = (newContactPerson.firstName || "").trim();
    const lastName = (newContactPerson.lastName || "").trim();
    const salutation = (newContactPerson.salutation || "").trim();
    if (!firstName && !lastName) {
      toast.error("First name or last name is required");
      return;
    }
    if (!email) {
      toast.error("Email address is required");
      return;
    }

    const newPerson: ContactPerson = {
      ...newContactPerson,
      email,
      firstName,
      lastName,
      name: [salutation, firstName, lastName].filter(Boolean).join(" "),
      designation: newContactPerson.designation?.trim(),
      department: newContactPerson.department?.trim(),
      skypeName: newContactPerson.skypeName?.trim(),
      workPhone: newContactPerson.workPhone?.trim(),
      mobile: newContactPerson.mobile?.trim(),
      salutation,
      photoUrl: newContactPerson.photoUrl?.trim(),
    };

    try {
      let updatedContacts: ContactPerson[] = [...contactPersons, newPerson];
      const vendorId = vendor?._id || (typeof order?.vendorId === "string" ? order.vendorId : (order?.vendorId as any)?._id);
      if (!vendorId) {
        toast.error("Vendor not found for this purchase order");
        return;
      }

      const result = await contactApi.update(vendorId, {
        contactPersons: updatedContacts,
      });
      updatedContacts = result.data.contactPersons || updatedContacts;
      setVendor(result.data);

      setContactPersons(updatedContacts);
      setShowAddContact(false);
      setNewContactPerson({
        name: "",
        salutation: "",
        firstName: "",
        lastName: "",
        email: "",
        workPhone: "",
        mobile: "",
        skypeName: "",
        designation: "",
        department: "",
        photoUrl: "",
      });
      setContactSearch("");
      addEmailToField(selectedRecipientField, email);
      setShowContactDropdown(false);
      toast.success("Contact person saved");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save contact person");
    }
  }

  async function handleSend() {
    if (!order) return;
    const toList = parseRecipients(to);
    if (toList.length === 0) {
      toast.error("At least one recipient is required");
      return;
    }

    setSending(true);
    try {
      await purchaseOrderApi.sendEmail(order._id, {
        to: toList,
        cc: parseRecipients(cc),
        bcc: parseRecipients(bcc),
        subject,
        body,
        attachPurchaseOrderPdf: attachPdf,
      });
      toast.success("Purchase order email sent");
      router.push("/purchases/orders");
    } catch (err: any) {
      toast.error(err?.message || "Failed to send purchase order email");
    } finally {
      setSending(false);
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader breadcrumb={<span className="text-sm font-medium">{title}</span>} />

        {fetching ? (
          <div className="flex items-center justify-center h-[70vh]">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="w-full p-3 md:p-4">
            <div className="border rounded bg-white overflow-hidden">
              <div className="px-4 py-3 border-b text-2xl font-medium">
                Email To {getName(order?.vendorId) || "Vendor"}.
              </div>

              <div className="divide-y">
                <div className="grid grid-cols-[90px_1fr] items-center px-4 py-2.5">
                  <span className="text-sm text-muted-foreground">From</span>
                  <span className="text-sm">{fromEmail || (firebaseUser as any)?.email || ""}</span>
                </div>

                <div className="grid grid-cols-[90px_1fr] items-center px-4 py-2.5 gap-2">
                  <span className="text-sm text-muted-foreground">Send To</span>
                  <div className="flex items-center gap-2">
                    <Input
                      value={to}
                      onFocus={() => openDropdownFor("to")}
                      onChange={(e) => setTo(e.target.value)}
                      placeholder="vendor@example.com"
                      className="h-8"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-blue-600"
                      onClick={() => {
                        setSelectedRecipientField("to");
                        setShowContactDropdown(false);
                        setShowAddContact(true);
                      }}
                    >
                      Add Contact Person
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-blue-600"
                      onClick={() => {
                        setShowCc(true);
                        openDropdownFor("cc");
                      }}
                    >
                      Cc
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-blue-600"
                      onClick={() => {
                        setShowBcc(true);
                        openDropdownFor("bcc");
                      }}
                    >
                      Bcc
                    </Button>
                  </div>
                </div>

                {showContactDropdown && selectedRecipientField === "to" && (
                  <div className="grid grid-cols-[90px_1fr] px-4 pb-2">
                    <span />
                    <div className="rounded-md border bg-white overflow-hidden">
                      <Command shouldFilter={false}>
                        <CommandInput
                          value={contactSearch}
                          onValueChange={setContactSearch}
                          placeholder="Search"
                        />
                        <CommandList className="max-h-[260px]">
                          {contactsLoading ? (
                            <div className="flex items-center justify-center py-4">
                              <Loader2 className="h-4 w-4 animate-spin" />
                            </div>
                          ) : filteredContactPersons.length === 0 ? (
                            <p className="px-4 py-3 text-sm text-muted-foreground uppercase">No contact persons found.</p>
                          ) : (
                            <CommandGroup>
                              {filteredContactPersons.map((contact) => {
                                const primaryEmail = contact.email?.trim();
                                if (!primaryEmail) return null;
                                const key = `${primaryEmail}-${contact.name || contact.firstName || contact.lastName}`;
                                return (
                                  <CommandItem
                                    key={key}
                                    value={`${contact.name || ""} ${primaryEmail}`}
                                    onSelect={() => {
                                      addEmailToField("to", primaryEmail);
                                      setShowContactDropdown(false);
                                      toast.success(`Added ${primaryEmail} to TO`);
                                    }}
                                  >
                                    <div className="flex flex-col">
                                      <span>{contact.name || `${contact.firstName || ""} ${contact.lastName || ""}`.trim() || primaryEmail}</span>
                                      <span className="text-xs text-muted-foreground">{primaryEmail}</span>
                                    </div>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          )}
                        </CommandList>
                      </Command>
                      <button
                        type="button"
                        className="w-full border-t px-4 py-3 text-left text-blue-600 text-base flex items-center gap-2"
                        onClick={() => {
                          setShowAddContact(true);
                          setShowContactDropdown(false);
                        }}
                      >
                        <PlusCircle className="h-4 w-4" />
                        Add Contact Person
                      </button>
                    </div>
                  </div>
                )}

                {showCc && (
                  <>
                    <div className="grid grid-cols-[90px_1fr] items-center px-4 py-2.5 gap-2">
                      <span className="text-sm text-muted-foreground">Cc</span>
                      <Input
                        value={cc}
                        onFocus={() => openDropdownFor("cc")}
                        onChange={(e) => setCc(e.target.value)}
                        placeholder="accounts@example.com"
                        className="h-8"
                      />
                    </div>
                    {showContactDropdown && selectedRecipientField === "cc" && (
                      <div className="grid grid-cols-[90px_1fr] px-4 pb-2">
                        <span />
                        <div className="rounded-md border bg-white overflow-hidden">
                          <Command shouldFilter={false}>
                            <CommandInput
                              value={contactSearch}
                              onValueChange={setContactSearch}
                              placeholder="Search"
                            />
                            <CommandList className="max-h-[260px]">
                              {contactsLoading ? (
                                <div className="flex items-center justify-center py-4">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                </div>
                              ) : filteredContactPersons.length === 0 ? (
                                <p className="px-4 py-3 text-sm text-muted-foreground uppercase">No contact persons found.</p>
                              ) : (
                                <CommandGroup>
                                  {filteredContactPersons.map((contact) => {
                                    const primaryEmail = contact.email?.trim();
                                    if (!primaryEmail) return null;
                                    const key = `${primaryEmail}-${contact.name || contact.firstName || contact.lastName}`;
                                    return (
                                      <CommandItem
                                        key={key}
                                        value={`${contact.name || ""} ${primaryEmail}`}
                                        onSelect={() => {
                                          addEmailToField("cc", primaryEmail);
                                          setShowContactDropdown(false);
                                          toast.success(`Added ${primaryEmail} to CC`);
                                        }}
                                      >
                                        <div className="flex flex-col">
                                          <span>{contact.name || `${contact.firstName || ""} ${contact.lastName || ""}`.trim() || primaryEmail}</span>
                                          <span className="text-xs text-muted-foreground">{primaryEmail}</span>
                                        </div>
                                      </CommandItem>
                                    );
                                  })}
                                </CommandGroup>
                              )}
                            </CommandList>
                          </Command>
                          <button
                            type="button"
                            className="w-full border-t px-4 py-3 text-left text-blue-600 text-base flex items-center gap-2"
                            onClick={() => {
                              setShowAddContact(true);
                              setShowContactDropdown(false);
                            }}
                          >
                            <PlusCircle className="h-4 w-4" />
                            Add Contact Person
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {showBcc && (
                  <>
                    <div className="grid grid-cols-[90px_1fr] items-center px-4 py-2.5 gap-2">
                      <span className="text-sm text-muted-foreground">Bcc</span>
                      <Input
                        value={bcc}
                        onFocus={() => openDropdownFor("bcc")}
                        onChange={(e) => setBcc(e.target.value)}
                        placeholder="owner@example.com"
                        className="h-8"
                      />
                    </div>
                    {showContactDropdown && selectedRecipientField === "bcc" && (
                      <div className="grid grid-cols-[90px_1fr] px-4 pb-2">
                        <span />
                        <div className="rounded-md border bg-white overflow-hidden">
                          <Command shouldFilter={false}>
                            <CommandInput
                              value={contactSearch}
                              onValueChange={setContactSearch}
                              placeholder="Search"
                            />
                            <CommandList className="max-h-[260px]">
                              {contactsLoading ? (
                                <div className="flex items-center justify-center py-4">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                </div>
                              ) : filteredContactPersons.length === 0 ? (
                                <p className="px-4 py-3 text-sm text-muted-foreground uppercase">No contact persons found.</p>
                              ) : (
                                <CommandGroup>
                                  {filteredContactPersons.map((contact) => {
                                    const primaryEmail = contact.email?.trim();
                                    if (!primaryEmail) return null;
                                    const key = `${primaryEmail}-${contact.name || contact.firstName || contact.lastName}`;
                                    return (
                                      <CommandItem
                                        key={key}
                                        value={`${contact.name || ""} ${primaryEmail}`}
                                        onSelect={() => {
                                          addEmailToField("bcc", primaryEmail);
                                          setShowContactDropdown(false);
                                          toast.success(`Added ${primaryEmail} to BCC`);
                                        }}
                                      >
                                        <div className="flex flex-col">
                                          <span>{contact.name || `${contact.firstName || ""} ${contact.lastName || ""}`.trim() || primaryEmail}</span>
                                          <span className="text-xs text-muted-foreground">{primaryEmail}</span>
                                        </div>
                                      </CommandItem>
                                    );
                                  })}
                                </CommandGroup>
                              )}
                            </CommandList>
                          </Command>
                          <button
                            type="button"
                            className="w-full border-t px-4 py-3 text-left text-blue-600 text-base flex items-center gap-2"
                            onClick={() => {
                              setShowAddContact(true);
                              setShowContactDropdown(false);
                            }}
                          >
                            <PlusCircle className="h-4 w-4" />
                            Add Contact Person
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                <div className="grid grid-cols-[90px_1fr] items-center px-4 py-2.5 gap-2">
                  <span className="text-sm text-muted-foreground">Subject</span>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-8" />
                </div>

                <div className="px-4 py-3">
                  <RichTextEditor
                    value={body}
                    onChange={setBody}
                    minHeight="360px"
                    placeholder="Write your purchase order email..."
                  />
                </div>

                <div className="px-4 py-3 bg-muted/30 flex flex-wrap items-center gap-2">
                  <Checkbox id="attach-pdf" checked={attachPdf} onCheckedChange={(v) => setAttachPdf(!!v)} />
                  <Label htmlFor="attach-pdf" className="text-sm cursor-pointer">Attach Purchase Order PDF</Label>
                  <div className="ml-auto border rounded px-3 py-1.5 text-sm text-muted-foreground bg-white flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span>{order?.purchaseOrderNumber || "PO"}.pdf</span>
                  </div>
                </div>

                {attachPdf && (
                  <div className="px-4 py-4 bg-muted/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">PDF Preview</p>
                      {pdfPreviewUrl && (
                        <a href={pdfPreviewUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-600 underline">
                          Open full preview
                        </a>
                      )}
                    </div>

                    <div className="rounded-md border overflow-hidden">
                      <div className="flex-1 overflow-y-auto bg-gray-100 print:bg-white print:overflow-visible py-6 px-4 print:p-0">
                        <div
                          className="statement-print-area bg-white mx-auto shadow-sm print:shadow-none border overflow-hidden"
                          style={{
                            width: pdfPreviewTemplate.width,
                            maxWidth: "100%",
                            minHeight: pdfPreviewTemplate.minHeight,
                            height: "680px",
                            backgroundColor: pdfPreviewTemplate.backgroundColor,
                            fontFamily: pdfPreviewTemplate.fontFamily,
                            fontSize: `${pdfPreviewTemplate.fontSize}pt`,
                          }}
                        >
                          {pdfPreviewLoading ? (
                            <div className="h-full w-full flex items-center justify-center">
                              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                          ) : pdfPreviewUrl ? (
                            <embed src={pdfPreviewUrl} type="application/pdf" className="h-full w-full" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
                              PDF preview could not be loaded.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 mt-3">
              <Button onClick={handleSend} disabled={sending}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Send Email
              </Button>
              <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
            </div>
          </div>
        )}

        {showAddContact && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-2 sm:p-6">
            <div className="absolute inset-0 bg-black/35" onClick={() => setShowAddContact(false)} />

            <div className="relative z-10 w-[min(1100px,98vw)] max-h-[92vh] overflow-hidden rounded-md border bg-background shadow-2xl">
              <div className="flex items-center justify-between border-b px-6 py-4">
                <h2 className="text-3xl font-normal tracking-tight">Add Contact Person</h2>
                <button
                  type="button"
                  onClick={() => setShowAddContact(false)}
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
                        <Select
                          value={newContactPerson.salutation || SALUTATION_NONE}
                          onValueChange={(value) => setNewContactPerson((prev) => ({ ...prev, salutation: value === SALUTATION_NONE ? "" : value }))}
                        >
                          <SelectTrigger className="h-11"><SelectValue placeholder="Mr." /></SelectTrigger>
                          <SelectContent className="z-[140]">
                            <SelectItem value={SALUTATION_NONE}>—</SelectItem>
                            {SALUTATIONS.map((item) => (
                              <SelectItem key={item} value={item}>{item}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          className="h-11"
                          placeholder="First Name"
                          value={newContactPerson.firstName ?? ""}
                          onChange={(e) => setNewContactPerson((prev) => ({ ...prev, firstName: e.target.value }))}
                        />
                        <Input
                          className="h-11"
                          placeholder="Last Name"
                          value={newContactPerson.lastName ?? ""}
                          onChange={(e) => setNewContactPerson((prev) => ({ ...prev, lastName: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="grid gap-2 md:grid-cols-[170px_minmax(0,1fr)] md:items-center md:gap-4">
                      <Label className="text-sm font-normal">Email Address</Label>
                      <Input
                        className="h-11"
                        type="email"
                        value={newContactPerson.email ?? ""}
                        onChange={(e) => setNewContactPerson((prev) => ({ ...prev, email: e.target.value }))}
                      />
                    </div>

                    <div className="grid gap-2 md:grid-cols-[170px_minmax(0,1fr)] md:items-start md:gap-4">
                      <Label className="text-sm font-normal md:mt-3">Phone</Label>
                      <div className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-[86px_minmax(0,1fr)]">
                          <Select defaultValue="+91">
                            <SelectTrigger className="h-11"><SelectValue placeholder="+91" /></SelectTrigger>
                            <SelectContent className="z-[140]"><SelectItem value="+91">+91</SelectItem></SelectContent>
                          </Select>
                          <Input
                            className="h-11"
                            placeholder="Work Number"
                            value={newContactPerson.workPhone ?? ""}
                            onChange={(e) => setNewContactPerson((prev) => ({ ...prev, workPhone: e.target.value }))}
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-[86px_minmax(0,1fr)]">
                          <Select defaultValue="+91">
                            <SelectTrigger className="h-11"><SelectValue placeholder="+91" /></SelectTrigger>
                            <SelectContent className="z-[140]"><SelectItem value="+91">+91</SelectItem></SelectContent>
                          </Select>
                          <Input
                            className="h-11"
                            placeholder="Mobile Number"
                            value={newContactPerson.mobile ?? ""}
                            onChange={(e) => setNewContactPerson((prev) => ({ ...prev, mobile: e.target.value }))}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-2 md:grid-cols-[170px_minmax(0,1fr)] md:items-center md:gap-4">
                      <Label className="text-sm font-normal">Skype Name/Number</Label>
                      <Input
                        className="h-11"
                        placeholder="Skype Name/Number"
                        value={newContactPerson.skypeName ?? ""}
                        onChange={(e) => setNewContactPerson((prev) => ({ ...prev, skypeName: e.target.value }))}
                      />
                    </div>

                    <div className="grid gap-2 md:grid-cols-[170px_minmax(0,1fr)] md:items-center md:gap-4">
                      <Label className="text-sm font-normal">Other Details</Label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input
                          className="h-11"
                          placeholder="Designation"
                          value={newContactPerson.designation ?? ""}
                          onChange={(e) => setNewContactPerson((prev) => ({ ...prev, designation: e.target.value }))}
                        />
                        <Input
                          className="h-11"
                          placeholder="Department"
                          value={newContactPerson.department ?? ""}
                          onChange={(e) => setNewContactPerson((prev) => ({ ...prev, department: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t bg-muted/10 p-6 lg:border-l lg:border-t-0">
                  <input
                    ref={profileImageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleProfileImageUpload}
                  />
                  <Label className="mb-4 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Profile Image</Label>
                  <div
                    className="rounded-md border border-dashed border-blue-400 bg-background p-6 text-center transition hover:bg-blue-50/40 cursor-pointer"
                    onClick={() => profileImageInputRef.current?.click()}
                  >
                    {newContactPerson.photoUrl ? (
                      <div className="flex flex-col items-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={newContactPerson.photoUrl} className="h-28 w-28 rounded-full border object-cover" alt="Profile" />
                        <p className="mt-3 text-sm text-muted-foreground">Click to change</p>
                      </div>
                    ) : (
                      <>
                        <Upload className="mx-auto mb-3 h-10 w-10 text-blue-500" />
                        <p className="text-2xl font-medium">Drag & Drop Profile Image</p>
                        <p className="mt-2 text-base text-muted-foreground">Supported Files: jpg, jpeg, png, gif, bmp</p>
                        <p className="text-base text-muted-foreground">Maximum File Size: 5MB</p>
                        <button type="button" className="mt-5 text-lg underline">Upload File</button>
                      </>
                    )}
                  </div>
                  {uploadingProfileImage && (
                    <div className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Uploading image...
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 border-t px-6 py-4 bg-background">
                <Button size="sm" onClick={handleSaveContactPerson}>Save and Select</Button>
                <Button variant="outline" size="sm" onClick={() => setShowAddContact(false)}>Cancel</Button>
              </div>
            </div>
          </div>
        )}

      </SidebarInset>
    </SidebarProvider>
  );
}
