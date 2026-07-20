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
    constructor(message: string) {
        super(409, "CONFLICT", message);
    }
}

export class UnprocessableError extends ApiError {
    constructor(message: string) {
        super(422, "UNPROCESSABLE_ENTITY", message);
    }
}

export function assertValidObjectId(id: string): void {
    if (!/^[a-f\d]{24}$/i.test(id)) {
        throw new ValidationError([{ path: ["id"], message: "Must be a valid 24-character hex ObjectId" }]);
    }
}
