import prisma from "../../prismaClient.js";

const TXN_SELECT = {
    id: true,
    date: true,
    description: true,
    creditAmount: true,
    debitAmount: true,
    balance: true,
    clusterId: true,
    statementMetadataId: true,
    createdAt: true,
    cluster: {
        select: {
            id: true,
            merchantName: true,
            payeeName: true,
            category: true,
            confidence: true,
        },
    },
};

export async function listTransactions(opts: {
    page: number;
    limit: number;
    month?: string;
    category?: string;
    minAmount?: number;
    maxAmount?: number;
}) {
    const { page, limit, month, category, minAmount, maxAmount } = opts;

    const dateFilter: Record<string, unknown> = {};
    if (month) {
        const start = new Date(`${month}-01T00:00:00.000Z`);
        const end = new Date(start);
        end.setUTCMonth(end.getUTCMonth() + 1);
        dateFilter.date = { gte: start, lt: end };
    }

    const amountFilter: Record<string, unknown> = {};
    if (minAmount !== undefined || maxAmount !== undefined) {
        amountFilter.debitAmount = {
            ...(minAmount !== undefined ? { gte: minAmount } : {}),
            ...(maxAmount !== undefined ? { lte: maxAmount } : {}),
        };
    }

    const where = {
        ...dateFilter,
        ...amountFilter,
        ...(category ? { cluster: { category } } : {}),
    };

    const [total, data] = await Promise.all([
        prisma.finalTransactionData.count({ where }),
        prisma.finalTransactionData.findMany({
            where,
            select: TXN_SELECT,
            orderBy: { date: "desc" },
            skip: (page - 1) * limit,
            take: limit,
        }),
    ]);

    return { data, total };
}

export async function getMonthlyStats() {
    return prisma.monthlyStats.findMany({ orderBy: { month: "asc" } });
}

export async function getCategoryBreakdown() {
    const stats = await prisma.monthlyStats.findMany({ select: { categoryBreakdown: true } });

    const totals = new Map<string, { totalSpend: number; txnCount: number }>();
    for (const s of stats) {
        for (const cat of s.categoryBreakdown as Array<{ category: string; totalSpend: number; txnCount: number }>) {
            const existing = totals.get(cat.category) ?? { totalSpend: 0, txnCount: 0 };
            existing.totalSpend += cat.totalSpend ?? 0;
            existing.txnCount += cat.txnCount ?? 0;
            totals.set(cat.category, existing);
        }
    }

    return [...totals.entries()]
        .map(([category, v]) => ({ category, ...v }))
        .sort((a, b) => b.totalSpend - a.totalSpend);
}

export async function getMerchants(category?: string) {
    return prisma.cluster.findMany({
        where: {
            merchantName: { not: null },
            ...(category ? { category } : {}),
        },
        select: {
            id: true,
            merchantName: true,
            payeeName: true,
            category: true,
            confidence: true,
            clusterLength: true,
            bankName: true,
        },
        orderBy: { clusterLength: "desc" },
        take: 200,
    });
}
