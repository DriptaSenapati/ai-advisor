import "../envConfig.js";
import app from "./app.js";
import fs from "fs";
import path from "path";

const PORT = Number(process.env.PORT ?? 3001);

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

app.listen(PORT, () => {
    console.log(`[API] Server running on http://localhost:${PORT}`);
    console.log(`[API] Swagger docs at http://localhost:${PORT}/api/docs`);
    console.log(`[API] Environment: ${process.env.NODE_ENV ?? "development"}`);
});
