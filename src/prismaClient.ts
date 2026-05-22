import "./envConfig.js";
import { PrismaClient } from "./generated/prisma/client.js";

const prisma = new PrismaClient();

export default prisma;