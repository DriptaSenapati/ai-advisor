import { GraphNode } from "@langchain/langgraph";
import { agentGraphSchema } from "../../../graph_state.js";
import { llmSystemMessage, structuredLlm } from "../../../models/index.js";

// create a batch of size process.env.BATCH_SIZE from list of transaction and split them into chunks of size process.env.CHUNK_SIZE
// for each batch invoke the llm and get the normalized transactions and then combine the results of all batches and return the final normalized transactions
function* batchTransactions(transactions: any[], batchSize: number = parseInt(process.env.BATCH_SIZE as string), chunkSize: number = parseInt(process.env.CHUNK_SIZE as string)) {
    for (let i = 0; i < transactions.length; i += batchSize) {
        const batch = transactions.slice(i, i + batchSize);

        yield [
            batch.slice(0, chunkSize),
            batch.slice(chunkSize, 2 * chunkSize),
        ]
    }
}


const statementErrorFetcherNode: GraphNode<typeof agentGraphSchema> = async (state) => {
    // flatten the extracted data

    const errorData: { errorRows: any[] } = { errorRows: [] };

    // for (const batch of batchTransactions(state.transactionData || [])) {
    //     const normDataList = (await Promise.all(batch.map(chunk => llmSystemMessage.pipe(structuredLlm).invoke({ extractedData: chunk })))).flat();
    //     errorData.errorRows.push(...normDataList.map(data => data.errorRows).flat());
    // }

    return {
        ...state, errorData: {
            "errorRows": [
                {
                    "action": "ACTION_REMOVE",
                    "rationale": "Row represents opening balance/non-transaction summary. Description contains keyword 'Opening Balance' and amounts are '-' not numeric, so row should be removed per rules 3 and 4.",
                    "row": [
                        {
                            "date": "",
                            "description": "Opening Balance -",
                            "creditAmount": "-",
                            "debitAmount": "-",
                            "balance": "5,49,995.54",
                            "tempId": "47c9422f-fbcf-46f8-8384-af7c52c94e54"
                        }
                    ]
                },
                {
                    "action": "ACTION_INCORRECT",
                    "rationale": "Balance field contains non-numeric text ' Page 1 of  22' appended; remove noise while keeping numeric value unchanged.",
                    "row": [
                        {
                            "date": "16 Jan 2025",
                            "description": "UPI/Amazon Pay/501617662728/You are paying",
                            "creditAmount": "",
                            "debitAmount": "269.00",
                            "balance": "5,30,957.40",
                            "tempId": "b41756fa-c551-408f-9d4f-893f26890f8e"
                        }
                    ]
                },
                {
                    "action": "ACTION_REMOVE",
                    "rationale": "Row has empty date, description, amounts, and balance; represents non-transactional noise and should be removed.",
                    "row": [
                        {
                            "date": "",
                            "description": "",
                            "creditAmount": "",
                            "debitAmount": "",
                            "balance": "",
                            "tempId": "b2fa6af4-0ea2-4f4f-bde4-873bab1eb6ae"
                        }
                    ]
                },
                {
                    "action": "ACTION_INCORRECT",
                    "rationale": "Balance field contains non-numeric text ' Page 2 of  22' which is extraction noise; remove the noise while keeping numeric value unchanged.",
                    "row": [
                        {
                            "date": "02 Feb 2025",
                            "description": "UPI/Indian Clearing/503324054883/Payment request",
                            "creditAmount": "",
                            "debitAmount": "4,000.00",
                            "balance": "5,74,746.48",
                            "tempId": "d03e3cd4-2933-496b-8bee-92cf64933c12"
                        }
                    ]
                },
                {
                    "action": "ACTION_REMOVE",
                    "rationale": "Row has empty date, description, amount, and balance; represents non-transactional blank/noise row.",
                    "row": [
                        {
                            "date": "",
                            "description": "",
                            "creditAmount": "",
                            "debitAmount": "",
                            "balance": "",
                            "tempId": "19ef52db-61ad-4139-a84f-a58fb04d20ff"
                        }
                    ]
                },
                {
                    "action": "ACTION_INCORRECT",
                    "rationale": "Date contains an extra trailing character 'a'. Correcting date format while keeping numeric values unchanged.",
                    "row": [
                        {
                            "date": "07 Feb 2025",
                            "description": "UPI/ARKADIPTAGHOSH/503831401906/Shradh",
                            "creditAmount": "750.00",
                            "debitAmount": "",
                            "balance": "5,76,497.24",
                            "tempId": "420ae45c-58c2-40c3-89bb-d586e461d5f7"
                        }
                    ]
                },
                {
                    "action": "ACTION_REMOVE",
                    "rationale": "Row is completely empty (no date, description, or amounts). It represents extraction noise, not a valid transaction.",
                    "row": [
                        {
                            "date": "",
                            "description": "",
                            "creditAmount": "",
                            "debitAmount": "",
                            "balance": "",
                            "tempId": "cd18384f-68cf-4a5e-8dec-da488cb960da"
                        }
                    ]
                },
                {
                    "action": "ACTION_INCORRECT",
                    "rationale": "Balance field contains non-numeric text ' Page 3 of  22'. Removing the extraneous page footer text while keeping the numeric balance value unchanged.",
                    "row": [
                        {
                            "date": "07 Feb 2025",
                            "description": "UPI/dassayanta3-3@o/540447868118/UPI",
                            "creditAmount": "",
                            "debitAmount": "421.00",
                            "balance": "5,76,037.24",
                            "tempId": "0259763e-d8a7-4430-bf00-6740b5ca0d1c"
                        }
                    ]
                },
                {
                    "action": "ACTION_INCORRECT",
                    "rationale": "Balance field contains non-numeric page footer text; remove trailing ' Page 4 of  22' while keeping numeric value unchanged.",
                    "row": [
                        {
                            "date": "27 Feb 2025",
                            "description": "UPI/Amazon India/505802097020/You are paying",
                            "creditAmount": "",
                            "debitAmount": "305.00",
                            "balance": "5,23,027.47",
                            "tempId": "68b1456e-efdb-42fe-8955-fc588fc620e2"
                        }
                    ]
                },
                {
                    "action": "ACTION_REMOVE",
                    "rationale": "Row is completely empty (no date, description, or amounts); represents non-transaction noise and should be removed.",
                    "row": [
                        {
                            "date": "",
                            "description": "",
                            "creditAmount": "",
                            "debitAmount": "",
                            "balance": "",
                            "tempId": "195fa19a-e4b8-48c5-9741-767752c93ae2"
                        }
                    ]
                },
                {
                    "action": "ACTION_INCORRECT",
                    "rationale": "Balance field contains non-numeric text ' Page 5 of  22' which is extraction noise; remove the text while keeping numeric value unchanged.",
                    "row": [
                        {
                            "date": "17 Mar 2025",
                            "description": "UPI/Amazon Pay/507673426649/You are",
                            "creditAmount": "",
                            "debitAmount": "499.00",
                            "balance": "5,17,780.23",
                            "tempId": "14a3d7a6-435d-46cc-904b-80b73486335b"
                        }
                    ]
                },
                {
                    "action": "ACTION_REMOVE",
                    "rationale": "Row has empty date, empty amounts, and empty balance with a single vague word 'paying' as description; this is extraction noise and not a valid transaction.",
                    "row": [
                        {
                            "date": "",
                            "description": "paying",
                            "creditAmount": "",
                            "debitAmount": "",
                            "balance": "",
                            "tempId": "86ec310e-6686-45d5-aaba-5f05503cfc14"
                        }
                    ]
                },
                {
                    "action": "ACTION_INCORRECT",
                    "rationale": "Balance field contains non-numeric text ' Page 6 of  22' appended to the numeric balance; remove the extraneous text while keeping numeric value unchanged.",
                    "row": [
                        {
                            "date": "10 Apr 2025",
                            "description": "UPI/SUBHANKAR SINGH/510066321317/UPI",
                            "creditAmount": "",
                            "debitAmount": "69.00",
                            "balance": "5,92,795.47",
                            "tempId": "e3764bd4-8964-468a-be85-0601237d436f"
                        }
                    ]
                },
                {
                    "action": "ACTION_REMOVE",
                    "rationale": "Row has empty date, description, amount, and balance; represents non-transaction noise and should be removed.",
                    "row": [
                        {
                            "date": "",
                            "description": "",
                            "creditAmount": "",
                            "debitAmount": "",
                            "balance": "",
                            "tempId": "92aac79e-ae30-4325-9603-8e8a46ecc872"
                        }
                    ]
                },
                {
                    "action": "ACTION_INCORRECT",
                    "rationale": "Balance field contains non-numeric text ' Page 7 of  22' appended; remove the non-numeric part while keeping numeric value unchanged.",
                    "row": [
                        {
                            "date": "30 Apr 2025",
                            "description": "NEFT HDFCH00208048948 TATA AIA LIFE INSURANCE COM",
                            "creditAmount": "22,369.00",
                            "debitAmount": "",
                            "balance": "5,35,865.01",
                            "tempId": "dc043a0d-3f9f-45c7-8758-ef655c68e816"
                        }
                    ]
                },
                {
                    "action": "ACTION_REMOVE",
                    "rationale": "Row has empty date, description, amount, and balance; represents non-transaction noise and should be removed.",
                    "row": [
                        {
                            "date": "",
                            "description": "",
                            "creditAmount": "",
                            "debitAmount": "",
                            "balance": "",
                            "tempId": "b14cca1a-857e-40b1-9dc0-5638bd7717f3"
                        }
                    ]
                },
                {
                    "action": "ACTION_INCORRECT",
                    "rationale": "Balance field contains non-numeric text ' Page 8 of  22'. Remove the non-numeric part while keeping numeric value unchanged.",
                    "row": [
                        {
                            "date": "13 May 2025",
                            "description": "UPI_CRADJ_U2_TDT_080525_512809689079_ 12MAY2025_9C",
                            "creditAmount": "217.69",
                            "debitAmount": "",
                            "balance": "6,03,712.37",
                            "tempId": "8205bf28-2087-42af-b86b-d85069ed5f35"
                        }
                    ]
                },
                {
                    "action": "ACTION_REMOVE",
                    "rationale": "Row has empty date, description, amount, and balance fields; represents non-transaction noise and should be removed.",
                    "row": [
                        {
                            "date": "",
                            "description": "",
                            "creditAmount": "",
                            "debitAmount": "",
                            "balance": "",
                            "tempId": "eef714ad-99f3-4b26-829d-5b03256cb2d4"
                        }
                    ]
                },
                {
                    "action": "ACTION_INCORRECT",
                    "rationale": "Balance field contains non-numeric text ' Page 9 of  22' appended; remove the page text while keeping numeric value unchanged.",
                    "row": [
                        {
                            "date": "07 Jun 2025",
                            "description": "UPI/Indian Clearing/515857295698/Indian Clearing",
                            "creditAmount": "",
                            "debitAmount": "2,000.00",
                            "balance": "6,10,486.03",
                            "tempId": "1f040279-63eb-476e-ade1-fa18a1fa9d2d"
                        }
                    ]
                },
                {
                    "action": "ACTION_REMOVE",
                    "rationale": "Row has empty date, description, and amount fields, indicating it is not a valid transaction and likely extraction noise.",
                    "row": [
                        {
                            "date": "",
                            "description": "",
                            "creditAmount": "",
                            "debitAmount": "",
                            "balance": "",
                            "tempId": "77f31963-a305-4518-aa9c-6734a92a37ae"
                        }
                    ]
                },
                {
                    "action": "ACTION_INCORRECT",
                    "rationale": "Balance field contains non-numeric text ' Page 10 of  22' appended; remove page text while keeping numeric value unchanged.",
                    "row": [
                        {
                            "date": "24 Jun 2025",
                            "description": "UPI/JAY SINGH/517544908918/UPI",
                            "creditAmount": "",
                            "debitAmount": "80.00",
                            "balance": "5,67,851.89",
                            "tempId": "aefd948b-d72f-4cba-a27d-8a9aa32c883f"
                        }
                    ]
                },
                {
                    "action": "ACTION_REMOVE",
                    "rationale": "Row has empty date, description, amount, and balance; represents non-transaction noise and should be removed.",
                    "row": [
                        {
                            "date": "",
                            "description": "",
                            "creditAmount": "",
                            "debitAmount": "",
                            "balance": "",
                            "tempId": "0985c164-da9a-45bd-af02-7568f4b376e3"
                        }
                    ]
                },
                {
                    "action": "ACTION_INCORRECT",
                    "rationale": "Balance field contains non-numeric text ' Page 11 of  22' appended; remove page text while keeping numeric value unchanged.",
                    "row": [
                        {
                            "date": "27 Jul 2025",
                            "description": "UPI/Google",
                            "creditAmount": "",
                            "debitAmount": "529.00",
                            "balance": "5,83,624.24",
                            "tempId": "c028252f-18cb-43b8-a5c8-edf37507a622"
                        }
                    ]
                },
                {
                    "action": "ACTION_REMOVE",
                    "rationale": "Row is a continuation/extraction noise for previous description; missing date, amounts, and balance, so it is not a standalone transaction.",
                    "row": [
                        {
                            "date": "",
                            "description": "Play/938874772085/MandateExecute",
                            "creditAmount": "",
                            "debitAmount": "",
                            "balance": "",
                            "tempId": "b9f79a29-29a3-4234-92db-fa061bc00170"
                        }
                    ]
                },
                {
                    "action": "ACTION_INCORRECT",
                    "rationale": "Balance field contains non-transaction text ' Page 12 of  22' which is extraction noise; remove this text while keeping numeric value unchanged.",
                    "row": [
                        {
                            "date": "17 Aug 2025",
                            "description": "UPI/Ganesh Bhandar/559595671596/UPI",
                            "creditAmount": "",
                            "debitAmount": "25.00",
                            "balance": "6,13,320.29",
                            "tempId": "d4d736de-d6e0-4efd-b930-4870f7cd8331"
                        }
                    ]
                },
                {
                    "action": "ACTION_REMOVE",
                    "rationale": "Row has empty date, description, and all amount/balance fields; represents non-transaction extraction noise and should be removed.",
                    "row": [
                        {
                            "date": "",
                            "description": "",
                            "creditAmount": "",
                            "debitAmount": "",
                            "balance": "",
                            "tempId": "71bbf1b0-7cda-4b0d-8791-e02af95b8195"
                        }
                    ]
                },
                {
                    "action": "ACTION_INCORRECT",
                    "rationale": "Date contains an extra trailing digit '5' making the format invalid; correctable by removing the stray character.",
                    "row": [
                        {
                            "date": "23 Aug 2025",
                            "description": "PCD/3224/GOOGLEPLAY/MUMBAI230825/10:1",
                            "creditAmount": "",
                            "debitAmount": "149.00",
                            "balance": "6,04,255.64",
                            "tempId": "0930e925-46de-4128-bc90-de0176357d4f"
                        }
                    ]
                },
                {
                    "action": "ACTION_INCORRECT",
                    "rationale": "Balance field contains trailing non-numeric text ' Page 13 of  22' which is extraction noise; must be cleaned while keeping numeric value unchanged.",
                    "row": [
                        {
                            "date": "04 Sep 2025",
                            "description": "UPI/Google India Di/561354650029/UPI",
                            "creditAmount": "",
                            "debitAmount": "940.00",
                            "balance": "6,53,027.01",
                            "tempId": "afe8e916-72a4-4c38-9c69-6004427c8762"
                        }
                    ]
                },
                {
                    "action": "ACTION_REMOVE",
                    "rationale": "Row has empty date, description, and all amount/balance fields; represents non-transaction extraction noise and should be removed.",
                    "row": [
                        {
                            "date": "",
                            "description": "",
                            "creditAmount": "",
                            "debitAmount": "",
                            "balance": "",
                            "tempId": "1f3404b8-6038-4462-9bca-b926fb48fb3a"
                        }
                    ]
                },
                {
                    "action": "ACTION_INCORRECT",
                    "rationale": "Date field contains an extra trailing digit '4' making it non-standard; correctable formatting issue.",
                    "row": [
                        {
                            "date": "23 Sep 2025",
                            "description": "PCD/3224/GOOGLEPLAY/MUMBAI230925/10:1",
                            "creditAmount": "",
                            "debitAmount": "149.00",
                            "balance": "6,33,895.55",
                            "tempId": "704b55ea-77ea-4fe8-a1e4-6157d9ce6d1c"
                        }
                    ]
                },
                {
                    "action": "ACTION_INCORRECT",
                    "rationale": "Balance field contains non-numeric text ' Page 14 of  22' which is extraction noise; remove the text while keeping the numeric value unchanged.",
                    "row": [
                        {
                            "date": "28 Sep 2025",
                            "description": "NACH-10-DR-LIC OF INDIA-4777103460925",
                            "creditAmount": "",
                            "debitAmount": "1,136.00",
                            "balance": "6,37,679.55",
                            "tempId": "83683b8c-e0a2-487f-8269-022a09d1341b"
                        }
                    ]
                },
                {
                    "action": "ACTION_REMOVE",
                    "rationale": "Row has empty date, description, amount, and balance fields; represents non-transactional/blank noise and should be removed.",
                    "row": [
                        {
                            "date": "",
                            "description": "",
                            "creditAmount": "",
                            "debitAmount": "",
                            "balance": "",
                            "tempId": "f5571b86-2ca2-401e-8f64-8d2c6ff59367"
                        }
                    ]
                },
                {
                    "action": "ACTION_INCORRECT",
                    "rationale": "Balance field contains non-numeric text ' Page 15 of  22' appended; remove the page text while keeping numeric value unchanged.",
                    "row": [
                        {
                            "date": "17 Oct 2025",
                            "description": "UPI/Compass India F/565611291812/UPI",
                            "creditAmount": "",
                            "debitAmount": "42.00",
                            "balance": "6,69,904.31",
                            "tempId": "2542068e-c71b-4058-a0e5-4f379de7d153"
                        }
                    ]
                },
                {
                    "action": "ACTION_REMOVE",
                    "rationale": "Row has empty date, description, amounts, and balance; represents non-transaction noise and should be removed.",
                    "row": [
                        {
                            "date": "",
                            "description": "",
                            "creditAmount": "",
                            "debitAmount": "",
                            "balance": "",
                            "tempId": "b63975b5-3194-450e-9d23-24b347e3ac7a"
                        }
                    ]
                },
                {
                    "action": "ACTION_INCORRECT",
                    "rationale": "Date contains an extra trailing ' 4' making it non-standard; correct to a valid date format while preserving the intended date.",
                    "row": [
                        {
                            "date": "23 Oct 2025",
                            "description": "PCD/3224/GOOGLEPLAY/MUMBAI231025/10:1",
                            "creditAmount": "",
                            "debitAmount": "149.00",
                            "balance": "6,35,176.31",
                            "tempId": "8fe02d8b-d426-44bc-9829-fd3c46240872"
                        }
                    ]
                },
                {
                    "action": "ACTION_INCORRECT",
                    "rationale": "Description contains an obvious spacing/segmentation OCR error in the word 'MAND ATE'; fix formatting while keeping all numeric values unchanged.",
                    "row": [
                        {
                            "date": "28 Oct 2025",
                            "description": "UPI/KLIKKTECHNOLOGI/530115028340/MANDATE",
                            "creditAmount": "",
                            "debitAmount": "99.00",
                            "balance": "6,25,919.46",
                            "tempId": "45823e8d-197e-4a51-8651-55f0b20bc886"
                        }
                    ]
                },
                {
                    "action": "ACTION_INCORRECT",
                    "rationale": "Balance field contains non-numeric text ' Page 16 of  22' appended; remove the page text while keeping numeric value unchanged.",
                    "row": [
                        {
                            "date": "03 Nov 2025",
                            "description": "UPI/shawbikash496-4/567309308211/UPI",
                            "creditAmount": "",
                            "debitAmount": "90.00",
                            "balance": "5,69,579.62",
                            "tempId": "5b09797c-35ae-4c81-86e9-b3398a1b5215"
                        }
                    ]
                },
                {
                    "action": "ACTION_REMOVE",
                    "rationale": "Row has empty date, description, and all amount/balance fields; represents non-transaction noise and should be removed.",
                    "row": [
                        {
                            "date": "",
                            "description": "",
                            "creditAmount": "",
                            "debitAmount": "",
                            "balance": "",
                            "tempId": "dd57e038-93ed-496f-9ce2-9be496d7400c"
                        }
                    ]
                },
                {
                    "action": "ACTION_INCORRECT",
                    "rationale": "Balance field contains non-numeric text ' Page 17 of  22' appended; remove the page text while keeping numeric value unchanged.",
                    "row": [
                        {
                            "date": "20 Nov 2025",
                            "description": "UPI/KUNAL  DAS/532438302189/UPI",
                            "creditAmount": "",
                            "debitAmount": "80.00",
                            "balance": "3,36,571.07",
                            "tempId": "35d2e1e3-bab5-4fb5-bc61-1477f5e24e3a"
                        }
                    ]
                },
                {
                    "action": "ACTION_REMOVE",
                    "rationale": "Row has empty date, description, amount, and balance; represents non-transaction noise and should be removed.",
                    "row": [
                        {
                            "date": "",
                            "description": "",
                            "creditAmount": "",
                            "debitAmount": "",
                            "balance": "",
                            "tempId": "18f772ca-d6e1-4417-b323-db3713528f6b"
                        }
                    ]
                },
                {
                    "action": "ACTION_INCORRECT",
                    "rationale": "Balance field contains non-numeric text ' Page 18 of  22' which is extraction noise; remove the page text while keeping numeric value unchanged.",
                    "row": [
                        {
                            "date": "08 Dec 2025",
                            "description": "UPI/Google India Di/534290166244/remarks",
                            "creditAmount": "",
                            "debitAmount": "730.00",
                            "balance": "2,99,200.91",
                            "tempId": "4f749772-2dad-4212-bdc7-e09ac2871767"
                        }
                    ]
                },
                {
                    "action": "ACTION_REMOVE",
                    "rationale": "Row has completely empty date, description, amount, and balance fields; represents non-transaction extraction noise.",
                    "row": [
                        {
                            "date": "",
                            "description": "",
                            "creditAmount": "",
                            "debitAmount": "",
                            "balance": "",
                            "tempId": "cb45a1b5-993f-4e85-a90f-c3a6920deb3a"
                        }
                    ]
                },
                {
                    "action": "ACTION_INCORRECT",
                    "rationale": "Balance field contains non-numeric text ' Page 19 of  22' appended; description and amounts are otherwise valid. Per rules, balance must be numeric, so remove the non-numeric page text while keeping the numeric value unchanged.",
                    "row": [
                        {
                            "date": "23 Dec 2025",
                            "description": "PCD/3224/GOOGLEPLAY/MUMBAI231225/10:1",
                            "creditAmount": "",
                            "debitAmount": "149.00",
                            "balance": "2,42,054.99",
                            "tempId": "b33f7806-b7ec-4e7f-ba36-92db4be6f6ce"
                        }
                    ]
                },
                {
                    "action": "ACTION_REMOVE",
                    "rationale": "Row appears to be extraction noise/non-transaction: date is just '5', description is empty, and all monetary fields are empty. Fails amount and description validation and is structurally not a valid transaction.",
                    "row": [
                        {
                            "date": "5",
                            "description": "",
                            "creditAmount": "",
                            "debitAmount": "",
                            "balance": "",
                            "tempId": "b15983dc-3d86-4567-a2a0-2e741be53247"
                        }
                    ]
                },
                {
                    "action": "ACTION_INCORRECT",
                    "rationale": "Balance field contains non-numeric text ' Page 20 of  22' appended; description also includes trailing period formatting that can be normalized. Numeric values must remain unchanged; remove page text from balance and keep description as-is since it is meaningful transaction info.",
                    "row": [
                        {
                            "date": "31 Dec 2025",
                            "description": "Int.Pd:4613421825:01-10-2025 to 31-12-2025",
                            "creditAmount": "2,826.00",
                            "debitAmount": "",
                            "balance": "3,35,598.21",
                            "tempId": "0cf21bd0-bb22-4645-8df0-662d638a7522"
                        }
                    ]
                }
            ]
        }
    };
}

export { statementErrorFetcherNode };