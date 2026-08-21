import type { Page, Route } from "@playwright/test";
import * as inv from "./inventory-fixtures";

/**
 * Test harness: signs the browser in and mocks the backend.
 *
 * Auth — Firebase persists the signed-in user in localStorage under
 * `firebase:authUser:<apiKey>:[DEFAULT]`. Seeding that key before any script
 * runs makes `onIdTokenChanged` fire with a restored session, so the app's auth
 * gates open without real credentials. The access token is given a far-future
 * expiry so the SDK never attempts a network refresh.
 *
 * API — every `/api/**` call is answered from the fixtures below, so these
 * tests need no MongoDB and no backend process.
 */

/**
 * Must match NEXT_PUBLIC_FIREBASE_API_KEY as the dev server actually resolves
 * it — Next reads `.env.local`, which wins over anything the test runner
 * exports. The localStorage key Firebase persists under embeds this value, so a
 * mismatch means the seeded session is silently ignored.
 */
export const API_KEY = "AIzaSyDUMMY-local-preview-key-0000000000";
export const ORG_ID = "6600000000000000000000a1";

const FAR_FUTURE = Date.now() + 1000 * 60 * 60 * 24 * 365;

export const fixtures = {
  units: [
    { _id: "u1", name: "Pieces", abbreviation: "pcs" },
    { _id: "u2", name: "Kilogram", abbreviation: "kg" },
    { _id: "u3", name: "Box", abbreviation: "box" },
  ],
  groups: [
    { _id: "g1", name: "Raw Material", parentId: null, description: "" },
    { _id: "g2", name: "Finished Goods", parentId: null, description: "" },
  ],
  taxes: [
    { _id: "t1", name: "GST 18%", rate: 18, taxType: "Simple" },
    { _id: "t2", name: "GST 5%", rate: 5, taxType: "Simple" },
    { _id: "t3", name: "GST 12%", rate: 12, taxType: "Simple" },
  ],
  warehouses: [
    { _id: "w1", name: "Bhilai Main", isPrimary: true },
    { _id: "w2", name: "Raipur Depot", isPrimary: false },
  ],
  accounts: [
    { _id: "a1", name: "Sales", rootType: "Income", accountType: "Income", isGroup: false },
    { _id: "a2", name: "Cost of Goods Sold", rootType: "Expense", accountType: "Cost Of Goods Sold", isGroup: false },
    { _id: "a3", name: "Inventory Asset", rootType: "Asset", accountType: "Stock", isGroup: false },
  ],
  contacts: [
    { _id: "c1", displayName: "Shree Traders", contactType: "Vendor" },
    { _id: "c2", displayName: "Acme Supplies", contactType: "Vendor" },
  ],
  items: [
    {
      _id: "i1",
      organizationId: ORG_ID,
      itemType: "Goods",
      itemMode: "SingleItem",
      name: "Steel Rod 12mm",
      sku: "SR-12",
      hsnSacCode: "7214",
      sellingPrice: 640,
      costPrice: 520,
      taxPreference: "Taxable",
      inventoryTracked: true,
      stockOnHand: 240,
      committedStock: 30,
      inventoryValue: 124800,
      averageCost: 520,
      reorderPoint: 50,
      valuationMethod: "MovingAverage",
      isActive: true,
      unit: { _id: "u1", name: "Pieces", abbreviation: "pcs" },
      itemGroupId: { _id: "g1", name: "Raw Material" },
      createdAt: "2026-01-10T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    },
    {
      _id: "i2",
      organizationId: ORG_ID,
      itemType: "Goods",
      itemMode: "SingleItem",
      name: "Cement Bag 50kg",
      sku: "CEM-50",
      hsnSacCode: "2523",
      sellingPrice: 410,
      costPrice: 355,
      taxPreference: "Taxable",
      inventoryTracked: true,
      stockOnHand: 8,
      committedStock: 0,
      inventoryValue: 2840,
      averageCost: 355,
      reorderPoint: 40,
      valuationMethod: "MovingAverage",
      isActive: true,
      unit: { _id: "u3", name: "Box", abbreviation: "box" },
      itemGroupId: { _id: "g1", name: "Raw Material" },
      createdAt: "2026-02-02T00:00:00.000Z",
      updatedAt: "2026-07-02T00:00:00.000Z",
    },
    {
      _id: "i3",
      organizationId: ORG_ID,
      itemType: "Service",
      itemMode: "SingleItem",
      name: "Freight — Local Delivery",
      sku: "",
      hsnSacCode: "996511",
      sellingPrice: 2500,
      costPrice: 0,
      taxPreference: "Taxable",
      inventoryTracked: false,
      stockOnHand: 0,
      committedStock: 0,
      inventoryValue: 0,
      averageCost: 0,
      reorderPoint: 0,
      valuationMethod: "MovingAverage",
      isActive: true,
      unit: null,
      itemGroupId: null,
      createdAt: "2026-03-05T00:00:00.000Z",
      updatedAt: "2026-07-03T00:00:00.000Z",
    },
  ],
};

/**
 * 137 items — deliberately more than one page and more than the old hard-coded
 * 200-row fetch, so a regression back to client-side filtering is detectable.
 */
export const bulkItems = [
  ...fixtures.items,
  ...Array.from({ length: 134 }, (_, n) => ({
    ...fixtures.items[0],
    _id: `bulk${n}`,
    name: `Bulk Part ${String(n + 1).padStart(3, "0")}`,
    sku: `BP-${String(n + 1).padStart(3, "0")}`,
    hsnSacCode: "8481",
    sellingPrice: 100 + n,
    costPrice: 60 + n,
    stockOnHand: 100 + n,
    reorderPoint: 0,
  })),
];

/** Records every API call the UI makes, so tests can assert on traffic. */
export type ApiLog = { method: string; url: string; body?: unknown }[];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function paginated(data: unknown[]) {
  return { data, pagination: { total: data.length, page: 1, limit: 25, pages: 1 } };
}

export interface HarnessOptions {
  /**
   * Serve the 137-item set instead of the 3-item one. Used by the pagination
   * and deep-search tests; the small set keeps the other tests' first page
   * predictable.
   */
  bulk?: boolean;
}

export async function installHarness(page: Page, opts: HarnessOptions = {}): Promise<ApiLog> {
  const log: ApiLog = [];
  const catalogue = opts.bulk ? bulkItems : fixtures.items;

  // ── 1. Seed a restored Firebase session ────────────────────────────
  await page.addInitScript(
    ({ apiKey, exp, orgId }) => {
      const user = {
        uid: "e2e-uid-0001",
        email: "owner@msme.test",
        emailVerified: true,
        displayName: "Rishabh Haldar",
        isAnonymous: false,
        photoURL: null,
        phoneNumber: null,
        tenantId: null,
        providerData: [
          {
            providerId: "password",
            uid: "owner@msme.test",
            displayName: "Rishabh Haldar",
            email: "owner@msme.test",
            phoneNumber: null,
            photoURL: null,
          },
        ],
        stsTokenManager: {
          refreshToken: "e2e-refresh-token",
          accessToken: "e2e-access-token",
          expirationTime: exp,
        },
        createdAt: String(Date.now() - 100000),
        lastLoginAt: String(Date.now()),
        apiKey,
        appName: "[DEFAULT]",
      };
      window.localStorage.setItem(
        `firebase:authUser:${apiKey}:[DEFAULT]`,
        JSON.stringify(user),
      );
      // The org context caches the active org locally too.
      window.localStorage.setItem("activeOrganization", JSON.stringify({ _id: orgId, name: "Haldar AI" }));
    },
    { apiKey: API_KEY, exp: FAR_FUTURE, orgId: ORG_ID },
  );

  // ── 2. Neutralise Firebase's own network calls ─────────────────────
  await page.route("**/*googleapis.com/**", (route) =>
    json(route, { users: [{ localId: "e2e-uid-0001", emailVerified: true }] }),
  );

  // ── 3. Mock the backend ────────────────────────────────────────────
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api/, "");
    const method = req.method();

    let body: unknown;
    try {
      body = req.postDataJSON();
    } catch {
      body = undefined;
    }
    log.push({ method, url: path + url.search, body });

    // --- auth / org ---
    if (path === "/auth/me") {
      return json(route, {
        user: {
          id: "dbuser1",
          firebaseUid: "e2e-uid-0001",
          name: "Rishabh Haldar",
          email: "owner@msme.test",
          phone: null,
          dob: null,
          gender: "",
          photoURL: "",
          provider: "email",
          profileComplete: true,
          activeOrganization: ORG_ID,
          roles: ["Admin"],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      });
    }
    if (path.startsWith("/organizations")) {
      if (method === "GET" && path === "/organizations") {
        return json(route, {
          data: [{ _id: ORG_ID, name: "Haldar AI", baseCurrency: "INR", country: "India", fiscalYearStart: 4 }],
        });
      }
      return json(route, { success: true, data: { _id: ORG_ID, name: "Haldar AI" } });
    }

    // --- item sub-resources (must precede /items) ---
    if (path === "/items/groups") {
      if (method === "POST") return json(route, { data: { _id: "gNew", ...(body as object) } });
      return json(route, { data: fixtures.groups });
    }
    if (path === "/items/units") {
      if (method === "POST") return json(route, { data: { _id: "uNew", ...(body as object) } });
      return json(route, { data: fixtures.units });
    }
    if (path === "/items/units/seed") return json(route, { message: "seeded" });

    // --- items ---
    // Mirrors the real endpoint: search, type, sort and paging are all applied
    // here, so the tests prove the client is delegating rather than filtering
    // a slice locally.
    if (path === "/items" && method === "GET") {
      const q = (url.searchParams.get("search") || "").toLowerCase().trim();
      const type = url.searchParams.get("type");
      const sortBy = url.searchParams.get("sortBy") || "name";
      const sortOrder = url.searchParams.get("sortOrder") || "asc";
      const pageNo = Math.max(1, Number(url.searchParams.get("page")) || 1);
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 25));

      let rows = [...catalogue];
      if (q) {
        rows = rows.filter(
          (i) =>
            i.name.toLowerCase().includes(q) ||
            (i.sku || "").toLowerCase().includes(q) ||
            (i.hsnSacCode || "").toLowerCase().includes(q),
        );
      }
      if (type) rows = rows.filter((i) => i.itemType === type);

      const pick = (row: (typeof rows)[number]) => {
        switch (sortBy) {
          case "rate": return row.sellingPrice;
          case "purchaseRate": return row.costPrice;
          case "stock": return row.stockOnHand;
          case "hsn": return row.hsnSacCode;
          case "sku": return row.sku;
          default: return row.name;
        }
      };
      rows.sort((a, b) => {
        const av = pick(a);
        const bv = pick(b);
        if (av === bv) return 0;
        const cmp = typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
        return sortOrder === "desc" ? -cmp : cmp;
      });

      const total = rows.length;
      const start = (pageNo - 1) * limit;
      return json(route, {
        data: rows.slice(start, start + limit),
        pagination: { total, page: pageNo, limit, pages: Math.max(1, Math.ceil(total / limit)) },
        // Aggregates cover the whole filtered set, exactly as the API does.
        summary: {
          totalItems: total,
          totalStock: rows.reduce((s, r) => s + Number(r.stockOnHand || 0), 0),
          goodsCount: rows.filter((r) => r.itemType === "Goods").length,
          servicesCount: rows.filter((r) => r.itemType === "Service").length,
        },
      });
    }
    if (path === "/items" && method === "POST") {
      return json(route, { data: { _id: "iNew", ...(body as object) } });
    }
    const itemMatch = path.match(/^\/items\/([^/]+)$/);
    if (itemMatch) {
      const found = fixtures.items.find((i) => i._id === itemMatch[1]) || fixtures.items[0];
      if (method === "DELETE") return json(route, { success: true });
      if (method === "PATCH" || method === "PUT") return json(route, { data: { ...found, ...(body as object) } });
      return json(route, { data: found });
    }
    if (/^\/items\/[^/]+\/inventory-metrics$/.test(path)) {
      return json(route, {
        data: {
          stockOnHand: 240, committedStock: 30, availableForSale: 210,
          inventoryValue: 124800, averageCost: 520,
          quantityIn: 400, quantityOut: 160,
        },
      });
    }
    if (/^\/items\/[^/]+\/clone$/.test(path)) {
      return json(route, { data: { ...fixtures.items[0], _id: "iClone", name: "Steel Rod 12mm (Copy)" } });
    }
    if (path === "/items/bulk-actions") {
      return json(route, { data: { matched: 2, modified: 2, message: "ok" } });
    }

    // --- inventory ---
    if (path === "/inventory/overview") return json(route, { data: inv.overview });
    if (path === "/inventory/adjustments") {
      if (method === "POST") {
        return json(route, { data: { _id: "adjNew", ...(body as object) } });
      }
      const itemId = url.searchParams.get("itemId");
      const rows = itemId
        ? inv.adjustments.filter((a) => (a.itemId as { _id: string })._id === itemId)
        : inv.adjustments;
      return json(route, paginated(rows));
    }
    if (path.startsWith("/inventory/sync/")) {
      return json(route, { data: { stockOnHand: 240 } });
    }

    if (path === "/move-orders") {
      if (method === "POST") return json(route, { data: { _id: "moNew", ...(body as object) } });
      return json(route, paginated(inv.moveOrders));
    }
    const moStatus = path.match(/^\/move-orders\/([^/]+)\/status$/);
    if (moStatus) {
      const found = inv.moveOrders.find((m) => m._id === moStatus[1]) || inv.moveOrders[0];
      return json(route, { data: { ...found, ...(body as object) } });
    }
    const moOne = path.match(/^\/move-orders\/([^/]+)$/);
    if (moOne) {
      const found = inv.moveOrders.find((m) => m._id === moOne[1]) || inv.moveOrders[0];
      if (method === "DELETE") return json(route, { success: true });
      return json(route, { data: found });
    }

    if (path === "/putaways/next-number") return json(route, { data: { putawayNumber: "PA-000003" } });
    if (path === "/putaways/pending") return json(route, { data: [] });
    if (path === "/putaways") {
      if (method === "POST") return json(route, { data: { _id: "paNew", ...(body as object) } });
      return json(route, { data: inv.putaways, pagination: { total: inv.putaways.length, page: 1, limit: 25, pages: 1 } });
    }

    const pkgByOrder = path.match(/^\/packages\/order\/([^/]+)$/);
    if (pkgByOrder) return json(route, { data: inv.packagesByOrder[pkgByOrder[1]] ?? [] });
    if (path === "/packages" && method === "POST") {
      return json(route, { data: { _id: "pkgNew", ...(body as object) } });
    }

    if (path.startsWith("/sales-orders")) {
      const one = path.match(/^\/sales-orders\/([^/]+)$/);
      if (one) {
        const found = inv.salesOrders.find((s) => s._id === one[1]) || inv.salesOrders[0];
        return json(route, { data: found });
      }
      return json(route, paginated(inv.salesOrders));
    }

    // --- lookups used by the item form ---
    // /accounts/for-item returns accounts GROUPED by accountType
    // (Record<string, Account[]>), not a flat array — AccountSelect calls
    // .map() on the grouped value, so the wrong shape crashes the whole form.
    if (path === "/accounts/for-item") {
      const section = url.searchParams.get("section");
      return json(route, {
        data:
          section === "purchase"
            ? { "Cost Of Goods Sold": [fixtures.accounts[1]], Stock: [fixtures.accounts[2]] }
            : { Income: [fixtures.accounts[0]] },
      });
    }
    if (path.startsWith("/accounts")) return json(route, { data: fixtures.accounts });
    if (path.startsWith("/taxes") || path.startsWith("/settings/taxes")) return json(route, { data: fixtures.taxes });
    if (path.startsWith("/warehouses") || path.startsWith("/settings/warehouses")) {
      return json(route, { data: fixtures.warehouses });
    }
    if (path.startsWith("/contacts")) return json(route, paginated(fixtures.contacts));
    if (path.startsWith("/projects/time-logs/active")) return json(route, { data: [] });
    if (path.startsWith("/currencies")) return json(route, { data: [{ _id: "cur1", code: "INR", symbol: "₹", name: "Indian Rupee" }] });

    // --- anything unmodelled: empty but well-shaped ---
    return json(route, { data: [], pagination: { total: 0, page: 1, limit: 25, pages: 0 } });
  });

  return log;
}

/**
 * Navigates to the items list and waits for real data.
 *
 * `networkidle` is not enough: the list fetch is fired by an effect that first
 * waits for the org context to resolve, so the page can be "idle" before it has
 * asked for anything. Waiting on rendered content is the only reliable signal.
 */
export async function gotoItems(page: Page, opts: HarnessOptions = {}) {
  await page.goto("/items", { waitUntil: "domcontentloaded" });
  // With the bulk catalogue the fixture items sort onto a later page, so wait
  // for the first row of the bulk set instead.
  const marker = opts.bulk ? "Bulk Part 001" : fixtures.items[0].name;
  await page.getByText(marker, { exact: false }).first().waitFor({ state: "visible", timeout: 30_000 });
}
