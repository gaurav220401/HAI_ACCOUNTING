import { apiFetch } from "./client";

// ─── Sections reference list ─────────────────────────────────────────────────
export const TDS_SECTIONS = [
  { code: "192A", label: "192A - Payment of accumulated balance due to an employee made by the trustees of the Recognized Provident Fund (RPF)." },
  { code: "193", label: "193 - Interest on securities" },
  { code: "194", label: "194 - Dividend" },
  { code: "194A", label: "194A - Other Interest than securities" },
  { code: "194B", label: "194B - Lotteries Winnings" },
  { code: "194BP", label: "194BP - Lotteries Winnings(Not wholly in cash)" },
  { code: "194BA", label: "194BA - Winnings from online games" },
  { code: "194BAP", label: "194BAP - Winnings from online games(Not wholly in cash)" },
  { code: "194BB", label: "194BB - Horse Race" },
  { code: "194C", label: "194C - Payment of contractors HUF/Indiv and Payment of contractors for Others" },
  { code: "194D", label: "194D - Insurance Commission" },
  { code: "194DA", label: "194DA - LIC maturity proceeds" },
  { code: "194EE", label: "194EE - Deposits in NSS" },
  { code: "194E", label: "194E - Payments to non-resident sportsmen or sports association" },
  { code: "194F", label: "194F - Re-purchase By Mutual Funds" },
  { code: "194G", label: "194G - Commission - prize on lottery" },
  { code: "194H", label: "194H - Commission or Brokerage" },
  { code: "194IA", label: "194IA - TDS on immovable property sale" },
  { code: "194IB", label: "194IB - Rent not covered under 194I" },
  { code: "194IC", label: "194IC - Payments Under Specified Agreement" },
  { code: "194I", label: "194I - Rent on land or furniture etc and Rent on plant and machinery" },
  { code: "194I(A)", label: "194I(A) - Rent on land or furniture etc" },
  { code: "194I(B)", label: "194I(B) - Rent on plant and machinery" },
  { code: "194J", label: "194J - Professional Fees" },
  { code: "194J(A)", label: "194J(A) - Technical services" },
  { code: "194J(B)", label: "194J(B) - Professional Fees or royalty" },
  { code: "194LA", label: "194LA - Compensation on acquisition" },
  { code: "194LB", label: "194LB - Payment in respect of compensation on acquisition of certain immovable property." },
  { code: "194LBA", label: "194LBA - Certain income in the form of interest from units of a business trust" },
  { code: "194LBA(A)", label: "194LBA(A) - Certain income in the form of interest from units of a business trust" },
  { code: "194LBA(B)", label: "194LBA(B) - Certain income in the form of dividend from units of a business trust" },
  { code: "194LBA(C)", label: "194LBA(C) - Income referred to in section 10(23FCA) from units of a business trust" },
  { code: "194LBB", label: "194LBB - Income in respect of units of investment fund" },
  { code: "194LBC", label: "194LBC - Income in respect of investment in securitization trust" },
  { code: "194LC(ia)", label: "194LC(ia) - Interest on foreign currency borrowings from Indian company" },
  { code: "194LC(ib)", label: "194LC(ib) - Interest on foreign currency borrowings from Indian company" },
  { code: "194LC(ic)", label: "194LC(ic) - Interest on foreign currency borrowings from Indian company" },
  { code: "194LD", label: "194LD - Income by way of interest on certain bonds and Government securities" },
  { code: "194O", label: "194O - e-commerce participant" },
  { code: "194Q", label: "194Q - Payment of purchase of goods" },
  { code: "194R", label: "194R - Benefit or perquisite" },
  { code: "194RP", label: "194RP - Benefit or perquisite(Not wholly in cash)" },
  { code: "194S", label: "194S - Transfer of a virtual digital asset" },
  { code: "194SP", label: "194SP - Transfer of a virtual digital asset(Not wholly in cash)" },
  { code: "194T", label: "194T - Payment by Partnership Firm to Partners" },
  { code: "194K", label: "194K - Income From Mutual Fund Units" },
  { code: "194M", label: "194M - Payment To Resident Contractors And Professionals" },
  { code: "194N", label: "194N - Payment of certain amounts in cash other than cases covered by first proviso or third provison" },
  { code: "194NC", label: "194NC - Payment of certain amounts in cash to co-operative societies not covered by first provison" },
  { code: "194NF", label: "194NF - Payment of certain amounts in cash to non-filers except in case of co-operative societies" },
  { code: "194NFT", label: "194NFT - Payment of certain amount in cash to non-filers being co-operative societies" },
  { code: "194P", label: "194P - Deduction of tax in case of specified senior citizens" },
  { code: "195", label: "195 - Other sums payable to a non-resident" },
  { code: "192", label: "192 - Salaries" },
  { code: "196A", label: "196A - Income from Units/MF to Non-Residents" },
  { code: "196B", label: "196B - Income such as Capital Gains from Units/MF to Non-residents" },
  { code: "196C", label: "196C - Non-resident Income From Foreign currency bonds" },
  { code: "196D", label: "196D - Income of foreign institutional investors from securities." },
  { code: "196D(1A)", label: "196D(1A) - Income of specified fund from securities referred to in clause (a) of sub-section (1) of section 115AD" },
  { code: "Others", label: "Others - Others" },
] as const;

export interface TdsTax {
  _id: string;
  organizationId: string;
  taxName: string;
  rate: number;
  sectionCode: string;
  sectionDescription: string;
  tdsPayableAccountId?: { _id: string; name: string; accountType: string } | string | null;
  tdsReceivableAccountId?: { _id: string; name: string; accountType: string } | string | null;
  isHigherRate: boolean;
  applicableStartDate?: string | null;
  applicableEndDate?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTdsTaxInput {
  taxName: string;
  rate: number;
  sectionCode: string;
  sectionDescription?: string;
  tdsPayableAccountId?: string | null;
  tdsReceivableAccountId?: string | null;
  isHigherRate?: boolean;
  applicableStartDate?: string | null;
  applicableEndDate?: string | null;
}

export type UpdateTdsTaxInput = Partial<CreateTdsTaxInput> & { isActive?: boolean };

export const tdsTaxApi = {
  list: (params?: { search?: string }) => {
    const qs = params?.search ? `?search=${encodeURIComponent(params.search)}` : "";
    return apiFetch<{ data: TdsTax[] }>(`/tds-taxes${qs}`);
  },
  getOne: (id: string) => apiFetch<{ data: TdsTax }>(`/tds-taxes/${id}`),
  create: (data: CreateTdsTaxInput) =>
    apiFetch<{ data: TdsTax }>("/tds-taxes", { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
  update: (id: string, data: UpdateTdsTaxInput) =>
    apiFetch<{ data: TdsTax }>(`/tds-taxes/${id}`, { method: "PATCH", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
  remove: (id: string) => apiFetch<{ success: boolean }>(`/tds-taxes/${id}`, { method: "DELETE" }),
};
