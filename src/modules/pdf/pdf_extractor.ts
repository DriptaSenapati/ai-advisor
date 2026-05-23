import mupdf, { Page, PDFPage } from "mupdf";
import fs from "fs";

const NUM_LINES_TO_CHECK_FOR_HEADER = 5;

const extractJSONText = (pdfPath: string) => {
    const doc = mupdf.Document.openDocument(pdfPath).asPDF();
    if (!doc) throw new Error(`Failed to open PDF: ${pdfPath}`);

    if (doc.needsPassword()) {
        const authenticated = doc.authenticatePassword(process.env.PDF_PASSWORD || "");
        if (!authenticated) throw new Error(`Incorrect or missing password for PDF: ${pdfPath}`);
    }

    const pageCount = doc.countPages();
    const textContent: Record<string, Record<string, any>> = {};

    for (let i = 0; i < pageCount; i++) {
        const page = doc.loadPage(i);
        const jsonText = JSON.parse(page.toStructuredText("preserve-spans").asJSON());
        if ((jsonText["blocks"] as any[]).length > 0) {
            textContent[i + 1] = jsonText;
        }
    }

    return textContent;
};

const Y_TOLERANCE = 2;

const _isSameY = (lines: Record<string, any>[]) => {
    if (lines.length === 0) return false;
    const yCoordinate = lines[0]?.["y"];
    return lines.every((obj) => Math.abs(obj["y"] - yCoordinate) <= Y_TOLERANCE);
}


const identifyTableHeader = (textContent: Record<string, Record<string, any>>): { [pageNum: string]: { y: number, columns: { text: string, x: number, y: number }[] } } => {
    const headerDetails: Record<string, Record<string, any> | null> = {}

    for (const [pageNum, pageContent] of Object.entries(textContent)) {
        const blocks = pageContent["blocks"];
        let headerFound = false;
        for (const block of blocks) {
            // console.log(block.lines, block.lines.length, _isSameY(block.lines), (block.lines as Record<string, any>[]).some(line => line["text"].toLowerCase().includes("date")));
            if (block.lines.length >= NUM_LINES_TO_CHECK_FOR_HEADER && _isSameY(block.lines) && (block.lines as Record<string, any>[]).some(line => /\bdate\b/i.test(line["text"]))) {
                headerDetails[pageNum] = {
                    y: block.bbox.y,
                    columns: block.lines.map((line: Record<string, any>) => ({ text: line["text"], x: line["x"], y: line["y"] }))
                };
                headerFound = true;
                break;
            }
        }
        if (!headerFound) {
            headerDetails[pageNum] = null;
        }
    }
    const nonNullHeaderDetails: { [pageNum: string]: { y: number, columns: { text: string, x: number, y: number }[] } } = Object.fromEntries(Object.entries(headerDetails).filter(([_, details]) => details !== null) as Array<[string, { y: number, columns: { text: string, x: number, y: number }[] }]>)
    if (Object.keys(nonNullHeaderDetails).length === 0) {
        throw new Error("No transaction table header found in the PDF. The statement format may not be supported.");
    }
    return nonNullHeaderDetails;
}



const _isDate = (text: string) => {
    const datePatterns = [
        /^\d{2}\/\d{2}\/\d{2,4}/,
        /^\d{2}-\d{2}-\d{2,4}/,
        /^\d{1,2} [A-Za-z]{3} \d{4}/,
        /^\d{1,2} [A-Za-z]+ \d{4}/,
        /^[A-Za-z]{3,} \d{1,2}, \d{4}/,
        /^\d{4}-\d{2}-\d{2}/
    ];

    return datePatterns.some(p => p.test(text));
}

const _singlePageRowGrouper = (lines: Record<string, any>[]) => {
    const rows: Record<string, any>[][] = [];
    let currentRow: Record<string, any>[] = [];
    let currentRowStartY: number | null = null;

    for (const line of lines) {
        const isNewRowDate = _isDate(line.text) &&
            (currentRowStartY === null || Math.abs(line.y - currentRowStartY) >= Y_TOLERANCE);

        if (isNewRowDate) {
            if (currentRow.length > 0) {
                rows.push([...currentRow]);
            }
            currentRow = [line];
            currentRowStartY = line.y;
        } else {
            currentRow.push(line);
        }
    }
    if (currentRow.length > 0) {
        rows.push([...currentRow]);
    }

    return rows.filter(row => row.length > 0 && _isDate(row[0]!.text));
}


const _groupRows = (flattenedLines: {
    [pageNum: string]: Record<string, any>[];
}) => {
    const groupedRows: { [pageNum: string]: Record<string, any>[][] } = {};
    for (const [pageNum, lines] of Object.entries(flattenedLines)) {
        const rows = _singlePageRowGrouper(lines);
        groupedRows[pageNum] = rows;
    }
    return groupedRows;

}

const _flattenLines = (filteredBlocks: {
    [pageNum: string]: Record<string, any>[];
}) => {
    const flattenLines: { [pageNum: string]: Record<string, any>[] } = {};

    for (const [pageNum, blocks] of Object.entries(filteredBlocks)) {
        flattenLines[pageNum] = blocks.map((block: Record<string, any>) => block.lines).flat();
        flattenLines[pageNum] = flattenLines[pageNum].sort((a, b) => {
            if (Math.abs(a.y - b.y) < Y_TOLERANCE) return a.x - b.x;
            return a.y - b.y;
        });
    }

    return flattenLines;
}

const MIN_CONSECUTIVE_TRANSACTION_BLOCKS = 3;

