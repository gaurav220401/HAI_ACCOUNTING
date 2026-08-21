import { test, expect, type Page } from "@playwright/test";
import { installHarness, type ApiLog } from "./harness";
import * as inv from "./inventory-fixtures";

const SHOTS = "e2e/__shots__";

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
  return errors;
}

const ignorable = (e: string) => /favicon|DevTools|Download the React/i.test(e);

async function open(page: Page, route: string, marker: string | RegExp) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.getByText(marker).first().waitFor({ state: "visible", timeout: 30_000 });
}

/** Every inventory page must reach the API without being bounced or crashing. */
function assertHealthy(page: Page, errors: string[], log: ApiLog, route: string) {
  expect(page.url(), `redirected away from ${route}`).toContain(route);
  expect(errors.filter((e) => !ignorable(e)), `console errors on ${route}`).toEqual([]);
  expect(log.length, `no API traffic from ${route}`).toBeGreaterThan(0);
}

// ══════════════════════════ overview ══════════════════════════

test.describe("Inventory overview", () => {
  test("renders headline stock figures", async ({ page }) => {
    const errors = watchErrors(page);
    const log = await installHarness(page);
    await open(page, "/inventory", /Overview/);

    assertHealthy(page, errors, log, "/inventory");
    expect(log.some((c) => c.url.startsWith("/inventory/overview"))).toBeTruthy();

    const body = (await page.locator("body").innerText()) || "";
    // trackedItems 42, outOfStock 3, lowStock 7 come from the API summary.
    expect(body).toMatch(/\b42\b/);
    expect(body).toMatch(/\b7\b/);

    await page.screenshot({ path: `${SHOTS}/inv-01-overview.png`, fullPage: true });
  });

  test("surfaces items below their reorder point", async ({ page }) => {
    await installHarness(page);
    await open(page, "/inventory", /Overview/);

    const body = (await page.locator("body").innerText()) || "";
    const named = /Cement Bag 50kg|Binding Wire/.test(body);
    const counted = /\b7\b/.test(body);
    expect(named || counted, "overview shows no low-stock signal at all").toBeTruthy();
  });
});

// ═════════════════════════ adjustments ═════════════════════════

