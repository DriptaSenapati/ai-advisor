import type { Request, Response, NextFunction } from "express";
import * as usersService from "../services/users.service.js";
import { ok } from "../response.js";
import { ValidationError } from "../errors.js";
import type { AuthenticatedRequest } from "../middleware/authenticate.js";

export async function getMe(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        ok(res, await usersService.getProfile(userId));
    } catch (err) {
        next(err);
    }
}


export async function uploadAvatar(req: Request, res: Response, next: NextFunction) {
    try {
        const file = req.file;
        const userId = (req as AuthenticatedRequest).user.id;
        if (!file) throw new ValidationError("An image file is required");
        ok(res, await usersService.setAvatar(userId, file.buffer, file.mimetype));
    } catch (err) {
        next(err);
    }
}

export async function deleteAvatar(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        ok(res, await usersService.removeAvatar(userId));
    } catch (err) {
        next(err);
    }
}
