import { test, expect, type Page } from "@playwright/test";
import { installHarness, gotoItems, fixtures } from "./harness";

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

// ───────────────────────────── list ─────────────────────────────

test.describe("Items list", () => {
  test("loads without client errors and renders every item", async ({ page }) => {
    const errors = watchErrors(page);
    const log = await installHarness(page);
    await gotoItems(page);

    expect(page.url()).toContain("/items");
    expect(log.some((c) => c.method === "GET" && c.url.startsWith("/items"))).toBeTruthy();

    for (const item of fixtures.items) {
      await expect(page.getByText(item.name, { exact: false }).first()).toBeVisible();
    }

    await page.screenshot({ path: `${SHOTS}/01-list.png` });
    expect(errors.filter((e) => !ignorable(e))).toEqual([]);
  });

  test("shows rate, cost, stock and HSN for a tracked item", async ({ page }) => {
    await installHarness(page);
    await gotoItems(page);

    const row = page.locator("tbody tr", { hasText: "Steel Rod 12mm" }).first();
    await expect(row).toContainText("640.00"); // selling rate
    await expect(row).toContainText("520.00"); // purchase rate
    await expect(row).toContainText("240");    // stock on hand
    await expect(row).toContainText("7214");   // HSN
    await expect(row).toContainText("pcs");    // usage unit
  });

  test("flags an item below its reorder point", async ({ page }) => {
    await installHarness(page);
    await gotoItems(page);

    // Cement: 8 on hand against a reorder point of 40.
    const row = page.locator("tbody tr", { hasText: "Cement Bag 50kg" }).first();
    await expect(row).toContainText(/low stock/i);
  });

  test("a service item carries no stock figure", async ({ page }) => {
    await installHarness(page);
    await gotoItems(page);

    const row = page.locator("tbody tr", { hasText: "Freight" }).first();
    await expect(row).toContainText("996511"); // SAC code still shown
    await expect(row).not.toContainText(/low stock/i);
  });

  // ── the D2 fix: filtering, sorting and paging must happen server-side ──

  test("search is resolved server-side, not by filtering a local slice", async ({ page }) => {
    const log = await installHarness(page);
    await gotoItems(page);
    const before = log.length;

    await page.getByPlaceholder("Search items...").fill("cement");

    await expect
      .poll(() => log.slice(before).filter((c) => /[?&]search=cement/i.test(c.url)).length, {
        timeout: 15_000,
      })
      .toBeGreaterThan(0);

    await expect(page.getByText("Cement Bag 50kg").first()).toBeVisible();
    await expect(page.getByText("Steel Rod 12mm")).toHaveCount(0);
  });

  test("search input is debounced to one request per pause", async ({ page }) => {
    const log = await installHarness(page);
    await gotoItems(page);
    const before = log.length;

    await page.getByPlaceholder("Search items...").pressSequentially("cement", { delay: 40 });
    await page.waitForTimeout(2500);

    const searchCalls = log.slice(before).filter((c) => /[?&]search=/i.test(c.url));
    expect(searchCalls.length, "each keystroke should not issue its own request").toBeLessThanOrEqual(2);
  });

  test("finds an item far beyond the first page", async ({ page }) => {
    // Bulk Part 130 sorts well past page 1 of 137 items. Under the old
    // client-side filter over a fixed slice, this is exactly what went missing.
    await installHarness(page, { bulk: true });
    await gotoItems(page, { bulk: true });

    await page.getByPlaceholder("Search items...").fill("BP-130");
    await expect(page.getByText("Bulk Part 130").first()).toBeVisible({ timeout: 15_000 });
  });

  test("paginates: reports the full total and walks pages", async ({ page }) => {
    const log = await installHarness(page, { bulk: true });
    await gotoItems(page, { bulk: true });

    const range = page.getByTestId("items-range");
    await expect(range).toContainText("137"); // full result set, not just this page
    await expect(page.getByTestId("items-page-indicator")).toContainText("Page 1 of 3");
    await expect(page.getByTestId("items-prev")).toBeDisabled();

    await page.getByTestId("items-next").click();
    await expect(page.getByTestId("items-page-indicator")).toContainText("Page 2 of 3");
    expect(log.some((c) => /[?&]page=2/.test(c.url))).toBeTruthy();
    await expect(page.getByTestId("items-prev")).toBeEnabled();

    await page.screenshot({ path: `${SHOTS}/04-pagination.png` });
  });

  test("changing rows-per-page refetches and resets to page 1", async ({ page }) => {
    const log = await installHarness(page, { bulk: true });
    await gotoItems(page, { bulk: true });

    await page.getByTestId("items-next").click();
    await expect(page.getByTestId("items-page-indicator")).toContainText("Page 2 of 3");

    await page.getByTestId("items-page-size").selectOption("100");

    await expect(page.getByTestId("items-page-indicator")).toContainText("Page 1 of 2");
    expect(log.some((c) => /[?&]limit=100/.test(c.url))).toBeTruthy();
  });

  test("column sort is delegated to the server", async ({ page }) => {
    const log = await installHarness(page);
    await gotoItems(page);
    const before = log.length;

    // The sort control is a button inside the <th>, not the header cell itself.
    await page.getByRole("button", { name: /^Stock On Hand/i }).first().click();

    await expect
      .poll(() => log.slice(before).filter((c) => /[?&]sortBy=stock/i.test(c.url)).length, { timeout: 15_000 })
      .toBeGreaterThan(0);
  });

  test("headline totals describe the whole result set, not the page", async ({ page }) => {
    await installHarness(page, { bulk: true });
    await gotoItems(page, { bulk: true });

    // 137 items across 3 pages of 50 — the card must not read 50.
    await expect(page.getByText("137").first()).toBeVisible();
  });
});

