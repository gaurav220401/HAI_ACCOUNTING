"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef } from "react";

// ─── Modular Form Configuration Registry ─────────────────────────────────

export interface FormFieldConfig {
  synonyms: string[];
}

export interface FormModule {
  id: string;
  name: string;
  routes: string[]; // Paths matching this form (e.g. "/items/new")
  fields: Record<string, FormFieldConfig>;
}

// Modular definitions for various sections of the application
export const FORM_MODULES: FormModule[] = [
  {
    id: "item",
    name: "Item / Product Form",
    routes: ["/items/new", "/items/edit"],
    fields: {
      name: { synonyms: ["item name", "name", "display name", "item_name", "itemname"] },
      sku: { synonyms: ["sku", "item code", "code", "part number"] },
      sellingPrice: { synonyms: ["selling price", "price", "selling_price", "rate", "unit price", "sales price"] },
      costPrice: { synonyms: ["cost price", "cost_price", "purchase price", "purchase_price", "cost"] },
      description: { synonyms: ["description", "notes", "item description", "purchase description", "sales description"] },
      itemType: { synonyms: ["item type", "type", "item_type"] },
      itemMode: { synonyms: ["item mode", "mode", "item_mode"] },
      brand: { synonyms: ["brand", "item brand"] },
      manufacturer: { synonyms: ["manufacturer", "maker"] },
      unit: { synonyms: ["unit", "uom", "unit of measurement"] },
      salesAccountId: { synonyms: ["sales account", "sales_account", "income account", "revenue account"] },
      purchaseAccountId: { synonyms: ["purchase account", "purchase_account", "expense account", "cost account"] },
      taxPreference: { synonyms: ["tax preference", "tax_preference", "taxable status"] },
      intraStateTaxId: { synonyms: ["intra-state tax rate", "intra_state_tax", "intra-state tax", "gst rate"] },
      interStateTaxId: { synonyms: ["inter-state tax rate", "inter_state_tax", "inter-state tax", "igst rate"] },
      inventoryTracked: { synonyms: ["track inventory", "inventory_tracked", "hasInventoryInfo", "has_inventory_info"] },
    }
  },
  {
    id: "invoice",
    name: "Invoice Form",
    routes: ["/sales/invoices/new", "/sales/invoices/edit"],
    fields: {
      customerId: { synonyms: ["customer", "customer name", "client", "customer_id", "customerId"] },
      invoiceNumber: { synonyms: ["invoice number", "invoice #", "invoice_number"] },
      invoiceDate: { synonyms: ["invoice date", "date", "invoice_date"] },
      dueDate: { synonyms: ["due date", "due_date", "payment terms"] },
      referenceNumber: { synonyms: ["reference number", "reference #", "ref_number", "ref #"] },
      salesperson: { synonyms: ["salesperson", "sales person", "agent"] },
      subject: { synonyms: ["subject", "invoice subject", "heading"] },
    }
  },
  {
    id: "customer",
    name: "Customer Form",
    routes: ["/sales/customers/new", "/sales/customers/edit"],
    fields: {
      displayName: { synonyms: ["display name", "displayName", "name", "full name", "contact name"] },
      email: { synonyms: ["email", "email address", "email_address"] },
      phone: { synonyms: ["phone", "phone number", "mobile", "mobile number"] },
      companyName: { synonyms: ["company name", "company", "organization"] },
      billingAddress: { synonyms: ["billing address", "address", "billing_address"] },
      gstType: { synonyms: ["gst treatment", "gst type", "gst_treatment", "gst preference"] },
      gstin: { synonyms: ["gstin", "gst registration number", "gst number"] },
    }
  },
  {
    id: "bill",
    name: "Bill Form",
    routes: ["/purchases/bills/new", "/purchases/bills/edit"],
    fields: {
      vendorId: { synonyms: ["vendor", "vendor name", "supplier", "vendor_id", "vendorId"] },
      billNumber: { synonyms: ["bill number", "bill #", "bill_number"] },
      billDate: { synonyms: ["bill date", "date", "bill_date"] },
      dueDate: { synonyms: ["due date", "due_date", "payment terms"] },
      referenceNumber: { synonyms: ["reference number", "reference #", "ref_number", "ref #"] },
      orderNumber: { synonyms: ["order number", "purchase order #", "po number"] },
    }
  }
];

