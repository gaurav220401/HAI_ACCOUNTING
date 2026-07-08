# UI Redesign Specification & Reference Guide

> **For AI Agents**: Read this ENTIRE document before making ANY UI changes.
> Reference images are in the `ui_desgin/` folder at the workspace root.
> NEVER change functionality — only visual/layout CSS changes are in scope.

---

## 1. Reference Images (Current — Use These)

**Folder:** `ui_desgin/` (relative to workspace root)

| File | What It Shows |
|------|--------------|
| `new1.webp` | Full app with sidebar, header (MetricFlow-style), invoice list table |
| `new2.webp` | Icon-only sidebar with user initials at bottom, admin panel content |
| `new3.webp` | List view with user avatar items, compact table rows |
| `new4.webp` | Compact table with status pills (In Transit, Delivered, Delayed, Pending) |
| `new5.webp` | Dashboard cards + moderation queue panel |

---

## 2. Color Tokens — TEAL THEME (NOT BLUE)

> [!IMPORTANT]
> The accent color is TEAL (`#0F766E` / `teal-700`), NOT blue. Do not use `blue-600` for accents.

### Backgrounds
| Purpose | Tailwind | Hex |
|---------|---------|-----|
| Global canvas / sidebar / content | `bg-white` | `#FFFFFF` |
| Table header | `bg-slate-50` | `#F8FAFC` |
| Hover row | `hover:bg-teal-50/30` or `hover:bg-slate-100/70` | — |
| Subtle alt bg | `bg-slate-50/50` | — |

### Text Colors
| Role | Tailwind | Hex |
|------|---------|-----|
| Brand / Logo text | `text-slate-700 font-semibold` | `#334155` |
| Heading | `text-slate-900 font-bold` | `#0F172A` |
| Breadcrumb label | `text-teal-700 text-[11px] font-medium` | `#0F766E` |
| Body | `text-slate-700` | `#334155` |
| Muted | `text-slate-500` | `#64748B` |
| Table column headers | `text-slate-500 text-[11px] uppercase tracking-wide` | — |
| Active nav item | `text-teal-700 font-semibold` | `#0F766E` |
| Inactive nav icon | `text-slate-400` | `#94A3B8` |

### Interactive / Buttons
| Element | Normal | Hover |
|---------|--------|-------|
| Primary action button | `bg-teal-600 text-white` | `hover:bg-teal-700` |
| Outline/cancel button | `border-slate-200 text-slate-600 bg-white` | `hover:bg-slate-50` |
| Icon button | `text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md` | — |
| Destructive | `text-rose-600 hover:bg-rose-50` | — |

### Status Pills
```jsx
// Pattern: inline-flex rounded-full with dot + text
<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
  <span className="h-1 w-1 rounded-full bg-emerald-500" />
  Active
</span>
```

| Status | bg | text | dot |
|--------|-----|------|-----|
| Active / Paid | `bg-emerald-50` | `text-emerald-700` | `bg-emerald-500` |
| Inactive | `bg-slate-100` | `text-slate-500` | `bg-slate-400` |
| Pending | `bg-amber-50` | `text-amber-700` | `bg-amber-500` |
| Low Stock / Danger | `bg-rose-50` | `text-rose-600` | `bg-rose-500` |
| Waiting/Purple | `bg-purple-50` | `text-purple-700` | `bg-purple-500` |

---

## 3. Layout Architecture

```
[AppSidebar — white, border-r border-slate-200/70]
  [SidebarHeader — logo + brand text]
  [SidebarContent — nav items with teal active state]
  [SidebarFooter — Settings link + User account widget]

[SidebarInset — bg-white, flex-col, h-svh]
  [PageHeader — h-14, border-b border-slate-200/70]
  [Page content — fills remaining height]
```

**SidebarInset background**: `bg-white` — NOT gray.

---

## 4. Component: AppSidebar

**File:** `client/components/app-sidebar.tsx`

### Brand Header
- Logo: `/hailogo.png`, `h-7 w-7 rounded-md`
- Brand text: `text-[15px] font-semibold tracking-tight text-slate-700` — NOT bold, NOT blue
- Collapse button: `border border-slate-200 text-slate-400 hover:bg-slate-50 rounded h-6 w-6`

