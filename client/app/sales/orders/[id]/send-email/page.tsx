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
import { salesOrderApi, type SalesOrder } from "@/lib/api/sales-orders";
import { smtpApi } from "@/lib/api/smtp";
import { contactApi, type Contact, type ContactPerson } from "@/lib/api/contacts";
import { apiFetch } from "@/lib/api/client";

const SALUTATION_NONE = "__none__";
const SALUTATIONS = ["Mr.", "Mrs.", "Ms.", "Miss", "Dr."];

function getCustomerName(v: any): string {
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

function formatDate(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatAmount(v: number) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function buildDefaultBody(params: {
  customerName: string;
  salesOrderNumber: string;
  orderDate: string;
  amountText: string;
  senderName: string;
  organizationName: string;
}) {
  return `
    <p>Dear ${escapeHtml(params.customerName || "Customer")},</p>
    <p>The sales order (<strong>${escapeHtml(params.salesOrderNumber)}</strong>) is attached with this email.</p>
    <p>An overview of the sales order is available below:</p>
    <hr style="border:none;border-top:1px dashed #6b7280;margin:18px 0;" />
    <h2 style="font-size:22px;line-height:1.35;margin:0 0 14px 0;">
      Sales Order # : <strong>${escapeHtml(params.salesOrderNumber)}</strong>
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

export default function SendSalesOrderEmailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderId = params.id;

  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization } = useOrganization();

  const [order, setOrder] = useState<SalesOrder | null>(null);
  const [customer, setCustomer] = useState<Contact | null>(null);
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

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    async function loadCustomerContacts() {
      const customerId = typeof order?.customerId === "string" ? order.customerId : (order?.customerId as any)?._id;
      if (!customerId) return;
      setContactsLoading(true);
      try {
        const contactRes = await contactApi.getById(customerId);
        setCustomer(contactRes.data);
        setContactPersons(contactRes.data.contactPersons || []);
      } catch {
        setContactPersons([]);
      } finally {
        setContactsLoading(false);
      }
    }
    loadCustomerContacts();
  }, [order?.customerId]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!orderId || !firebaseUser || !activeOrganization?._id) return;
      setFetching(true);
      try {
        const res = await salesOrderApi.getById(orderId);
        if (!mounted) return;
        const so = res.data;
        setOrder(so);
        const customerName = getCustomerName(so.customerId);
        const customerEmail = (so.customerId as any)?.email || "";
        setTo(customerEmail);
        setSubject(`Sales Order from ${activeOrganization.name} (Sales Order #: ${so.salesOrderNumber})`);

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
          buildDefaultBody({
            customerName: customerName || "Customer",
            salesOrderNumber: so.salesOrderNumber,
            orderDate: formatDate(so.orderDate),
            amountText: `₹${formatAmount(Number(so.total || 0))} (in INR)`,
            senderName,
            organizationName: activeOrganization.name,
          }),
        );
      } catch {
        toast.error("Failed to load sales order");
        router.push("/sales/orders");
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
        const pdfBlob = await salesOrderApi.downloadPdf(order._id);
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
    if (!order) return "Send Sales Order Email";
    return `Send Email • ${order.salesOrderNumber}`;
  }, [order]);

  const parseRecipients = (value: string) =>
    value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

  const contactOptions = useMemo(() => {
    const list = [...contactPersons];
    const customerPrimaryEmail = customer?.email?.trim();
    const customerDisplayName = customer?.displayName || customer?.companyName || "Primary Contact";
    if (
      customerPrimaryEmail &&
      !list.some((cp) => cp.email?.trim().toLowerCase() === customerPrimaryEmail.toLowerCase())
    ) {
      list.unshift({
        name: customerDisplayName,
        email: customerPrimaryEmail,
      } as ContactPerson);
    }
    return list;
  }, [contactPersons, customer]);

  const filteredContactPersons = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    if (!q) return contactOptions;
    return contactOptions.filter((cp) =>
      [cp.salutation, cp.firstName, cp.lastName, cp.email, cp.designation, cp.department, cp.skypeName]
        .filter(Boolean)
        .some((field) => field?.toLowerCase().includes(q)),
    );
  }, [contactOptions, contactSearch]);

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
      const customerId = customer?._id || (typeof order?.customerId === "string" ? order.customerId : (order?.customerId as any)?._id);
      if (!customerId) {
        toast.error("Customer not found for this sales order");
        return;
      }

      const result = await contactApi.update(customerId, {
        contactPersons: updatedContacts,
      });
      updatedContacts = result.data.contactPersons || updatedContacts;
      setCustomer(result.data);

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
      await salesOrderApi.sendEmail(order._id, {
        to: toList,
        cc: parseRecipients(cc),
        bcc: parseRecipients(bcc),
        subject,
        body,
        attachPdf,
      });
      toast.success("Sales order email sent");
      router.push(`/sales/orders/${order._id}`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to send sales order email");
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
                Email To {getCustomerName(order?.customerId) || "Customer"}.
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
                      placeholder="customer@example.com"
                      className="h-8 flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-blue-600 h-8"
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
                      className="text-blue-600 h-8"
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
                      className="text-blue-600 h-8"
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
                    <div className="rounded-md border bg-white overflow-hidden shadow-lg mt-1">
                      <Command shouldFilter={false}>
                        <CommandInput
                          value={contactSearch}
                          onValueChange={setContactSearch}
                          placeholder="Search contact..."
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
                              {filteredContactPersons.map((contact, idx) => {
                                const primaryEmail = contact.email?.trim();
                                if (!primaryEmail) return null;
                                return (
                                  <CommandItem
                                    key={`${primaryEmail}-${idx}`}
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
                        className="w-full border-t px-4 py-3 text-left text-blue-600 text-base flex items-center gap-2 hover:bg-muted/50"
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
                        placeholder="cc@example.com"
                        className="h-8"
                      />
                    </div>
                    {showContactDropdown && selectedRecipientField === "cc" && (
                      <div className="grid grid-cols-[90px_1fr] px-4 pb-2">
                        <span />
                        <div className="rounded-md border bg-white overflow-hidden shadow-lg mt-1">
                          <Command shouldFilter={false}>
                            <CommandInput
                              value={contactSearch}
                              onValueChange={setContactSearch}
                              placeholder="Search contact..."
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
                                  {filteredContactPersons.map((contact, idx) => {
                                    const primaryEmail = contact.email?.trim();
                                    if (!primaryEmail) return null;
                                    return (
                                      <CommandItem
                                        key={`${primaryEmail}-${idx}`}
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
                        placeholder="bcc@example.com"
                        className="h-8"
                      />
                    </div>
                    {showContactDropdown && selectedRecipientField === "bcc" && (
                      <div className="grid grid-cols-[90px_1fr] px-4 pb-2">
                        <span />
                        <div className="rounded-md border bg-white overflow-hidden shadow-lg mt-1">
                          <Command shouldFilter={false}>
                            <CommandInput
                              value={contactSearch}
                              onValueChange={setContactSearch}
                              placeholder="Search contact..."
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
                                  {filteredContactPersons.map((contact, idx) => {
                                    const primaryEmail = contact.email?.trim();
                                    if (!primaryEmail) return null;
                                    return (
                                      <CommandItem
                                        key={`${primaryEmail}-${idx}`}
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
                    placeholder="Write your email body..."
                  />
                </div>

                <div className="px-4 py-3 bg-muted/30 flex flex-wrap items-center gap-2">
                  <Checkbox id="attach-pdf" checked={attachPdf} onCheckedChange={(v) => setAttachPdf(!!v)} />
                  <Label htmlFor="attach-pdf" className="text-sm cursor-pointer">Attach Sales Order PDF</Label>
                  <div className="ml-auto border rounded px-3 py-1.5 text-sm text-muted-foreground bg-white flex items-center gap-2 shadow-sm">
                    <FileText className="h-4 w-4" />
                    <span>{order?.salesOrderNumber || "SO"}.pdf</span>
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

                    <div className="rounded-md border overflow-hidden shadow-inner bg-white">
                      {pdfPreviewLoading ? (
                        <div className="h-[500px] w-full flex items-center justify-center">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : pdfPreviewUrl ? (
                        <iframe title="Sales Order PDF Preview" src={pdfPreviewUrl} className="w-full h-[680px]" />
                      ) : (
                        <div className="h-[500px] w-full flex items-center justify-center text-sm text-muted-foreground">
                          PDF preview could not be loaded.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4">
              <Button onClick={handleSend} disabled={sending} className="min-w-[120px]">
                {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Send Email
              </Button>
              <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
            </div>
          </div>
        )}

        {showAddContact && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-2 sm:p-6">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowAddContact(false)} />

            <div className="relative z-10 w-[min(900px,98vw)] max-h-[92vh] overflow-hidden rounded-lg border bg-background shadow-2xl flex flex-col">
              <div className="flex items-center justify-between border-b px-6 py-4">
                <h2 className="text-2xl font-semibold">Add Contact Person</h2>
                <button
                  type="button"
                  onClick={() => setShowAddContact(false)}
                  className="rounded-full p-1 hover:bg-muted transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <div className="grid lg:grid-cols-[1fr_280px] gap-8">
                  <div className="space-y-4">
                    <div className="grid gap-2 md:grid-cols-[140px_1fr] items-center">
                      <Label className="text-sm font-medium">Name</Label>
                      <div className="grid gap-3 sm:grid-cols-[100px_1fr_1fr]">
                        <Select
                          value={newContactPerson.salutation || SALUTATION_NONE}
                          onValueChange={(v) => setNewContactPerson(p => ({ ...p, salutation: v === SALUTATION_NONE ? "" : v }))}
                        >
                          <SelectTrigger className="h-10"><SelectValue placeholder="Mr." /></SelectTrigger>
                          <SelectContent className="z-[140]">
                            <SelectItem value={SALUTATION_NONE}>—</SelectItem>
                            {SALUTATIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input
                          placeholder="First Name"
                          value={newContactPerson.firstName}
                          onChange={e => setNewContactPerson(p => ({ ...p, firstName: e.target.value }))}
                        />
                        <Input
                          placeholder="Last Name"
                          value={newContactPerson.lastName}
                          onChange={e => setNewContactPerson(p => ({ ...p, lastName: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="grid gap-2 md:grid-cols-[140px_1fr] items-center">
                      <Label className="text-sm font-medium">Email</Label>
                      <Input
                        type="email"
                        value={newContactPerson.email}
                        onChange={e => setNewContactPerson(p => ({ ...p, email: e.target.value }))}
                      />
                    </div>

                    <div className="grid gap-2 md:grid-cols-[140px_1fr] items-center">
                      <Label className="text-sm font-medium">Work Phone</Label>
                      <Input
                        value={newContactPerson.workPhone}
                        onChange={e => setNewContactPerson(p => ({ ...p, workPhone: e.target.value }))}
                      />
                    </div>

                    <div className="grid gap-2 md:grid-cols-[140px_1fr] items-center">
                      <Label className="text-sm font-medium">Designation</Label>
                      <Input
                        value={newContactPerson.designation}
                        onChange={e => setNewContactPerson(p => ({ ...p, designation: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <Label className="text-sm font-medium">Profile Image</Label>
                    <div 
                      className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-muted/30 transition bg-muted/10 h-[220px]"
                      onClick={() => profileImageInputRef.current?.click()}
                    >
                      <input 
                        ref={profileImageInputRef}
                        type="file" 
                        className="hidden" 
                        accept="image/*"
                        onChange={handleProfileImageUpload}
                      />
                      {newContactPerson.photoUrl ? (
                        <div className="relative group">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={newContactPerson.photoUrl} alt="Preview" className="h-32 w-32 rounded-full object-cover border-4 border-white shadow" />
                          <div className="absolute inset-0 bg-black/20 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                            <Upload className="h-6 w-6 text-white" />
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                            <Upload className="h-6 w-6 text-primary" />
                          </div>
                          <p className="text-sm text-center font-medium">Click to upload photo</p>
                          <p className="text-xs text-muted-foreground mt-1">Max size 5MB</p>
                        </>
                      )}
                    </div>
                    {uploadingProfileImage && (
                      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Uploading...
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t px-6 py-4 bg-muted/20 flex items-center justify-end gap-3">
                <Button variant="outline" onClick={() => setShowAddContact(false)}>Cancel</Button>
                <Button onClick={handleSaveContactPerson}>Save and Select</Button>
              </div>
            </div>
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
