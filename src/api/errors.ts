export class ApiError extends Error {
    constructor(
        public readonly statusCode: number,
        public readonly code: string,
        message: string,
        public readonly details?: unknown
    ) {
        super(message);
        this.name = this.constructor.name;
    }
}

export class NotFoundError extends ApiError {
    constructor(resource: string, id?: string) {
        super(404, "NOT_FOUND", id ? `${resource} with id "${id}" not found` : `${resource} not found`);
    }
}

export class ValidationError extends ApiError {
    constructor(details: unknown) {
        super(400, "VALIDATION_ERROR", "Request validation failed", details);
    }
}

export class ConflictError extends ApiError {
    /**
     * `code` is overridable because the gate has three distinct 409s
     * (`NOT_EXTRACTED`, `EXTRACTION_FAILED`, `ALREADY_STARTED`) and the client
     * has to tell them apart — `ALREADY_STARTED` is treated as success, the other
     * two are not. Matching on the message string would be fragile.
     */
    constructor(message: string, code: string = "CONFLICT") {
        super(409, code, message);
    }
}

export class UnprocessableError extends ApiError {
    constructor(message: string) {
        super(422, "UNPROCESSABLE_ENTITY", message);
    }
}

/**
 * The caller's plan does not include this feature.
 *
 * **403, not 402.** `Payment Required` reads like the right answer and isn't:
 * there is no payment flow to send anyone to, and the free plan is a real plan
 * rather than an unpaid invoice. 403 says "not for you as you are", which is
 * exactly the case.
 *
 * `details` carries `requiredPlan` so the client can say *which* plan unlocks
 * it. Making the UI derive that from its own copy of the catalog would put the
 * upgrade prompt one deploy out of step with the rule that produced it.
 */
export class PlanRequiredError extends ApiError {
    constructor(feature: string, requiredPlan: string | null, currentPlan: string, message?: string) {
        super(
            403,
            "PLAN_REQUIRED",
            message ?? `This feature is not included in your current plan`,
            { feature, requiredPlan, currentPlan }
        );
    }
}

/** The caller's plan includes this feature but they have used their allowance of it. */
export class PlanLimitError extends ApiError {
    constructor(
        feature: string,
        limit: number,
        used: number,
        requiredPlan: string | null,
        currentPlan: string,
        message?: string
    ) {
        super(403, "PLAN_LIMIT_EXCEEDED", message ?? `You have reached your plan's limit`, {
            feature,
            limit,
            used,
            requiredPlan,
            currentPlan,
        });
    }
}

export function assertValidObjectId(id: string): void {
    if (!/^[a-f\d]{24}$/i.test(id)) {
        throw new ValidationError([{ path: ["id"], message: "Must be a valid 24-character hex ObjectId" }]);
    }
}
