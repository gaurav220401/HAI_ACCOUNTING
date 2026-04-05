"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import SetupConfigShell from "@/components/settings/setup-config-shell";
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
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { currencyApi, organizationApi, type Currency, type ExchangeRate } from "@/lib/api";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function CurrenciesSettingsPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { activeOrganization, loading: orgLoading, needsOrgSetup, refreshOrganizations } = useOrganization();

  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [baseCurrency, setBaseCurrency] = useState("INR");

  const [fetching, setFetching] = useState(false);
  const [savingBase, setSavingBase] = useState(false);
  const [savingRate, setSavingRate] = useState(false);
  const [seedingCurrencies, setSeedingCurrencies] = useState(false);

  const [newRate, setNewRate] = useState({
    from: "USD",
    to: "INR",
    rate: "",
    date: todayIsoDate(),
  });

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!orgLoading && needsOrgSetup) router.push("/org-setup");
  }, [orgLoading, needsOrgSetup, router]);

  useEffect(() => {
    setBaseCurrency(activeOrganization?.baseCurrency || "INR");
  }, [activeOrganization?.baseCurrency]);

  useEffect(() => {
    const load = async () => {
      if (!activeOrganization?._id) return;
      setFetching(true);
      try {
        const currencyRes = await currencyApi.list();
        let nextCurrencies = currencyRes.data || [];

        // Self-heal first-run environments where currencies were never seeded.
        if (nextCurrencies.length === 0) {
          await currencyApi.seedCurrencies();
          const seededRes = await currencyApi.list();
          nextCurrencies = seededRes.data || [];
        }

        const ratesRes = await currencyApi.listRates({ limit: 100 });
        setCurrencies(nextCurrencies);
        setRates(ratesRes.data || []);
      } catch {
        toast.error("Failed to load currency settings");
      } finally {
        setFetching(false);
      }
    };

    void load();
  }, [activeOrganization?._id]);

  useEffect(() => {
    if (currencies.length === 0) return;

    const available = new Set(currencies.map((c) => c.code));

    if (!available.has(baseCurrency)) {
      setBaseCurrency(currencies[0].code);
    }

    setNewRate((prev) => {
      const from = available.has(prev.from) ? prev.from : currencies[0].code;
      const to = available.has(prev.to)
        ? prev.to
        : currencies.find((c) => c.code !== from)?.code || from;
      return { ...prev, from, to };
    });
  }, [currencies, baseCurrency]);

  const canSaveBase = useMemo(
    () => Boolean(activeOrganization?._id && baseCurrency && currencies.some((c) => c.code === baseCurrency)),
    [activeOrganization?._id, baseCurrency, currencies],
  );

  async function handleInitializeCurrencies() {
    setSeedingCurrencies(true);
    try {
      await currencyApi.seedCurrencies();
      const currencyRes = await currencyApi.list();
      setCurrencies(currencyRes.data || []);
      toast.success("Currencies initialized");
    } catch {
      toast.error("Failed to initialize currencies");
    } finally {
      setSeedingCurrencies(false);
    }
  }

  async function handleSaveBaseCurrency() {
    if (!activeOrganization?._id) return;
    setSavingBase(true);
    try {
      await organizationApi.update(activeOrganization._id, { baseCurrency });
      await refreshOrganizations();
      toast.success("Base currency updated");
    } catch {
      toast.error("Failed to save base currency");
    } finally {
      setSavingBase(false);
    }
  }

  async function handleAddRate() {
    if (!newRate.from || !newRate.to || !newRate.rate || !newRate.date) {
      toast.error("Fill all exchange rate fields");
      return;
    }
    const rateNum = Number(newRate.rate);
    if (!Number.isFinite(rateNum) || rateNum <= 0) {
      toast.error("Rate must be greater than zero");
      return;
    }

    setSavingRate(true);
    try {
      await currencyApi.createRate({
        from: newRate.from,
        to: newRate.to,
        rate: rateNum,
        date: newRate.date,
        source: "manual",
      });
      const ratesRes = await currencyApi.listRates({ limit: 100 });
      setRates(ratesRes.data || []);
      setNewRate((prev) => ({ ...prev, rate: "" }));
      toast.success("Exchange rate added");
    } catch {
      toast.error("Failed to add exchange rate");
    } finally {
      setSavingRate(false);
    }
  }

  async function handleDeleteRate(id: string) {
    try {
      await currencyApi.deleteRate(id);
      setRates((prev) => prev.filter((r) => r._id !== id));
      toast.success("Exchange rate deleted");
    } catch {
      toast.error("Failed to delete exchange rate");
    }
  }

  return (
    <SetupConfigShell
      title="Currencies"
      subtitle="Choose your base currency and maintain exchange rates for multi-currency accounting."
      actions={(
        <Button onClick={handleSaveBaseCurrency} disabled={!canSaveBase || savingBase || fetching}>
          {savingBase ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span className="ml-2">Save Base Currency</span>
        </Button>
      )}
    >
      <div className="space-y-6">
        <section className="rounded-lg border p-4">
          <h2 className="font-medium mb-4">Base Currency</h2>
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-3 items-end">
            <div className="space-y-1.5">
              <Label>Organization Base Currency</Label>
              <Select value={baseCurrency} onValueChange={setBaseCurrency}>
                <SelectTrigger disabled={fetching || currencies.length === 0}>
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code} - {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-muted-foreground">
              Base currency is used for financial reports and account balances. Transaction currencies can still vary.
            </div>
          </div>
          {currencies.length === 0 && (
            <div className="mt-3 rounded-md border border-dashed p-3 text-xs text-muted-foreground flex items-center justify-between gap-3">
              <span>No currencies found yet. Initialize default world currencies to enable selection.</span>
              <Button type="button" variant="outline" size="sm" onClick={handleInitializeCurrencies} disabled={seedingCurrencies}>
                {seedingCurrencies ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                <span className="ml-2">Initialize</span>
              </Button>
            </div>
          )}
        </section>

        <section className="rounded-lg border p-4 space-y-4">
          <h2 className="font-medium">Exchange Rates</h2>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div className="space-y-1.5">
              <Label>From</Label>
              <Select value={newRate.from} onValueChange={(v) => setNewRate((p) => ({ ...p, from: v }))}>
                <SelectTrigger disabled={currencies.length === 0}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>To</Label>
              <Select value={newRate.to} onValueChange={(v) => setNewRate((p) => ({ ...p, to: v }))}>
                <SelectTrigger disabled={currencies.length === 0}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Rate</Label>
              <Input
                type="number"
                min="0"
                step="0.0001"
                value={newRate.rate}
                onChange={(e) => setNewRate((p) => ({ ...p, rate: e.target.value }))}
                placeholder="e.g. 83.25"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                value={newRate.date}
                onChange={(e) => setNewRate((p) => ({ ...p, date: e.target.value }))}
              />
            </div>

            <Button onClick={handleAddRate} disabled={savingRate || currencies.length === 0}>
              {savingRate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span className="ml-2">Add Rate</span>
            </Button>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2">From</th>
                  <th className="px-3 py-2">To</th>
                  <th className="px-3 py-2">Rate</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2 w-20">Action</th>
                </tr>
              </thead>
              <tbody>
                {rates.length === 0 && (
                  <tr>
                    <td className="px-3 py-4 text-muted-foreground" colSpan={5}>
                      No exchange rates added yet.
                    </td>
                  </tr>
                )}
                {rates.map((rate) => (
                  <tr key={rate._id} className="border-t">
                    <td className="px-3 py-2">{rate.from}</td>
                    <td className="px-3 py-2">{rate.to}</td>
                    <td className="px-3 py-2">{rate.rate}</td>
                    <td className="px-3 py-2">{new Date(rate.date).toLocaleDateString("en-IN")}</td>
                    <td className="px-3 py-2">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => handleDeleteRate(rate._id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </SetupConfigShell>
  );
}
