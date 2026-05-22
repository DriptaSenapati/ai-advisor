import mupdf, { Page, PDFPage } from "mupdf";
import fs from "fs";

const NUM_LINES_TO_CHECK_FOR_HEADER = 4;

const extractJSONText = (pdfPath: string) => {
    const doc = mupdf.Document.openDocument(pdfPath).asPDF();
    if (doc) {
        doc.authenticatePassword(process.env.PDF_PASSWORD || "");
        const pageCount = doc.countPages();
        const textContent: Record<string, Record<string, any>> = {};

        for (let i = 0; i < pageCount; i++) {
            const page = doc.loadPage(i);
            // console.log(page.getBounds());
            const jsonText = JSON.parse(page.toStructuredText("preserve-spans").asJSON());
            textContent[i + 1] = jsonText;

            // for (const block of text["blocks"]) {
            //     const annotation = (page as PDFPage).createAnnotation("Polygon");
            //     const x1 = block["bbox"]["x"];
            //     const y1 = block["bbox"]["y"];
            //     const x2 = block["bbox"]["x"] + block["bbox"]["w"];
            //     const y2 = block["bbox"]["y"] + block["bbox"]["h"];
            //     annotation.setColor([0, 0, 1])
            //     annotation.setInteriorColor([])
            //     annotation.addVertex([x1, y1])
            //     annotation.addVertex([x2, y1])
            //     annotation.addVertex([x2, y2])
            //     annotation.addVertex([x1, y2])
            //     annotation.update()
            // }
        }
        // fs.writeFileSync("output-polygon.pdf", doc.saveToBuffer("incremental").asUint8Array())
        return textContent;
    }

};

const _isSameY = (lines: Record<string, any>[]) => {
    if (lines.length === 0) return false;
    const yCoordinate = lines[0]?.["y"];
    return lines.every((obj) => obj["y"] === yCoordinate);
}


const identifyTableHeader = (textContent: Record<string, Record<string, any>>): { [pageNum: string]: { y: number, columns: { text: string, x: number, y: number }[] } } => {
    const headerDetails: Record<string, Record<string, any> | null> = {}

    for (const [pageNum, pageContent] of Object.entries(textContent)) {
        const blocks = pageContent["blocks"];
        let headerFound = false;
        for (const block of blocks) {
            // console.log(block.lines, block.lines.length, _isSameY(block.lines), (block.lines as Record<string, any>[]).some(line => line["text"].toLowerCase().includes("date")));
            if (block.lines.length >= NUM_LINES_TO_CHECK_FOR_HEADER && _isSameY(block.lines) && (block.lines as Record<string, any>[]).some(line => line["text"].toLowerCase().includes("date"))) {
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
    const rows: Record<string, any>[][] = []

    let currentRow: Record<string, any>[] = [];
    for (const line of lines) {
        if (_isDate(line.text)) {
            if (currentRow.length > 0) {
                rows.push([...currentRow]);
                currentRow = [line];
            } else {
                currentRow.push(line);
            }
        } else {
            currentRow.push(line);
        }
    }
    if (currentRow.length > 0) {
        rows.push([...currentRow]);

    }

    return rows;
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
            if (Math.abs(a.y - b.y) < 2) return a.x - b.x;
            return a.y - b.y;
        });
    }

    return flattenLines;
}

const _filterBlocksBelowHeader = (textContent: Record<string, Record<string, any>>, headerDetails: Record<string, Record<string, any>>): { [pageNum: string]: Record<string, any>[] } => {
    const headerY: { [pageNum: string]: number } = Object.fromEntries(Object.entries(headerDetails).map(([pageNum, details]) => [pageNum, details.y]));
    return Object.fromEntries(Object.entries(headerY).map(([pageNum, y]) => textContent[pageNum] != undefined ? [pageNum, textContent[pageNum]["blocks"].filter((block: Record<string, any>) => block.bbox.y > y)] : [pageNum, []]));
}

const _groupColumnsPerPage = (rows: Record<string, any>[][], headerDetails: { text: string, x: number, y: number }[]) => {
    let groupedColumns: { [header: string]: string[] }[] = [];

    for (const row of rows) {
        let column: { [header: string]: string[] } = Object.fromEntries(headerDetails.map(header => [header.text, []]));
        for (const line of row) {
            let closestHeader = headerDetails[0];
            const eligibleHeaders = headerDetails.filter(header => header.x < (line.x + line.bbox.w));
            for (const header of eligibleHeaders) {
                if (Math.abs(line.x - header.x) <= Math.abs(line.x - closestHeader!.x)) {
                    closestHeader = header;
                }

            }
            column[closestHeader!.text] = [...(column[closestHeader!.text] || []), line.text];
        }
        groupedColumns.push(column);
    }
    return groupedColumns.map(col => Object.fromEntries(Object.entries(col).map(([header, values]) => [header, values.join(" ")])));
}

const _groupColumns = (rows: {
    [pageNum: string]: Record<string, any>[][];
}, headerDetails: Record<string, any>) => {
    let groupColumns: { [pageNum: string]: { [header: string]: string }[] } = {};
    for (const [pageNum, pageRows] of Object.entries(rows)) {
        const header = headerDetails[pageNum];
        const colPerPage = _groupColumnsPerPage(pageRows, header.columns);
        groupColumns[pageNum] = colPerPage;
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