### Nav Items
- Item height: `h-9`, padding: `px-3`, margin: `my-[1px]`, rounded: `rounded-lg`
- **Active**: `text-teal-700 font-semibold bg-teal-50 [&>svg]:text-teal-600`
- **Inactive**: `text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 [&>svg]:text-slate-400`
- Sub-items: `h-8 rounded-md px-2.5 text-[12px]`, border-l `border-l border-slate-100 ml-4 pl-2`
- Sub active: `text-teal-700 font-semibold bg-teal-50/60`

### Footer (IMPORTANT — user controls live HERE, not in header)
Structure:
1. `Settings` link (standard nav style, neutral)
2. **User Account Widget** (DropdownMenu trigger):
   - Trigger: avatar circle (`bg-teal-600 text-white`, initials) + name + role + chevron icon
   - Avatar uses REAL user data from `useAuth()` — `dbUser.name` or `firebaseUser.displayName` or email prefix
   - NO hardcoded names like "Laura Palmer"
   - Dropdown (opens upward, `side="top"`):
     - User info block: avatar + name + email
     - Org switcher section: lists all orgs, checkmark on active, click to switch
     - Log Out: `text-rose-600 hover:bg-rose-50`

### Removed from Sidebar
- The old separate Log Out button as a standalone item is GONE — Log Out is now inside the user dropdown

---

## 5. Component: PageHeader

**File:** `client/components/page-header.tsx`

### Layout
```
[SidebarTrigger h-7 w-7] [Separator?] [breadcrumb?]   [actions? flex-1 justify-end]   [OrgSwitcher] [Separator] [ChatIcon] [BellIcon]
```

### Rules
- Height: `h-14`
- Background: `bg-white`, border: `border-b border-slate-200/70`
- **Org switcher is visible in header** (HeaderOrgSwitcher component, compact style).
- **NO user avatar or details in header** — moved to sidebar footer.
- Right side (from left to right):
  1. Org switcher trigger dropdown button.
  2. Separator vertical `h-4 bg-slate-200 mx-1`.
  3. Chat icon: `MessageSquare h-4 w-4`, button `h-8 w-8 rounded-md hover:bg-slate-100 text-slate-400`.
  4. Bell icon: same size, with `bg-rose-500 ring-1 ring-white h-1.5 w-1.5` red dot (absolute top-right).

---

## 6. Component: Items List Page

**File:** `client/app/items/page.tsx`

### Layout
- `SidebarInset`: `bg-white` (NO gray background)
- Table container: flush (NO `p-6` wrapper), just `border-t border-slate-100`
- Header breadcrumb: `<span className="text-sm font-semibold text-slate-700">Items</span>`
- Toolbar actions (in `actions` prop): search + type filter pills + refresh + **teal** New button + dropdown

### Table
- Header row: `bg-slate-50 border-b border-slate-200`
- Header cells: `text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5`
- Body rows: `px-4 py-2`, hover `hover:bg-blue-50/20` (subtle)
- Item name link: `text-teal-700 hover:text-teal-800 hover:underline`
- Filter pills active: `bg-teal-600 text-white border-teal-600`
- New item button: `bg-teal-600 hover:bg-teal-700 text-white`
- **Loading State**: When fetching table data, show a table-structured skeleton shimmer (using `animate-pulse` or similar shimmer effect) that matches the exact column width/row structure. Never use a simple spinning wheel or generic "Loading..." text.

### Split panel (when item selected)
- Wrapper: `p-4 gap-4 bg-slate-50/50`
- Left panel: `w-80 rounded-2xl border border-slate-100 bg-white shadow-2xs`
- Active item in left panel: `bg-teal-50/50 border-l-[3px] border-l-teal-600`
- Detail tabs active: `border-teal-600 text-teal-700 font-bold`

---

## 7. Component: Form Spacing & Layout Guidelines

### General Form Design Principles
To maintain consistent, high-end professional aesthetics, all form screens must follow these layout and spacing rules to eliminate empty "unwanted" white space on wide viewports:

1. **Forms WITH Sidebar (e.g., Expense Form with receipt upload):**
   - **Structure**: Multi-column split screen. Left side holds the inputs, right side holds the upload panel/sidebar.
   - **Sizing**: Form column uses `max-w-2xl w-full` to prevent inputs from stretching excessively. Sidebar uses `w-96 border-l bg-slate-50/50`.
   - **Alignment**: Left-aligned, snap to edge layouts.

