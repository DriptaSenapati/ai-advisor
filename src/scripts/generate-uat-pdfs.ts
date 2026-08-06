/**
 * Generates the 4 UAT sample statement PDFs and writes them through the
 * storage abstraction (src/lib/storage.ts) under the "uat" kind — not to a
 * local assets/ folder, since prod's .dockerignore excludes assets/ entirely
 * and prod runs STORAGE_DRIVER=s3. Two files are re-saved encrypted via
 * mupdf's saveToBuffer("encrypt=...") pass, reusing UAT_TEST_PASSWORD so
 * there is only one password a tester ever needs.
 *
 *   npm run generate:uat-pdfs
 *
 * Deterministic (seeded RNG) — re-running regenerates byte-identical content
 * every time, so this is safe to run more than once.
 */
import "../envConfig.js";
import PDFDocument from "pdfkit";
import * as mupdf from "mupdf";
import { storage } from "../lib/storage.js";
import { UAT_TEST_PDFS, UAT_TEST_PASSWORD } from "../config/uat.js";

// ---- seeded RNG (mulberry32) — deterministic across runs ----
function mulberry32(seed: number) {
    let a = seed;
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

interface Row {
    date: Date;
    narration: string;
    debit?: number;
    credit?: number;
}

const PAYEES = ["RAJESH KUMAR", "PRIYA SHARMA", "AMIT PATEL", "SNEHA REDDY", "VIKRAM SINGH", "ANITA DESAI"];
const MERCHANTS_FOOD = ["SWIGGY", "ZOMATO", "DOMINOS", "CAFE COFFEE DAY"];
const MERCHANTS_GROCERY = ["BIGBASKET", "DMART", "RELIANCE FRESH"];
const MERCHANTS_SUB = [
    { name: "NETFLIX", amount: 649 },
    { name: "SPOTIFY", amount: 119 },
    { name: "AMAZON PRIME", amount: 299 },
];
const UTILITIES = ["AIRTEL POSTPAID", "TATA POWER", "JIO FIBER"];

function fmtDate(d: Date): string {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()}`;
}

function fmtAmount(n: number): string {
    return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Builds ~85 rows spanning 7 months, ending "today", with a consistent running balance. */
function buildRows(rng: () => number, monthlyIncome: number, incomeCv: number, openingBalance: number): Row[] {
    const rows: Row[] = [];
    const months = 7;
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth() - months + 1, 1);

    for (let m = 0; m < months; m++) {
        const monthStart = new Date(start.getFullYear(), start.getMonth() + m, 1);
        const salaryDay = 1 + Math.floor(rng() * 3);
        const salaryAmt = Math.round(monthlyIncome * (1 + (rng() - 0.5) * 2 * incomeCv));
        rows.push({ date: new Date(monthStart.getFullYear(), monthStart.getMonth(), salaryDay), narration: "NEFT CR SALARY CREDIT XXCORP", credit: salaryAmt });

        rows.push({ date: new Date(monthStart.getFullYear(), monthStart.getMonth(), 3), narration: "RENT PAYMENT UPI/CR/REF/LANDLORD PROPERTIES", debit: 18000 + Math.round(rng() * 500) });
        rows.push({ date: new Date(monthStart.getFullYear(), monthStart.getMonth(), 5), narration: `${UTILITIES[m % UTILITIES.length]} BILLPAY`, debit: 400 + Math.round(rng() * 900) });
        rows.push({ date: new Date(monthStart.getFullYear(), monthStart.getMonth(), 7), narration: "SIP MUTUAL FUND AXIS BLUECHIP", debit: 5000 });

        for (const sub of MERCHANTS_SUB) {
            rows.push({ date: new Date(monthStart.getFullYear(), monthStart.getMonth(), 9 + MERCHANTS_SUB.indexOf(sub)), narration: `${sub.name} SUBSCRIPTION`, debit: sub.amount });
        }

        const groceryVisits = 1 + (rng() > 0.8 ? 1 : 0);
        for (let g = 0; g < groceryVisits; g++) {
            const day = 2 + Math.floor(rng() * 26);
            rows.push({ date: new Date(monthStart.getFullYear(), monthStart.getMonth(), day), narration: `${MERCHANTS_GROCERY[Math.floor(rng() * MERCHANTS_GROCERY.length)]} PURCHASE`, debit: 400 + Math.round(rng() * 2200) });
        }

        const foodOrders = 1 + (rng() > 0.8 ? 1 : 0);
        for (let f = 0; f < foodOrders; f++) {
            const day = 1 + Math.floor(rng() * 27);
            rows.push({ date: new Date(monthStart.getFullYear(), monthStart.getMonth(), day), narration: `${MERCHANTS_FOOD[Math.floor(rng() * MERCHANTS_FOOD.length)]} ORDER`, debit: 150 + Math.round(rng() * 650) });
        }

        const p2pCount = 1 + (rng() > 0.7 ? 1 : 0);
        for (let p = 0; p < p2pCount; p++) {
            const day = 1 + Math.floor(rng() * 27);
            const payee = PAYEES[Math.floor(rng() * PAYEES.length)];
            if (rng() > 0.5) {
                rows.push({ date: new Date(monthStart.getFullYear(), monthStart.getMonth(), day), narration: `UPI/DR/REF/${payee}/SPLIT`, debit: 200 + Math.round(rng() * 1800) });
            } else {
                rows.push({ date: new Date(monthStart.getFullYear(), monthStart.getMonth(), day), narration: `UPI/CR/REF/${payee}/SETTLEMENT`, credit: 200 + Math.round(rng() * 1200) });
            }
        }

        rows.push({ date: new Date(monthStart.getFullYear(), monthStart.getMonth(), 20 + Math.floor(rng() * 5)), narration: "ATM WDL SELF", debit: 2000 + Math.round(rng() * 3) * 1000 });

        // A duplicate-charge and an outlier once, so red-flag detection has something.
        if (m === Math.floor(months / 2)) {
            const dupDay = 15;
            rows.push({ date: new Date(monthStart.getFullYear(), monthStart.getMonth(), dupDay), narration: `${MERCHANTS_GROCERY[0]} PURCHASE`, debit: 1499 });
            rows.push({ date: new Date(monthStart.getFullYear(), monthStart.getMonth(), dupDay), narration: `${MERCHANTS_GROCERY[0]} PURCHASE`, debit: 1499 });
            rows.push({ date: new Date(monthStart.getFullYear(), monthStart.getMonth(), 22), narration: "ELECTRONICS WORLD PURCHASE", debit: 22000 });
        }
    }

    rows.sort((a, b) => a.date.getTime() - b.date.getTime());

    let balance = openingBalance;
    for (const row of rows) {
        balance = balance - (row.debit ?? 0) + (row.credit ?? 0);
        (row as Row & { balance: number }).balance = Math.round(balance * 100) / 100;
    }

    return rows;
}

const COLS = [
    { key: "date", label: "Date", x: 30, width: 70 },
    { key: "narration", label: "Narration", x: 100, width: 220 },
    { key: "debit", label: "Withdrawal (Dr)", x: 320, width: 80 },
    { key: "credit", label: "Deposit (Cr)", x: 400, width: 80 },
    { key: "balance", label: "Balance", x: 480, width: 80 },
] as const;

function renderPdf(rows: (Row & { balance: number })[], bankLabel: string, accountLabel: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: "A4", margin: 30, bufferPages: true });
        const chunks: Buffer[] = [];
        doc.on("data", (c: Buffer) => chunks.push(c));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);

        const TOP = 110;
        const ROW_H = 16;
        const BOTTOM = 780;

        function drawHeaderBlock() {
            doc.fontSize(14).text(bankLabel, 30, 40);
            doc.fontSize(9).text(accountLabel, 30, 60);
            doc.fontSize(9).text("Statement of Account", 30, 74);
        }

        function drawTableHeader(y: number) {
            doc.fontSize(9).font("Helvetica-Bold");
            for (const col of COLS) {
                doc.text(col.label, col.x, y, { width: col.width, lineBreak: false });
            }
            doc.font("Helvetica");
        }

        let y = TOP;
        drawHeaderBlock();
        drawTableHeader(y);
        y += ROW_H;

        for (const row of rows) {
            if (y > BOTTOM) {
                doc.addPage();
                y = TOP;
                drawHeaderBlock();
                drawTableHeader(y);
                y += ROW_H;
            }
            const cells: Record<string, string> = {
                date: fmtDate(row.date),
                narration: row.narration,
                debit: row.debit ? fmtAmount(row.debit) : "",
                credit: row.credit ? fmtAmount(row.credit) : "",
                balance: fmtAmount(row.balance),
            };
            doc.fontSize(8);
            for (const col of COLS) {
                doc.text(cells[col.key]!, col.x, y, { width: col.width, lineBreak: false });
            }
            y += ROW_H;
        }

        doc.end();
    });
}

function encrypt(buffer: Buffer, password: string): Buffer {
    const doc = mupdf.Document.openDocument(buffer, "application/pdf");
    const pdf = doc.asPDF();
    if (!pdf) throw new Error("Generated buffer is not a PDF");
    const out = pdf.saveToBuffer(`encrypt=aes-256,user-password=${password},owner-password=${password}`);
    return Buffer.from(out.asUint8Array());
}

const PROFILES: Record<string, { bank: string; account: string; income: number; cv: number; opening: number }> = {
    "salaried-savings": { bank: "Horizon Bank", account: "Savings A/C ...4821", income: 68000, cv: 0.03, opening: 42000 },
    "freelancer-mixed": { bank: "Coastal Trust Bank", account: "Savings A/C ...7734", income: 45000, cv: 0.45, opening: 18000 },
    "family-joint": { bank: "Horizon Bank", account: "Joint A/C ...1190", income: 92000, cv: 0.05, opening: 65000 },
    "small-business": { bank: "Meridian Bank", account: "Current A/C ...5502", income: 58000, cv: 0.55, opening: 30000 },
};

async function main(): Promise<void> {
    for (const pdf of UAT_TEST_PDFS) {
        const profile = PROFILES[pdf.id];
        if (!profile) throw new Error(`No data profile for ${pdf.id}`);

        const seed = [...pdf.id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
        const rng = mulberry32(seed);
        const rows = buildRows(rng, profile.income, profile.cv, profile.opening) as (Row & { balance: number })[];

        let buffer = await renderPdf(rows, profile.bank, profile.account);
        if (pdf.passwordProtected) {
            buffer = encrypt(buffer, UAT_TEST_PASSWORD);
        }

        const key = storage.keyFor("uat", pdf.filename);
        await storage.put(key, buffer, "application/pdf");
        console.log(`wrote ${pdf.filename} (${rows.length} rows, ${buffer.length} bytes, password=${pdf.passwordProtected})`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
