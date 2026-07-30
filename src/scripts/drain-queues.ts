/**
 * Empty the statement queues.
 *
 * Needed after the two-phase split: any `pdf.process` job enqueued by the old
 * single-job flow carries `{ filePath, bankName, pdfPassword }`, which the new
 * phase-2 worker does not read, and points at a statement the schema reset
 * deleted. Left in Redis they would run, fail three times each, and publish
 * failures for statements that no longer exist.
 *
 *   npm run drain:queues
 */
import "../envConfig.js";
import { extractQueue, pdfQueue } from "../queue/index.js";

for (const queue of [extractQueue, pdfQueue]) {
    const counts = await queue.getJobCounts();
    await queue.obliterate({ force: true });
    console.log(`Drained ${queue.name} —`, counts);
}

console.log("Done.");
process.exit(0);