const _filterBlocksBelowHeader = (textContent: Record<string, Record<string, any>>, headerDetails: Record<string, Record<string, any>>): { [pageNum: string]: Record<string, any>[] } => {
    return Object.fromEntries(
        Object.entries(textContent).map(([pageNum, pageContent]) => {
            const header = headerDetails[pageNum];
            if (header) {
                return [pageNum, pageContent["blocks"].filter((block: Record<string, any>) => block.bbox.y > header.y)];
            }

            // No header — find the first run of MIN_CONSECUTIVE_TRANSACTION_BLOCKS consecutive
            // blocks each having >= NUM_LINES_TO_CHECK_FOR_HEADER lines. That marks the start
            // of the transaction table on this page.
            const blocks: Record<string, any>[] = pageContent["blocks"];
            let consecutive = 0;
            let startIdx = -1;

            for (let i = 0; i < blocks.length; i++) {
                if (blocks[i]!.lines.length >= NUM_LINES_TO_CHECK_FOR_HEADER) {
                    consecutive++;
                    if (consecutive === MIN_CONSECUTIVE_TRANSACTION_BLOCKS) {
                        startIdx = i - (MIN_CONSECUTIVE_TRANSACTION_BLOCKS - 1);
                        break;
                    }
                } else {
                    consecutive = 0;
                }
            }

            // Fallback: consecutive run not found (too few blocks or non-transaction blocks
            // interspersed) — start from the first block that has enough lines
            if (startIdx === -1) {
                startIdx = blocks.findIndex(b => b.lines.length >= NUM_LINES_TO_CHECK_FOR_HEADER);
            }

            return [pageNum, startIdx !== -1 ? blocks.slice(startIdx) : []];
        })
    );
}

const _groupColumnsPerPage = (rows: Record<string, any>[][], headerDetails: { text: string, x: number, y: number }[]) => {
    const sortedHeaders = [...headerDetails].sort((a, b) => a.x - b.x);
    const leftmostHeader = sortedHeaders[0]!;
    const secondHeader = sortedHeaders[1];

    let groupedColumns: { [header: string]: string[] }[] = [];

    for (const row of rows) {
        let column: { [header: string]: string[] } = Object.fromEntries(headerDetails.map(header => [header.text, []]));
        for (const line of row) {
            const eligibleHeaders = sortedHeaders.filter(header => header.x < (line.x + line.bbox.w));
            const searchHeaders = eligibleHeaders.length > 0 ? eligibleHeaders : sortedHeaders;
            let closestHeader = searchHeaders[0]!;
            for (const header of searchHeaders) {
                if (Math.abs(line.x - header.x) < Math.abs(line.x - closestHeader.x)) {
                    closestHeader = header;
                }
            }

            // The leftmost column (Date) holds exactly one value — the date that opened this row.
            // Any subsequent line assigned to it is narration content whose X happens to be
            // closer to the Date header than to the Narration header (common in HDFC format).
            // Redirect those lines to the next column to the right.
            if (closestHeader.text === leftmostHeader.text && column[leftmostHeader.text]!.length > 0 && secondHeader) {
                closestHeader = secondHeader;
            }

            column[closestHeader.text] = [...(column[closestHeader.text] || []), line.text];
        }
        groupedColumns.push(column);
    }
    return groupedColumns.map(col => Object.fromEntries(Object.entries(col).map(([header, values]) => [header, values.join(" ")])));
}

const _groupColumns = (rows: {
    [pageNum: string]: Record<string, any>[][];
}, headerDetails: Record<string, any>) => {
    let groupColumns: { [pageNum: string]: { [header: string]: string }[] } = {};
    let lastKnownHeader: { columns: { text: string, x: number, y: number }[] } | null = null;

    const sortedPageNums = Object.keys(rows).sort((a, b) => parseInt(a) - parseInt(b));

    for (const pageNum of sortedPageNums) {
        const pageRows = rows[pageNum]!;
        const header = headerDetails[pageNum] ?? lastKnownHeader;

        if (!header) {
            console.warn(`[PDF Extractor] No header available for page ${pageNum} — skipping`);
            continue;
        }

        if (headerDetails[pageNum]) {
            lastKnownHeader = headerDetails[pageNum];
        }

        groupColumns[pageNum] = _groupColumnsPerPage(pageRows, header.columns);
    }
    return groupColumns;
}

const buildTransactionData = (pdfPath: string) => {
    // extract JSON text from PDF
    const textContent = extractJSONText(pdfPath);
    // identify header of the transaction table, store y coordinate of the header
    if (!textContent) return;
    const headerDetails = identifyTableHeader(textContent);
    // console.log(headerDetails[2]);

    // filter blocks that are below the header y coordinate for each page and have at least 4(NUM_LINES_TO_CHECK_FOR_HEADER) lines (to avoid picking up blocks that are not part of the transaction table)
    const filteredBlocks = _filterBlocksBelowHeader(textContent, headerDetails);


    // flatten the lines of all blocks into a single array, filter lines that have y coordinate > header y coordinate
    const flattenedLines = _flattenLines(filteredBlocks);
    // console.log(Object.keys(flattenedLines), flattenedLines[20][flattenedLines[20].length - 1]);

    // extract and group rows of the transaction table, rows should have > y coordinate of the header
    const groupedRows = _groupRows(flattenedLines);
    // console.log(Object.keys(groupedRows), groupedRows[2]);

    // group each line from row into columns based on x coordinate, we can use the header column x coordinates as reference
    const groupedColumns = _groupColumns(groupedRows, headerDetails);
    // console.log(Object.keys(groupedColumns), groupedColumns[1], headerDetails[1]);

    // fs.writeFile("extracted_data.json", JSON.stringify(groupedColumns[1], null, 2), "utf-8", (err) => {
    //     if (err) {
    //         console.error("Error writing to file", err);
    //     } else {
    //         console.log("Data successfully written to extracted_data.json");
    //     }
    // });
    return groupedColumns;
}

export { buildTransactionData };