2. **Forms WITHOUT Sidebar (e.g., Recurring Expense Form, Recurring Bill Form, Item Form):**
   - **Structure**: Center-aligned, balanced two-column grid (`grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6 max-w-5xl mx-auto`).
   - **Clurrence Clustering**:
     - **Left Column**: Recurrence Schedule, General Details, Customer Settings.
     - **Right Column**: Expense Details, Accounts, Amount/Currency, Notes.
   - **Fields**: Each form row utilizes a grid of `grid grid-cols-[140px_1fr] items-center gap-4` to clean up spacing and prevent fields from stretching all the way across wide monitors.
   - **Buttons**: Positioned at the bottom, left-aligned, below a horizontal `<Separator />`.

---

## 7b. Component: Item Form

**File:** `client/app/items/_components/item-form.tsx`

### Rules
- Outer wrapper: `bg-white min-h-full flex flex-col`
- Toolbar: `px-6 py-3.5 border-b border-slate-100 bg-white sticky top-0 z-10`
- Breadcrumb: `<p className="text-[11px] font-medium text-teal-700 mb-0.5">Items</p>`
- Title: `text-lg font-bold text-slate-900 leading-none`
- Cancel: `h-8 px-4 border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-md`
- Save: `h-8 px-4 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md`
- Form body: `px-6 py-5 w-full max-w-6xl mr-auto space-y-5` (left-aligned)
- Info banner: `bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-2.5 text-[12px] text-amber-800`
- **Dynamic Field Loading**: When fetching options or detail data for relation fields (like Vendors, Customers, or Items), display a tailored shimmer/skeleton effect that represents the visual shape of the expected component (e.g. small loading input skeleton or inline text line skeletons). Avoid round spinner wheels or standard text loading placeholders.

---

## 7c. Component: Purchase Orders

