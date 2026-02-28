"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { contactApi, type CreateContactInput, type TaxTreatment } from "@/lib/api/contacts";
import { settingsApi, type PaymentTerms } from "@/lib/api/settings";

type CustomerTypeUi = "Business" | "Individual";

export default function NewCustomerPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [customerType, setCustomerType] = useState<CustomerTypeUi>("Business");
  const [salutation, setSalutation] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const [companyName, setCompanyName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [mobile, setMobile] = useState("");

  const [taxTreatment, setTaxTreatment] = useState<TaxTreatment>("Taxable");
  const [placeOfSupply, setPlaceOfSupply] = useState("");
  const [pan, setPan] = useState("");
  const [gstin, setGstin] = useState("");

  const [currency, setCurrency] = useState("INR");
  const [openingBalance, setOpeningBalance] = useState<string>("");
  const [paymentTermsId, setPaymentTermsId] = useState<string>("");

  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms[]>([]);

  const [portalEnabled, setPortalEnabled] = useState(false);
  const [language, setLanguage] = useState("en");

  const [billingStreet, setBillingStreet] = useState("");
  const [billingCity, setBillingCity] = useState("");
  const [billingState, setBillingState] = useState("");
  const [billingZip, setBillingZip] = useState("");
  const [billingCountry, setBillingCountry] = useState("");

  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!firebaseUser || loading) return;
    settingsApi.paymentTerms
      .list()
      .then((res) => setPaymentTerms(res.data ?? []))
      .catch(() => setPaymentTerms([]));
  }, [firebaseUser, loading]);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  const computedDisplayName = useMemo(() => {
    if (customerType === "Business") return companyName.trim();
    const parts = [salutation, firstName, lastName].map((s) => s.trim()).filter(Boolean);
    return parts.join(" ").trim();
  }, [customerType, salutation, firstName, lastName, companyName]);

  useEffect(() => {
    setDisplayName((prev) => (prev.trim() ? prev : computedDisplayName));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computedDisplayName]);

  async function onSave() {
    setError("");

    const finalDisplayName = displayName.trim() || computedDisplayName;
    if (!finalDisplayName) {
      setError("Customer Display Name is required");
      return;
    }

    const isObjectId = (v: string) => /^[a-f\d]{24}$/i.test(v);

    const payload: CreateContactInput = {
      contactType: "Customer",
      displayName: finalDisplayName,
      companyName: companyName.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      mobile: mobile.trim() || undefined,
      taxTreatment,
      placeOfSupply: placeOfSupply.trim() || undefined,
      pan: pan.trim() || undefined,
      gstin: gstin.trim() || undefined,
      currency: currency.trim() || undefined,
      paymentTermsId: isObjectId(paymentTermsId) ? paymentTermsId : undefined,
      openingBalance: openingBalance.trim() ? Number(openingBalance) : undefined,
      billingAddress: {
        street: billingStreet.trim() || undefined,
        city: billingCity.trim() || undefined,
        state: billingState.trim() || undefined,
        zip: billingZip.trim() || undefined,
        country: billingCountry.trim() || undefined,
      },
      notes: notes.trim() || undefined,
      portalEnabled,
      language,
    };

    if (payload.openingBalance != null && Number.isNaN(payload.openingBalance)) {
      setError("Opening Balance must be a number");
      return;
    }

    setSaving(true);
    try {
      await contactApi.create(payload);
      router.push("/sales/customers");
    } catch (e: any) {
      setError(e?.message || "Failed to create customer");
    } finally {
      setSaving(false);
    }
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
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => router.push("/sales/customers")}
                aria-label="Back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Sales <span className="mx-1">/</span>
                Customers <span className="mx-1">/</span>
                <span className="font-medium text-foreground">New Customer</span>
              </span>
            </div>
          }
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => router.push("/sales/customers")} disabled={saving}>
                Cancel
              </Button>
              <Button size="sm" onClick={onSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
            </>
          }
        />

        <div className="flex flex-1 flex-col p-6 gap-6">
          <div className="max-w-4xl">
            <h1 className="text-xl font-bold">New Customer</h1>
            {error ? (
              <p className="mt-2 text-sm text-destructive">{error}</p>
            ) : null}

            <div className="mt-6 grid grid-cols-1 gap-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <Label className="md:col-span-3">Customer Type</Label>
                <div className="md:col-span-9 flex items-center gap-2">
                  <Button
                    type="button"
                    variant={customerType === "Business" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCustomerType("Business")}
                  >
                    Business
                  </Button>
                  <Button
                    type="button"
                    variant={customerType === "Individual" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCustomerType("Individual")}
                  >
                    Individual
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                <Label className="md:col-span-3">Primary Contact</Label>
                <div className="md:col-span-9 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Select value={salutation} onValueChange={setSalutation}>
                    <SelectTrigger>
                      <SelectValue placeholder="Salutation" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Mr.">Mr.</SelectItem>
                      <SelectItem value="Ms.">Ms.</SelectItem>
                      <SelectItem value="Mrs.">Mrs.</SelectItem>
                      <SelectItem value="Dr.">Dr.</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input placeholder="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  <Input placeholder="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <Label className="md:col-span-3">Company Name</Label>
                <div className="md:col-span-9">
                  <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <Label className="md:col-span-3">Customer Display Name</Label>
                <div className="md:col-span-9">
                  <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={computedDisplayName || "Display Name"} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <Label className="md:col-span-3">Customer Email</Label>
                <div className="md:col-span-9">
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <Label className="md:col-span-3">Customer Phone</Label>
                <div className="md:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input placeholder="Work Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  <Input placeholder="Mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="mt-8">
              <Tabs defaultValue="other" className="w-full">
                <TabsList variant="line" className="w-full justify-start border-b rounded-none px-0">
                  <TabsTrigger value="other">Other Details</TabsTrigger>
                  <TabsTrigger value="address">Address</TabsTrigger>
                  <TabsTrigger value="remarks">Remarks</TabsTrigger>
                </TabsList>

                <TabsContent value="other" className="pt-6">
                  <div className="grid grid-cols-1 gap-4">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      <Label className="md:col-span-3">GST Treatment</Label>
                      <div className="md:col-span-9">
                        <Select value={taxTreatment} onValueChange={(v) => setTaxTreatment(v as TaxTreatment)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a GST treatment" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Taxable">Taxable</SelectItem>
                            <SelectItem value="TaxExempt">Tax Exempt</SelectItem>
                            <SelectItem value="ReverseCharge">Reverse Charge</SelectItem>
                            <SelectItem value="SEZ">SEZ</SelectItem>
                            <SelectItem value="Overseas">Overseas</SelectItem>
                            <SelectItem value="Composition">Composition</SelectItem>
                            <SelectItem value="UIN">UIN</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      <Label className="md:col-span-3">Place Of Supply</Label>
                      <div className="md:col-span-9">
                        <Input value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)} />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      <Label className="md:col-span-3">PAN</Label>
                      <div className="md:col-span-9">
                        <Input value={pan} onChange={(e) => setPan(e.target.value)} />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      <Label className="md:col-span-3">GSTIN</Label>
                      <div className="md:col-span-9">
                        <Input value={gstin} onChange={(e) => setGstin(e.target.value)} />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      <Label className="md:col-span-3">Currency</Label>
                      <div className="md:col-span-9">
                        <Input value={currency} onChange={(e) => setCurrency(e.target.value)} />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      <Label className="md:col-span-3">Opening Balance</Label>
                      <div className="md:col-span-9">
                        <Input value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} placeholder="0" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      <Label className="md:col-span-3">Payment Terms</Label>
                      <div className="md:col-span-9">
                        <Select value={paymentTermsId} onValueChange={setPaymentTermsId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select payment terms" />
                          </SelectTrigger>
                          <SelectContent>
                            {paymentTerms.map((t) => (
                              <SelectItem key={t._id} value={t._id}>
                                {t.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      <Label className="md:col-span-3">Enable Portal?</Label>
                      <div className="md:col-span-9 flex items-center gap-2">
                        <Checkbox checked={portalEnabled} onCheckedChange={(v) => setPortalEnabled(Boolean(v))} />
                        <span className="text-sm">Allow portal access for this customer</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      <Label className="md:col-span-3">Portal Language</Label>
                      <div className="md:col-span-9">
                        <Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="en" />
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="address" className="pt-6">
                  <div className="grid grid-cols-1 gap-4">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      <Label className="md:col-span-3">Street</Label>
                      <div className="md:col-span-9">
                        <Input value={billingStreet} onChange={(e) => setBillingStreet(e.target.value)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      <Label className="md:col-span-3">City</Label>
                      <div className="md:col-span-9">
                        <Input value={billingCity} onChange={(e) => setBillingCity(e.target.value)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      <Label className="md:col-span-3">State</Label>
                      <div className="md:col-span-9">
                        <Input value={billingState} onChange={(e) => setBillingState(e.target.value)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      <Label className="md:col-span-3">PIN Code</Label>
                      <div className="md:col-span-9">
                        <Input value={billingZip} onChange={(e) => setBillingZip(e.target.value)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      <Label className="md:col-span-3">Country</Label>
                      <div className="md:col-span-9">
                        <Input value={billingCountry} onChange={(e) => setBillingCountry(e.target.value)} />
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="remarks" className="pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                    <Label className="md:col-span-3">Remarks</Label>
                    <div className="md:col-span-9">
                      <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
