"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  ArrowLeft, 
  Save, 
  Plus, 
  Users, 
  Calendar,
  DollarSign,
  Clock,
  Settings,
  ChevronDown
} from "lucide-react";
import { projectApi, type CreateProjectInput } from "@/lib/api";

export default function NewProjectPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();
  
  const [formData, setFormData] = useState<CreateProjectInput>({
    name: "",
    description: "",
    customerName: "",
    projectCode: "",
    billingMethod: "Hourly Rate",
    rate: "",
    ratePerDay: "",
    budgetedRevenue: "",
    hoursBudgetType: "",
    watchlistEnabled: false
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!loading) {
      if (!firebaseUser) { router.push("/login"); return; }
    }
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) {
      router.push("/org-setup");
    }
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const handleInputChange = (field: keyof CreateProjectInput, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ""
      }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Project name is required";
    }

    if (!formData.customerName.trim()) {
      newErrors.customerName = "Customer name is required";
    }

    if (formData.billingMethod === "Hourly Rate" && !(formData.rate ?? "").trim()) {
      newErrors.rate = "Rate is required for hourly billing";
    }

    if (formData.billingMethod === "Fixed Rate" && !(formData.rate ?? "").trim()) {
      newErrors.rate = "Fixed rate is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    try {
      console.log('Creating project with data:', formData);
      const response = await projectApi.create(formData);
      console.log('Project creation response:', response);
      
      if (response.data) {
        // Navigate to project details page
        router.push(`/time-tracking/projects/${response.data._id}`);
      }
    } catch (error: any) {
      console.error('Failed to create project:', error);
      
      // Handle different error types
      if (error.message) {
        setErrors(prev => ({
          ...prev,
          submit: error.message
        }));
      } else if (error.code === 'PROJECT_CODE_EXISTS') {
        setErrors(prev => ({
          ...prev,
          projectCode: "Project code already exists"
        }));
      } else {
        setErrors(prev => ({
          ...prev,
          submit: "Failed to create project. Please try again."
        }));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    router.push("/time-tracking/projects");
  };

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {/* Header */}
        <PageHeader 
          breadcrumb={
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleCancel}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <span className="text-sm font-medium">New Project</span>
            </div>
          }
          actions={
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                onClick={handleCancel}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSubmit}
                disabled={isLoading}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {isLoading ? "Creating..." : "Create Project"}
              </Button>
            </div>
          }
        />

        {/* Content */}
        <div className="flex flex-1 flex-col gap-6 p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Basic Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Basic Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Project Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => handleInputChange("name", e.target.value)}
                      placeholder="Enter project name"
                      className={errors.name ? "border-red-500" : ""}
                    />
                    {errors.name && (
                      <p className="text-sm text-red-500">{errors.name}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => handleInputChange("description", e.target.value)}
                      placeholder="Enter project description"
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="customerName">Customer Name *</Label>
                    <Input
                      id="customerName"
                      value={formData.customerName}
                      onChange={(e) => handleInputChange("customerName", e.target.value)}
                      placeholder="Enter customer name"
                      className={errors.customerName ? "border-red-500" : ""}
                    />
                    {errors.customerName && (
                      <p className="text-sm text-red-500">{errors.customerName}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="projectCode">Project Code</Label>
                    <Input
                      id="projectCode"
                      value={formData.projectCode}
                      onChange={(e) => handleInputChange("projectCode", e.target.value)}
                      placeholder="Enter project code (optional)"
                      className={errors.projectCode ? "border-red-500" : ""}
                    />
                    {errors.projectCode && (
                      <p className="text-sm text-red-500">{errors.projectCode}</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Billing Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Billing Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="billingMethod">Billing Method *</Label>
                    <Select
                      value={formData.billingMethod}
                      onValueChange={(value) => handleInputChange("billingMethod", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select billing method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Fixed Rate">Fixed Rate</SelectItem>
                        <SelectItem value="Hourly Rate">Hourly Rate</SelectItem>
                        <SelectItem value="Based on Project Hours">Based on Project Hours</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {(formData.billingMethod === "Hourly Rate" || formData.billingMethod === "Fixed Rate") && (
                    <div className="space-y-2">
                      <Label htmlFor="rate">
                        {formData.billingMethod === "Hourly Rate" ? "Hourly Rate *" : "Fixed Rate *"}
                      </Label>
                      <Input
                        id="rate"
                        value={formData.rate}
                        onChange={(e) => handleInputChange("rate", e.target.value)}
                        placeholder={formData.billingMethod === "Hourly Rate" ? "₹75/hr" : "₹5,000"}
                        className={errors.rate ? "border-red-500" : ""}
                      />
                      {errors.rate && (
                        <p className="text-sm text-red-500">{errors.rate}</p>
                      )}
                    </div>
                  )}

                  {formData.billingMethod === "Hourly Rate" && (
                    <div className="space-y-2">
                      <Label htmlFor="ratePerDay">Rate per Day</Label>
                      <Input
                        id="ratePerDay"
                        value={formData.ratePerDay}
                        onChange={(e) => handleInputChange("ratePerDay", e.target.value)}
                        placeholder="₹600/day"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="budgetedRevenue">Budgeted Revenue</Label>
                    <Input
                      id="budgetedRevenue"
                      value={formData.budgetedRevenue}
                      onChange={(e) => handleInputChange("budgetedRevenue", e.target.value)}
                      placeholder="₹10,000"
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="watchlistEnabled"
                      checked={formData.watchlistEnabled}
                      onCheckedChange={(checked) => handleInputChange("watchlistEnabled", checked as boolean)}
                    />
                    <Label htmlFor="watchlistEnabled">Add to watchlist</Label>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Additional Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Additional Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="hoursBudgetType">Hours Budget Type</Label>
                    <Select
                      value={formData.hoursBudgetType}
                      onValueChange={(value) => handleInputChange("hoursBudgetType", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select budget type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="total">Total Hours</SelectItem>
                        <SelectItem value="per-user">Per User</SelectItem>
                        <SelectItem value="per-task">Per Task</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {errors.submit && (
              <div className="rounded-md bg-red-50 p-4">
                <p className="text-sm text-red-800">{errors.submit}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-4 pt-4 border-t">
              <Button 
                type="button"
                variant="outline" 
                onClick={handleCancel}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={isLoading}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {isLoading ? "Creating..." : "Create Project"}
              </Button>
            </div>
          </form>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
