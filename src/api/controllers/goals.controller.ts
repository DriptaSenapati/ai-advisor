import type { Request, Response, NextFunction } from "express";
import * as goalsService from "../services/goals.service.js";
import { ok, created, accepted } from "../response.js";
import type { AuthenticatedRequest } from "../middleware/authenticate.js";

export async function listGoals(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const { status } = (req.query as unknown) as { status: "active" | "completed" | "all" };
        const goals = await goalsService.listGoalsByStatus(userId, status);
        ok(res, goals);
    } catch (err) {
        next(err);
    }
}

export async function createGoal(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const goal = await goalsService.createNewGoal(req.body, userId);
        created(res, goal);
    } catch (err) {
        next(err);
    }
}

export async function getGoal(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const id = req.params["id"] as string;
        const goal = await goalsService.getGoalById(id, userId);
        ok(res, goal);
    } catch (err) {
        next(err);
    }
}

export async function updateGoal(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const id = req.params["id"] as string;
        const goal = await goalsService.patchGoal(id, userId, req.body);
        ok(res, goal);
    } catch (err) {
        next(err);
    }
}

export async function deleteGoal(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const id = req.params["id"] as string;
        await goalsService.removeGoal(id, userId);
        ok(res, { deleted: true });
    } catch (err) {
        next(err);
    }
}

export async function analyzeGoal(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const id = req.params["id"] as string;
        await goalsService.getGoalById(id, userId);
        await goalsService.scheduleGoalAnalysis(id, userId);
        accepted(res, { jobStarted: true, goalId: id });
    } catch (err) {
        next(err);
    }
}
