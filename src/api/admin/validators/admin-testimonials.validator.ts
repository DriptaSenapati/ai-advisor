import { z } from "zod";

/** The six CSS variables the default testimonials use, already re-pointed for
 *  dark mode — kept as a closed set so an admin can't accidentally pick a
 *  token with no dark-theme answer. */
export const TESTIMONIAL_BG_TOKENS = [
    "var(--ember-500)",
    "var(--ember-400)",
    "var(--ember-600)",
    "var(--rust-500)",
    "var(--grey-2)",
    "var(--grey-3)",
] as const;

const testimonialFields = {
    quote: z.string().min(1).max(600),
    name: z.string().min(1).max(100),
    role: z.string().min(1).max(100),
    initials: z.string().min(1).max(4),
    bg: z.enum(TESTIMONIAL_BG_TOKENS),
    order: z.coerce.number().int().default(0),
};

export const createTestimonialSchema = z.object(testimonialFields);
export const updateTestimonialSchema = z.object(testimonialFields).partial();
