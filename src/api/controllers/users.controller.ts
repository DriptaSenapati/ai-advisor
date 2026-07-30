import fs from "fs/promises";
import path from "path";
import type { Request, Response, NextFunction } from "express";
import * as usersService from "../services/users.service.js";
import { ok } from "../response.js";
import { ValidationError } from "../errors.js";
import { AVATAR_DIR } from "../middleware/upload.js";
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
    const file = req.file;
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        if (!file) throw new ValidationError("An image file is required");
        ok(res, await usersService.setAvatar(userId, file.filename));
    } catch (err) {
        // multer has already written the file to disk by the time this handler
        // runs, so a failure past that point leaves a file nothing references.
        if (file) {
            await fs.unlink(path.join(AVATAR_DIR, file.filename)).catch(() => {});
        }
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
