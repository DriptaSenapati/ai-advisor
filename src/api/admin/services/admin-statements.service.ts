import prisma from "../../../prismaClient.js";
import { NotFoundError, assertValidObjectId } from "../../errors.js";

/**
 * Deliberately **not** a reuse of `statements.service.ts`'s `listStatements` —
 * that query is user-scoped by design (`where: { userId, ... }`). This is the
 * cross-user admin view: same filter shape, no `userId` in the where clause,
 * plus the owning user's name/email attached via a batched second lookup.
 */
export async function listAdminStatements(
    page: number,
    limit: number,
    status?: string,
    gate?: string,
    bankName?: string,
    extractionStatus?: string
) {
    const where = {
        ...(bankName ? { bankName: { contains: bankName, mode: "insensitive" as const } } : {}),
        ...(status ? { normalizerStatus: status } : {}),
        ...(extractionStatus ? { extractionStatus } : {}),
        ...(gate ? { gateDecision: gate } : {}),
    };

    const [total, rows] = await Promise.all([
        prisma.statementMetadata.count({ where }),
        prisma.statementMetadata.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
            select: {
                id: true,
                userId: true,
                fileName: true,
                bankName: true,
                createdAt: true,
                updatedAt: true,
                extractionStatus: true,
                normalizerStatus: true,
                categorizationStatus: true,
                insightsStatus: true,
                gateDecision: true,
                extractionError: true,
                normalizerError: true,
                insightsError: true,
                balanceGapCount: true,
                extractionConfidence: true,
                rawRowCount: true,
                totalTransactions: true,
            },
        }),
    ]);

    const userIds = [...new Set(rows.map((r) => r.userId).filter((id): id is string => !!id))];
    const users = userIds.length
        ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
        : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    const data = rows.map((r) => ({ ...r, user: r.userId ? (userById.get(r.userId) ?? null) : null }));
    return { data, total };
}

export async function getAdminStatementDetail(id: string) {
    assertValidObjectId(id);
    const statement = await prisma.statementMetadata.findUnique({
        where: { id },
        include: { gateDecisions: { orderBy: { decidedAt: "desc" } } },
    });
    if (!statement) throw new NotFoundError("Statement", id);

    const user = statement.userId
        ? await prisma.user.findUnique({ where: { id: statement.userId }, select: { id: true, name: true, email: true } })
        : null;

    // retainedFile is a server-side filename marker — never returned by any
    // admin route, same rule the product API follows in `toPublicStatement`.
    // awaitingPassword is the one bit an admin needs from it.
    const awaitingPassword = Boolean(statement.retainedFile);
    const publicStatement: Record<string, unknown> = { ...statement };
    delete publicStatement["retainedFile"];

    return { ...publicStatement, user, awaitingPassword };
}