// Fallback search synonyms shared globally across all forms
const GLOBAL_FALLBACKS: Record<string, string[]> = {
  name: ["name", "title", "label"],
  description: ["description", "desc", "notes", "summary"],
  email: ["email", "email address", "email_address"],
  phone: ["phone", "phone number", "mobile", "mobile number"],
  sku: ["sku", "code"],
};

export function useFormAgent() {
  const router = useRouter();
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // Determine active form module config based on active pathname
  const getActiveModule = useCallback((path: string): FormModule | undefined => {
    return FORM_MODULES.find((m) =>
      m.routes.some((r) => path.toLowerCase().startsWith(r.toLowerCase()))
    );
  }, []);

  // Find form input using fuzzy matching rules within active module schema context
  const findElement = useCallback((key: string, activeModule?: FormModule): HTMLElement | null => {
    const fieldConfig = activeModule?.fields[key];
    const candidates = Array.from(
      new Set([
        ...(fieldConfig?.synonyms || []),
        ...(GLOBAL_FALLBACKS[key] || []),
        key.toLowerCase(),
      ])
    );
    
    // 1. Try finding input by direct name, id, or placeholder attribute
    for (const cand of candidates) {
      const escaped = cand.replace(/"/g, '\\"');
      const directEl = document.querySelector(
        `input[name="${escaped}"], input[id="${escaped}"], textarea[name="${escaped}"], textarea[id="${escaped}"]`
      ) as HTMLElement;
      if (directEl && directEl.offsetParent !== null) {
        return directEl;
      }
    }

    // 2. Search labels containing the candidate texts
    const labels = Array.from(document.querySelectorAll("label")) as HTMLElement[];
    for (const cand of candidates) {
      const matchedLabel = labels.find((l) =>
        l.textContent?.toLowerCase().replace(/[*:]/g, "").trim().includes(cand)
      );

      if (matchedLabel) {
        // Try htmlFor ID matching
        const htmlFor = matchedLabel.getAttribute("for");
        if (htmlFor) {
          const el = document.getElementById(htmlFor);
          if (el && el.offsetParent !== null) return el;
        }

        // Try direct children
        const childInput = matchedLabel.querySelector("input, textarea, [role='combobox']") as HTMLElement;
        if (childInput && childInput.offsetParent !== null) return childInput;

        // Try sibling search (standard grid forms)
        const parent = matchedLabel.parentElement;
        if (parent) {
          const siblingInput = parent.querySelector("input, textarea, button[role='combobox'], [role='checkbox'], button[role='radio'], input[type='radio']") as HTMLElement;
          if (siblingInput && siblingInput.offsetParent !== null) return siblingInput;

          // Next sibling container input
          const nextSib = matchedLabel.nextElementSibling;
          if (nextSib) {
            const innerInput = nextSib.querySelector("input, textarea, button[role='combobox'], [role='checkbox'], button[role='radio'], input[type='radio']") as HTMLElement;
            if (innerInput && innerInput.offsetParent !== null) return innerInput;
          }
        }
      }
    }

    // 3. Search inputs by their placeholder text directly
    const inputs = Array.from(document.querySelectorAll("input, textarea")) as HTMLInputElement[];
    for (const cand of candidates) {
      const match = inputs.find((inp) =>
        inp.placeholder?.toLowerCase().includes(cand)
      );
      if (match && match.offsetParent !== null) return match;
    }

    return null;
  }, []);

  // Update input text value and trigger React's controlled value bindings
  const setInputValue = useCallback(async (
    inputEl: HTMLInputElement | HTMLTextAreaElement,
    value: string,
    onProgress: (msg: string) => void,
    fieldName: string
  ) => {
    inputEl.focus();
    inputEl.scrollIntoView({ behavior: "smooth", block: "center" });

    // Add glowing visual highlight
    inputEl.classList.add(
      "ring-2",
      "ring-teal-500",
      "border-teal-500",
      "shadow-[0_0_10px_rgba(20,184,166,0.5)]",
      "scale-[1.01]",
      "transition-all",
      "duration-300"
    );

    // Clear input first
    const lastVal = inputEl.value;
    inputEl.value = "";
    let event = new Event("input", { bubbles: true });
    let tracker = (inputEl as any)._valueTracker;
    if (tracker) tracker.setValue(lastVal);
    inputEl.dispatchEvent(event);

    // Visual typing micro-animation
    for (let i = 0; i < value.length; i++) {
      const delay = 25 + Math.random() * 35;
      await sleep(delay);
      const prevVal = inputEl.value;
      inputEl.value += value[i];

      event = new Event("input", { bubbles: true });
      tracker = (inputEl as any)._valueTracker;
      if (tracker) tracker.setValue(prevVal);
      inputEl.dispatchEvent(event);

      onProgress(`Typing ${fieldName}: "${inputEl.value}"...`);
    }

    inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(200);

    // Remove glowing styling
    inputEl.classList.remove(
      "ring-2",
      "ring-teal-500",
      "border-teal-500",
      "shadow-[0_0_10px_rgba(20,184,166,0.5)]",
      "scale-[1.01]"
    );
    inputEl.blur();
  }, []);

  // Automate Checkbox / Switch component
  const setCheckboxValue = useCallback(async (checkboxEl: HTMLElement, value: boolean) => {
    checkboxEl.focus();
    checkboxEl.scrollIntoView({ behavior: "smooth", block: "center" });

    checkboxEl.classList.add("ring-2", "ring-teal-500", "duration-300");

    const isChecked = checkboxEl.getAttribute("aria-checked") === "true" || (checkboxEl as HTMLInputElement).checked;
    if (!!isChecked !== value) {
      checkboxEl.click();
      await sleep(300);
    }

    checkboxEl.classList.remove("ring-2", "ring-teal-500");
    checkboxEl.blur();
  }, []);

  // Automate Radix UI Select Trigger / dropdowns
  const setSelectValue = useCallback(async (
    triggerEl: HTMLElement,
    value: string,
    onProgress: (msg: string) => void,
    fieldName: string
  ) => {
    triggerEl.focus();
    triggerEl.scrollIntoView({ behavior: "smooth", block: "center" });

    triggerEl.classList.add(
      "ring-2",
      "ring-teal-500",
      "border-teal-500",
      "shadow-[0_0_10px_rgba(20,184,166,0.5)]"
    );

    onProgress(`Opening "${fieldName}" dropdown...`);
    triggerEl.click();
    await sleep(400);

    const options = Array.from(
      document.querySelectorAll('[role="option"], [role="menuitem"], .select-item, [data-radix-select-viewport] *')
    ) as HTMLElement[];

    const matched = options.find(
      (opt) =>
        opt.textContent?.trim().toLowerCase() === value.toLowerCase() ||
        opt.textContent?.trim().toLowerCase().includes(value.toLowerCase())
    );

    if (matched) {
      onProgress(`Selecting "${value}" from dropdown...`);
      matched.click();
    } else {
      triggerEl.click();
      onProgress(`Could not find "${value}" in dropdown option list.`);
    }

    await sleep(300);
    triggerEl.classList.remove(
      "ring-2",
      "ring-teal-500",
      "border-teal-500",
      "shadow-[0_0_10px_rgba(20,184,166,0.5)]"
    );
    triggerEl.blur();
  }, []);

  // Primary runner function to orchestrate navigation and automation
  const executeFormFilling = useCallback(
    async (
      route: string,
      formData: Record<string, any>,
      onProgress: (msg: string) => void,
      onComplete: () => void
    ) => {
      // 1. Navigation phase
      const currentPath = window.location.pathname;
      if (currentPath.toLowerCase() !== route.toLowerCase()) {
        onProgress(`Navigating to route ${route}...`);
        router.push(route);
        
        let pathMatch = false;
        for (let attempt = 0; attempt < 50; attempt++) {
          await sleep(200);
          if (window.location.pathname.toLowerCase() === route.toLowerCase()) {
            pathMatch = true;
            break;
          }
        }
        
        if (!pathMatch) {
          onProgress(`Failed to navigate to target page ${route}.`);
          onComplete();
          return;
        }
        onProgress("Page loaded. Scanning for input fields...");
        await sleep(600);
      } else {
        onProgress("Form page is already active. Scanning fields...");
        await sleep(300);
      }

      // Identify the active modular schema context
      const activeModule = getActiveModule(window.location.pathname);

      // 2. Poll for DOM elements availability
      let foundInputs = false;
      for (let attempt = 0; attempt < 25; attempt++) {
        const testInputs = document.querySelectorAll("input, textarea, button[role='combobox'], button[role='radio']");
        if (testInputs.length > 3) {
          foundInputs = true;
          break;
        }
        await sleep(200);
      }

      if (!foundInputs) {
        onProgress("Could not locate form inputs on this page.");
        onComplete();
        return;
      }

      // 3. Process fields sequentially
      const entries = Object.entries(formData);
      for (const [key, value] of entries) {
        if (value === undefined || value === null || value === "") continue;

        // Check if it matches a radio button option (such as Goods / Service type selection)
        const radioOptions = Array.from(
          document.querySelectorAll("button[role='radio'], input[type='radio']")
        ) as HTMLElement[];
        
        let radioClicked = false;
        for (const radio of radioOptions) {
          const id = radio.getAttribute("id");
          let labelText = "";
          if (id) {
            const label = document.querySelector(`label[for="${id}"]`);
            if (label) labelText = label.textContent?.trim() || "";
          }
          if (!labelText) {
            const parentLabel = radio.closest("label");
            if (parentLabel) labelText = parentLabel.textContent?.trim() || "";
          }
          if (!labelText) {
            const parent = radio.parentElement;
            if (parent) {
              const label = parent.querySelector("label");
              if (label) labelText = label.textContent?.trim() || "";
            }
          }
          
          const valStr = String(value).toLowerCase();
          const radioValAttr = radio.getAttribute("value")?.toLowerCase() || "";
          const radioId = id?.toLowerCase() || "";
          
          const fieldConfig = activeModule?.fields[key];
          const keyCandidates = Array.from(
            new Set([
              ...(fieldConfig?.synonyms || []),
              ...(GLOBAL_FALLBACKS[key] || []),
              key.toLowerCase(),
            ])
          );

          const isRelatedToKey = keyCandidates.some((cand) => {
            const groupParent = radio.closest(".flex-col, .grid, .flex");
            const groupLabel = groupParent?.querySelector("label")?.textContent?.toLowerCase() || "";
            return groupLabel.includes(cand) || radio.getAttribute("name")?.toLowerCase().includes(cand);
          });

          if (
            isRelatedToKey &&
            (labelText.toLowerCase() === valStr ||
              labelText.toLowerCase().includes(valStr) ||
              radioValAttr === valStr ||
              radioId.includes(valStr))
          ) {
            onProgress(`Selecting option "${value}" for "${key}"...`);
            radio.focus();
            radio.scrollIntoView({ behavior: "smooth", block: "center" });
            radio.classList.add("ring-2", "ring-teal-500", "duration-300");
            radio.click();
            await sleep(400);
            radio.classList.remove("ring-2", "ring-teal-500");
            radio.blur();
            radioClicked = true;
            break;
          }
        }

        if (radioClicked) {
          continue;
        }

        const el = findElement(key, activeModule);
        if (!el) {
          onProgress(`Field "${key}" could not be located in form.`);
          await sleep(400);
          continue;
        }

        const tag = el.tagName.toLowerCase();
        const typeAttr = el.getAttribute("type");
        const roleAttr = el.getAttribute("role");

        onProgress(`Found field for "${key}". Automation in progress...`);

        // Check if it's a checkbox / switch
        if (roleAttr === "checkbox" || typeAttr === "checkbox" || el.classList.contains("checkbox")) {
          const isBoolVal = typeof value === "boolean" ? value : String(value).toLowerCase() === "true";
          await setCheckboxValue(el, isBoolVal);
        }
        // Check if it's a select trigger combobox
        else if (roleAttr === "combobox" || tag === "button" || el.classList.contains("select-trigger")) {
          await setSelectValue(el, String(value), onProgress, key);
        }
        // Default to text inputs/textareas
        else if (tag === "input" || tag === "textarea") {
          await setInputValue(el as HTMLInputElement | HTMLTextAreaElement, String(value), onProgress, key);
        } else {
          el.focus();
          el.click();
          await sleep(300);
        }
      }

      onProgress("All form fields populated successfully! Please review the form and submit.");
      onComplete();
    },
    [router, getActiveModule, findElement, setInputValue, setCheckboxValue, setSelectValue]
  );

  return { executeFormFilling };
}
