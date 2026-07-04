import z from "zod";

function parseTransactionDate(dateStr?: string | null): Date | null {
    if (!dateStr) return null;

    const str = dateStr.trim();

    // 1. DD/MM/YY or DD/MM/YYYY
    if (/^\d{2}\/\d{2}\/\d{2,4}/.test(str)) {
        const [d, m, y] = str.split("/");
        return new Date(normalizeYear(y || "1800"), Number(m) - 1, Number(d));
    }

    // 2. DD-MM-YY or DD-MM-YYYY
    if (/^\d{2}-\d{2}-\d{2,4}/.test(str)) {
        const [d, m, y] = str.split("-");
        return new Date(normalizeYear(y || "1800"), Number(m) - 1, Number(d));
    }

    // 3. 1 Apr 2024 OR 1 April 2024
    if (/^\d{1,2} [A-Za-z]{3,} \d{4}/.test(str)) {
        return new Date(str);
    }

    // 4. Apr 1, 2024
    if (/^[A-Za-z]{3,} \d{1,2}, \d{4}/.test(str)) {
        return new Date(str);
    }

    // 5. YYYY-MM-DD (ISO)
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
        return new Date(str);
    }

    return null;
}

function normalizeYear(year: string) {
    if (year.length === 2) {
        const num = Number(year);
        return num > 50 ? 1900 + num : 2000 + num;
    }
    return Number(year);
}


const genericTransactionDataSchema = z.object({
    date: z.string().describe("Transaction Date in ISO format"),
    description: z.string().describe("Transaction Description"),
    creditAmount: z.string().describe("Credit Amount"),
    debitAmount: z.string().describe("Debit Amount"),
    balance: z.string().describe("Account Balance")
});

const CATEGORIES = [
    { name: "Food & Dining", description: "Restaurants, cafes, food delivery (Zomato, Swiggy), takeaway" },
    { name: "Groceries", description: "Supermarkets, kirana stores, BigBasket, Blinkit, Zepto" },
    { name: "Transport", description: "Uber, Ola, auto, metro, fuel, toll, Rapido, parking" },
    { name: "Shopping", description: "Clothing, electronics, Amazon, Flipkart, Myntra, offline retail" },
    { name: "Bills & Utilities", description: "Electricity, water, gas, internet, mobile recharge, rent, broadband" },
    { name: "Health & Medical", description: "Pharmacy, hospital, doctor, diagnostic labs, health apps" },
    { name: "Entertainment & Subscriptions", description: "Netflix, Hotstar, Spotify, gaming, movie tickets, events" },
    { name: "Education", description: "School/college fees, online courses, books, coaching" },
    { name: "Travel & Accommodation", description: "Flights, hotels, Airbnb, trains, MakeMyTrip, Goibibo" },
    { name: "Finance & Investments", description: "Mutual funds, SIP, stocks, FD, PPF, NPS, EPF, insurance premiums (LIC, term, health). NOT loan EMIs" },
    { name: "Transfers & Payments", description: "UPI P2P transfers, NEFT, IMPS, loan EMI repayments, credit card bill payments, bank-to-bank transfers" },
    { name: "Other", description: "Anything that does not clearly fit the above" },
] as const;

export { genericTransactionDataSchema, parseTransactionDate, CATEGORIES };