// ───────────────────────── create form ─────────────────────────

async function gotoNewItem(page: Page) {
  await page.goto("/items/new", { waitUntil: "domcontentloaded" });
  await page.getByText("Item Name", { exact: false }).first().waitFor({ timeout: 30_000 });
}

/** Enables the inventory block, which is collapsed by default. */
async function enableInventory(page: Page) {
  await page.getByText("Track Inventory for this item", { exact: false }).first().click();
  await page.getByText("Valuation Method", { exact: false }).first().waitFor({ timeout: 10_000 });
}

test.describe("Item create form", () => {
  test("renders all core sections without errors", async ({ page }) => {
    const errors = watchErrors(page);
    await installHarness(page);
    await gotoNewItem(page);

    for (const label of [
      "Basic Information", "Item Name", "Goods", "Service",
      "Item Details", "Unit", "SKU",
      "Description & Tax", "HSN/SAC Code", "Tax Preference",
      "Sales Information", "Selling Price",
      "Purchase Information", "Cost Price", "Preferred Vendor",
    ]) {
      await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
    }

    await page.screenshot({ path: `${SHOTS}/02-new-item.png`, fullPage: true });
    expect(errors.filter((e) => !ignorable(e))).toEqual([]);
  });

  test("offers separate intra-state (CGST+SGST) and inter-state (IGST) rates", async ({ page }) => {
    await installHarness(page);
    await gotoNewItem(page);

    await expect(page.getByText("Intra State Tax Rate", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Inter State Tax Rate", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("CGST", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("IGST", { exact: false }).first()).toBeVisible();
  });

  test("offers all three GST tax preferences", async ({ page }) => {
    await installHarness(page);
    await gotoNewItem(page);

    for (const pref of ["Taxable", "Non-Taxable", "Exempt"]) {
      await expect(page.getByText(pref, { exact: true }).first()).toBeVisible();
    }
  });

  test("inventory block exposes valuation, reorder point and opening stock", async ({ page }) => {
    await installHarness(page);
    await gotoNewItem(page);
    await enableInventory(page);

    for (const label of ["Valuation Method", "Reorder Point", "Warehouse", "Opening Stock", "Opening Cost / Unit"]) {
      await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
    }
    await page.screenshot({ path: `${SHOTS}/03-inventory-block.png`, fullPage: true });
  });

  test("the D1 fix: only the implemented valuation method is offered", async ({ page }) => {
    await installHarness(page);
    await gotoNewItem(page);
    await enableInventory(page);

    const body = (await page.locator("body").innerText()) || "";
    // FIFO must not be selectable while costing values every issue at
    // Item.averageCost — offering it records a policy the engine ignores.
    expect(/\bFIFO\b/i.test(body), "FIFO is offered but not implemented").toBeFalsy();
    await expect(page.getByText("WAC", { exact: false }).first()).toBeVisible();
  });

  test("does not submit an item with no name", async ({ page }) => {
    const log = await installHarness(page);
    await gotoNewItem(page);

    await page.getByRole("button", { name: /^save$/i }).first().click();
    await page.waitForTimeout(2000);

    expect(
      log.filter((c) => c.method === "POST" && c.url === "/items"),
      "form POSTed an item with an empty required name",
    ).toHaveLength(0);
  });
});

// ═════════════ known gaps (documented, not failures) ═════════════
// Fields an Indian MSME needs that the item form does not offer yet.
// Remove the .fixme when each ships.

const GAPS: Array<[string, RegExp]> = [
  ["batch / lot number", /\bbatch\b|\blot no/i],
  ["expiry date", /expiry|best before/i],
  ["serial number", /serial/i],
  ["MRP", /\bmrp\b|maximum retail/i],
  ["GST cess", /\bcess\b/i],
  ["tax-inclusive price toggle", /inclusive/i],
  ["barcode / EAN", /barcode|\bean\b/i],
  ["per-warehouse stock", /warehouse[- ]wise|per[- ]warehouse/i],
  ["UQC for GSTR-1", /\buqc\b|unit quantity code/i],
];

for (const [name, re] of GAPS) {
  test.fixme(`GAP: item form has no ${name}`, async ({ page }) => {
    await installHarness(page);
    await gotoNewItem(page);
    await enableInventory(page);
    const text = (await page.locator("body").innerText()) || "";
    expect(re.test(text)).toBeTruthy();
  });
}
