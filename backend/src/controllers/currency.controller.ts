import { Response } from "express";
import Currency from "../models/currency.model";
import ExchangeRate from "../models/exchange-rate.model";
import { AuthenticatedRequest } from "../types";
import asyncHandler from "../utils/asyncHandler";
import { NotFoundError, ValidationError, ForbiddenError } from "../utils/errors";

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

// ─── Currencies ─────────────────────────────────────────────────────────────

/** GET /api/currencies — list all enabled world currencies */
export const listCurrencies = asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const currencies = await Currency.find({ isEnabled: true }).sort({ code: 1 }).lean();
  res.json({ success: true, data: currencies });
});

/** POST /api/currencies/seed — seed 100+ world currencies (run once) */
export const seedCurrencies = asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const existing = await Currency.countDocuments();
  if (existing > 5) return res.json({ success: true, message: "Currencies already seeded" });

  await Currency.insertMany(WORLD_CURRENCIES);
  res.status(201).json({ success: true, message: `${WORLD_CURRENCIES.length} currencies seeded` });
});

// ─── Exchange Rates ──────────────────────────────────────────────────────────

/** GET /api/exchange-rates?from=USD&to=INR */
export const listRates = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const filter: any = { organizationId: orgId(req) };
  if (req.query.from) filter.fromCurrency = (req.query.from as string).toUpperCase();
  if (req.query.to) filter.toCurrency = (req.query.to as string).toUpperCase();

  const rates = await ExchangeRate.find(filter).sort({ date: -1 }).limit(100).lean();
  res.json({ success: true, data: rates });
});

/** GET /api/exchange-rates/latest?from=USD&to=INR — single latest rate */
export const latestRate = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { from, to } = req.query;
  if (!from || !to) throw new ValidationError("from and to currency codes are required");

  const rate = await ExchangeRate.findOne({
    organizationId: orgId(req),
    fromCurrency: (from as string).toUpperCase(),
    toCurrency: (to as string).toUpperCase(),
  }).sort({ date: -1 });

  res.json({ success: true, data: rate ?? null });
});

/** POST /api/exchange-rates */
export const createRate = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { fromCurrency, toCurrency, date, rate } = req.body;
  if (!fromCurrency || !toCurrency || !date || !rate)
    throw new ValidationError("fromCurrency, toCurrency, date, and rate are required");

  const exRate = new ExchangeRate({
    organizationId: orgId(req),
    fromCurrency: fromCurrency.toUpperCase(),
    toCurrency: toCurrency.toUpperCase(),
    date: new Date(date),
    rate: +rate,
    source: "Manual",
  });
  await exRate.save();
  res.status(201).json({ success: true, data: exRate });
});

/** DELETE /api/exchange-rates/:id */
export const deleteRate = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const rate = await ExchangeRate.findOneAndDelete({ _id: req.params.id, organizationId: orgId(req) });
  if (!rate) throw new NotFoundError("Exchange Rate");
  res.json({ success: true, message: "Exchange rate deleted" });
});

// ─── World Currencies Data ───────────────────────────────────────────────────

