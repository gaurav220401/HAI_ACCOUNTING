"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { 
  Bar, 
  BarChart, 
  CartesianGrid, 
  Cell, 
  ResponsiveContainer, 
  Tooltip, 
  XAxis, 
  YAxis, 
  Area, 
  AreaChart 
} from "recharts";
import { 
  Box, 
  ChevronRight, 
  Clock, 
  FileText, 
  Package, 
  Plus, 
  ShoppingCart, 
  Truck, 
  Users,
  Image as ImageIcon
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import type { InventoryOverviewResponse } from "@/lib/api/inventory";

interface DashboardOverviewProps {
  data: InventoryOverviewResponse;
  period: string;
  onPeriodChange: (p: string) => void;
  onNewAdjustment: () => void;
}

export function DashboardOverview({ data, period, onPeriodChange, onNewAdjustment }: DashboardOverviewProps) {
  const [stockedView, setStockedView] = useState<"quantity" | "value">("quantity");
  const [summaryView, setSummaryView] = useState<"quantity" | "value">("quantity");

  const fmtCurrency = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val);
  };

  const topStocked = stockedView === "quantity" ? data.topStockedItems.byQuantity : data.topStockedItems.byValue;

  return (
    <div className="space-y-6">
      {/* Top Summary Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <div className="h-1 bg-blue-500 w-full" />
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Valuation</p>
              <h3 className="text-xl font-bold text-slate-800 mt-1">{fmtCurrency(data.summary.totalValue)}</h3>
              <p className="text-[10px] text-slate-500 mt-1">Across {data.summary.trackedItems} items</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
              <Box className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <div className="h-1 bg-orange-500 w-full" />
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Low Stock</p>
              <h3 className="text-xl font-bold text-slate-800 mt-1">{data.summary.lowStockItems}</h3>
              <p className="text-[10px] text-orange-600 font-medium mt-1">Needs attention</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-orange-50 flex items-center justify-center text-orange-600">
              <Clock className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <div className="h-1 bg-red-500 w-full" />
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Out of Stock</p>
              <h3 className="text-xl font-bold text-slate-800 mt-1">{data.summary.outOfStockItems}</h3>
              <p className="text-[10px] text-red-600 font-medium mt-1">Immediate action</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-red-50 flex items-center justify-center text-red-600">
              <Box className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <div className="h-1 bg-green-500 w-full" />
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Stock</p>
              <h3 className="text-xl font-bold text-slate-800 mt-1">{data.summary.totalQuantity}</h3>
              <p className="text-[10px] text-green-600 font-medium mt-1">Units on hand</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-green-50 flex items-center justify-center text-green-600">
              <Package className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Left Column: Analytics */}
        <div className="space-y-6">
          {/* Sales Order Summary Chart */}
          <Card className="border-none shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-md font-semibold">Sales Trends</CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">Order volume and revenue over time</p>
              </div>
              <div className="flex rounded-md bg-slate-100 p-0.5">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className={cn(
                    "h-7 text-[10px] px-2 shadow-none",
                    summaryView === "quantity" ? "bg-white shadow-sm" : ""
                  )}
                  onClick={() => setSummaryView("quantity")}
                >
                  By Quantity
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className={cn(
                    "h-7 text-[10px] px-2 shadow-none",
                    summaryView === "value" ? "bg-white shadow-sm" : ""
                  )}
                  onClick={() => setSummaryView("value")}
                >
                  By Value
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[240px] w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.salesOrderSummary}>
                    <defs>
                      <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="_id" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{fontSize: 10, fill: '#94a3b8'}}
                      tickFormatter={(v) => v.split('-').pop() || v} 
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{fontSize: 10, fill: '#94a3b8'}}
                      tickFormatter={(v) => summaryView === 'value' ? `${v/1000}k` : v}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey={summaryView === "quantity" ? "quantity" : "value"} 
                      stroke="#3b82f6" 
                      fillOpacity={1} 
                      fill="url(#colorVal)" 
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Top Selling Items */}
            <Card className="border-none shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-md font-semibold">Top Selling Items</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {data.topSellingItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs">
                        #{i+1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-700 truncate">{item.name}</p>
                        <p className="text-[10px] text-slate-400">{item.quantity} units sold</p>
                      </div>
                      <span className="text-xs font-bold text-slate-700">{fmtCurrency(item.revenue)}</span>
                    </div>
                  ))}
                  {data.topSellingItems.length === 0 && <p className="text-xs text-slate-400 italic text-center py-4">No sales data available.</p>}
                </div>
              </CardContent>
            </Card>

            {/* Category Distribution */}
            <Card className="border-none shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-md font-semibold">Category Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {data.categoryDistribution.map((cat, i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        <span>{cat.category}</span>
                        <span>{fmtCurrency(cat.value)}</span>
                      </div>
                      <Progress 
                        value={(cat.value / (data.categoryDistribution[0]?.value || 1)) * 100} 
                        className="h-1.5 bg-slate-50 [&>div]:bg-blue-400" 
                      />
                    </div>
                  ))}
                  {data.categoryDistribution.length === 0 && <p className="text-xs text-slate-400 italic text-center py-4">No categories defined.</p>}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Sales By Channel */}
            <Card className="border-none shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-md font-semibold">Sales By Channel</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {data.salesByChannel.map((ch, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${i === 0 ? "bg-blue-500" : "bg-slate-300"}`} />
                        <span className="text-xs text-slate-600">{ch.channel}</span>
                      </div>
                      <span className="text-xs font-bold text-slate-800">{fmtCurrency(ch.amount)}</span>
                    </div>
                  ))}
                  {data.salesByChannel.length === 0 && <p className="text-xs text-slate-400 italic text-center py-4">No channel data available.</p>}
                </div>
              </CardContent>
            </Card>

            {/* Recent Receipts */}
            <Card className="border-none shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-md font-semibold">Recent Receipts</CardTitle>
              </CardHeader>
              <CardContent className="p-0 px-6 pb-6">
                <div className="space-y-4">
                  {data.receiveHistory.map((r, i) => (
                    <div key={i} className="flex items-center justify-between py-1">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-800">{r.receiveNumber}</span>
                        <span className="text-[10px] text-slate-400">{r.vendor}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-slate-700">{r.quantity} Units</span>
                        <p className="text-[10px] text-slate-400">{new Date(r.date).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                  {data.receiveHistory.length === 0 && <p className="text-xs text-slate-400 italic text-center py-4">No recent receipts.</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right Column: Pipeline */}
        <div className="space-y-6">
          <Card className="border-none shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-500" />
                Pipeline Status
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                <div className="p-4 space-y-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sales & Shipping</p>
                  {[
                    { label: "To Be Packed", count: data.pendingActions.sales.toPack, color: "bg-orange-500" },
                    { label: "To Be Shipped", count: data.pendingActions.sales.toShip, color: "bg-blue-500" },
                    { label: "To Be Delivered", count: data.pendingActions.sales.toDeliver, color: "bg-green-500" },
                    { label: "To Be Invoiced", count: data.pendingActions.sales.toInvoice, color: "bg-purple-500" },
                  ].map((item, i) => (
                    <button key={i} className="w-full group flex items-center justify-between py-2 hover:translate-x-1 transition-transform">
                      <div className="flex items-center gap-3">
                        <div className={`h-1.5 w-1.5 rounded-full ${item.color}`} />
                        <span className="text-xs text-slate-600 font-medium group-hover:text-slate-900">{item.label}</span>
                      </div>
                      <span className="text-xs font-bold text-slate-900">{item.count}</span>
                    </button>
                  ))}
                </div>

                <div className="p-4 space-y-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Purchasing</p>
                  {[
                    { label: "To Be Received", count: data.pendingActions.purchases.toBeReceived, color: "bg-blue-600" },
                    { label: "In Progress", count: data.pendingActions.purchases.receiveInProgress, color: "bg-orange-600" },
                    { 
                      label: "Pending Putaways", 
                      count: data.pendingActions.purchases.pendingPutaways, 
                      color: "bg-amber-600",
                      url: "/purchases/receives"
                    },
                  ].map((item, i) => (
                    <button 
                      key={i} 
                      className="w-full group flex items-center justify-between py-2 hover:translate-x-1 transition-transform"
                      onClick={() => item.url && (window.location.href = item.url)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`h-1.5 w-1.5 rounded-full ${item.color}`} />
                        <span className="text-xs text-slate-600 font-medium group-hover:text-slate-900">{item.label}</span>
                      </div>
                      <span className="text-xs font-bold text-slate-900">{item.count}</span>
                    </button>
                  ))}
                </div>

                <div className="p-4 space-y-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Inventory Alerts</p>
                  {[
                    { label: "Below Reorder Level", count: data.pendingActions.inventory.belowReorder, color: "bg-red-500" },
                  ].map((item, i) => (
                    <button key={i} className="w-full group flex items-center justify-between py-2 hover:translate-x-1 transition-transform">
                      <div className="flex items-center gap-3">
                        <div className={`h-1.5 w-1.5 rounded-full ${item.color}`} />
                        <span className="text-xs text-slate-600 font-medium group-hover:text-slate-800">{item.label}</span>
                      </div>
                      <span className="text-xs font-bold text-red-600">{item.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Filter Select */}
          <div className="p-4 rounded-xl bg-white border shadow-sm space-y-3">
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dashboard Period</p>
             <Select value={period} onValueChange={onPeriodChange}>
                <SelectTrigger className="w-full h-10 text-xs bg-slate-50 border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="year">This Year</SelectItem>
                </SelectContent>
              </Select>
          </div>

          <Button 
            className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-lg shadow-blue-200"
            onClick={onNewAdjustment}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Adjustment
          </Button>
        </div>
      </div>
    </div>
  );
}
