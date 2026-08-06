import prisma from "../../../prismaClient.js";

export async function listAdminJobs(
    page: number,
    limit: number,
    jobType?: string,
    status?: string,
    from?: string,
    to?: string
) {
    const where = {
        ...(jobType ? { jobType } : {}),
        ...(status ? { status } : {}),
        ...(from || to
            ? {
                  startedAt: {
                      ...(from ? { gte: new Date(from) } : {}),
                      ...(to ? { lte: new Date(to) } : {}),
                  },
              }
            : {}),
    };

    const [total, rows] = await Promise.all([
        prisma.adminJobLog.count({ where }),
        prisma.adminJobLog.findMany({
            where,
            orderBy: { startedAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
        }),
    ]);

    return { data: rows, total };
}
