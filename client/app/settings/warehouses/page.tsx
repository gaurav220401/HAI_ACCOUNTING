"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";
import SetupConfigShell from "@/components/settings/setup-config-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { warehouseApi } from "@/lib/api/warehouses";
import type { Warehouse } from "@/lib/api/warehouses";

export default function WarehousesSettingsPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { activeOrganization, loading: orgLoading, needsOrgSetup } = useOrganization();

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Partial<Warehouse> | null>(null);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!orgLoading && needsOrgSetup) router.push("/org-setup");
  }, [orgLoading, needsOrgSetup, router]);

  useEffect(() => {
    loadWarehouses();
  }, [activeOrganization?._id]);

  const loadWarehouses = async () => {
    if (!activeOrganization?._id) return;
    setFetching(true);
    try {
      const res = await warehouseApi.list({ includeInactive: true });
      setWarehouses(res.data || []);
    } catch {
      toast.error("Failed to load warehouses");
    } finally {
      setFetching(false);
    }
  };

  const handleOpenNew = () => {
    setEditingWarehouse({
      name: "",
      address: { street: "", city: "", state: "", zip: "", country: "" },
      isPrimary: warehouses.length === 0,
      isActive: true,
    });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (warehouse: Warehouse) => {
    setEditingWarehouse({ ...warehouse });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editingWarehouse?.name?.trim()) {
      toast.error("Warehouse name is required");
      return;
    }

    setSaving(true);
    try {
      if (editingWarehouse._id) {
        await warehouseApi.update(editingWarehouse._id, editingWarehouse);
        toast.success("Warehouse updated");
      } else {
        await warehouseApi.create(editingWarehouse);
        toast.success("Warehouse created");
      }
      setIsDialogOpen(false);
      loadWarehouses();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save warehouse");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this warehouse?")) return;
    try {
      await warehouseApi.remove(id);
      toast.success("Warehouse deleted");
      loadWarehouses();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete warehouse");
    }
  };

  return (
    <SetupConfigShell
      title="Warehouses"
      subtitle="Manage your warehouse locations for inventory tracking."
      actions={(
        <Button onClick={handleOpenNew} disabled={fetching}>
          <Plus className="h-4 w-4" />
          <span className="ml-2">New Warehouse</span>
        </Button>
      )}
    >
      <div className="space-y-6">
        <section className="rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {fetching ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Loading warehouses...
                  </td>
                </tr>
              ) : warehouses.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    No warehouses found. Click &quot;New Warehouse&quot; to add one.
                  </td>
                </tr>
              ) : (
                warehouses.map((wh) => (
                  <tr key={wh._id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="font-medium">{wh.name}</div>
                      {wh.isPrimary && (
                        <span className="inline-block mt-1 px-2 py-0.5 text-[10px] bg-primary/10 text-primary rounded-full font-medium">
                          Primary
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {[wh.address?.city, wh.address?.state, wh.address?.country].filter(Boolean).join(", ") || "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 text-[10px] rounded-full font-medium ${wh.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}`}>
                        {wh.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenEdit(wh)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(wh._id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingWarehouse?._id ? "Edit Warehouse" : "New Warehouse"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Warehouse Name *</Label>
              <Input
                value={editingWarehouse?.name || ""}
                onChange={(e) => setEditingWarehouse((p) => ({ ...(p || {}), name: e.target.value } as Partial<Warehouse>))}
                placeholder="e.g. Main Warehouse"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>City</Label>
                <Input
                  value={editingWarehouse?.address?.city || ""}
                  onChange={(e) => setEditingWarehouse((p) => ({ ...(p || {}), address: { ...(p?.address || {}), city: e.target.value } } as Partial<Warehouse>))}
                />
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Input
                  value={editingWarehouse?.address?.state || ""}
                  onChange={(e) => setEditingWarehouse((p) => ({ ...(p || {}), address: { ...(p?.address || {}), state: e.target.value } } as Partial<Warehouse>))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Country</Label>
                <Input
                  value={editingWarehouse?.address?.country || ""}
                  onChange={(e) => setEditingWarehouse((p) => ({ ...(p || {}), address: { ...(p?.address || {}), country: e.target.value } } as Partial<Warehouse>))}
                />
              </div>
              <div className="space-y-2">
                <Label>Zip Code</Label>
                <Input
                  value={editingWarehouse?.address?.zip || ""}
                  onChange={(e) => setEditingWarehouse((p) => ({ ...(p || {}), address: { ...(p?.address || {}), zip: e.target.value } } as Partial<Warehouse>))}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Street Address</Label>
              <Input
                value={editingWarehouse?.address?.street || ""}
                onChange={(e) => setEditingWarehouse((p) => ({ ...(p || {}), address: { ...(p?.address || {}), street: e.target.value } } as Partial<Warehouse>))}
              />
            </div>

            <div className="flex flex-col gap-3 mt-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isPrimary"
                  checked={editingWarehouse?.isPrimary || false}
                  onCheckedChange={(checked) => setEditingWarehouse((p) => ({ ...(p || {}), isPrimary: !!checked } as Partial<Warehouse>))}
                />
                <Label htmlFor="isPrimary" className="font-normal cursor-pointer">Mark as Primary Warehouse</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isActive"
                  checked={editingWarehouse?.isActive || false}
                  onCheckedChange={(checked) => setEditingWarehouse((p) => ({ ...(p || {}), isActive: !!checked } as Partial<Warehouse>))}
                />
                <Label htmlFor="isActive" className="font-normal cursor-pointer">Active</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SetupConfigShell>
  );
}
