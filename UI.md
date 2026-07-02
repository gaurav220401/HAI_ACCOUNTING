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

### Split panel (when item selected)
- Wrapper: `p-4 gap-4 bg-slate-50/50`
- Left panel: `w-80 rounded-2xl border border-slate-100 bg-white shadow-2xs`
- Active item in left panel: `bg-teal-50/50 border-l-[3px] border-l-teal-600`
- Detail tabs active: `border-teal-600 text-teal-700 font-bold`

---

## 7. Component: Item Form

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

---

## 8. What NOT To Change

- Any TypeScript logic, state management, API calls, hooks, routes
- Auth logic (`useAuth`, `useOrganization`)
- All dialog/modal behavior
- Nav items and their URLs in AppSidebar
- Any functionality of the DropdownMenu items (only styles)
