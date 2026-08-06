import prisma from "../../prismaClient.js";

/** Single Prisma access point for `Testimonial` — both the public read and the
 *  admin CRUD call into this. */

export async function getPublicTestimonials() {
    return prisma.testimonial.findMany({
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: { id: true, quote: true, name: true, role: true, initials: true, bg: true },
    });
}