**Files:**
- List Page: [client/app/purchases/orders/page.tsx](file:///c:/Users/somes/Desktop/Haldar/HAI_Accounting/client/app/purchases/orders/page.tsx)
- Create Form: [client/app/purchases/orders/new/page.tsx](file:///c:/Users/somes/Desktop/Haldar/HAI_Accounting/client/app/purchases/orders/new/page.tsx)
- Edit Form: [client/app/purchases/orders/[id]/edit/page.tsx](file:///c:/Users/somes/Desktop/Haldar/HAI_Accounting/client/app/purchases/orders/[id]/edit/page.tsx)

### List & Table Rules
- **Breadcrumb Selection**: Uses double-line page header with small teal section title `Purchases` and the active filter category dropdown (e.g. `All Purchase Orders`, `Draft Purchase Orders`) as subtitle.
- **Loading State**: Uses `TableSkeleton` for main list grids and `ListSkeleton` for details panel views during data fetching, applying pulsing `animate-pulse` blocks matching columns.
- **Active Selection**: Compact list elements use `bg-teal-50/50 border-l-[3px] border-l-teal-600` for active indicators and slate backgrounds on hover.
- **Status Badges**: Custom `StatusPill` with matching background, border, text, and dot indicator representing statuses (Draft, Open, Received, Billed, Closed, Canceled).
- **Banner Alerts**: Detail panels display status context banners utilizing soft alerts in matching status colors (amber, teal, emerald, purple, slate, rose).

### Form Rules
- **Page Breadcrumbs**: Display double-line text headers indicating the module hierarchy (e.g. `Purchases` in teal and `New Purchase Order` / `Edit Purchase Order` as secondary text).
- **Form Wrapper**: Structured inside a `SidebarInset className="bg-white flex flex-col overflow-hidden h-svh"`.
- **Primary Buttons**: Submit and save action buttons are styled as Teal primary items (`bg-teal-600 hover:bg-teal-700 text-white rounded-md`).
- **Cancel Button**: Slate borders and text (`border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-md`).

---

## 7d. Component: Login & Signup Forms

**Files:**
- Login Page: [client/app/login/page.tsx](file:///c:/Users/somes/Desktop/Haldar/HAI_Accounting/client/app/login/page.tsx)
- Signup Page: [client/app/signup/page.tsx](file:///c:/Users/somes/Desktop/Haldar/HAI_Accounting/client/app/signup/page.tsx)
- Login Form: [client/components/login-form.tsx](file:///c:/Users/somes/Desktop/Haldar/HAI_Accounting/client/components/login-form.tsx)
- Signup Form: [client/components/signup-form.tsx](file:///c:/Users/somes/Desktop/Haldar/HAI_Accounting/client/components/signup-form.tsx)

### Rules
- **Split Layout**: Widescreen two-column split (`grid lg:grid-cols-2`). Left holds the form, right holds the brand graphic cover panel.
- **Brand Cover Panel (Right)**: Fully covered by a widescreen landscape SaaS dashboard illustration (`object-cover w-full h-full`) containing real-time reports, charts, and currency symbols (Indian Rupees ₹). Features a dark teal premium gradient overlay (`from-teal-950/80 via-slate-900/40 to-transparent`) and bottom-aligned white text branding with the company logo.
- **Form Colors (Left)**: Active tab selection indicators, primary action buttons, step markers, and link anchors use the Teal theme (`bg-teal-600`, `hover:bg-teal-700`, `text-teal-700`).
- **Logo Branding**: The official logo is displayed at the top center of the form container.

---

## 8. Loading States & Shimmer Skeletons

Whenever fetching data from the backend, implement exact UI-matching shimmer/skeleton effects:

### Table/List Views (Main Section)
- **Visual Style**: Skeleton structure that mirrors the actual table row/cell structure.
- **Pattern**: Multiple rows (e.g. 5 rows) of horizontal gray blocks representing cell data, with a smooth pulsing fade-in-out shimmer animation (`animate-pulse`).
- **NO**: Simple circular spinner or "Loading..." label in the center of the screen.

### Form Fields & Selector Dropdowns (e.g., Vendor, Customer, Items Selectors)
- **Visual Style**: Compact skeleton matching the expected form control height and width.
- **Pattern**: A pulsing skeleton bar inside the custom Select trigger or inline dropdown options when loading options like vendors, customers, or items.
- **NO**: Generic loading spinners inside dropdown overlays.

---

## 9. What NOT To Change

- Any TypeScript logic, state management, API calls, hooks, routes
- Auth logic (`useAuth`, `useOrganization`)
- All dialog/modal behavior
- Nav items and their URLs in AppSidebar
- Any functionality of the DropdownMenu items (only styles)

---

## 10. Component: Dashboard Page

**File:** `client/app/dashboard/page.tsx`

### Layout & Page Header
- Background: Changed container to `bg-white` (no gray background, flush alignment).
- Breadcrumb: Styled as `<span className="text-[11px] font-medium text-teal-700 uppercase tracking-wide">Dashboard</span>`.
- Welcome Heading: Styled heading as `text-2xl font-bold text-slate-900` and description as `text-sm text-slate-500`.

### Cards & Dropdown Controls
- Receivable & Payable Cards:
  - Card borders updated to `border-slate-100 shadow-2xs`.
  - Dropdown triggers styled as outline buttons: `variant="outline" size="sm" className="h-8 px-2.5 gap-1.5 text-xs font-semibold text-slate-600 bg-white border-slate-200 hover:bg-slate-50 rounded-md shadow-2xs"`.
  - Dropdown menu items active background styled as `bg-teal-600` and focus state to `focus:bg-teal-700`. Inside icons styled as `text-teal-600`.
  - Overdue progress bars styled as soft rounded badges (`h-1.5 w-full rounded-full bg-slate-100`) with indicator colors updated to `bg-amber-500` (receivables) and `bg-rose-500` (payables).
  - Stat sub-labels current and overdue are laid out in a flex space-between pattern inside a subtle top-border border-t: `text-xs pt-1 border-t border-slate-100`.

### Cash Flow Chart
- Color scheme: Area chart line fill gradient converted to teal (`#0f766e`).
- Right-side balance indicator uses `text-teal-700` and `bg-teal-600` for active items.
- Full custom shimmer block rendering when `loadingDashboard` is true.

### Income & Expenses
- Accrual & Cash toggle buttons updated to use `bg-teal-600 text-white` for active elements.
- Income/Expense LineChart stroke widths updated to `2.5` with `#10b981` (emerald-500) for income and `#f43f5e` (rose-500) for expenses.
- Visual skeleton shimmers added for loading state.

### Top Expenses List
- Replaced plain text listings with a custom visual breakdown featuring horizontal progress bars representing the percentage of total expenses (`bg-teal-600` indicators on `bg-slate-100` tracks).
- Shimmer skeleton rows rendered when `loadingDashboard` is true.

### Low Stock Alert
- Status count pill styled to follow the standard pattern: `bg-rose-50 text-rose-600 border border-rose-100` with a `bg-rose-500` status indicator dot.
- Text sizes, SKU details, and unit values styled to align with global design system tokens.
- Replaced spinners and circular loading overlays with a custom multi-row text and value shimmer layout (`animate-pulse`).

### Bank and Credit Cards
- Row items styled with bullet dots `bg-teal-500` and border spacing.
- Visual shimmers added to match structure during data fetch.

### Account Watchlist
- Widgets styled as light cards with rounded corners: `rounded-xl border border-slate-100 bg-slate-50/30 p-4 transition-all hover:bg-slate-50/60`.
- Shimmer skeletons added for loading state.

---

## 11. Component: Quotes UI Pages

**Files:**
- List Page: `client/app/sales/quotes/page.tsx`
- Detail Page: `client/app/sales/quotes/[id]/page.tsx`
- Form Pages: `client/app/sales/quotes/new/page.tsx`, `client/app/sales/quotes/[id]/edit/page.tsx`
- Template Editor: `client/app/sales/quotes/[id]/edit-template/page.tsx`, `panels.tsx`
- Email Modal: `client/app/sales/quotes/_components/send-email-modal.tsx`

### List Page Rules
- Double-line header: Section title `Sales` in teal-700, and current view (e.g. `All Quotes`) as subtitle.
- Split screen details/list format on click, with detail card active selection styled as `bg-teal-50/50 border-l-[3px] border-l-teal-600`.
- Status pills use `StatusPill` component with appropriate color schemes for (Draft, Sent, Accepted, Declined, Invoiced, Expired).

### Detail Page Rules
- Layout matches invoice detail pages, showing transaction actions at the top (Edit, Email, Print/PDF, Convert).
- PDF customization side panel with a real-time updating live preview canvas.

### Form Pages Rules
- Form fields organized into a clean grid. Customer selection contains inline action to add new records.
- Line items are dynamically looked up from inventory. Tax and discount options are laid out in a tabular form.
- Save and submit buttons are styled in Teal primary actions (`bg-teal-600 hover:bg-teal-700 text-white`).

### Template Editor & Email Rules
- Dual column config workspace with a live mock quote render.
- Form inputs, sliders, and toggle radio buttons styled using `accent-teal-600`.
- Modals and dialog headers styled using a gradient background from `teal-600` to `teal-800`.

---

## 12. Component: Credit Notes, Delivery Challans, Recurring Invoices, and Retainer Invoices UI Pages

**Files:**
- Credit Notes: `client/app/sales/credit-notes/page.tsx`, `client/app/sales/credit-notes/[id]/edit/page.tsx`, `client/components/credit-note-form.tsx`
- Delivery Challans: `client/app/sales/delivery-challans/page.tsx`, `client/app/sales/delivery-challans/[id]/page.tsx`, `client/app/sales/delivery-challans/new/page.tsx`, `client/app/sales/delivery-challans/[id]/edit/page.tsx`
- Recurring Invoices: `client/app/sales/recurring-invoices/page.tsx`, `client/app/sales/recurring-invoices/[id]/page.tsx`, `client/app/sales/recurring-invoices/_components/recurring-invoice-form.tsx`
- Retainer Invoices: `client/app/sales/retainer-invoices/page.tsx`, `client/app/sales/retainer-invoices/new/page.tsx`, `client/app/sales/retainer-invoices/[id]/page.tsx`

### Credit Notes & Delivery Challans
- Status badges and ribbons styled using Teal-based color schemes (e.g. `bg-teal-50 text-teal-700 border-teal-300`, `bg-teal-600` for active ribbons, and `bg-teal-800` for table headers).
- Loader components updated to use `border-teal-600` or `text-teal-600` instead of primary blue.
- Bulk items and new item modals styled using `accent-teal-600` for radio/checkbox inputs and standard Teal primary colors (`bg-teal-600 hover:bg-teal-700 text-white font-semibold`) for action buttons.

### Recurring & Retainer Invoices
- Layout lists, profiles, and action menus updated to align with the Teal design theme.
- Record payment, record refund, apply/unapply buttons, and next cycle previews styled using standard Teal primary actions (`bg-teal-600 hover:bg-teal-700 text-white`).
- Breadcrumbs and internal hyperlinks updated to `text-teal-600` / `text-teal-700` and hover variants.

---

## 13. Component: Sales Orders UI Pages

**Files:**
- List Page: `client/app/sales/orders/page.tsx`
- Detail Page: `client/app/sales/orders/[id]/page.tsx`
- Form Pages: `client/app/sales/orders/new/page.tsx`, `client/app/sales/orders/[id]/edit/page.tsx`
- Email Modal: `client/app/sales/orders/[id]/send-email/page.tsx`

### Sales Orders Rules
- All action buttons and icons (e.g. Convert to Invoice, Save Draft, Save and Send) styled in Teal primary actions (`bg-teal-600 hover:bg-teal-700 text-white`).
- Form elements, inputs, and radio buttons use Teal color indicators (`accent-teal-600` and focus rings `focus:ring-teal-600/20`).
- Status pills, badges, and loader spinners styled to follow the Teal theme (`border-teal-600` loader, `text-teal-700` highlights, `bg-teal-600 text-white border-teal-600` for active filters/labels).

---

## 14. Component: Purchases Modules (Receives, Bills, Recurring Bills, Payments Made, Vendor Credits)

**Files:**
- Purchase Receives: `client/app/purchases/receives/page.tsx`, `client/app/purchases/receives/new/page.tsx`
- Bills: `client/app/purchases/bills/page.tsx`, `client/components/bill-form.tsx`, `client/app/purchases/bills/new/page.tsx`, `client/app/purchases/bills/[id]/edit/page.tsx`
- Recurring Bills: `client/app/purchases/recurring-bills/page.tsx`, `client/components/recurring-bill-form.tsx`, `client/app/purchases/recurring-bills/new/page.tsx`, `client/app/purchases/recurring-bills/[id]/edit/page.tsx`
- Payments Made: `client/app/purchases/payments-made/page.tsx`, `client/app/purchases/payments-made/_components/payment-made-editor.tsx`, `client/app/purchases/payments-made/new/page.tsx`, `client/app/purchases/payments-made/[id]/edit/page.tsx`
- Vendor Credits: `client/app/purchases/vendor-credits/page.tsx`, `client/components/vendor-credit-form.tsx`, `client/app/purchases/vendor-credits/new/page.tsx`, `client/app/purchases/vendor-credits/[id]/edit/page.tsx`

### Redesign & Rules:
- **Breadcrumbs**: Double-line layout header with small teal section title `Purchases` and the active page name/view as bold Slate subtitle.
- **Teal Accent Theme**: All primary action buttons, active filters, active tab indicators, and active table item links/selections use standard Teal color schemes (`bg-teal-600 hover:bg-teal-700 text-white`, `text-teal-700 font-semibold`, etc.).
- **Active Selections**: Compact list panels use `bg-teal-50/50 border-l-[3px] border-l-teal-600` for active indicators when split pane layout is open.
- **Status Pills**: Replace inline raw status text badges with standard `StatusPill` with matching border, background, and dot indicator representing statuses (Paid: emerald; Unpaid/Open: amber; Overdue: rose; Draft/Void: slate).
- **Loading Skeletons (Shimmer)**: Replace all central spinning wheel loader icons with visual table shimmers (`TableSkeleton`) and detail list shimmers (`ListSkeleton`) during data fetches.
- **Form Layout**: Spacing rules are strictly followed (no sidebars forms center-aligned with balanced columns, inputs restricted in widths, buttons aligned at the bottom separated by a horizontal separator).

---

## 15. Component: Dropdowns and Select Inputs (Sales and Purchases Forms)

### Rules & Guidelines:
- **Teal Focus/Hover Themes**: All custom dropdown selection triggers (such as `SelectTrigger` or custom buttons) must use a Teal focus outline/ring (`focus:border-teal-500 focus:ring-teal-500/20` or similar).
- **SelectItem Styling**: Dropdown selection menu option lists (such as `SelectItem`) must use Teal background highlights on hover/focus (`focus:bg-teal-50 focus:text-teal-700` and dark mode equivalents). Check indicators/active marks should use Teal (`text-teal-600`).
- **Dynamic Shimmer Loaders**: When any form loads vendor, customer, item, account, or tax data from the backend, show a dropdown shimmer/skeleton loader.
  - **Visual Design**: The loading dropdown should render a pulsing rounded input-sized container with a loading placeholder text (e.g. `Loading vendors...`) and a ChevronDown icon, both styled in soft gray (`text-slate-400 bg-slate-100/80 animate-pulse border border-slate-200`).
  - **NO**: Empty dropdowns, standard loading spinning wheels, or generic text placeholders in place of fields.



