 "use client";
 
 import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
 import { AppSidebar } from "@/components/app-sidebar";
 import { PageHeader } from "@/components/page-header";
 
 export default function ItemsPage() {
   return (
     <SidebarProvider>
       <AppSidebar />
       <SidebarInset>
         <PageHeader
           breadcrumb={
             <span className="text-sm text-muted-foreground">
               <span className="font-medium text-foreground">Items</span>
             </span>
           }
         />
         <div className="p-6">
           <h1 className="text-xl font-semibold">Items</h1>
           <p className="mt-2 text-sm text-muted-foreground">
             Items module is accessible. Additional functionality is currently removed.
           </p>
         </div>
       </SidebarInset>
     </SidebarProvider>
   );
 }
