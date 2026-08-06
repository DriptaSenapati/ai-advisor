import prisma from "../../../prismaClient.js";
import { NotFoundError, assertValidObjectId } from "../../errors.js";

export async function listAdminTestimonials() {
    return prisma.testimonial.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] });
}

export async function createTestimonial(data: {
    quote: string;
    name: string;
    role: string;
    initials: string;
    bg: string;
    order: number;
}) {
    return prisma.testimonial.create({ data });
}

export async function updateTestimonial(
    id: string,
    data: Partial<{ quote: string; name: string; role: string; initials: string; bg: string; order: number }>
) {
    assertValidObjectId(id);
    const existing = await prisma.testimonial.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Testimonial", id);
    return prisma.testimonial.update({ where: { id }, data });
}

export async function deleteTestimonial(id: string) {
    assertValidObjectId(id);
    const existing = await prisma.testimonial.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Testimonial", id);
    await prisma.testimonial.delete({ where: { id } });
}