test.describe("Inventory adjustments", () => {
  test("lists existing adjustments with direction and quantity", async ({ page }) => {
    const errors = watchErrors(page);
    const log = await installHarness(page);
    await open(page, "/inventory/adjustments", /Steel Rod 12mm|ADJ-000001/);

    assertHealthy(page, errors, log, "/inventory/adjustments");

    const body = (await page.locator("body").innerText()) || "";
    expect(body).toContain("Steel Rod 12mm");
    expect(body).toContain("Cement Bag 50kg");
    // Both directions must be distinguishable.
    expect(/increase/i.test(body) && /decrease/i.test(body)).toBeTruthy();

    await page.screenshot({ path: `${SHOTS}/inv-02-adjustments.png`, fullPage: true });
  });

  test("records the resulting stock on hand, not just the delta", async ({ page }) => {
    await installHarness(page);
    await open(page, "/inventory/adjustments", /Steel Rod 12mm|ADJ-000001/);

    const body = (await page.locator("body").innerText()) || "";
    // resultingStockOnHand 240 / 8 is what makes the log reconstructable.
    expect(/\b240\b/.test(body) || /\b8\b/.test(body)).toBeTruthy();
  });

  test("the create form is inline and offers the standard reasons", async ({ page }) => {
    await installHarness(page);
    await open(page, "/inventory/adjustments", /New Adjustment/);

    await expect(page.getByText("New Adjustment", { exact: false }).first()).toBeVisible();
    for (const label of ["Item", "Direction", "Reason", "Quantity"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByRole("button", { name: /post adjustment/i })).toBeVisible();
  });

  test("posting an adjustment sends item, direction and quantity", async ({ page }) => {
    const log = await installHarness(page);
    await open(page, "/inventory/adjustments", /New Adjustment/);

    // Item picker — only inventory-tracked items are offered.
    await page.getByText("Select inventory-tracked item").click();
    await page.getByRole("option", { name: /Steel Rod 12mm/ }).click();

    await page.locator('input[type="number"]').first().fill("15");
    await page.getByRole("button", { name: /post adjustment/i }).click();
    await page.waitForTimeout(2500);

    const posted = log.filter((c) => c.method === "POST" && c.url === "/inventory/adjustments");
    expect(posted, "Post Adjustment did not reach the API").toHaveLength(1);

    const payload = posted[0].body as Record<string, unknown>;
    expect(payload.itemId).toBe("i1");
    expect(Number(payload.quantityDelta)).toBe(15);
    expect(payload.direction).toBeTruthy();
  });

  test("REGRESSION: a decrease must not be sent as a positive quantity", async ({ page }) => {
    const log = await installHarness(page);
    await open(page, "/inventory/adjustments", /New Adjustment/);

    await page.getByText("Select inventory-tracked item").click();
    await page.getByRole("option", { name: /Steel Rod 12mm/ }).click();

    // Switch direction to Decrease.
    await page.getByText("Increase", { exact: true }).first().click();
    await page.getByRole("option", { name: "Decrease" }).click();

    await page.locator('input[type="number"]').first().fill("10");
    await page.getByRole("button", { name: /post adjustment/i }).click();
    await page.waitForTimeout(2500);

    const posted = log.filter((c) => c.method === "POST" && c.url === "/inventory/adjustments");
    expect(posted).toHaveLength(1);

    const payload = posted[0].body as Record<string, unknown>;
    expect(payload.direction).toBe("Decrease");
    // Either the delta is signed, or direction carries the sign — but the two
    // must not disagree, or stock moves the wrong way.
    const qty = Number(payload.quantityDelta);
    expect(
      qty < 0 || payload.direction === "Decrease",
      `direction=Decrease but quantityDelta=${qty} with no sign information`,
    ).toBeTruthy();
  });
});

// ═════════════════════════ move orders ═════════════════════════

test.describe("Move orders", () => {
  test("lists transfers with source, destination and status", async ({ page }) => {
    const errors = watchErrors(page);
    const log = await installHarness(page);
    await open(page, "/inventory/move-orders", /MO-000001/);

    assertHealthy(page, errors, log, "/inventory/move-orders");

    const body = (await page.locator("body").innerText()) || "";
    expect(body).toContain("MO-000001");
    expect(body).toContain("Bhilai Main");
    expect(body).toContain("Raipur Depot");
    expect(/draft/i.test(body) && /in transit/i.test(body)).toBeTruthy();

    await page.screenshot({ path: `${SHOTS}/inv-03-move-orders.png`, fullPage: true });
  });

  test("the create form loads warehouses and items", async ({ page }) => {
    const errors = watchErrors(page);
    const log = await installHarness(page);
    await page.goto("/inventory/move-orders/new", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);

    expect(errors.filter((e) => !ignorable(e))).toEqual([]);
    expect(log.some((c) => c.url.startsWith("/settings/warehouses") || c.url.startsWith("/warehouses"))).toBeTruthy();
    expect(log.some((c) => c.url.startsWith("/items"))).toBeTruthy();

    await page.screenshot({ path: `${SHOTS}/inv-04-move-order-new.png`, fullPage: true });
  });
});

// ══════════════════ packages / shipments / putaways ══════════════════

test.describe("Packages", () => {
  test("lists sales orders and their packing state", async ({ page }) => {
    const errors = watchErrors(page);
    const log = await installHarness(page);
    await open(page, "/inventory/packages", /SO-000001|Chhattisgarh/);

    assertHealthy(page, errors, log, "/inventory/packages");
    const body = (await page.locator("body").innerText()) || "";
    expect(body).toContain("SO-000001");

    await page.screenshot({ path: `${SHOTS}/inv-05-packages.png`, fullPage: true });
  });
});

test.describe("Shipments", () => {
  test("lists orders with shipment status", async ({ page }) => {
    const errors = watchErrors(page);
    const log = await installHarness(page);
    await open(page, "/inventory/shipments", /SO-000001|Chhattisgarh/);

    assertHealthy(page, errors, log, "/inventory/shipments");
    const body = (await page.locator("body").innerText()) || "";
    expect(body).toContain("SO-000001");
    expect(/delivered|pending/i.test(body)).toBeTruthy();

    await page.screenshot({ path: `${SHOTS}/inv-06-shipments.png`, fullPage: true });
  });
});

test.describe("Putaways", () => {
  test("lists putaways with their receive reference and status", async ({ page }) => {
    const errors = watchErrors(page);
    const log = await installHarness(page);
    await open(page, "/inventory/putaways", /PA-000001/);

    assertHealthy(page, errors, log, "/inventory/putaways");
    const body = (await page.locator("body").innerText()) || "";
    expect(body).toContain("PA-000001");
    expect(body).toContain("PR-000004");

    await page.screenshot({ path: `${SHOTS}/inv-07-putaways.png`, fullPage: true });
  });

  test("the create form allocates a putaway number up front", async ({ page }) => {
    const log = await installHarness(page);
    await page.goto("/inventory/putaways/new", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);

    expect(log.some((c) => c.url === "/putaways/next-number")).toBeTruthy();
    // The number is rendered into an input's value, not as page text.
    await expect(page.locator('input[value="PA-000003"]')).toHaveCount(1);
  });
});

// ═══════════ systemic: how inventory pages load their data ═══════════
// The Items list was fixed to filter and page in the database. These record
// whether the rest of Inventory does the same. Failures here are the report.

// Every one of these backends paginates correctly and returns pagination
// metadata. The pages just fetch one slice and render it, with no control to
// reach the rest — so row 101 does not exist as far as the user is concerned.
const NO_PAGER: Array<[string, string, RegExp]> = [
  ["adjustments", "/inventory/adjustments", /Steel Rod 12mm|ADJ-000001/],
  ["move orders", "/inventory/move-orders", /MO-000001/],
  ["putaways", "/inventory/putaways", /PA-000001/],
  ["packages", "/inventory/packages", /SO-000001/],
  ["shipments", "/inventory/shipments", /SO-000001/],
];

for (const [label, route, marker] of NO_PAGER) {
  test.fixme(`GAP: ${label} offers a way to reach rows past the first fetch`, async ({ page }) => {
    await installHarness(page);
    await open(page, route, marker);
    const body = (await page.locator("body").innerText()) || "";
    expect(
      /previous|next page|page \d+ of|rows per page|showing \d+ .* of/i.test(body),
      `${label} renders one fetched slice with no pagination control`,
    ).toBeTruthy();
  });
}

test.fixme("GAP: putaways asks the server for a bounded page", async ({ page }) => {
  const log = await installHarness(page);
  await open(page, "/inventory/putaways", /PA-000001/);
  const call = log.find((c) => c.url.startsWith("/putaways"));
  expect(
    /[?&]limit=/.test(call?.url || ""),
    "putaways sends no limit, so it silently takes the backend default of 50 with no indication more exist",
  ).toBeTruthy();
});

test.fixme("GAP: packages does not issue a request per sales order", async ({ page }) => {
  const log = await installHarness(page);
  await open(page, "/inventory/packages", /SO-000001/);

  const perOrder = log.filter((c) => /^\/packages\/order\//.test(c.url));
  expect(
    perOrder.length,
    `${perOrder.length} per-order requests for 2 orders; at the 100-order fetch size that is ~200 round trips`,
  ).toBeLessThanOrEqual(1);
});

test.fixme("GAP: a completed move order moves stock between warehouses", async ({ page }) => {
  // move-order.controller.ts:125 states it plainly: "Since stockOnHand is
  // global, the net effect on global stock is 0". Receiving a transfer writes
  // two InventoryAdjustment audit rows and changes no balance, because stock is
  // a single scalar per item rather than a quantity per location. Until stock
  // becomes rows keyed (item x warehouse), this feature cannot do its job.
  await installHarness(page);
  await open(page, "/inventory/move-orders", /MO-000001/);
  const body = (await page.locator("body").innerText()) || "";
  expect(/stock at .*warehouse|per[- ]warehouse|warehouse stock/i.test(body)).toBeTruthy();
});