const WORLD_CURRENCIES = [
  { code: "AED", name: "UAE Dirham", symbol: "د.إ", decimalPlaces: 2 },
  { code: "AFN", name: "Afghan Afghani", symbol: "؋", decimalPlaces: 2 },
  { code: "ALL", name: "Albanian Lek", symbol: "L", decimalPlaces: 2 },
  { code: "AMD", name: "Armenian Dram", symbol: "֏", decimalPlaces: 2 },
  { code: "ANG", name: "Netherlands Antillean Guilder", symbol: "ƒ", decimalPlaces: 2 },
  { code: "AOA", name: "Angolan Kwanza", symbol: "Kz", decimalPlaces: 2 },
  { code: "ARS", name: "Argentine Peso", symbol: "$", decimalPlaces: 2 },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", decimalPlaces: 2 },
  { code: "AWG", name: "Aruban Florin", symbol: "ƒ", decimalPlaces: 2 },
  { code: "AZN", name: "Azerbaijani Manat", symbol: "₼", decimalPlaces: 2 },
  { code: "BAM", name: "Bosnia-Herzegovina Convertible Mark", symbol: "KM", decimalPlaces: 2 },
  { code: "BBD", name: "Barbadian Dollar", symbol: "Bds$", decimalPlaces: 2 },
  { code: "BDT", name: "Bangladeshi Taka", symbol: "৳", decimalPlaces: 2 },
  { code: "BGN", name: "Bulgarian Lev", symbol: "лв", decimalPlaces: 2 },
  { code: "BHD", name: "Bahraini Dinar", symbol: ".د.ب", decimalPlaces: 3 },
  { code: "BIF", name: "Burundian Franc", symbol: "Fr", decimalPlaces: 0 },
  { code: "BMD", name: "Bermudian Dollar", symbol: "$", decimalPlaces: 2 },
  { code: "BND", name: "Brunei Dollar", symbol: "B$", decimalPlaces: 2 },
  { code: "BOB", name: "Bolivian Boliviano", symbol: "Bs.", decimalPlaces: 2 },
  { code: "BRL", name: "Brazilian Real", symbol: "R$", decimalPlaces: 2 },
  { code: "BSD", name: "Bahamian Dollar", symbol: "B$", decimalPlaces: 2 },
  { code: "BTN", name: "Bhutanese Ngultrum", symbol: "Nu", decimalPlaces: 2 },
  { code: "BWP", name: "Botswanan Pula", symbol: "P", decimalPlaces: 2 },
  { code: "BYN", name: "Belarusian Ruble", symbol: "Br", decimalPlaces: 2 },
  { code: "BZD", name: "Belize Dollar", symbol: "BZ$", decimalPlaces: 2 },
  { code: "CAD", name: "Canadian Dollar", symbol: "CA$", decimalPlaces: 2 },
  { code: "CDF", name: "Congolese Franc", symbol: "Fr", decimalPlaces: 2 },
  { code: "CHF", name: "Swiss Franc", symbol: "Fr", decimalPlaces: 2 },
  { code: "CLP", name: "Chilean Peso", symbol: "$", decimalPlaces: 0 },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", decimalPlaces: 2 },
  { code: "COP", name: "Colombian Peso", symbol: "$", decimalPlaces: 2 },
  { code: "CRC", name: "Costa Rican Colón", symbol: "₡", decimalPlaces: 2 },
  { code: "CUP", name: "Cuban Peso", symbol: "$", decimalPlaces: 2 },
  { code: "CVE", name: "Cape Verdean Escudo", symbol: "$", decimalPlaces: 2 },
  { code: "CZK", name: "Czech Koruna", symbol: "Kč", decimalPlaces: 2 },
  { code: "DJF", name: "Djiboutian Franc", symbol: "Fr", decimalPlaces: 0 },
  { code: "DKK", name: "Danish Krone", symbol: "kr", decimalPlaces: 2 },
  { code: "DOP", name: "Dominican Peso", symbol: "RD$", decimalPlaces: 2 },
  { code: "DZD", name: "Algerian Dinar", symbol: "د.ج", decimalPlaces: 2 },
  { code: "EGP", name: "Egyptian Pound", symbol: "E£", decimalPlaces: 2 },
  { code: "ERN", name: "Eritrean Nakfa", symbol: "Nfk", decimalPlaces: 2 },
  { code: "ETB", name: "Ethiopian Birr", symbol: "Br", decimalPlaces: 2 },
  { code: "EUR", name: "Euro", symbol: "€", decimalPlaces: 2 },
  { code: "FJD", name: "Fijian Dollar", symbol: "FJ$", decimalPlaces: 2 },
  { code: "GBP", name: "British Pound Sterling", symbol: "£", decimalPlaces: 2 },
  { code: "GEL", name: "Georgian Lari", symbol: "₾", decimalPlaces: 2 },
  { code: "GHS", name: "Ghanaian Cedi", symbol: "GH₵", decimalPlaces: 2 },
  { code: "GMD", name: "Gambian Dalasi", symbol: "D", decimalPlaces: 2 },
  { code: "GNF", name: "Guinean Franc", symbol: "Fr", decimalPlaces: 0 },
  { code: "GTQ", name: "Guatemalan Quetzal", symbol: "Q", decimalPlaces: 2 },
  { code: "GYD", name: "Guyanaese Dollar", symbol: "GY$", decimalPlaces: 2 },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$", decimalPlaces: 2 },
  { code: "HNL", name: "Honduran Lempira", symbol: "L", decimalPlaces: 2 },
  { code: "HRK", name: "Croatian Kuna", symbol: "kn", decimalPlaces: 2 },
  { code: "HTG", name: "Haitian Gourde", symbol: "G", decimalPlaces: 2 },
  { code: "HUF", name: "Hungarian Forint", symbol: "Ft", decimalPlaces: 2 },
  { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp", decimalPlaces: 2 },
  { code: "ILS", name: "Israeli New Shekel", symbol: "₪", decimalPlaces: 2 },
  { code: "INR", name: "Indian Rupee", symbol: "₹", decimalPlaces: 2 },
  { code: "IQD", name: "Iraqi Dinar", symbol: "ع.د", decimalPlaces: 3 },
  { code: "IRR", name: "Iranian Rial", symbol: "﷼", decimalPlaces: 2 },
  { code: "ISK", name: "Icelandic Króna", symbol: "kr", decimalPlaces: 0 },
  { code: "JMD", name: "Jamaican Dollar", symbol: "J$", decimalPlaces: 2 },
  { code: "JOD", name: "Jordanian Dinar", symbol: "JD", decimalPlaces: 3 },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", decimalPlaces: 0 },
  { code: "KES", name: "Kenyan Shilling", symbol: "KSh", decimalPlaces: 2 },
  { code: "KGS", name: "Kyrgystani Som", symbol: "с", decimalPlaces: 2 },
  { code: "KHR", name: "Cambodian Riel", symbol: "៛", decimalPlaces: 2 },
  { code: "KRW", name: "South Korean Won", symbol: "₩", decimalPlaces: 0 },
  { code: "KWD", name: "Kuwaiti Dinar", symbol: "KD", decimalPlaces: 3 },
  { code: "KYD", name: "Cayman Islands Dollar", symbol: "CI$", decimalPlaces: 2 },
  { code: "KZT", name: "Kazakhstani Tenge", symbol: "₸", decimalPlaces: 2 },
  { code: "LAK", name: "Laotian Kip", symbol: "₭", decimalPlaces: 2 },
  { code: "LBP", name: "Lebanese Pound", symbol: "ل.ل", decimalPlaces: 2 },
  { code: "LKR", name: "Sri Lankan Rupee", symbol: "₨", decimalPlaces: 2 },
  { code: "LRD", name: "Liberian Dollar", symbol: "L$", decimalPlaces: 2 },
  { code: "LSL", name: "Lesotho Loti", symbol: "M", decimalPlaces: 2 },
  { code: "LYD", name: "Libyan Dinar", symbol: "LD", decimalPlaces: 3 },
  { code: "MAD", name: "Moroccan Dirham", symbol: "MAD", decimalPlaces: 2 },
  { code: "MDL", name: "Moldovan Leu", symbol: "L", decimalPlaces: 2 },
  { code: "MKD", name: "Macedonian Denar", symbol: "ден", decimalPlaces: 2 },
  { code: "MMK", name: "Myanmar Kyat", symbol: "K", decimalPlaces: 2 },
  { code: "MNT", name: "Mongolian Tögrög", symbol: "₮", decimalPlaces: 2 },
  { code: "MOP", name: "Macanese Pataca", symbol: "P", decimalPlaces: 2 },
  { code: "MRU", name: "Mauritanian Ouguiya", symbol: "UM", decimalPlaces: 2 },
  { code: "MUR", name: "Mauritian Rupee", symbol: "₨", decimalPlaces: 2 },
  { code: "MVR", name: "Maldivian Rufiyaa", symbol: "Rf", decimalPlaces: 2 },
  { code: "MWK", name: "Malawian Kwacha", symbol: "MK", decimalPlaces: 2 },
  { code: "MXN", name: "Mexican Peso", symbol: "MX$", decimalPlaces: 2 },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM", decimalPlaces: 2 },
  { code: "MZN", name: "Mozambican Metical", symbol: "MT", decimalPlaces: 2 },
  { code: "NAD", name: "Namibian Dollar", symbol: "N$", decimalPlaces: 2 },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦", decimalPlaces: 2 },
  { code: "NIO", name: "Nicaraguan Córdoba", symbol: "C$", decimalPlaces: 2 },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr", decimalPlaces: 2 },
  { code: "NPR", name: "Nepalese Rupee", symbol: "₨", decimalPlaces: 2 },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$", decimalPlaces: 2 },
  { code: "OMR", name: "Omani Rial", symbol: "ر.ع.", decimalPlaces: 3 },
  { code: "PAB", name: "Panamanian Balboa", symbol: "B/.", decimalPlaces: 2 },
  { code: "PEN", name: "Peruvian Sol", symbol: "S/.", decimalPlaces: 2 },
  { code: "PGK", name: "Papua New Guinean Kina", symbol: "K", decimalPlaces: 2 },
  { code: "PHP", name: "Philippine Peso", symbol: "₱", decimalPlaces: 2 },
  { code: "PKR", name: "Pakistani Rupee", symbol: "₨", decimalPlaces: 2 },
  { code: "PLN", name: "Polish Złoty", symbol: "zł", decimalPlaces: 2 },
  { code: "PYG", name: "Paraguayan Guaraní", symbol: "₲", decimalPlaces: 0 },
  { code: "QAR", name: "Qatari Rial", symbol: "ر.ق", decimalPlaces: 2 },
  { code: "RON", name: "Romanian Leu", symbol: "lei", decimalPlaces: 2 },
  { code: "RSD", name: "Serbian Dinar", symbol: "din.", decimalPlaces: 2 },
  { code: "RUB", name: "Russian Ruble", symbol: "₽", decimalPlaces: 2 },
  { code: "RWF", name: "Rwandan Franc", symbol: "Fr", decimalPlaces: 0 },
  { code: "SAR", name: "Saudi Riyal", symbol: "﷼", decimalPlaces: 2 },
  { code: "SBD", name: "Solomon Islands Dollar", symbol: "SI$", decimalPlaces: 2 },
  { code: "SCR", name: "Seychellois Rupee", symbol: "₨", decimalPlaces: 2 },
  { code: "SDG", name: "Sudanese Pound", symbol: "ج.س.", decimalPlaces: 2 },
  { code: "SEK", name: "Swedish Krona", symbol: "kr", decimalPlaces: 2 },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$", decimalPlaces: 2 },
  { code: "SLL", name: "Sierra Leonean Leone", symbol: "Le", decimalPlaces: 2 },
  { code: "SOS", name: "Somali Shilling", symbol: "Sh", decimalPlaces: 2 },
  { code: "SRD", name: "Surinamese Dollar", symbol: "$", decimalPlaces: 2 },
  { code: "STN", name: "São Tomé & Príncipe Dobra", symbol: "Db", decimalPlaces: 2 },
  { code: "SVC", name: "Salvadoran Colón", symbol: "₡", decimalPlaces: 2 },
  { code: "SYP", name: "Syrian Pound", symbol: "£", decimalPlaces: 2 },
  { code: "SZL", name: "Swazi Lilangeni", symbol: "E", decimalPlaces: 2 },
  { code: "THB", name: "Thai Baht", symbol: "฿", decimalPlaces: 2 },
  { code: "TJS", name: "Tajikistani Somoni", symbol: "SM", decimalPlaces: 2 },
  { code: "TMT", name: "Turkmenistani Manat", symbol: "T", decimalPlaces: 2 },
  { code: "TND", name: "Tunisian Dinar", symbol: "DT", decimalPlaces: 3 },
  { code: "TOP", name: "Tongan Paʻanga", symbol: "T$", decimalPlaces: 2 },
  { code: "TRY", name: "Turkish Lira", symbol: "₺", decimalPlaces: 2 },
  { code: "TTD", name: "Trinidad & Tobago Dollar", symbol: "TT$", decimalPlaces: 2 },
  { code: "TWD", name: "New Taiwan Dollar", symbol: "NT$", decimalPlaces: 2 },
  { code: "TZS", name: "Tanzanian Shilling", symbol: "Sh", decimalPlaces: 2 },
  { code: "UAH", name: "Ukrainian Hryvnia", symbol: "₴", decimalPlaces: 2 },
  { code: "UGX", name: "Ugandan Shilling", symbol: "Sh", decimalPlaces: 0 },
  { code: "USD", name: "United States Dollar", symbol: "$", decimalPlaces: 2 },
  { code: "UYU", name: "Uruguayan Peso", symbol: "$U", decimalPlaces: 2 },
  { code: "UZS", name: "Uzbekistani Sum", symbol: "лв", decimalPlaces: 2 },
  { code: "VES", name: "Venezuelan Bolívar", symbol: "Bs.S", decimalPlaces: 2 },
  { code: "VND", name: "Vietnamese Dong", symbol: "₫", decimalPlaces: 0 },
  { code: "VUV", name: "Vanuatu Vatu", symbol: "Vt", decimalPlaces: 0 },
  { code: "WST", name: "Samoan Tala", symbol: "WS$", decimalPlaces: 2 },
  { code: "XAF", name: "Central African CFA Franc", symbol: "Fr", decimalPlaces: 0 },
  { code: "XCD", name: "East Caribbean Dollar", symbol: "EC$", decimalPlaces: 2 },
  { code: "XOF", name: "West African CFA Franc", symbol: "Fr", decimalPlaces: 0 },
  { code: "YER", name: "Yemeni Rial", symbol: "﷼", decimalPlaces: 2 },
  { code: "ZAR", name: "South African Rand", symbol: "R", decimalPlaces: 2 },
  { code: "ZMW", name: "Zambian Kwacha", symbol: "ZK", decimalPlaces: 2 },
  { code: "ZWL", name: "Zimbabwean Dollar", symbol: "Z$", decimalPlaces: 2 },
];
