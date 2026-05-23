import { GraphNode } from "@langchain/langgraph";
import { agentGraphSchema } from "../../graph_state.js";
import { pdfExtractorTool } from "../graphTools/statementExtraction/graph_pdf_extractor.js";
import { v4 as uuidv4 } from 'uuid';

const pdfExtractorToolNode: GraphNode<typeof agentGraphSchema> = async (state) => {
    console.log(`[PDF Extractor] Parsing statement: ${state.statementPath}`);
    const extractedData = await pdfExtractorTool.invoke({ pdfPath: state.statementPath });
    const rows = extractedData ? Object.values(extractedData).flat() : [];
    console.log(`[PDF Extractor] Done — extracted ${rows.length} rows across ${extractedData ? Object.keys(extractedData).length : 0} page(s)`);

    return { ...state, extractedData: extractedData && rows.map((tran) => ({ ...tran, [process.env.TEMP_ID_KEY as string]: uuidv4() })) };

    // return {
    //     ...state,
    //     extractedData: [
    //         {
    //             "#": "- - 1",
    //             "Date": "",
    //             "Description": "Opening Balance -",
    //             "Chq/Ref. No.": "",
    //             "Withdrawal (Dr.)": "-",
    //             "Deposit (Cr.)": "-",
    //             "Balance": "5,49,995.54",
    //             "tempId": "47c9422f-fbcf-46f8-8384-af7c52c94e54"
    //         },
    //         {
    //             "#": "2",
    //             "Date": "03 Jan 2025",
    //             "Description": "UPI/Amazon Pay/536949403827/You are paying",
    //             "Chq/Ref. No.": "UPI-500323270738",
    //             "Withdrawal (Dr.)": "1,399.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,48,596.54",
    //             "tempId": "fb1615dc-5060-4230-9101-4256853a1f7d"
    //         },
    //         {
    //             "#": "3",
    //             "Date": "05 Jan 2025",
    //             "Description": "NACH-10-DR-CTRAZORPAY- CAPITALFLOPFUJDNBOBZWFUD",
    //             "Chq/Ref. No.": "NACHDB050125081256 00",
    //             "Withdrawal (Dr.)": "2,499.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,46,097.54",
    //             "tempId": "10153b3b-cb45-4f4e-8164-1e16b43d5d79"
    //         },
    //         {
    //             "#": "4",
    //             "Date": "05 Jan 2025",
    //             "Description": "UPI/ANIL SHARMA/500550315874/UPI",
    //             "Chq/Ref. No.": "UPI-500508754544",
    //             "Withdrawal (Dr.)": "900.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,45,197.54",
    //             "tempId": "2855a4a4-3165-4d97-bb19-e12d14beccda"
    //         },
    //         {
    //             "#": "5",
    //             "Date": "05 Jan 2025",
    //             "Description": "UPI/RIK  SINGHA/500593437278/UPI",
    //             "Chq/Ref. No.": "UPI-500514279146",
    //             "Withdrawal (Dr.)": "362.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,44,835.54",
    //             "tempId": "266f273a-9c60-4235-aace-954b92fdf45a"
    //         },
    //         {
    //             "#": "6",
    //             "Date": "05 Jan 2025",
    //             "Description": "UPI/Axelia Solution/500527239970/UPI",
    //             "Chq/Ref. No.": "UPI-500516706275",
    //             "Withdrawal (Dr.)": "4,861.14",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,39,974.40",
    //             "tempId": "6edd784e-f447-4973-a046-aed8378b9457"
    //         },
    //         {
    //             "#": "7",
    //             "Date": "05 Jan 2025",
    //             "Description": "UPI/RUNUSENAPATI/500512132777/UPI",
    //             "Chq/Ref. No.": "UPI-500516758529",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "6,100.00",
    //             "Balance": "5,46,074.40",
    //             "tempId": "6b2cc751-1599-42f7-bab9-22dec5103f3c"
    //         },
    //         {
    //             "#": "8",
    //             "Date": "06 Jan 2025",
    //             "Description": "UPI/VIHANA COLLECTI/500668283285/UPI",
    //             "Chq/Ref. No.": "UPI-500651295131",
    //             "Withdrawal (Dr.)": "270.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,45,804.40",
    //             "tempId": "f930a0a3-87e7-4c2c-90c8-48ddffb9b039"
    //         },
    //         {
    //             "#": "9",
    //             "Date": "06 Jan 2025",
    //             "Description": "UPI/VINOD  KUMAR/500666985372/UPI",
    //             "Chq/Ref. No.": "UPI-500652528421",
    //             "Withdrawal (Dr.)": "120.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,45,684.40",
    //             "tempId": "0d2f5fd0-a423-44dc-92c2-17fd7b4c139f"
    //         },
    //         {
    //             "#": "10",
    //             "Date": "06 Jan 2025",
    //             "Description": "UPI/HRIDAY ENTERPRI/500600293674/UPI",
    //             "Chq/Ref. No.": "UPI-500658858442",
    //             "Withdrawal (Dr.)": "255.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,45,429.40",
    //             "tempId": "98813327-b389-4567-8284-5074055a1ea1"
    //         },
    //         {
    //             "#": "11",
    //             "Date": "07 Jan 2025",
    //             "Description": "UPI/RIK  SINGHA/537319169795/bus fare",
    //             "Chq/Ref. No.": "UPI-500713768561",
    //             "Withdrawal (Dr.)": "20.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,45,409.40",
    //             "tempId": "ded06259-f1fd-423b-92fe-405b87e351c4"
    //         },
    //         {
    //             "#": "12",
    //             "Date": "08 Jan 2025",
    //             "Description": "UPI/NEW RANG BE RAN/500844070432/UPI",
    //             "Chq/Ref. No.": "UPI-500876652601",
    //             "Withdrawal (Dr.)": "350.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,45,059.40",
    //             "tempId": "1786e30e-330f-4654-8095-a86c13ad7d8b"
    //         },
    //         {
    //             "#": "13",
    //             "Date": "09 Jan 2025",
    //             "Description": "UPI/SENCO GOLD LIMI/537571110936/UPI",
    //             "Chq/Ref. No.": "UPI-500903366661",
    //             "Withdrawal (Dr.)": "3,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,42,059.40",
    //             "tempId": "62a0599d-531e-49bf-88ae-710d4624d14e"
    //         },
    //         {
    //             "#": "14",
    //             "Date": "09 Jan 2025",
    //             "Description": "UPI/Rupam Kundu/537557242348/UPI",
    //             "Chq/Ref. No.": "UPI-500932923189",
    //             "Withdrawal (Dr.)": "380.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,41,679.40",
    //             "tempId": "50f5b6cb-421f-4d12-97af-e86ae4f0e2d8"
    //         },
    //         {
    //             "#": "15",
    //             "Date": "09 Jan 2025",
    //             "Description": "UPI/CHAND HUSSAIN/537557165017/UPI",
    //             "Chq/Ref. No.": "UPI-500943328665",
    //             "Withdrawal (Dr.)": "40.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,41,639.40",
    //             "tempId": "bd7d1758-9108-4b7c-b944-f55b60728283"
    //         },
    //         {
    //             "#": "16",
    //             "Date": "11 Jan 2025",
    //             "Description": "UPI/abhishekdas496-/501123164402/UPI",
    //             "Chq/Ref. No.": "UPI-501104594525",
    //             "Withdrawal (Dr.)": "5,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,36,639.40",
    //             "tempId": "efb439d3-3dd2-471c-a5e8-78f2f573ddae"
    //         },
    //         {
    //             "#": "17",
    //             "Date": "11 Jan 2025",
    //             "Description": "UPI/ATANU GANGULI/537729429595/UPI",
    //             "Chq/Ref. No.": "UPI-501149698801",
    //             "Withdrawal (Dr.)": "830.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,35,809.40",
    //             "tempId": "6d5253a4-294f-4cd3-9083-c5651c042bde"
    //         },
    //         {
    //             "#": "18",
    //             "Date": "12 Jan 2025",
    //             "Description": "UPI/Mr NIRANJAN MOH/537804335694/pre booking",
    //             "Chq/Ref. No.": "UPI-501255213088",
    //             "Withdrawal (Dr.)": "300.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,35,509.40",
    //             "tempId": "f56295f0-49ea-492a-b34a-bc74bdd2c39f"
    //         },
    //         {
    //             "#": "19",
    //             "Date": "12 Jan 2025",
    //             "Description": "UPI/Jio Prepaid Rec/537892145010/UPI",
    //             "Chq/Ref. No.": "UPI-501259706802",
    //             "Withdrawal (Dr.)": "69.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,35,440.40",
    //             "tempId": "6765960f-bdd2-41cd-a255-60372281c741"
    //         },
    //         {
    //             "#": "20",
    //             "Date": "12 Jan 2025",
    //             "Description": "UPI/Archaeological /501224026777/Upi Transaction",
    //             "Chq/Ref. No.": "UPI-501272334627",
    //             "Withdrawal (Dr.)": "40.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,35,400.40",
    //             "tempId": "abb84547-b246-4671-8773-2ba8a546185d"
    //         },
    //         {
    //             "#": "21",
    //             "Date": "12 Jan 2025",
    //             "Description": "UPI/BASANTA KUMAR S/537896090962/Pay to BharatPe",
    //             "Chq/Ref. No.": "UPI-501293127622",
    //             "Withdrawal (Dr.)": "55.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,35,345.40",
    //             "tempId": "f8e1e990-250d-4f46-8ffb-5064766bc5ea"
    //         },
    //         {
    //             "#": "22",
    //             "Date": "13 Jan 2025",
    //             "Description": "UPI/Tantuja State H/501317558764/UPI",
    //             "Chq/Ref. No.": "UPI-501334149148",
    //             "Withdrawal (Dr.)": "370.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,34,975.40",
    //             "tempId": "935462f7-6281-4f1f-b42c-83f5bfab30a4"
    //         },
    //         {
    //             "#": "23",
    //             "Date": "13 Jan 2025",
    //             "Description": "UPI/ATANU GANGULI/537904700819/food bill",
    //             "Chq/Ref. No.": "UPI-501351519209",
    //             "Withdrawal (Dr.)": "670.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,34,305.40",
    //             "tempId": "01c330c1-da9e-41da-b972-921e4e696193"
    //         },
    //         {
    //             "#": "24",
    //             "Date": "13 Jan 2025",
    //             "Description": "UPI/ATANU GANGULI/501319698344/UPI",
    //             "Chq/Ref. No.": "UPI-501352492788",
    //             "Withdrawal (Dr.)": "2,700.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,31,605.40",
    //             "tempId": "18261193-676f-486e-8a6d-8b00e2648150"
    //         },
    //         {
    //             "#": "25",
    //             "Date": "14 Jan 2025",
    //             "Description": "UPI/JARIN BEGUM/538091431413/Pay to BharatPe",
    //             "Chq/Ref. No.": "UPI-501474011355",
    //             "Withdrawal (Dr.)": "257.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,31,348.40",
    //             "tempId": "2e03b042-3429-4a80-9f06-426a94b742f4"
    //         },
    //         {
    //             "#": "26",
    //             "Date": "14 Jan 2025",
    //             "Description": "UPI/abhishekdas496-/538056856672/UPI",
    //             "Chq/Ref. No.": "UPI-501498062485",
    //             "Withdrawal (Dr.)": "122.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,31,226.40",
    //             "tempId": "fee5d3b9-ca60-4798-94e9-947687b6e41a"
    //         },
    //         {
    //             "#": "Statement Generated on 17 Mar 2026, 18:41",
    //             "Date": "16 Jan 2025",
    //             "Description": "UPI/Amazon Pay/501617662728/You are paying",
    //             "Chq/Ref. No.": "UPI-501661769171",
    //             "Withdrawal (Dr.)": "269.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,30,957.40 Page 1 of  22",
    //             "tempId": "b41756fa-c551-408f-9d4f-893f26890f8e"
    //         },
    //         {
    //             "#": "27",
    //             "Date": "",
    //             "Description": "",
    //             "Chq/Ref. No.": "",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "",
    //             "Balance": "",
    //             "tempId": "b2fa6af4-0ea2-4f4f-bde4-873bab1eb6ae"
    //         },
    //         {
    //             "#": "28",
    //             "Date": "16 Jan 2025",
    //             "Description": "UPI/LIFE INSURANCE /501642746521/PAYMENT",
    //             "Chq/Ref. No.": "UPI-501670700026",
    //             "Withdrawal (Dr.)": "3,814.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,27,143.40",
    //             "tempId": "04b26c9c-5823-4f7d-965f-3f899d33817d"
    //         },
    //         {
    //             "#": "29",
    //             "Date": "17 Jan 2025",
    //             "Description": "UPI/Google Play/330022370175/MandateExecute",
    //             "Chq/Ref. No.": "UPI-501738855722",
    //             "Withdrawal (Dr.)": "7.02",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,27,136.38",
    //             "tempId": "e261c2fa-3016-406c-9c65-8ecc4e5e6c89"
    //         },
    //         {
    //             "#": "30",
    //             "Date": "19 Jan 2025",
    //             "Description": "UPI/BINDHYACHAL SAH/501962398851/UPI",
    //             "Chq/Ref. No.": "UPI-501923869741",
    //             "Withdrawal (Dr.)": "195.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,26,941.38",
    //             "tempId": "8e340a7e-e531-4463-af5f-41f3803eaf53"
    //         },
    //         {
    //             "#": "31",
    //             "Date": "19 Jan 2025",
    //             "Description": "UPI/Haldiram Chowri/538506815786/UPI",
    //             "Chq/Ref. No.": "UPI-501932268314",
    //             "Withdrawal (Dr.)": "203.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,26,738.38",
    //             "tempId": "1f5c2258-afd4-400f-93c3-0d02e5d07f52"
    //         },
    //         {
    //             "#": "32",
    //             "Date": "19 Jan 2025",
    //             "Description": "UPI/Haldiram Chowri/538538616186/UPI",
    //             "Chq/Ref. No.": "UPI-501935518404",
    //             "Withdrawal (Dr.)": "485.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,26,253.38",
    //             "tempId": "433c4e27-e4bf-450b-be23-f6a766e80703"
    //         },
    //         {
    //             "#": "33",
    //             "Date": "19 Jan 2025",
    //             "Description": "UPI/TARAMA CATARER/538533717482/UPI",
    //             "Chq/Ref. No.": "UPI-501938753750",
    //             "Withdrawal (Dr.)": "50.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,26,203.38",
    //             "tempId": "241320b3-8005-4730-a9e0-ba597205dd68"
    //         },
    //         {
    //             "#": "34",
    //             "Date": "20 Jan 2025",
    //             "Description": "UPI/IZHAR  ASAR/538696743994/UPI",
    //             "Chq/Ref. No.": "UPI-502059273869",
    //             "Withdrawal (Dr.)": "46.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,26,157.38",
    //             "tempId": "e31e0678-056e-4ed2-813e-7d70e5eb031c"
    //         },
    //         {
    //             "#": "35",
    //             "Date": "20 Jan 2025",
    //             "Description": "UPI/Compass India F/538604758955/UPI",
    //             "Chq/Ref. No.": "UPI-502063891199",
    //             "Withdrawal (Dr.)": "38.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,26,119.38",
    //             "tempId": "b6584d2e-f3f2-478d-99dc-c449dbb7e5dd"
    //         },
    //         {
    //             "#": "36",
    //             "Date": "20 Jan 2025",
    //             "Description": "UPI/Biltu  Das/538667387957/UPI",
    //             "Chq/Ref. No.": "UPI-502080740558",
    //             "Withdrawal (Dr.)": "80.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,26,039.38",
    //             "tempId": "6c8cbeee-6b44-45ec-92af-2ecba5961a9e"
    //         },
    //         {
    //             "#": "37",
    //             "Date": "20 Jan 2025",
    //             "Description": "UPI/Google India Di/502051309155/UPI",
    //             "Chq/Ref. No.": "UPI-502090425896",
    //             "Withdrawal (Dr.)": "900.90",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,25,138.48",
    //             "tempId": "974f4629-446f-4c59-ab05-9265b4ae4ddf"
    //         },
    //         {
    //             "#": "38",
    //             "Date": "21 Jan 2025",
    //             "Description": "UPI/SUPRATIM  AUDDY/502127925254/UPI",
    //             "Chq/Ref. No.": "UPI-502100566823",
    //             "Withdrawal (Dr.)": "163.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,24,975.48",
    //             "tempId": "b6b3d194-950b-488b-baf7-7fe86301a01d"
    //         },
    //         {
    //             "#": "39",
    //             "Date": "21 Jan 2025",
    //             "Description": "UPI/RUNUSENAPATI/502141914608/UPI",
    //             "Chq/Ref. No.": "UPI-502101913324",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "4,114.00",
    //             "Balance": "5,29,089.48",
    //             "tempId": "aea51587-638f-4e81-a4dd-91f6bd03b3ca"
    //         },
    //         {
    //             "#": "40",
    //             "Date": "21 Jan 2025",
    //             "Description": "UPI/ARINDAM  SEAL/502135265916/UPI",
    //             "Chq/Ref. No.": "UPI-502130466411",
    //             "Withdrawal (Dr.)": "100.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,28,989.48",
    //             "tempId": "28a41838-4dcf-4aab-adf7-2496145310bb"
    //         },
    //         {
    //             "#": "41",
    //             "Date": "22 Jan 2025",
    //             "Description": "UPI/Dominospizza/538835448346/UPIIntent",
    //             "Chq/Ref. No.": "UPI-502285153412",
    //             "Withdrawal (Dr.)": "1,315.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,27,674.48",
    //             "tempId": "4886db93-e4a4-4494-bf5b-5b8875521dd1"
    //         },
    //         {
    //             "#": "42",
    //             "Date": "23 Jan 2025",
    //             "Description": "PCD/3224/GOOGLE PLAY SER CYBS S/I 224230125/10:15",
    //             "Chq/Ref. No.": "502204322399",
    //             "Withdrawal (Dr.)": "149.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,27,525.48",
    //             "tempId": "a116ce94-aa5e-47ca-890e-1eb57c4285b7"
    //         },
    //         {
    //             "#": "43",
    //             "Date": "23 Jan 2025",
    //             "Description": "UPI/ArpitaSarkar/502316207819/UPI",
    //             "Chq/Ref. No.": "UPI-502317730738",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "899.00",
    //             "Balance": "5,28,424.48",
    //             "tempId": "108097bf-6259-4842-957a-4de138b17b3b"
    //         },
    //         {
    //             "#": "44",
    //             "Date": "23 Jan 2025",
    //             "Description": "UPI/SENAPATI D/502323822589/UPI",
    //             "Chq/Ref. No.": "UPI-502331021152",
    //             "Withdrawal (Dr.)": "2,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,26,424.48",
    //             "tempId": "ea3bab52-ad40-40d8-bd3c-9fed29232b86"
    //         },
    //         {
    //             "#": "45",
    //             "Date": "25 Jan 2025",
    //             "Description": "UPI/SOURAV KUMAR MA/539167836355/UPI",
    //             "Chq/Ref. No.": "UPI-502513854823",
    //             "Withdrawal (Dr.)": "1,250.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,25,174.48",
    //             "tempId": "3d7b877a-3e88-43cb-b563-e217239704ff"
    //         },
    //         {
    //             "#": "46",
    //             "Date": "26 Jan 2025",
    //             "Description": "UPI/ANIL SHARMA/539293698143/UPI",
    //             "Chq/Ref. No.": "UPI-502655266402",
    //             "Withdrawal (Dr.)": "560.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,24,614.48",
    //             "tempId": "275a9f86-24f2-46ea-b60f-637205b58384"
    //         },
    //         {
    //             "#": "47",
    //             "Date": "26 Jan 2025",
    //             "Description": "UPI/SENAPATID/502650015414/UPI",
    //             "Chq/Ref. No.": "UPI-502669436300",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "2,000.00",
    //             "Balance": "5,26,614.48",
    //             "tempId": "33d00ff0-ad1b-4915-8fdf-3942c3e0ed70"
    //         },
    //         {
    //             "#": "48",
    //             "Date": "26 Jan 2025",
    //             "Description": "UPI/AMARJIT SINGH/502671220429/UPI",
    //             "Chq/Ref. No.": "UPI-502672032823",
    //             "Withdrawal (Dr.)": "440.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,26,174.48",
    //             "tempId": "13586674-a3e3-4729-8cc3-a3cab5da4b7e"
    //         },
    //         {
    //             "#": "49",
    //             "Date": "26 Jan 2025",
    //             "Description": "UPI/GHULAM HUSSAIN/502607527249/UPI",
    //             "Chq/Ref. No.": "UPI-502680617538",
    //             "Withdrawal (Dr.)": "46.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,26,128.48",
    //             "tempId": "5b5f0e86-c027-44b6-9377-edc3a59ac078"
    //         },
    //         {
    //             "#": "50",
    //             "Date": "27 Jan 2025",
    //             "Description": "UPI/JioCinema/502762611067/Subscription De",
    //             "Chq/Ref. No.": "UPI-502786327816",
    //             "Withdrawal (Dr.)": "29.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,26,099.48",
    //             "tempId": "5a3ee543-6074-4ebe-b96b-d254794b6869"
    //         },
    //         {
    //             "#": "51",
    //             "Date": "27 Jan 2025",
    //             "Description": "UPI/Compass India F/502772472446/UPI",
    //             "Chq/Ref. No.": "UPI-502701786362",
    //             "Withdrawal (Dr.)": "19.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,26,080.48",
    //             "tempId": "f9189e7e-0a8d-4225-8812-33d86551ae43"
    //         },
    //         {
    //             "#": "52",
    //             "Date": "27 Jan 2025",
    //             "Description": "UPI/Slent vv00004/502701388248/UPI",
    //             "Chq/Ref. No.": "UPI-502715106817",
    //             "Withdrawal (Dr.)": "25.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,26,055.48",
    //             "tempId": "6153cf2c-7b0c-4d66-a54e-11bdade9d675"
    //         },
    //         {
    //             "#": "53",
    //             "Date": "27 Jan 2025",
    //             "Description": "UPI/BINOD KUMAR/539342102565/UPI",
    //             "Chq/Ref. No.": "UPI-502722252551",
    //             "Withdrawal (Dr.)": "65.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,25,990.48",
    //             "tempId": "30ad15a8-30ee-44ca-8947-5f239f12267b"
    //         },
    //         {
    //             "#": "54",
    //             "Date": "28 Jan 2025",
    //             "Description": "UPI/MS NANILAL GHOS/539492629829/UPI",
    //             "Chq/Ref. No.": "UPI-502842628727",
    //             "Withdrawal (Dr.)": "37.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,25,953.48",
    //             "tempId": "0550cc3a-9299-42df-84ee-7f8badb2cc88"
    //         },
    //         {
    //             "#": "55",
    //             "Date": "28 Jan 2025",
    //             "Description": "PCD/3224/GOOGLE PLAY APP CYBS S/I 224280125/11:36",
    //             "Chq/Ref. No.": "502706601051",
    //             "Withdrawal (Dr.)": "10.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,25,943.48",
    //             "tempId": "3c94e6da-286f-4182-8703-e11c10b14118"
    //         },
    //         {
    //             "#": "56",
    //             "Date": "28 Jan 2025",
    //             "Description": "UPI/Google Play/499733340285/MandateExecute",
    //             "Chq/Ref. No.": "UPI-502862310767",
    //             "Withdrawal (Dr.)": "99.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,25,844.48",
    //             "tempId": "64249e03-ddef-4caa-88c9-26c721388296"
    //         },
    //         {
    //             "#": "57",
    //             "Date": "29 Jan 2025",
    //             "Description": "UPI/Blinkit/502952861255/UPIIntent",
    //             "Chq/Ref. No.": "UPI-502916204703",
    //             "Withdrawal (Dr.)": "605.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,25,239.48",
    //             "tempId": "f92ac5bb-7c7b-4f59-be6b-ec27bc11f6c7"
    //         },
    //         {
    //             "#": "58",
    //             "Date": "30 Jan 2025",
    //             "Description": "UPI/Barbeque Nation/503080481644/PayviaRazorpay",
    //             "Chq/Ref. No.": "UPI-503045632130",
    //             "Withdrawal (Dr.)": "400.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,24,839.48",
    //             "tempId": "a8227689-1a8d-4649-8ec6-c11650f3ceaa"
    //         },
    //         {
    //             "#": "59",
    //             "Date": "30 Jan 2025",
    //             "Description": "UPI/CHAKRABORTYM/539692725556/UPI",
    //             "Chq/Ref. No.": "UPI-503046283493",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "400.00",
    //             "Balance": "5,25,239.48",
    //             "tempId": "20473f7c-1488-4c50-bc64-e0b2d8e72911"
    //         },
    //         {
    //             "#": "60",
    //             "Date": "30 Jan 2025",
    //             "Description": "UPI/Compass India F/503099789636/UPI",
    //             "Chq/Ref. No.": "UPI-503046989644",
    //             "Withdrawal (Dr.)": "38.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,25,201.48",
    //             "tempId": "5490fd0a-59fe-4c8e-bbe9-a0ce4fbdf48d"
    //         },
    //         {
    //             "#": "61",
    //             "Date": "30 Jan 2025",
    //             "Description": "UPI/Compass India F/539674500699/UPI",
    //             "Chq/Ref. No.": "UPI-503061244458",
    //             "Withdrawal (Dr.)": "52.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,25,149.48",
    //             "tempId": "d87cee3c-f703-40f5-b9a8-ef243c672ba3"
    //         },
    //         {
    //             "#": "62",
    //             "Date": "30 Jan 2025",
    //             "Description": "UPI/ANISH DAS/539691815642/UPI",
    //             "Chq/Ref. No.": "UPI-503066639052",
    //             "Withdrawal (Dr.)": "80.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,25,069.48",
    //             "tempId": "5efbdfc2-42a6-4fae-a91e-2f371dd58d91"
    //         },
    //         {
    //             "#": "63",
    //             "Date": "31 Jan 2025",
    //             "Description": "UPI/MsTITASSENAPATI/539776631198/UPI",
    //             "Chq/Ref. No.": "UPI-503179667326",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "18,000.00",
    //             "Balance": "5,43,069.48",
    //             "tempId": "590524cc-bca9-4194-92e1-b1efb481bc30"
    //         },
    //         {
    //             "#": "64",
    //             "Date": "31 Jan 2025",
    //             "Description": "UPI/JEET  SAHA/539721840704/UPI",
    //             "Chq/Ref. No.": "UPI-503186848071",
    //             "Withdrawal (Dr.)": "5,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,38,069.48",
    //             "tempId": "06bbb5f3-b25c-4798-86a7-fe34f7dea38b"
    //         },
    //         {
    //             "#": "65",
    //             "Date": "31 Jan 2025",
    //             "Description": "UPI/SENAPATID/539787648674/UPI",
    //             "Chq/Ref. No.": "UPI-503188412743",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "50,000.00",
    //             "Balance": "5,88,069.48",
    //             "tempId": "880cd881-e85d-4380-8db2-643d23af67c9"
    //         },
    //         {
    //             "#": "66",
    //             "Date": "31 Jan 2025",
    //             "Description": "UPI/Farmpool Privat/539769264115/Payment",
    //             "Chq/Ref. No.": "UPI-503103087945",
    //             "Withdrawal (Dr.)": "4.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,88,065.48",
    //             "tempId": "cd0bf04c-4a89-4d8e-a9f0-98c3d08a64f4"
    //         },
    //         {
    //             "#": "67",
    //             "Date": "31 Jan 2025",
    //             "Description": "UPI/DURJOY  DAS/539779484665/UPI",
    //             "Chq/Ref. No.": "UPI-503119927492",
    //             "Withdrawal (Dr.)": "56.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,88,009.48",
    //             "tempId": "6f706ba4-f5f5-4499-bce6-cdb57e48560b"
    //         },
    //         {
    //             "#": "68",
    //             "Date": "01 Feb 2025",
    //             "Description": "UPI/DRIPTA SENAPATI/503200317035/laptop EMI",
    //             "Chq/Ref. No.": "UPI-503240142227",
    //             "Withdrawal (Dr.)": "9,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,79,009.48",
    //             "tempId": "f248a521-a5b0-44c0-8f86-987206b5faf2"
    //         },
    //         {
    //             "#": "69",
    //             "Date": "02 Feb 2025",
    //             "Description": "UPI/SUPRATIM  AUDDY/503379165764/UPI",
    //             "Chq/Ref. No.": "UPI-503386499984",
    //             "Withdrawal (Dr.)": "163.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,78,846.48",
    //             "tempId": "6654992e-ff7d-48b0-ae7c-69d6f8b772ea"
    //         },
    //         {
    //             "#": "70",
    //             "Date": "02 Feb 2025",
    //             "Description": "UPI/RAJKUMARGHOSH/503332296051/UPI",
    //             "Chq/Ref. No.": "UPI-503303275704",
    //             "Withdrawal (Dr.)": "100.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,78,746.48",
    //             "tempId": "599432bf-d300-4067-9c97-e2909873e597"
    //         },
    //         {
    //             "#": "Statement Generated on 17 Mar 2026, 18:41",
    //             "Date": "02 Feb 2025",
    //             "Description": "UPI/Indian Clearing/503324054883/Payment request",
    //             "Chq/Ref. No.": "UPI-503307586658",
    //             "Withdrawal (Dr.)": "4,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,74,746.48 Page 2 of  22",
    //             "tempId": "d03e3cd4-2933-496b-8bee-92cf64933c12"
    //         },
    //         {
    //             "#": "71",
    //             "Date": "",
    //             "Description": "",
    //             "Chq/Ref. No.": "",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "",
    //             "Balance": "",
    //             "tempId": "19ef52db-61ad-4139-a84f-a58fb04d20ff"
    //         },
    //         {
    //             "#": "72",
    //             "Date": "02 Feb 2025",
    //             "Description": "UPI/MD SULTAN/539903324035/UPI",
    //             "Chq/Ref. No.": "UPI-503319585141",
    //             "Withdrawal (Dr.)": "290.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,74,456.48",
    //             "tempId": "9e72ecfa-945e-4ab5-b082-ed8295a854a6"
    //         },
    //         {
    //             "#": "73",
    //             "Date": "02 Feb 2025",
    //             "Description": "UPI/ZOMATO/539975838408/UPI",
    //             "Chq/Ref. No.": "UPI-503328040781",
    //             "Withdrawal (Dr.)": "628.80",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,73,827.68",
    //             "tempId": "ccaf7ab9-0673-40cf-8ae4-385ea046ef20"
    //         },
    //         {
    //             "#": "74",
    //             "Date": "02 Feb 2025",
    //             "Description": "UPI/ZOMATO/539913744709/UPI",
    //             "Chq/Ref. No.": "UPI-503328117977",
    //             "Withdrawal (Dr.)": "538.30",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,73,289.38",
    //             "tempId": "55661990-ea6f-4c2b-8647-934e885af7a0"
    //         },
    //         {
    //             "#": "75",
    //             "Date": "02 Feb 2025",
    //             "Description": "UPI/TARAMA CATARER/539955555323/UPI",
    //             "Chq/Ref. No.": "UPI-503332771803",
    //             "Withdrawal (Dr.)": "30.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,73,259.38",
    //             "tempId": "ec219ab1-f08f-46bb-9128-69d730d02607"
    //         },
    //         {
    //             "#": "76",
    //             "Date": "03 Feb 2025",
    //             "Description": "UPI/CELEBRATION/503430712004/UPI",
    //             "Chq/Ref. No.": "UPI-503468479270",
    //             "Withdrawal (Dr.)": "100.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,73,159.38",
    //             "tempId": "e8cf6e8d-69db-4fe9-bf58-5cd7b3cc7a5f"
    //         },
    //         {
    //             "#": "77",
    //             "Date": "03 Feb 2025",
    //             "Description": "UPI/Mr SUBHAS BANIK/503417707845/UPI",
    //             "Chq/Ref. No.": "UPI-503470478452",
    //             "Withdrawal (Dr.)": "200.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,72,959.38",
    //             "tempId": "4b73b023-3d6b-4c03-9710-1b53b8ff2667"
    //         },
    //         {
    //             "#": "78",
    //             "Date": "03 Feb 2025",
    //             "Description": "UPI/RAILWAY RECRUIT/503423815196/RAILWAY RECRUIT",
    //             "Chq/Ref. No.": "UPI-503476006670",
    //             "Withdrawal (Dr.)": "250.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,72,709.38",
    //             "tempId": "a7a989a5-3585-4675-871d-6891046046e7"
    //         },
    //         {
    //             "#": "79",
    //             "Date": "04 Feb 2025",
    //             "Description": "UPI/Indian Clearing/503531832669/Indian Clearing",
    //             "Chq/Ref. No.": "UPI-503594285181",
    //             "Withdrawal (Dr.)": "4,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,68,709.38",
    //             "tempId": "efbb62ca-b91e-49ce-847a-92ce4574c8e6"
    //         },
    //         {
    //             "#": "80",
    //             "Date": "04 Feb 2025",
    //             "Description": "UPI/Indian Clearing/503531838007/Indian Clearing",
    //             "Chq/Ref. No.": "UPI-503594294926",
    //             "Withdrawal (Dr.)": "2,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,66,709.38",
    //             "tempId": "68306917-09d4-42a5-a034-b645773ab646"
    //         },
    //         {
    //             "#": "81",
    //             "Date": "04 Feb 2025",
    //             "Description": "UPI/Mrs PAMELA DHAR/503555767820/UPI",
    //             "Chq/Ref. No.": "UPI-503503194881",
    //             "Withdrawal (Dr.)": "18.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,66,691.38",
    //             "tempId": "167bbc1b-48aa-4e48-b57b-3d060e2a401b"
    //         },
    //         {
    //             "#": "82",
    //             "Date": "04 Feb 2025",
    //             "Description": "UPI/LIFE INSURANCE /503537881660/PAYMENT",
    //             "Chq/Ref. No.": "UPI-503520185772",
    //             "Withdrawal (Dr.)": "8,836.14",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,57,855.24",
    //             "tempId": "b9b42ae7-bb32-4e80-80c3-02ed443b4795"
    //         },
    //         {
    //             "#": "83",
    //             "Date": "05 Feb 2025",
    //             "Description": "NACH-10-DR-CTRAZORPAY- CAPITALFLOPRN1POOZST7FOC",
    //             "Chq/Ref. No.": "NACHDB050225081921 00",
    //             "Withdrawal (Dr.)": "749.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,57,106.24",
    //             "tempId": "22df0f9c-7ab8-424b-96b7-46eb6a7e9455"
    //         },
    //         {
    //             "#": "84",
    //             "Date": "06 Feb 2025",
    //             "Description": "UPI/Compass India F/503730637100/UPI",
    //             "Chq/Ref. No.": "UPI-503716731573",
    //             "Withdrawal (Dr.)": "19.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,57,087.24",
    //             "tempId": "9fe04dff-ab49-4310-b118-9b13f8f3436a"
    //         },
    //         {
    //             "#": "85",
    //             "Date": "06 Feb 2025",
    //             "Description": "UPI/RITAM DUTTA/503700478501/UPI",
    //             "Chq/Ref. No.": "UPI-503743444577",
    //             "Withdrawal (Dr.)": "90.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,56,997.24",
    //             "tempId": "cc44a5f5-becd-4097-b942-2ab3b7abf43f"
    //         },
    //         {
    //             "#": "86",
    //             "Date": "07 Feb 2025",
    //             "Description": "UPI/MRMILANHAZRA/503850959254/UPI",
    //             "Chq/Ref. No.": "UPI-503857363702",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "750.00",
    //             "Balance": "5,57,747.24",
    //             "tempId": "cf90470f-1da9-4acd-8364-38f2a9eabf1b"
    //         },
    //         {
    //             "#": "87",
    //             "Date": "07 Feb 2025",
    //             "Description": "UPI/DIPANKARSARKAR/503830110741/abhishe kkabiye",
    //             "Chq/Ref. No.": "UPI-503857979919",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "750.00",
    //             "Balance": "5,58,497.24",
    //             "tempId": "1486672d-7e16-4e92-a399-0f1bd9a60684"
    //         },
    //         {
    //             "#": "88",
    //             "Date": "07 Feb 2025",
    //             "Description": "UPI/BANERJEES/503830841030/UPI",
    //             "Chq/Ref. No.": "UPI-503858522130",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "750.00",
    //             "Balance": "5,59,247.24",
    //             "tempId": "c0d2e4cb-4de3-4672-98d1-feab79bcd00c"
    //         },
    //         {
    //             "#": "89",
    //             "Date": "07 Feb 2025",
    //             "Description": "UPI/ARKADIPTAGHOSH/503884583942/UPI",
    //             "Chq/Ref. No.": "UPI-503858700340",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "3,000.00",
    //             "Balance": "5,62,247.24",
    //             "tempId": "e5cbe8f1-c69a-44cb-8f9f-444a00caa9b0"
    //         },
    //         {
    //             "#": "90",
    //             "Date": "07 Feb 2025",
    //             "Description": "UPI/SREYAGHOSH/540492293105/Abhishek",
    //             "Chq/Ref. No.": "UPI-503859169238",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "750.00",
    //             "Balance": "5,62,997.24",
    //             "tempId": "d347e254-694f-4ab0-8b89-3070d11f9d8a"
    //         },
    //         {
    //             "#": "91",
    //             "Date": "07 Feb 2025",
    //             "Description": "UPI/SATWIKSHANKAR/503852876583/UPI",
    //             "Chq/Ref. No.": "UPI-503859248903",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "750.00",
    //             "Balance": "5,63,747.24",
    //             "tempId": "843566eb-08a9-40e7-94f2-3e675d6bb5d5"
    //         },
    //         {
    //             "#": "92",
    //             "Date": "07 Feb 2025",
    //             "Description": "UPI/MUKHERJEES/503802499588/Abhishek",
    //             "Chq/Ref. No.": "UPI-503859409748",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "750.00",
    //             "Balance": "5,64,497.24",
    //             "tempId": "d68aaf37-967c-4901-ada0-c68c33d35c8c"
    //         },
    //         {
    //             "#": "93",
    //             "Date": "07 Feb 2025",
    //             "Description": "UPI/CHAKRABORTYS/503853575229/UPI",
    //             "Chq/Ref. No.": "UPI-503859939586",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "750.00",
    //             "Balance": "5,65,247.24",
    //             "tempId": "c95e7226-1fce-44c7-90d0-e906fd8948e8"
    //         },
    //         {
    //             "#": "94",
    //             "Date": "07 Feb 2025",
    //             "Description": "UPI/HRISHITAGHOSH/540483892535/UPI",
    //             "Chq/Ref. No.": "UPI-503860014064",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "750.00",
    //             "Balance": "5,65,997.24",
    //             "tempId": "c924d056-95c3-46a8-9e2a-46d2f3c8f7e3"
    //         },
    //         {
    //             "#": "95",
    //             "Date": "07 Feb 2025",
    //             "Description": "UPI/SUVANKARMALLICK/503854115753/UPI",
    //             "Chq/Ref. No.": "UPI-503860472676",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "750.00",
    //             "Balance": "5,66,747.24",
    //             "tempId": "5ec57511-19b3-4ddd-b7f7-424778f694fb"
    //         },
    //         {
    //             "#": "96",
    //             "Date": "07 Feb 2025",
    //             "Description": "UPI/NANDIS/540484893770/UPI",
    //             "Chq/Ref. No.": "UPI-503860498126",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "750.00",
    //             "Balance": "5,67,497.24",
    //             "tempId": "c3168d88-8eb4-4114-bed1-e700e8d1b3c3"
    //         },
    //         {
    //             "#": "97",
    //             "Date": "07 Feb 2025",
    //             "Description": "UPI/AGARWALR/503832138884/UPI",
    //             "Chq/Ref. No.": "UPI-503860602729",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "700.00",
    //             "Balance": "5,68,197.24",
    //             "tempId": "e4036602-8a66-423d-96a8-aa4028b25b83"
    //         },
    //         {
    //             "#": "98",
    //             "Date": "07 Feb 2025",
    //             "Description": "UPI/AGARWALR/503832220444/UPI",
    //             "Chq/Ref. No.": "UPI-503860670899",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "50.00",
    //             "Balance": "5,68,247.24",
    //             "tempId": "d20d1d94-17e3-449f-ad4f-37cb35a3e168"
    //         },
    //         {
    //             "#": "99",
    //             "Date": "07 Feb 2025",
    //             "Description": "UPI/ARKADIPTAGHOSH/540481885933/ParthTi wari",
    //             "Chq/Ref. No.": "UPI-503861193392",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "750.00",
    //             "Balance": "5,68,997.24",
    //             "tempId": "86a017f2-306b-46b7-b65a-18e178d88615"
    //         },
    //         {
    //             "#": "100",
    //             "Date": "07 Feb 2025",
    //             "Description": "UPI/ABHRADEB/503828599647/UPI",
    //             "Chq/Ref. No.": "UPI-503862080087",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "750.00",
    //             "Balance": "5,69,747.24",
    //             "tempId": "8000a4a2-bcfe-4eaa-a035-56da30e3de28"
    //         },
    //         {
    //             "#": "101",
    //             "Date": "07 Feb 2025",
    //             "Description": "UPI/ANKHIMUKHOPADHY/503883301099/Abhi shekmarraig",
    //             "Chq/Ref. No.": "UPI-503862490293",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "750.00",
    //             "Balance": "5,70,497.24",
    //             "tempId": "6dddb0ab-69bb-4735-88a0-4a61431bcdfd"
    //         },
    //         {
    //             "#": "102",
    //             "Date": "07 Feb 2025",
    //             "Description": "UPI/MDSAIF/503833361558/UPI",
    //             "Chq/Ref. No.": "UPI-503862689844",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "750.00",
    //             "Balance": "5,71,247.24",
    //             "tempId": "8a23d838-6f5b-441f-b108-2e27c3268357"
    //         },
    //         {
    //             "#": "103",
    //             "Date": "07 Feb 2025",
    //             "Description": "UPI/TAPASMAITY/123922051414/Avishekswee ddin",
    //             "Chq/Ref. No.": "UPI-503865189730",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "750.00",
    //             "Balance": "5,71,997.24",
    //             "tempId": "10797bab-95ab-4c54-8271-d76d4a564d07"
    //         },
    //         {
    //             "#": "104",
    //             "Date": "07 Feb 2025",
    //             "Description": "UPI/SAYANSARKAR/503835504192/AbhishekR ecepti",
    //             "Chq/Ref. No.": "UPI-503865762604",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "750.00",
    //             "Balance": "5,72,747.24",
    //             "tempId": "2eca0c19-5a61-4992-b35a-3682ad33fedb"
    //         },
    //         {
    //             "#": "105",
    //             "Date": "07 Feb 2025",
    //             "Description": "UPI/DEBDATTAMUKHOPA/503811389199/Abhi shekMarriag",
    //             "Chq/Ref. No.": "UPI-503865784336",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "750.00",
    //             "Balance": "5,73,497.24",
    //             "tempId": "d63e8e4b-ef5f-41a1-a166-d67ddeb90a5c"
    //         },
    //         {
    //             "#": "106",
    //             "Date": "07 Feb 2025",
    //             "Description": "UPI/SHAGUFTASIDDIQA/540487905777/contri butionfor",
    //             "Chq/Ref. No.": "UPI-503865843235",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "750.00",
    //             "Balance": "5,74,247.24",
    //             "tempId": "cfb041da-e4fc-4c75-bf1b-cf2f773ce3e5"
    //         },
    //         {
    //             "#": "107",
    //             "Date": "07 Feb 2025",
    //             "Description": "UPI/SENA/503836174543/UPI",
    //             "Chq/Ref. No.": "UPI-503866271244",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "750.00",
    //             "Balance": "5,74,997.24",
    //             "tempId": "f57be46b-c002-4d3f-b74b-6a0f4f2d6772"
    //         },
    //         {
    //             "#": "108",
    //             "Date": "07 Feb 2025",
    //             "Description": "UPI/ROYHS/503870071995/SentusingPaytmU",
    //             "Chq/Ref. No.": "UPI-503874687715",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "750.00",
    //             "Balance": "5,75,747.24",
    //             "tempId": "829b0586-2ee0-4e6c-8579-201e3eb005ab"
    //         },
    //         {
    //             "#": "109",
    //             "Date": "07 Feb 2025 a",
    //             "Description": "UPI/ARKADIPTAGHOSH/503831401906/Shradh",
    //             "Chq/Ref. No.": "UPI-503875224183",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "750.00",
    //             "Balance": "5,76,497.24",
    //             "tempId": "420ae45c-58c2-40c3-89bb-d586e461d5f7"
    //         },
    //         {
    //             "#": "110",
    //             "Date": "07 Feb 2025",
    //             "Description": "UPI/Amazon Pay/503804723200/AmazonChannels",
    //             "Chq/Ref. No.": "UPI-503875404719",
    //             "Withdrawal (Dr.)": "39.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,76,458.24",
    //             "tempId": "fe6fd71b-2723-456d-b110-6ec910ac4a2b"
    //         },
    //         {
    //             "#": "Statement Generated on 17 Mar 2026, 18:41",
    //             "Date": "07 Feb 2025",
    //             "Description": "UPI/dassayanta3-3@o/540447868118/UPI",
    //             "Chq/Ref. No.": "UPI-503897314163",
    //             "Withdrawal (Dr.)": "421.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,76,037.24 Page 3 of  22",
    //             "tempId": "0259763e-d8a7-4430-bf00-6740b5ca0d1c"
    //         },
    //         {
    //             "#": "111",
    //             "Date": "",
    //             "Description": "",
    //             "Chq/Ref. No.": "",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "",
    //             "Balance": "",
    //             "tempId": "cd18384f-68cf-4a5e-8dec-da488cb960da"
    //         },
    //         {
    //             "#": "112",
    //             "Date": "08 Feb 2025",
    //             "Description": "UPI/SUHASISHSAMADDA/540549468838/UPI",
    //             "Chq/Ref. No.": "UPI-503907354298",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "750.00",
    //             "Balance": "5,76,787.24",
    //             "tempId": "5c3eaa97-2137-4b9c-b977-b20031b42875"
    //         },
    //         {
    //             "#": "113",
    //             "Date": "08 Feb 2025",
    //             "Description": "UPI/ABDUL  HAI/540596596972/UPI",
    //             "Chq/Ref. No.": "UPI-503922095773",
    //             "Withdrawal (Dr.)": "242.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,76,545.24",
    //             "tempId": "887e26f5-28c3-4b41-b7c9-57c10002eae8"
    //         },
    //         {
    //             "#": "114",
    //             "Date": "08 Feb 2025",
    //             "Description": "UPI/SAURAV  KRISHN/503911412413/UPI",
    //             "Chq/Ref. No.": "UPI-503933951897",
    //             "Withdrawal (Dr.)": "66.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,76,479.24",
    //             "tempId": "77cae5e4-7b9e-4b05-a305-6bb92015c28b"
    //         },
    //         {
    //             "#": "115",
    //             "Date": "10 Feb 2025",
    //             "Description": "UPI/SOUMYADEVPORIYA/504101978929/Abhis hekrecepti",
    //             "Chq/Ref. No.": "UPI-504110560810",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "750.00",
    //             "Balance": "5,77,229.24",
    //             "tempId": "151d4b19-fe7b-4665-b1f7-0c23c743faa5"
    //         },
    //         {
    //             "#": "116",
    //             "Date": "10 Feb 2025",
    //             "Description": "UPI/SENCO GOLD LIMI/540795521165/UPI",
    //             "Chq/Ref. No.": "UPI-504115955946",
    //             "Withdrawal (Dr.)": "3,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,74,229.24",
    //             "tempId": "9c35117c-012e-41c5-a4e4-59a0e1e307e3"
    //         },
    //         {
    //             "#": "117",
    //             "Date": "10 Feb 2025",
    //             "Description": "UPI/Compass India F/540764137115/UPI",
    //             "Chq/Ref. No.": "UPI-504125400597",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,74,187.24",
    //             "tempId": "3b5bff66-ad27-4108-a11a-4a32fc0ae6f6"
    //         },
    //         {
    //             "#": "118",
    //             "Date": "10 Feb 2025",
    //             "Description": "UPI/SUKANTA  SARKAR/540771974324/UPI",
    //             "Chq/Ref. No.": "UPI-504147420820",
    //             "Withdrawal (Dr.)": "89.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,74,098.24",
    //             "tempId": "d540cb9c-e55a-4a88-aad9-a4d5af66ec31"
    //         },
    //         {
    //             "#": "119",
    //             "Date": "10 Feb 2025",
    //             "Description": "UPI/PARNA GHOSH/540754079848/UPI",
    //             "Chq/Ref. No.": "UPI-504147571225",
    //             "Withdrawal (Dr.)": "200.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,73,898.24",
    //             "tempId": "c3504498-527b-4ab1-9db5-10d85c0abbb0"
    //         },
    //         {
    //             "#": "120",
    //             "Date": "10 Feb 2025",
    //             "Description": "UPI/SAYAN SARKAR/540744689457/UPI",
    //             "Chq/Ref. No.": "UPI-504160513015",
    //             "Withdrawal (Dr.)": "500.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,73,398.24",
    //             "tempId": "037d7ff8-f4de-49fc-93e7-da39012485c1"
    //         },
    //         {
    //             "#": "121",
    //             "Date": "10 Feb 2025",
    //             "Description": "UPI/FNP/504147000423/GIFTSZV062",
    //             "Chq/Ref. No.": "UPI-504161106584",
    //             "Withdrawal (Dr.)": "1,447.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,71,951.24",
    //             "tempId": "960907b3-490e-4cdf-8c06-629901261898"
    //         },
    //         {
    //             "#": "122",
    //             "Date": "11 Feb 2025",
    //             "Description": "UPI/DEBA/504269392397/PAYBYWHATSAPP",
    //             "Chq/Ref. No.": "UPI-504279948926",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "750.00",
    //             "Balance": "5,72,701.24",
    //             "tempId": "54b9609a-4a45-4618-9d6e-489c8b6e4168"
    //         },
    //         {
    //             "#": "123",
    //             "Date": "12 Feb 2025",
    //             "Description": "UPI/PharmEasy/504394781080/UPI",
    //             "Chq/Ref. No.": "UPI-504324590656",
    //             "Withdrawal (Dr.)": "2,389.53",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,70,311.71",
    //             "tempId": "a691c009-2b3b-4435-84cc-fa75a63c2c8f"
    //         },
    //         {
    //             "#": "124",
    //             "Date": "12 Feb 2025",
    //             "Description": "UPI/RUNUSENAPATI/504311156054/UPI",
    //             "Chq/Ref. No.": "UPI-504324653720",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "2,390.00",
    //             "Balance": "5,72,701.71",
    //             "tempId": "30b2029e-185a-41e4-9fe1-bf62ee1ed9e3"
    //         },
    //         {
    //             "#": "125",
    //             "Date": "12 Feb 2025",
    //             "Description": "UPI/SREYA GHOSH/504350796234/UPI",
    //             "Chq/Ref. No.": "UPI-504328330118",
    //             "Withdrawal (Dr.)": "25,553.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,47,148.71",
    //             "tempId": "9c059761-cc7f-4d55-8592-882175e47a7a"
    //         },
    //         {
    //             "#": "126",
    //             "Date": "13 Feb 2025",
    //             "Description": "UPI/VI/541025861013/UPI",
    //             "Chq/Ref. No.": "UPI-504476818103",
    //             "Withdrawal (Dr.)": "489.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,46,659.71",
    //             "tempId": "d527f788-9a07-4269-b7e4-e709d165cc3b"
    //         },
    //         {
    //             "#": "127",
    //             "Date": "13 Feb 2025",
    //             "Description": "UPI/Compass India F/541015286657/UPI",
    //             "Chq/Ref. No.": "UPI-504487481717",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,46,617.71",
    //             "tempId": "7d4e325f-b191-47ca-a9b6-90cbf0e77ae6"
    //         },
    //         {
    //             "#": "128",
    //             "Date": "13 Feb 2025",
    //             "Description": "UPI/UBER INDIA SYST/504435612109/PaymenttoUBERIN",
    //             "Chq/Ref. No.": "UPI-504406687847",
    //             "Withdrawal (Dr.)": "71.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,46,546.71",
    //             "tempId": "eb060807-e4a8-4b59-88a5-a8c6bdb345b7"
    //         },
    //         {
    //             "#": "129",
    //             "Date": "15 Feb 2025",
    //             "Description": "UPI/ANIL SHARMA/541212025316/UPI",
    //             "Chq/Ref. No.": "UPI-504690611961",
    //             "Withdrawal (Dr.)": "550.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,45,996.71",
    //             "tempId": "2474390e-647d-4f3f-a575-0cc4b5fc2947"
    //         },
    //         {
    //             "#": "130",
    //             "Date": "15 Feb 2025",
    //             "Description": "UPI/JITENDRA YADAV/541241273166/UPI",
    //             "Chq/Ref. No.": "UPI-504615035384",
    //             "Withdrawal (Dr.)": "290.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,45,706.71",
    //             "tempId": "3ec7c672-69bc-475c-b8d1-ab5ad852ce76"
    //         },
    //         {
    //             "#": "131",
    //             "Date": "16 Feb 2025",
    //             "Description": "UPI/Samar Karmakar/504730441770/UPI",
    //             "Chq/Ref. No.": "UPI-504760101411",
    //             "Withdrawal (Dr.)": "300.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,45,406.71",
    //             "tempId": "f1328d5f-1eef-4216-b90e-def4630ba05f"
    //         },
    //         {
    //             "#": "132",
    //             "Date": "16 Feb 2025",
    //             "Description": "UPI/WOW Momo Foods /504723650529/UPI",
    //             "Chq/Ref. No.": "UPI-504761153079",
    //             "Withdrawal (Dr.)": "266.68",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,45,140.03",
    //             "tempId": "2f65c77a-528c-48c3-bd25-94c0f14f1d70"
    //         },
    //         {
    //             "#": "133",
    //             "Date": "16 Feb 2025",
    //             "Description": "UPI/Amazon Pay/504703062564/You are paying",
    //             "Chq/Ref. No.": "UPI-504776153996",
    //             "Withdrawal (Dr.)": "499.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,44,641.03",
    //             "tempId": "23eae582-001e-4475-9d94-bfa436d1fa8f"
    //         },
    //         {
    //             "#": "134",
    //             "Date": "17 Feb 2025",
    //             "Description": "UPI/AFTAB HOSSEN GH/504817095723/UPI",
    //             "Chq/Ref. No.": "UPI-504890954819",
    //             "Withdrawal (Dr.)": "63.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,44,578.03",
    //             "tempId": "ed5ee2ec-0014-48fd-b07f-e097a546629f"
    //         },
    //         {
    //             "#": "135",
    //             "Date": "17 Feb 2025",
    //             "Description": "UPI/Compass India F/541483502884/UPI",
    //             "Chq/Ref. No.": "UPI-504897691418",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,44,536.03",
    //             "tempId": "f0475ed0-b136-4ec7-a372-81d41d8eaa4f"
    //         },
    //         {
    //             "#": "136",
    //             "Date": "17 Feb 2025",
    //             "Description": "UPI/pinkybose05@oka/541482633897/UPI",
    //             "Chq/Ref. No.": "UPI-504815085589",
    //             "Withdrawal (Dr.)": "90.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,44,446.03",
    //             "tempId": "6e1023ac-d475-4ed9-ab90-bcb9facdf2f1"
    //         },
    //         {
    //             "#": "137",
    //             "Date": "17 Feb 2025",
    //             "Description": "UPI/AKASH CYBER CAF/541433545235/UPI",
    //             "Chq/Ref. No.": "UPI-504816361076",
    //             "Withdrawal (Dr.)": "250.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,44,196.03",
    //             "tempId": "d682e316-a107-4114-829d-b81ece0ae155"
    //         },
    //         {
    //             "#": "138",
    //             "Date": "18 Feb 2025",
    //             "Description": "UPI/BIGTREE ENTERTA/504914201173/UPI",
    //             "Chq/Ref. No.": "UPI-504946011947",
    //             "Withdrawal (Dr.)": "359.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,43,837.03",
    //             "tempId": "8a0c1f70-f715-4625-aedc-65e0abbfb350"
    //         },
    //         {
    //             "#": "139",
    //             "Date": "18 Feb 2025",
    //             "Description": "UPI/SENAPATID/541575099706/UPI",
    //             "Chq/Ref. No.": "UPI-504946144908",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "2,250.00",
    //             "Balance": "5,46,087.03",
    //             "tempId": "9a5423bb-6389-4abf-80b5-37ba7679f71f"
    //         },
    //         {
    //             "#": "140",
    //             "Date": "18 Feb 2025",
    //             "Description": "UPI/MrDRIPTASENAPAT/541589229472/UPI",
    //             "Chq/Ref. No.": "UPI-504946234473",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "2,250.00",
    //             "Balance": "5,48,337.03",
    //             "tempId": "eb514b02-437c-4c8c-865b-8d248c7528ac"
    //         },
    //         {
    //             "#": "141",
    //             "Date": "19 Feb 2025",
    //             "Description": "UPI/NAKUL  AICH/505031775313/UPI",
    //             "Chq/Ref. No.": "UPI-505089266113",
    //             "Withdrawal (Dr.)": "20.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,48,317.03",
    //             "tempId": "861d4b5a-70e7-4a53-adcd-798c15787deb"
    //         },
    //         {
    //             "#": "142",
    //             "Date": "20 Feb 2025",
    //             "Description": "UPI/SENAPATID/541768952469/UPI",
    //             "Chq/Ref. No.": "UPI-505138527949",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "5,000.00",
    //             "Balance": "5,53,317.03",
    //             "tempId": "14973655-3f12-44ff-bdab-d774137070a8"
    //         },
    //         {
    //             "#": "143",
    //             "Date": "20 Feb 2025",
    //             "Description": "UPI/Blinkit/541789283358/Blinkit",
    //             "Chq/Ref. No.": "UPI-505157034296",
    //             "Withdrawal (Dr.)": "165.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,53,152.03",
    //             "tempId": "e41c24de-507c-4ea9-a159-e2fac57c8d3d"
    //         },
    //         {
    //             "#": "144",
    //             "Date": "20 Feb 2025",
    //             "Description": "NEFT HSBCN05121771065 HSBC ELECTRONIC DATA PROCES",
    //             "Chq/Ref. No.": "NEFTINW-1130916918",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "1,250.00",
    //             "Balance": "5,54,402.03",
    //             "tempId": "f7054bec-3008-41a4-be6c-a1f694f511b1"
    //         },
    //         {
    //             "#": "145",
    //             "Date": "21 Feb 2025",
    //             "Description": "UPI/Compass India F/505217954007/UPI",
    //             "Chq/Ref. No.": "UPI-505299702383",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,54,360.03",
    //             "tempId": "0375fcb4-dd95-4d7f-a28e-3ad2240759fb"
    //         },
    //         {
    //             "#": "146",
    //             "Date": "21 Feb 2025",
    //             "Description": "UPI/Nandial Thakur/505224576579/UPI",
    //             "Chq/Ref. No.": "UPI-505213180529",
    //             "Withdrawal (Dr.)": "20.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,54,340.03",
    //             "tempId": "95b585da-189e-458a-a33e-cc1290c18c61"
    //         },
    //         {
    //             "#": "147",
    //             "Date": "21 Feb 2025",
    //             "Description": "UPI/BIGTREE ENTERTA/505208497717/UPI",
    //             "Chq/Ref. No.": "UPI-505225895642",
    //             "Withdrawal (Dr.)": "848.56",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,53,491.47",
    //             "tempId": "9b609bb2-4f20-44c8-a887-1f6663c90972"
    //         },
    //         {
    //             "#": "148",
    //             "Date": "23 Feb 2025",
    //             "Description": "PCD/3224/GOOGLE PLAY SER CYBS S/I 224230225/10:15",
    //             "Chq/Ref. No.": "505304668739",
    //             "Withdrawal (Dr.)": "149.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,53,342.47",
    //             "tempId": "8c2bfb9e-e2fc-493b-9b97-7f42adf8d2e8"
    //         },
    //         {
    //             "#": "149",
    //             "Date": "23 Feb 2025",
    //             "Description": "PCD/0024/SHOPPERS STOP LTD/KOLKATA230225/19:16",
    //             "Chq/Ref. No.": "505413559307",
    //             "Withdrawal (Dr.)": "23,186.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,30,156.47",
    //             "tempId": "a731498e-dcb0-4437-a34a-447f78531822"
    //         },
    //         {
    //             "#": "150",
    //             "Date": "24 Feb 2025",
    //             "Description": "UPI/AMIT  RAY/505561587557/UPI",
    //             "Chq/Ref. No.": "UPI-505547643000",
    //             "Withdrawal (Dr.)": "62.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,30,094.47",
    //             "tempId": "0fddf461-7a82-4ed9-8e23-d02877e5f58a"
    //         },
    //         {
    //             "#": "151",
    //             "Date": "24 Feb 2025",
    //             "Description": "UPI/Compass India F/505523285145/UPI",
    //             "Chq/Ref. No.": "UPI-505552095633",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,30,052.47",
    //             "tempId": "ef987286-0407-4119-8f89-cee8d5135367"
    //         },
    //         {
    //             "#": "152",
    //             "Date": "25 Feb 2025",
    //             "Description": "PCD/3224/SHOPPERS STOP LTD/KOLKATA250225/21:04",
    //             "Chq/Ref. No.": "505615592775",
    //             "Withdrawal (Dr.)": "6,506.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,23,546.47",
    //             "tempId": "2f8552dc-6b3d-4572-b31e-be9d9758d24d"
    //         },
    //         {
    //             "#": "153",
    //             "Date": "25 Feb 2025",
    //             "Description": "UPI/BHIKHARAM CHAND/542265798990/UPI",
    //             "Chq/Ref. No.": "UPI-505628798476",
    //             "Withdrawal (Dr.)": "184.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,23,362.47",
    //             "tempId": "3115b64b-3170-4238-ae79-631c75ce0876"
    //         },
    //         {
    //             "#": "154",
    //             "Date": "25 Feb 2025",
    //             "Description": "UPI/TARAMA CATARER/505688500578/UPI",
    //             "Chq/Ref. No.": "UPI-505630546980",
    //             "Withdrawal (Dr.)": "30.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,23,332.47",
    //             "tempId": "78b15e41-bb2f-4a75-a1c1-93e962e7ccb6"
    //         },
    //         {
    //             "#": "Statement Generated on 17 Mar 2026, 18:41",
    //             "Date": "27 Feb 2025",
    //             "Description": "UPI/Amazon India/505802097020/You are paying",
    //             "Chq/Ref. No.": "UPI-505893703929",
    //             "Withdrawal (Dr.)": "305.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,23,027.47 Page 4 of  22",
    //             "tempId": "68b1456e-efdb-42fe-8955-fc588fc620e2"
    //         },
    //         {
    //             "#": "155",
    //             "Date": "",
    //             "Description": "",
    //             "Chq/Ref. No.": "",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "",
    //             "Balance": "",
    //             "tempId": "195fa19a-e4b8-48c5-9741-767752c93ae2"
    //         },
    //         {
    //             "#": "156",
    //             "Date": "27 Feb 2025",
    //             "Description": "UPI/Compass India F/505811495672/UPI",
    //             "Chq/Ref. No.": "UPI-505802022963",
    //             "Withdrawal (Dr.)": "21.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,23,006.47",
    //             "tempId": "1b5c6314-dce7-451a-a807-2d27054185ec"
    //         },
    //         {
    //             "#": "157",
    //             "Date": "28 Feb 2025",
    //             "Description": "UPI/Amazon India/505982388050/You are paying",
    //             "Chq/Ref. No.": "UPI-505955344125",
    //             "Withdrawal (Dr.)": "99.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,22,907.47",
    //             "tempId": "fb257c7f-7f0a-43c0-9d30-b7b7720ab412"
    //         },
    //         {
    //             "#": "158",
    //             "Date": "28 Feb 2025",
    //             "Description": "UPI/Google Play/896151520595/MandateExecute",
    //             "Chq/Ref. No.": "UPI-505967066746",
    //             "Withdrawal (Dr.)": "99.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,22,808.47",
    //             "tempId": "4ca2357e-1ddf-48bc-93a0-9691d4828ce5"
    //         },
    //         {
    //             "#": "159",
    //             "Date": "01 Mar 2025",
    //             "Description": "UPI/ANIL SHARMA/506017638646/UPI",
    //             "Chq/Ref. No.": "UPI-506006378364",
    //             "Withdrawal (Dr.)": "700.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,22,108.47",
    //             "tempId": "1451b515-a866-4592-a206-5a57758a5b56"
    //         },
    //         {
    //             "#": "160",
    //             "Date": "01 Mar 2025",
    //             "Description": "UPI/ashimganguly131/506017456029/UPI",
    //             "Chq/Ref. No.": "UPI-506022665232",
    //             "Withdrawal (Dr.)": "420.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,21,688.47",
    //             "tempId": "62b3474c-c424-4da5-8419-3ba16cfe47d5"
    //         },
    //         {
    //             "#": "161",
    //             "Date": "01 Mar 2025",
    //             "Description": "UPI/Jio Prepaid Rec/506070188506/UPI",
    //             "Chq/Ref. No.": "UPI-506037670504",
    //             "Withdrawal (Dr.)": "29.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,21,659.47",
    //             "tempId": "d9ae59a3-615b-439d-b689-d5df803c0ecf"
    //         },
    //         {
    //             "#": "162",
    //             "Date": "01 Mar 2025",
    //             "Description": "UPI/Kushe Kumar Yad/506024684737/UPI",
    //             "Chq/Ref. No.": "UPI-506041380638",
    //             "Withdrawal (Dr.)": "380.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,21,279.47",
    //             "tempId": "56e1daa0-2c1d-458e-a63e-1f380ae6d756"
    //         },
    //         {
    //             "#": "163",
    //             "Date": "02 Mar 2025",
    //             "Description": "UPI/SENAPATI D/542755713151/UPI",
    //             "Chq/Ref. No.": "UPI-506155976514",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "40,000.00",
    //             "Balance": "5,61,279.47",
    //             "tempId": "a324d441-a3fa-464e-92d7-6caf97b78171"
    //         },
    //         {
    //             "#": "164",
    //             "Date": "02 Mar 2025",
    //             "Description": "UPI/DRIPTA SENAPATI/542784611329/UPI",
    //             "Chq/Ref. No.": "UPI-506155998114",
    //             "Withdrawal (Dr.)": "11,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,50,279.47",
    //             "tempId": "5bcfee6b-1151-4967-bfbd-6ac2bf705ec6"
    //         },
    //         {
    //             "#": "165",
    //             "Date": "02 Mar 2025",
    //             "Description": "UPI/DUMMY NAME/506158198186/little donation",
    //             "Chq/Ref. No.": "UPI-506156482668",
    //             "Withdrawal (Dr.)": "500.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,49,779.47",
    //             "tempId": "deda1cb8-4f61-49d8-8b9b-41033f747193"
    //         },
    //         {
    //             "#": "166",
    //             "Date": "03 Mar 2025",
    //             "Description": "UPI/LICPGINEW/506226271521/Oid73716673F Y20",
    //             "Chq/Ref. No.": "UPI-506210786640",
    //             "Withdrawal (Dr.)": "2,323.12",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,47,456.35",
    //             "tempId": "e32b81d5-0e63-4b54-8b1f-629af87ce489"
    //         },
    //         {
    //             "#": "167",
    //             "Date": "03 Mar 2025",
    //             "Description": "UPI/Compass India F/506209900781/UPI",
    //             "Chq/Ref. No.": "UPI-506222444290",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,47,414.35",
    //             "tempId": "51d7eeba-8306-44c9-bdf9-9550cdbabe30"
    //         },
    //         {
    //             "#": "168",
    //             "Date": "03 Mar 2025",
    //             "Description": "UPI/SHREYAN CHAKRAB/506248116429/sambodhi",
    //             "Chq/Ref. No.": "UPI-506227426934",
    //             "Withdrawal (Dr.)": "300.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,47,114.35",
    //             "tempId": "54d33730-20de-474d-bf14-f1f15b8ebcbd"
    //         },
    //         {
    //             "#": "169",
    //             "Date": "03 Mar 2025",
    //             "Description": "UPI/SUPRATIM  AUDDY/506227530440/UPI",
    //             "Chq/Ref. No.": "UPI-506241981026",
    //             "Withdrawal (Dr.)": "163.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,46,951.35",
    //             "tempId": "8fecdf3c-8cb4-41ea-8ce2-ed1fdc1d5bc8"
    //         },
    //         {
    //             "#": "170",
    //             "Date": "03 Mar 2025",
    //             "Description": "UPI/ANUPAM  DUTTA/506251841084/UPI",
    //             "Chq/Ref. No.": "UPI-506252010567",
    //             "Withdrawal (Dr.)": "55.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,46,896.35",
    //             "tempId": "b589b316-7cfb-4954-87be-730e296efb52"
    //         },
    //         {
    //             "#": "171",
    //             "Date": "04 Mar 2025",
    //             "Description": "UPI/ARINDAM  SEAL/542989706299/UPI",
    //             "Chq/Ref. No.": "UPI-506395010995",
    //             "Withdrawal (Dr.)": "100.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,46,796.35",
    //             "tempId": "326323d6-be9f-4c4f-ba3a-6274d6282a85"
    //         },
    //         {
    //             "#": "172",
    //             "Date": "05 Mar 2025",
    //             "Description": "NACH-10-DR-CTRAZORPAY- CAPITALFLOQ2RSH2DJIE7TKZ",
    //             "Chq/Ref. No.": "NACHDB050325082130 00",
    //             "Withdrawal (Dr.)": "459.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,46,337.35",
    //             "tempId": "4d5a6b61-4d17-458f-b559-7a9da800e663"
    //         },
    //         {
    //             "#": "173",
    //             "Date": "06 Mar 2025",
    //             "Description": "UPI/BIDHAN DAS/506545648314/UPI",
    //             "Chq/Ref. No.": "UPI-506591195952",
    //             "Withdrawal (Dr.)": "64.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,46,273.35",
    //             "tempId": "9deee8c3-ccb8-439a-9310-8589db2c1569"
    //         },
    //         {
    //             "#": "174",
    //             "Date": "06 Mar 2025",
    //             "Description": "UPI/Compass India F/506583355556/UPI",
    //             "Chq/Ref. No.": "UPI-506598178479",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,46,231.35",
    //             "tempId": "efa83987-7739-47a1-a75f-ee54da74ebb1"
    //         },
    //         {
    //             "#": "175",
    //             "Date": "06 Mar 2025",
    //             "Description": "UPI/Event  27/506509658479/UPI",
    //             "Chq/Ref. No.": "UPI-506599889379",
    //             "Withdrawal (Dr.)": "318.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,45,913.35",
    //             "tempId": "2baffae9-4010-4c95-8b4a-9256f0e714ce"
    //         },
    //         {
    //             "#": "176",
    //             "Date": "06 Mar 2025",
    //             "Description": "UPI/HRISHITA GHOSH/543149655006/Waffle",
    //             "Chq/Ref. No.": "UPI-506500459315",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "159.00",
    //             "Balance": "5,46,072.35",
    //             "tempId": "bf44fd4c-60cd-4f6c-bd97-c81c4d13fd88"
    //         },
    //         {
    //             "#": "177",
    //             "Date": "07 Mar 2025",
    //             "Description": "UPI/Indian Clearing/506691313572/Indian Clearing",
    //             "Chq/Ref. No.": "UPI-506638330143",
    //             "Withdrawal (Dr.)": "4,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,42,072.35",
    //             "tempId": "9c489ac2-2847-436a-8d8f-56a05aae4bbe"
    //         },
    //         {
    //             "#": "178",
    //             "Date": "07 Mar 2025",
    //             "Description": "UPI/Indian Clearing/506691313559/Indian Clearing",
    //             "Chq/Ref. No.": "UPI-506638329432",
    //             "Withdrawal (Dr.)": "2,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,40,072.35",
    //             "tempId": "9d8d58ce-67ad-492d-bb71-106a84e6478c"
    //         },
    //         {
    //             "#": "179",
    //             "Date": "07 Mar 2025",
    //             "Description": "UPI/Indian Clearing/506691313584/Indian Clearing",
    //             "Chq/Ref. No.": "UPI-506638330169",
    //             "Withdrawal (Dr.)": "4,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,36,072.35",
    //             "tempId": "011fc65c-2d99-4505-a041-90e0a2b150b6"
    //         },
    //         {
    //             "#": "180",
    //             "Date": "07 Mar 2025",
    //             "Description": "UPI/Amazon Pay/506660468065/AmazonChannels",
    //             "Chq/Ref. No.": "UPI-506666992704",
    //             "Withdrawal (Dr.)": "69.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,36,003.35",
    //             "tempId": "3e6e2309-1efa-4b02-a235-485659bff854"
    //         },
    //         {
    //             "#": "181",
    //             "Date": "07 Mar 2025",
    //             "Description": "UPI/Jio Prepaid Rec/543288164094/UPI",
    //             "Chq/Ref. No.": "UPI-506674611404",
    //             "Withdrawal (Dr.)": "3,500.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,32,503.35",
    //             "tempId": "2584a798-bcd8-4154-b28d-a506de56a26f"
    //         },
    //         {
    //             "#": "182",
    //             "Date": "09 Mar 2025",
    //             "Description": "UPI/SENCO GOLD LIMI/543428119835/UPI",
    //             "Chq/Ref. No.": "UPI-506873345898",
    //             "Withdrawal (Dr.)": "3,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,29,503.35",
    //             "tempId": "75803fe8-06ce-4df9-914a-750489ec654e"
    //         },
    //         {
    //             "#": "183",
    //             "Date": "09 Mar 2025",
    //             "Description": "UPI/RazorpayZomato/543429467419/PayviaR azorpay",
    //             "Chq/Ref. No.": "UPI-506815364188",
    //             "Withdrawal (Dr.)": "334.80",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,29,168.55",
    //             "tempId": "c665c21c-9820-453c-a783-5f5595e36be4"
    //         },
    //         {
    //             "#": "184",
    //             "Date": "10 Mar 2025",
    //             "Description": "UPI/Jui  Singha/506914010101/UPI",
    //             "Chq/Ref. No.": "UPI-506945966330",
    //             "Withdrawal (Dr.)": "56.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,29,112.55",
    //             "tempId": "5b33a71b-b31e-4695-842d-4d982008cb30"
    //         },
    //         {
    //             "#": "185",
    //             "Date": "10 Mar 2025",
    //             "Description": "UPI/Compass India F/506935405450/UPI",
    //             "Chq/Ref. No.": "UPI-506949267803",
    //             "Withdrawal (Dr.)": "21.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,29,091.55",
    //             "tempId": "212bc214-a9f1-4694-98f9-8b9912d60569"
    //         },
    //         {
    //             "#": "186",
    //             "Date": "10 Mar 2025",
    //             "Description": "UPI/SUBHOJIT MONDAL/506978175774/UPI",
    //             "Chq/Ref. No.": "UPI-506981795484",
    //             "Withdrawal (Dr.)": "90.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,29,001.55",
    //             "tempId": "326aa16f-51c1-45d2-a8b2-dc642a4b777d"
    //         },
    //         {
    //             "#": "187",
    //             "Date": "11 Mar 2025",
    //             "Description": "UPI/Apollo Pharmacy/507037990036/Payment to Apol",
    //             "Chq/Ref. No.": "UPI-507005752092",
    //             "Withdrawal (Dr.)": "752.85",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,28,248.70",
    //             "tempId": "c61be313-f77f-45ec-8380-79af828522a2"
    //         },
    //         {
    //             "#": "188",
    //             "Date": "11 Mar 2025",
    //             "Description": "UPI/PHARMEASY/507015297601/UPI",
    //             "Chq/Ref. No.": "UPI-507005830362",
    //             "Withdrawal (Dr.)": "1,483.49",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,26,765.21",
    //             "tempId": "5a331d7e-4eef-48d4-b052-499c957384f2"
    //         },
    //         {
    //             "#": "189",
    //             "Date": "12 Mar 2025",
    //             "Description": "UPI/Blinkit/507135504780/Blinkit",
    //             "Chq/Ref. No.": "UPI-507185687389",
    //             "Withdrawal (Dr.)": "308.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,26,457.21",
    //             "tempId": "05f51d5b-d81e-45a9-97eb-100364ef56ea"
    //         },
    //         {
    //             "#": "190",
    //             "Date": "13 Mar 2025",
    //             "Description": "UPI/Jio Prepaid Rec/507263277574/UPI",
    //             "Chq/Ref. No.": "UPI-507233877572",
    //             "Withdrawal (Dr.)": "629.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,25,828.21",
    //             "tempId": "a75cb956-8bdc-4b2a-bf74-906771dc413c"
    //         },
    //         {
    //             "#": "191",
    //             "Date": "13 Mar 2025",
    //             "Description": "UPI/LIFE INSURANCE /100162898590/PAYMENT",
    //             "Chq/Ref. No.": "UPI-507256823486",
    //             "Withdrawal (Dr.)": "907.98",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,24,920.23",
    //             "tempId": "e98c4a19-3bb2-4925-a5ec-7588992ed02c"
    //         },
    //         {
    //             "#": "192",
    //             "Date": "13 Mar 2025",
    //             "Description": "UPI/IRON ARMOUR FIT/543872731250/UPI",
    //             "Chq/Ref. No.": "UPI-507282698518",
    //             "Withdrawal (Dr.)": "5,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,19,920.23",
    //             "tempId": "bdf50276-5970-4f88-b8a0-061d05ae378c"
    //         },
    //         {
    //             "#": "193",
    //             "Date": "14 Mar 2025",
    //             "Description": "UPI/MOSTAK AHMED/543980052934/UPI",
    //             "Chq/Ref. No.": "UPI-507301245548",
    //             "Withdrawal (Dr.)": "30.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,19,890.23",
    //             "tempId": "c306309e-6857-48dc-84d6-85b16f3e8bb8"
    //         },
    //         {
    //             "#": "194",
    //             "Date": "15 Mar 2025",
    //             "Description": "UPI/NEW JOGAMAYA SW/507429460121/UPI",
    //             "Chq/Ref. No.": "UPI-507491293019",
    //             "Withdrawal (Dr.)": "90.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,19,800.23",
    //             "tempId": "08bd41ad-4813-467d-abfd-7870c74198b3"
    //         },
    //         {
    //             "#": "195",
    //             "Date": "16 Mar 2025",
    //             "Description": "UPI/DIBYENDU MUKHER/544145710465/UPI",
    //             "Chq/Ref. No.": "UPI-507524566179",
    //             "Withdrawal (Dr.)": "1,500.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,18,300.23",
    //             "tempId": "3b809a73-1481-464a-97b6-5cc4ab90047c"
    //         },
    //         {
    //             "#": "196",
    //             "Date": "17 Mar 2025",
    //             "Description": "UPI/Compass India F/544207990319/UPI",
    //             "Chq/Ref. No.": "UPI-507684055070",
    //             "Withdrawal (Dr.)": "21.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,18,279.23",
    //             "tempId": "f300caff-68b6-4737-af91-5610f9e20e2a"
    //         },
    //         {
    //             "#": "Statement Generated on 17 Mar 2026, 18:41",
    //             "Date": "17 Mar 2025",
    //             "Description": "UPI/Amazon Pay/507673426649/You are",
    //             "Chq/Ref. No.": "UPI-507612293326",
    //             "Withdrawal (Dr.)": "499.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,17,780.23 Page 5 of  22",
    //             "tempId": "14a3d7a6-435d-46cc-904b-80b73486335b"
    //         },
    //         {
    //             "#": "197",
    //             "Date": "",
    //             "Description": "paying",
    //             "Chq/Ref. No.": "",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "",
    //             "Balance": "",
    //             "tempId": "86ec310e-6686-45d5-aaba-5f05503cfc14"
    //         },
    //         {
    //             "#": "198",
    //             "Date": "20 Mar 2025",
    //             "Description": "UPI/GHOSH  CO/507966158052/UPI",
    //             "Chq/Ref. No.": "UPI-507997160938",
    //             "Withdrawal (Dr.)": "180.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,17,600.23",
    //             "tempId": "ac48fecc-8cbe-4eb1-8eb8-9303ec7a9996"
    //         },
    //         {
    //             "#": "199",
    //             "Date": "22 Mar 2025",
    //             "Description": "UPI/GHOSH OPTICS/508176936619/UPI",
    //             "Chq/Ref. No.": "UPI-508113348162",
    //             "Withdrawal (Dr.)": "4,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,13,600.23",
    //             "tempId": "580f0cb5-27a7-4b9f-a7c8-4af70182a612"
    //         },
    //         {
    //             "#": "200",
    //             "Date": "23 Mar 2025",
    //             "Description": "PCD/3224/GOOGLE PLAY SER CYBS S/I 224230325/10:15",
    //             "Chq/Ref. No.": "508104531469",
    //             "Withdrawal (Dr.)": "149.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,13,451.23",
    //             "tempId": "01ce3a86-ea5d-4ead-b7d1-4b83821208e5"
    //         },
    //         {
    //             "#": "201",
    //             "Date": "23 Mar 2025",
    //             "Description": "UPI/PALLAB  GHOSH/508259371662/UPI",
    //             "Chq/Ref. No.": "UPI-508237643424",
    //             "Withdrawal (Dr.)": "18.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,13,433.23",
    //             "tempId": "e1fce044-3770-4ab8-a038-b41404f6e972"
    //         },
    //         {
    //             "#": "202",
    //             "Date": "23 Mar 2025",
    //             "Description": "UPI/B M LEISURE LLP/544866213500/UPI",
    //             "Chq/Ref. No.": "UPI-508265602127",
    //             "Withdrawal (Dr.)": "314.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,13,119.23",
    //             "tempId": "0445450f-e2fd-4c9f-a6c5-0365d1451110"
    //         },
    //         {
    //             "#": "203",
    //             "Date": "23 Mar 2025",
    //             "Description": "UPI/B M LEISURE LLP/544849304091/UPI",
    //             "Chq/Ref. No.": "UPI-508265749149",
    //             "Withdrawal (Dr.)": "335.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,12,784.23",
    //             "tempId": "7f9760f9-d97b-411e-b15f-5c24afac07b9"
    //         },
    //         {
    //             "#": "204",
    //             "Date": "23 Mar 2025",
    //             "Description": "UPI/B M LEISURE LLP/544842102498/UPI",
    //             "Chq/Ref. No.": "UPI-508265870649",
    //             "Withdrawal (Dr.)": "83.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,12,701.23",
    //             "tempId": "7c9b5294-4366-4e16-a73a-ef6a7d2bb60c"
    //         },
    //         {
    //             "#": "205",
    //             "Date": "24 Mar 2025",
    //             "Description": "UPI/Compass India F/544936461010/UPI",
    //             "Chq/Ref. No.": "UPI-508308389780",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,12,659.23",
    //             "tempId": "7789e9d3-517d-4abe-b52e-168ff1029af9"
    //         },
    //         {
    //             "#": "206",
    //             "Date": "24 Mar 2025",
    //             "Description": "UPI/TINKU KUMAR MIS/544964480979/UPI",
    //             "Chq/Ref. No.": "UPI-508321241359",
    //             "Withdrawal (Dr.)": "35.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,12,624.23",
    //             "tempId": "b793d32a-ae49-498b-a27c-7b08afbdded8"
    //         },
    //         {
    //             "#": "207",
    //             "Date": "26 Mar 2025",
    //             "Description": "UPI/Compass India F/545199923918/UPI",
    //             "Chq/Ref. No.": "UPI-508531102254",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,12,582.23",
    //             "tempId": "11bb4fcd-a555-4d38-b67d-b83a7d715511"
    //         },
    //         {
    //             "#": "208",
    //             "Date": "26 Mar 2025",
    //             "Description": "UPI/TINKU KUMAR MIS/545192755299/UPI",
    //             "Chq/Ref. No.": "UPI-508542154227",
    //             "Withdrawal (Dr.)": "55.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,12,527.23",
    //             "tempId": "84eb2b37-4d28-478e-8bb0-b6e8bb3bdc53"
    //         },
    //         {
    //             "#": "209",
    //             "Date": "27 Mar 2025",
    //             "Description": "UPI/LIFE INSURANCE /100243425479/PAYMENT",
    //             "Chq/Ref. No.": "UPI-508601179587",
    //             "Withdrawal (Dr.)": "6,454.02",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,06,073.21",
    //             "tempId": "e55519b4-c5f7-4d7b-8e56-73e3c51457ff"
    //         },
    //         {
    //             "#": "210",
    //             "Date": "28 Mar 2025",
    //             "Description": "UPI/Google Play/260434300875/MandateExecute",
    //             "Chq/Ref. No.": "UPI-508768305369",
    //             "Withdrawal (Dr.)": "99.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,05,974.21",
    //             "tempId": "d975e9ba-f9dc-4d6b-aa15-b31931588a26"
    //         },
    //         {
    //             "#": "211",
    //             "Date": "29 Mar 2025",
    //             "Description": "UPI/GHOSH OPTICS/545469687019/UPI",
    //             "Chq/Ref. No.": "UPI-508816452767",
    //             "Withdrawal (Dr.)": "3,200.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,02,774.21",
    //             "tempId": "c2172415-fb84-4c49-ac71-43682d3bb7d7"
    //         },
    //         {
    //             "#": "212",
    //             "Date": "30 Mar 2025",
    //             "Description": "UPI/Ganesh Bhandar/508913975427/UPI",
    //             "Chq/Ref. No.": "UPI-508972996084",
    //             "Withdrawal (Dr.)": "212.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,02,562.21",
    //             "tempId": "9d8062c8-0aa5-4be5-9f8f-1e5bb6a16037"
    //         },
    //         {
    //             "#": "213",
    //             "Date": "30 Mar 2025",
    //             "Description": "UPI/Zomato Online O/545511724590/ZomatoOnlineOrd",
    //             "Chq/Ref. No.": "UPI-508904787489",
    //             "Withdrawal (Dr.)": "9.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,02,553.21",
    //             "tempId": "b4e0069b-6eb0-4753-ac4e-ac90a4c302f1"
    //         },
    //         {
    //             "#": "214",
    //             "Date": "30 Mar 2025",
    //             "Description": "UPI/Zomato Online O/545594518590/ZomatoOnlineOrd",
    //             "Chq/Ref. No.": "UPI-508906496414",
    //             "Withdrawal (Dr.)": "426.55",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,02,126.66",
    //             "tempId": "926f9524-7db7-409f-affb-4ddfb05002ad"
    //         },
    //         {
    //             "#": "215",
    //             "Date": "31 Mar 2025",
    //             "Description": "UPI/Zomato Ltd/509019125825/Zomato Payment",
    //             "Chq/Ref. No.": "UPI-509074587240",
    //             "Withdrawal (Dr.)": "537.30",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,01,589.36",
    //             "tempId": "6c14cc13-b086-472d-b177-80208e973dec"
    //         },
    //         {
    //             "#": "216",
    //             "Date": "31 Mar 2025",
    //             "Description": "UPI/RAJA BHAR/509030525016/UPI",
    //             "Chq/Ref. No.": "UPI-509081030165",
    //             "Withdrawal (Dr.)": "500.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,01,089.36",
    //             "tempId": "c0379198-e819-421e-87c6-d5503fe0d6d2"
    //         },
    //         {
    //             "#": "217",
    //             "Date": "31 Mar 2025",
    //             "Description": "Int.Pd:4613421825:01-01-2025 to 31-03-2025",
    //             "Chq/Ref. No.": "",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "3,995.00",
    //             "Balance": "5,05,084.36",
    //             "tempId": "e42b003b-7feb-4536-a8b6-7478ab625653"
    //         },
    //         {
    //             "#": "218",
    //             "Date": "01 Apr 2025",
    //             "Description": "UPI/SENAPATI D/509119465824/UPI",
    //             "Chq/Ref. No.": "UPI-509199700313",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "50,000.00",
    //             "Balance": "5,55,084.36",
    //             "tempId": "1cb3428a-84c4-4a44-a932-8a03c3ca1378"
    //         },
    //         {
    //             "#": "219",
    //             "Date": "01 Apr 2025",
    //             "Description": "UPI/SENAPATI D/509165656864/UPI",
    //             "Chq/Ref. No.": "UPI-509199769086",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "50,000.00",
    //             "Balance": "6,05,084.36",
    //             "tempId": "8bbdc1be-1f8d-4a6f-97dc-1e6e9381df33"
    //         },
    //         {
    //             "#": "220",
    //             "Date": "01 Apr 2025",
    //             "Description": "UPI/DUMMY NAME/545745815585/UPI",
    //             "Chq/Ref. No.": "UPI-509130323695",
    //             "Withdrawal (Dr.)": "1,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,04,084.36",
    //             "tempId": "8823dfdb-2446-4048-9e21-4d3e42ec9a6b"
    //         },
    //         {
    //             "#": "221",
    //             "Date": "03 Apr 2025",
    //             "Description": "UPI/Blinkit/509376245973/Blinkit",
    //             "Chq/Ref. No.": "UPI-509327105533",
    //             "Withdrawal (Dr.)": "247.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,03,837.36",
    //             "tempId": "ace0655b-1b2d-45e3-8941-098a32709118"
    //         },
    //         {
    //             "#": "222",
    //             "Date": "04 Apr 2025",
    //             "Description": "UPI/Amazon India/509403643105/You are paying",
    //             "Chq/Ref. No.": "UPI-509411421057",
    //             "Withdrawal (Dr.)": "99.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,03,738.36",
    //             "tempId": "2d246f62-9116-4966-a894-b1b371586f34"
    //         },
    //         {
    //             "#": "223",
    //             "Date": "05 Apr 2025",
    //             "Description": "NACH-10-DR-CTRAZORPAY- CAPITALFLOQFAKHT86U1477L",
    //             "Chq/Ref. No.": "NACHDB050425081753 00",
    //             "Withdrawal (Dr.)": "3,399.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,00,339.36",
    //             "tempId": "c42d4ee6-e07e-4bd2-8f9a-6e1c4919574d"
    //         },
    //         {
    //             "#": "224",
    //             "Date": "05 Apr 2025",
    //             "Description": "UPI/Apollo Pharmacy/509543933021/Payment to Apol",
    //             "Chq/Ref. No.": "UPI-509564394152",
    //             "Withdrawal (Dr.)": "238.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,00,101.36",
    //             "tempId": "f1162b5f-515f-4367-ae84-bbddf19c9f2c"
    //         },
    //         {
    //             "#": "225",
    //             "Date": "05 Apr 2025",
    //             "Description": "UPI/Axelia Solution/509545440959/UPI",
    //             "Chq/Ref. No.": "UPI-509564684336",
    //             "Withdrawal (Dr.)": "1,791.49",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,98,309.87",
    //             "tempId": "7374c1bc-f7fe-451e-af3d-af856ce3e2fe"
    //         },
    //         {
    //             "#": "226",
    //             "Date": "05 Apr 2025",
    //             "Description": "UPI/SUPRATIM  AUDDY/509569186420/UPI",
    //             "Chq/Ref. No.": "UPI-509506453043",
    //             "Withdrawal (Dr.)": "163.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,98,146.87",
    //             "tempId": "263e4df2-2238-46b8-8565-dc62bdfd8bb6"
    //         },
    //         {
    //             "#": "227",
    //             "Date": "05 Apr 2025",
    //             "Description": "UPI/Ms TITAS SENAPA/013379895186/Payment from Ph",
    //             "Chq/Ref. No.": "UPI-509507116708",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "8,500.00",
    //             "Balance": "6,06,646.87",
    //             "tempId": "a8a56df5-7870-45a3-89f7-4bbd9dd7c9d0"
    //         },
    //         {
    //             "#": "228",
    //             "Date": "06 Apr 2025",
    //             "Description": "UPI/METRO PHARMA QR/546211134373/UPI",
    //             "Chq/Ref. No.": "UPI-509651904035",
    //             "Withdrawal (Dr.)": "3,520.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,03,126.87",
    //             "tempId": "03b0cc74-f284-4d0e-933d-96150c27cb97"
    //         },
    //         {
    //             "#": "229",
    //             "Date": "06 Apr 2025",
    //             "Description": "UPI/Blinkit/546221938754/Blinkit Payment",
    //             "Chq/Ref. No.": "UPI-509663541486",
    //             "Withdrawal (Dr.)": "165.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,02,961.87",
    //             "tempId": "ea5b0c09-1f07-4262-b2ad-9d905d3a1f19"
    //         },
    //         {
    //             "#": "230",
    //             "Date": "07 Apr 2025",
    //             "Description": "UPI/Indian Clearing/509753844186/Indian Clearing",
    //             "Chq/Ref. No.": "UPI-509774094151",
    //             "Withdrawal (Dr.)": "4,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,98,961.87",
    //             "tempId": "9597ce26-d23f-4e55-b848-9343a6152fcf"
    //         },
    //         {
    //             "#": "231",
    //             "Date": "07 Apr 2025",
    //             "Description": "UPI/Indian Clearing/509753844206/Indian Clearing",
    //             "Chq/Ref. No.": "UPI-509774094184",
    //             "Withdrawal (Dr.)": "2,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,96,961.87",
    //             "tempId": "76ecabf0-0baa-4f23-b423-327e32bd518e"
    //         },
    //         {
    //             "#": "232",
    //             "Date": "07 Apr 2025",
    //             "Description": "UPI/Indian Clearing/509753844223/Indian Clearing",
    //             "Chq/Ref. No.": "UPI-509774094221",
    //             "Withdrawal (Dr.)": "4,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,92,961.87",
    //             "tempId": "a01614da-dada-4089-a4da-23de8f472a9f"
    //         },
    //         {
    //             "#": "233",
    //             "Date": "07 Apr 2025",
    //             "Description": "UPI/Compass India F/546337491274/UPI",
    //             "Chq/Ref. No.": "UPI-509798283816",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,92,919.87",
    //             "tempId": "99589bb8-4721-49c9-9eec-f40db96bc4d5"
    //         },
    //         {
    //             "#": "234",
    //             "Date": "07 Apr 2025",
    //             "Description": "UPI/Amazon Pay/509710875304/AmazonChannels",
    //             "Chq/Ref. No.": "UPI-509704561333",
    //             "Withdrawal (Dr.)": "69.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,92,850.87",
    //             "tempId": "ed3cb8c9-0f1d-4d1f-b8b0-3b116650a37e"
    //         },
    //         {
    //             "#": "235",
    //             "Date": "08 Apr 2025",
    //             "Description": "UPI_CRADJ_U2_TDT_050425_509545440959_ 07APR2025_9C",
    //             "Chq/Ref. No.": "FOS2509873734078",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "13.60",
    //             "Balance": "5,92,864.47",
    //             "tempId": "30624ee8-18a0-49a0-8640-754dbd14c24e"
    //         },
    //         {
    //             "#": "Statement Generated on 17 Mar 2026, 18:41",
    //             "Date": "10 Apr 2025",
    //             "Description": "UPI/SUBHANKAR SINGH/510066321317/UPI",
    //             "Chq/Ref. No.": "UPI-510089409193",
    //             "Withdrawal (Dr.)": "69.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,92,795.47 Page 6 of  22",
    //             "tempId": "e3764bd4-8964-468a-be85-0601237d436f"
    //         },
    //         {
    //             "#": "236",
    //             "Date": "",
    //             "Description": "",
    //             "Chq/Ref. No.": "",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "",
    //             "Balance": "",
    //             "tempId": "92aac79e-ae30-4325-9603-8e8a46ecc872"
    //         },
    //         {
    //             "#": "237",
    //             "Date": "10 Apr 2025",
    //             "Description": "UPI/Compass India F/510057024660/UPI",
    //             "Chq/Ref. No.": "UPI-510093049803",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,92,753.47",
    //             "tempId": "058873bf-32ba-4a97-b726-1eb197fb7bbf"
    //         },
    //         {
    //             "#": "238",
    //             "Date": "10 Apr 2025",
    //             "Description": "UPI/Slent vv00003/510061141779/UPI",
    //             "Chq/Ref. No.": "UPI-510009565069",
    //             "Withdrawal (Dr.)": "35.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,92,718.47",
    //             "tempId": "2631af79-379b-4d41-88af-944a8014bace"
    //         },
    //         {
    //             "#": "239",
    //             "Date": "10 Apr 2025",
    //             "Description": "UPI/BHOLANATH DAS/510006162592/UPI",
    //             "Chq/Ref. No.": "UPI-510020804948",
    //             "Withdrawal (Dr.)": "72.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,92,646.47",
    //             "tempId": "72466fe7-47c6-4fc2-9c2d-a1c6b4f4943a"
    //         },
    //         {
    //             "#": "240",
    //             "Date": "12 Apr 2025",
    //             "Description": "Card dues debited 9406244003932493",
    //             "Chq/Ref. No.": "VP-2108554910",
    //             "Withdrawal (Dr.)": "234.82",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,92,411.65",
    //             "tempId": "c3875823-250d-4028-8864-d9e57c2afdf7"
    //         },
    //         {
    //             "#": "241",
    //             "Date": "12 Apr 2025",
    //             "Description": "UPI/SRI KRISHNA SWE/546898561410/UPI",
    //             "Chq/Ref. No.": "UPI-510213701892",
    //             "Withdrawal (Dr.)": "12.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,92,399.65",
    //             "tempId": "f0a8838b-2e48-4baf-8c04-6a987b9a69cc"
    //         },
    //         {
    //             "#": "242",
    //             "Date": "12 Apr 2025",
    //             "Description": "UPI/Mr SUBHADIP LAH/546896986731/UPI",
    //             "Chq/Ref. No.": "UPI-510228227975",
    //             "Withdrawal (Dr.)": "2,050.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,90,349.65",
    //             "tempId": "de6f8d66-5f2e-467d-90df-9b6141865eff"
    //         },
    //         {
    //             "#": "243",
    //             "Date": "13 Apr 2025",
    //             "Description": "UPI/Jalajoga mishti/510348970559/UPI",
    //             "Chq/Ref. No.": "UPI-510394401438",
    //             "Withdrawal (Dr.)": "110.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,90,239.65",
    //             "tempId": "1139a53f-7a69-4753-bb98-6018fa12080f"
    //         },
    //         {
    //             "#": "244",
    //             "Date": "13 Apr 2025",
    //             "Description": "UPI/DECATHLON/510340373131/UPI",
    //             "Chq/Ref. No.": "UPI-510300846273",
    //             "Withdrawal (Dr.)": "999.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,89,240.65",
    //             "tempId": "cd0c58d7-3265-4b84-9bd1-5b2dc2f1aabf"
    //         },
    //         {
    //             "#": "245",
    //             "Date": "13 Apr 2025",
    //             "Description": "UPI/Decathlon/510394473280/Payment for 701",
    //             "Chq/Ref. No.": "UPI-510301330406",
    //             "Withdrawal (Dr.)": "999.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,88,241.65",
    //             "tempId": "18445297-857c-4a7b-a3e2-feb49bdafd4f"
    //         },
    //         {
    //             "#": "246",
    //             "Date": "13 Apr 2025",
    //             "Description": "UPI/RJS MATRI FOOD /510377877344/UPI",
    //             "Chq/Ref. No.": "UPI-510309342826",
    //             "Withdrawal (Dr.)": "1,154.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,87,087.65",
    //             "tempId": "082a2503-83ce-4ce7-b50c-8b57d9e096f6"
    //         },
    //         {
    //             "#": "247",
    //             "Date": "15 Apr 2025",
    //             "Description": "UPI/RAJENDRA  SWAIN/547135969010/UPI",
    //             "Chq/Ref. No.": "UPI-510595476542",
    //             "Withdrawal (Dr.)": "20.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,87,067.65",
    //             "tempId": "439c2902-e4c8-433e-9c59-718db9d4a755"
    //         },
    //         {
    //             "#": "248",
    //             "Date": "15 Apr 2025",
    //             "Description": "UPI/Zomato private /510569633862/UPIIntent",
    //             "Chq/Ref. No.": "UPI-510540800785",
    //             "Withdrawal (Dr.)": "853.60",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,86,214.05",
    //             "tempId": "b6213539-f561-49a8-a204-f5ef1bc94b52"
    //         },
    //         {
    //             "#": "249",
    //             "Date": "17 Apr 2025",
    //             "Description": "UPI/Mr SUMAN DEBNAT/547342224948/UPI",
    //             "Chq/Ref. No.": "UPI-510728485401",
    //             "Withdrawal (Dr.)": "80.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,86,134.05",
    //             "tempId": "5a36301e-05bc-4b44-a16a-d38e7c31f38c"
    //         },
    //         {
    //             "#": "250",
    //             "Date": "17 Apr 2025",
    //             "Description": "UPI/Compass India F/547301330986/UPI",
    //             "Chq/Ref. No.": "UPI-510733228430",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,86,092.05",
    //             "tempId": "b26329f8-6df6-4710-a5ff-34fc35263fe9"
    //         },
    //         {
    //             "#": "251",
    //             "Date": "18 Apr 2025",
    //             "Description": "UPI/SANTOSH YADAV/510842646822/UPI",
    //             "Chq/Ref. No.": "UPI-510828715283",
    //             "Withdrawal (Dr.)": "850.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,85,242.05",
    //             "tempId": "934800e9-876d-437d-9bf6-c803b79ccead"
    //         },
    //         {
    //             "#": "252",
    //             "Date": "19 Apr 2025",
    //             "Description": "UPI/MASHRUD  KHAN/510908643597/UPI",
    //             "Chq/Ref. No.": "UPI-510934439701",
    //             "Withdrawal (Dr.)": "690.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,84,552.05",
    //             "tempId": "e826da25-19f3-4996-98f5-e442a9478a5a"
    //         },
    //         {
    //             "#": "253",
    //             "Date": "19 Apr 2025",
    //             "Description": "UPI/RAJENDRA  SWAIN/510944455339/UPI",
    //             "Chq/Ref. No.": "UPI-510947129826",
    //             "Withdrawal (Dr.)": "15.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,84,537.05",
    //             "tempId": "17d661a9-633b-454f-abf9-2c83f7d4055d"
    //         },
    //         {
    //             "#": "254",
    //             "Date": "19 Apr 2025",
    //             "Description": "UPI/Godaddy India D/510916673685/collect- pay-req",
    //             "Chq/Ref. No.": "UPI-510974583264",
    //             "Withdrawal (Dr.)": "1,197.51",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,83,339.54",
    //             "tempId": "604333e4-82bc-46dc-9bcc-356b7be43b42"
    //         },
    //         {
    //             "#": "255",
    //             "Date": "20 Apr 2025",
    //             "Description": "UPI/Godaddy India D/511022083213/collect- pay-req",
    //             "Chq/Ref. No.": "UPI-511050044121",
    //             "Withdrawal (Dr.)": "175.82",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,83,163.72",
    //             "tempId": "ddf78f4f-1ae2-4e5a-aae1-800f2626afc2"
    //         },
    //         {
    //             "#": "256",
    //             "Date": "20 Apr 2025",
    //             "Description": "UPI/Apollo Pharmacy/547625096301/Payment to Apol",
    //             "Chq/Ref. No.": "UPI-511055576909",
    //             "Withdrawal (Dr.)": "655.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,82,508.72",
    //             "tempId": "69adf32d-c235-4b9c-9c07-d6597c23e5ad"
    //         },
    //         {
    //             "#": "257",
    //             "Date": "22 Apr 2025",
    //             "Description": "UPI/RANJIT MANNA/547818712403/UPI",
    //             "Chq/Ref. No.": "UPI-511267814033",
    //             "Withdrawal (Dr.)": "5,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,77,508.72",
    //             "tempId": "33098586-c4d2-41e3-a25c-0eed062502b5"
    //         },
    //         {
    //             "#": "258",
    //             "Date": "23 Apr 2025",
    //             "Description": "PCD/3224/GOOGLE PLAY SER CYBS S/I 224230425/10:15",
    //             "Chq/Ref. No.": "511204468235",
    //             "Withdrawal (Dr.)": "149.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,77,359.72",
    //             "tempId": "a2a91a8e-c98c-44c7-8c3a-95de849ce179"
    //         },
    //         {
    //             "#": "259",
    //             "Date": "24 Apr 2025",
    //             "Description": "UPI/ARINDAM  SEAL/511436939268/UPI",
    //             "Chq/Ref. No.": "UPI-511479521676",
    //             "Withdrawal (Dr.)": "140.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,77,219.72",
    //             "tempId": "25a8253a-5023-4489-a89d-8a5a1f5d724c"
    //         },
    //         {
    //             "#": "260",
    //             "Date": "25 Apr 2025",
    //             "Description": "UPI/RANJIT MANNA/511537383081/UPI",
    //             "Chq/Ref. No.": "UPI-511517378586",
    //             "Withdrawal (Dr.)": "13,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,64,219.72",
    //             "tempId": "3c7c4913-2b6a-4c8d-9410-b106bda23caa"
    //         },
    //         {
    //             "#": "261",
    //             "Date": "25 Apr 2025",
    //             "Description": "UPI/RUNU SENAPATI/103746613124/UPI",
    //             "Chq/Ref. No.": "UPI-511517497503",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "13,000.00",
    //             "Balance": "5,77,219.72",
    //             "tempId": "ace20a19-1eab-4491-b036-125e240edbf1"
    //         },
    //         {
    //             "#": "262",
    //             "Date": "25 Apr 2025",
    //             "Description": "ATL/0024/622018/SBI HATIBAGAN ONSITE A250425/20:20",
    //             "Chq/Ref. No.": "511520009697",
    //             "Withdrawal (Dr.)": "6,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,71,219.72",
    //             "tempId": "e5c431c0-800b-40fe-81bc-ab175f72dac1"
    //         },
    //         {
    //             "#": "263",
    //             "Date": "25 Apr 2025",
    //             "Description": "UPI/Ms TITAS SENAPA/575805637591/Payment from Ph",
    //             "Chq/Ref. No.": "UPI-511556581103",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "8,500.00",
    //             "Balance": "5,79,719.72",
    //             "tempId": "66555bc5-7a73-48b7-a066-27329609e44c"
    //         },
    //         {
    //             "#": "264",
    //             "Date": "26 Apr 2025",
    //             "Description": "UPI/Amazon India/548287641138/You are paying",
    //             "Chq/Ref. No.": "UPI-511669402816",
    //             "Withdrawal (Dr.)": "238.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,79,481.72",
    //             "tempId": "6a3434f4-a7bf-4065-aba9-771887a91a79"
    //         },
    //         {
    //             "#": "265",
    //             "Date": "26 Apr 2025",
    //             "Description": "UPI/Amazon India/548280849669/You are paying",
    //             "Chq/Ref. No.": "UPI-511675054301",
    //             "Withdrawal (Dr.)": "200.97",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,79,280.75",
    //             "tempId": "b6749c51-d8a6-4011-b348-d8ec903ae760"
    //         },
    //         {
    //             "#": "266",
    //             "Date": "26 Apr 2025",
    //             "Description": "UPI/Vi/548201253787/UPI",
    //             "Chq/Ref. No.": "UPI-511683225165",
    //             "Withdrawal (Dr.)": "139.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,79,141.75",
    //             "tempId": "fbf063aa-3a4d-44d5-8d3b-54bbd8280392"
    //         },
    //         {
    //             "#": "267",
    //             "Date": "26 Apr 2025",
    //             "Description": "UPI/INFOTEL SERVICE/548252356187/UPI",
    //             "Chq/Ref. No.": "UPI-511684433260",
    //             "Withdrawal (Dr.)": "435.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,78,706.75",
    //             "tempId": "6395f459-6079-468f-ade5-0b162b0889f4"
    //         },
    //         {
    //             "#": "268",
    //             "Date": "27 Apr 2025",
    //             "Description": "UPI/JAY GOSWAMI/227142204409/Web Site Email",
    //             "Chq/Ref. No.": "UPI-511736658867",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "3,000.00",
    //             "Balance": "5,81,706.75",
    //             "tempId": "db909517-808a-4a7a-93fe-b877045cc493"
    //         },
    //         {
    //             "#": "269",
    //             "Date": "27 Apr 2025",
    //             "Description": "UPI/Godaddy India D/511751884548/collect- pay-req",
    //             "Chq/Ref. No.": "UPI-511736692706",
    //             "Withdrawal (Dr.)": "3,000.74",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,78,706.01",
    //             "tempId": "ef2490f7-a4c3-4305-97af-8b2133db2d64"
    //         },
    //         {
    //             "#": "270",
    //             "Date": "28 Apr 2025",
    //             "Description": "UPI/Compass India F/511806793320/UPI",
    //             "Chq/Ref. No.": "UPI-511898823653",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,78,664.01",
    //             "tempId": "02d6bc40-c02d-4ee5-8125-51edefd70898"
    //         },
    //         {
    //             "#": "271",
    //             "Date": "28 Apr 2025",
    //             "Description": "UPI/Google Play/801990021185/MandateExecute",
    //             "Chq/Ref. No.": "UPI-511812987132",
    //             "Withdrawal (Dr.)": "99.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,78,565.01",
    //             "tempId": "9805dd8e-5d30-4af9-a73e-0b33149463fd"
    //         },
    //         {
    //             "#": "272",
    //             "Date": "28 Apr 2025",
    //             "Description": "ATL/0024/622018/SBI HATIBAGAN ONSITE A280425/20:32",
    //             "Chq/Ref. No.": "511820018180",
    //             "Withdrawal (Dr.)": "3,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,75,565.01",
    //             "tempId": "35f054f2-ebe7-4a54-80a1-f17dbc6fb125"
    //         },
    //         {
    //             "#": "273",
    //             "Date": "29 Apr 2025",
    //             "Description": "UPI/PALLAB  GHOSH/548516734562/UPI",
    //             "Chq/Ref. No.": "UPI-511950320364",
    //             "Withdrawal (Dr.)": "19.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,75,546.01",
    //             "tempId": "9d4da741-3d53-46de-879e-c9978b6526e0"
    //         },
    //         {
    //             "#": "274",
    //             "Date": "29 Apr 2025",
    //             "Description": "UPI/SALONI JAISWAL/511904903796/UPI",
    //             "Chq/Ref. No.": "UPI-511994810092",
    //             "Withdrawal (Dr.)": "700.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,74,846.01",
    //             "tempId": "5dcb82b7-efa9-46f1-8365-d4a716522825"
    //         },
    //         {
    //             "#": "275",
    //             "Date": "30 Apr 2025",
    //             "Description": "NACH-10-DR-CTTATAAIAL-4901003280593 C226556040 CT",
    //             "Chq/Ref. No.": "NACHDB300425061114 00",
    //             "Withdrawal (Dr.)": "61,350.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,13,496.01",
    //             "tempId": "15daaad5-b54a-42ee-8a85-9cb9808cac05"
    //         },
    //         {
    //             "#": "Statement Generated on 17 Mar 2026, 18:41",
    //             "Date": "30 Apr 2025",
    //             "Description": "NEFT HDFCH00208048948 TATA AIA LIFE INSURANCE COM",
    //             "Chq/Ref. No.": "NEFTINW-1197965406",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "22,369.00",
    //             "Balance": "5,35,865.01 Page 7 of  22",
    //             "tempId": "dc043a0d-3f9f-45c7-8758-ef655c68e816"
    //         },
    //         {
    //             "#": "276",
    //             "Date": "",
    //             "Description": "",
    //             "Chq/Ref. No.": "",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "",
    //             "Balance": "",
    //             "tempId": "b14cca1a-857e-40b1-9dc0-5638bd7717f3"
    //         },
    //         {
    //             "#": "277",
    //             "Date": "02 May 2025",
    //             "Description": "UPI/ANIL SHARMA/548844382314/UPI",
    //             "Chq/Ref. No.": "UPI-512251890644",
    //             "Withdrawal (Dr.)": "160.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,35,705.01",
    //             "tempId": "047d8080-f5ae-4a2a-8817-6832cc8d6b42"
    //         },
    //         {
    //             "#": "278",
    //             "Date": "03 May 2025",
    //             "Description": "UPI/Apollo Pharmacy/512433893285/Payment to Apol(Value Date: 04-05-2025)",
    //             "Chq/Ref. No.": "UPI-512461075929",
    //             "Withdrawal (Dr.)": "1,121.50",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,34,583.51",
    //             "tempId": "ef7601a0-8956-4aac-b8f8-d58c1f870460"
    //         },
    //         {
    //             "#": "279",
    //             "Date": "03 May 2025",
    //             "Description": "UPI/PharmEasy/512406391279/UPI(Value Date: 04-05-2025)",
    //             "Chq/Ref. No.": "UPI-512461109670",
    //             "Withdrawal (Dr.)": "1,891.86",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,32,691.65",
    //             "tempId": "dfcf8f4d-7d75-4de8-a623-33831b9ef56c"
    //         },
    //         {
    //             "#": "280",
    //             "Date": "03 May 2025",
    //             "Description": "UPI/RUNU SENAPATI/104229105367/UPI(Value Date: 04-05-2025)",
    //             "Chq/Ref. No.": "UPI-512461132077",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "2,400.00",
    //             "Balance": "5,35,091.65",
    //             "tempId": "c17e24ab-cec3-45e3-a31e-77246f25573e"
    //         },
    //         {
    //             "#": "281",
    //             "Date": "04 May 2025",
    //             "Description": "UPI/Amazon India/512432696550/You are paying",
    //             "Chq/Ref. No.": "UPI-512468370919",
    //             "Withdrawal (Dr.)": "459.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,34,632.65",
    //             "tempId": "9dc2cf12-ae73-4a91-b36b-39714c963d71"
    //         },
    //         {
    //             "#": "282",
    //             "Date": "04 May 2025",
    //             "Description": "UPI/ANKEET  SEAL/512479645266/UPI",
    //             "Chq/Ref. No.": "UPI-512468456982",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "459.00",
    //             "Balance": "5,35,091.65",
    //             "tempId": "67cd7942-0c00-471e-9049-e98c1202288c"
    //         },
    //         {
    //             "#": "283",
    //             "Date": "04 May 2025",
    //             "Description": "UPI/CHANDAN  JAISWA/549087113542/UPI",
    //             "Chq/Ref. No.": "UPI-512481226406",
    //             "Withdrawal (Dr.)": "120.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,34,971.65",
    //             "tempId": "0eaf582b-5458-43f0-9867-092d81b068f2"
    //         },
    //         {
    //             "#": "284",
    //             "Date": "04 May 2025",
    //             "Description": "UPI/souravkumarpal3/549045233336/UPI",
    //             "Chq/Ref. No.": "UPI-512493578346",
    //             "Withdrawal (Dr.)": "2,350.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,32,621.65",
    //             "tempId": "239d0c6b-6297-4c9e-9fca-b59da778b166"
    //         },
    //         {
    //             "#": "285",
    //             "Date": "04 May 2025",
    //             "Description": "UPI/Sourav Kumar Pa/104255740280/UPI",
    //             "Chq/Ref. No.": "UPI-512495244541",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "500.00",
    //             "Balance": "5,33,121.65",
    //             "tempId": "947f0893-c3f9-458f-8d41-69f3da8a5f71"
    //         },
    //         {
    //             "#": "286",
    //             "Date": "05 May 2025",
    //             "Description": "NACH-10-DR-CTRAZORPAY- CAPITALFLOQQYW1H8KDE8TGQ",
    //             "Chq/Ref. No.": "NACHDB050525081150 01",
    //             "Withdrawal (Dr.)": "5,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,28,121.65",
    //             "tempId": "88568f60-2546-4d0e-9b6a-85c0d236a545"
    //         },
    //         {
    //             "#": "287",
    //             "Date": "05 May 2025",
    //             "Description": "NACH-10-DR-CTRAZORPAY- CAPITALFLOQQYVRGPH6MNRZP",
    //             "Chq/Ref. No.": "NACHDB050525081149 01",
    //             "Withdrawal (Dr.)": "999.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,27,122.65",
    //             "tempId": "e2a9b187-ff95-4621-910d-b9df57e7c5a9"
    //         },
    //         {
    //             "#": "288",
    //             "Date": "05 May 2025",
    //             "Description": "UPI/AMIT  SAHA/512571700626/UPI",
    //             "Chq/Ref. No.": "UPI-512551097482",
    //             "Withdrawal (Dr.)": "80.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,27,042.65",
    //             "tempId": "b27f8866-0e3e-4449-8c64-9b370a4227f9"
    //         },
    //         {
    //             "#": "289",
    //             "Date": "05 May 2025",
    //             "Description": "UPI/Compass India F/549151791006/UPI",
    //             "Chq/Ref. No.": "UPI-512552325207",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,27,000.65",
    //             "tempId": "e07ce7eb-3109-4bdc-aaff-7d491750db7e"
    //         },
    //         {
    //             "#": "290",
    //             "Date": "05 May 2025",
    //             "Description": "UPI/aloke.singh567@/512567228960/UPI",
    //             "Chq/Ref. No.": "UPI-512576309345",
    //             "Withdrawal (Dr.)": "83.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,26,917.65",
    //             "tempId": "3cb8990f-8029-44aa-8819-5b7314e83572"
    //         },
    //         {
    //             "#": "291",
    //             "Date": "06 May 2025",
    //             "Description": "UPI/Jio Prepaid Rec/512611563630/UPI",
    //             "Chq/Ref. No.": "UPI-512611995606",
    //             "Withdrawal (Dr.)": "629.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,26,288.65",
    //             "tempId": "2ddaed29-ea9c-4b93-8817-ad15e7087e74"
    //         },
    //         {
    //             "#": "292",
    //             "Date": "06 May 2025",
    //             "Description": "UPI/VODAFONE IDEA L/512673567636/UPI",
    //             "Chq/Ref. No.": "UPI-512612141042",
    //             "Withdrawal (Dr.)": "489.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,25,799.65",
    //             "tempId": "50c1e20c-8d47-4cb1-a5a4-8cc0d5032ff0"
    //         },
    //         {
    //             "#": "293",
    //             "Date": "06 May 2025",
    //             "Description": "UPI/SENAPATI D/512606968828/UPI",
    //             "Chq/Ref. No.": "UPI-512612232015",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "89,000.00",
    //             "Balance": "6,14,799.65",
    //             "tempId": "0ed57e2c-6314-41d1-9571-6f3c83a43324"
    //         },
    //         {
    //             "#": "294",
    //             "Date": "07 May 2025",
    //             "Description": "UPI/Indian Clearing/512700711660/Indian Clearing",
    //             "Chq/Ref. No.": "UPI-512754566932",
    //             "Withdrawal (Dr.)": "2,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,12,799.65",
    //             "tempId": "24750d8a-3b24-48c6-b787-25bc2c6a140a"
    //         },
    //         {
    //             "#": "295",
    //             "Date": "07 May 2025",
    //             "Description": "UPI/Indian Clearing/512700711638/Indian Clearing",
    //             "Chq/Ref. No.": "UPI-512754566894",
    //             "Withdrawal (Dr.)": "4,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,08,799.65",
    //             "tempId": "e253a3ba-6941-4a44-ae44-09c8cf81752d"
    //         },
    //         {
    //             "#": "296",
    //             "Date": "07 May 2025",
    //             "Description": "UPI/Indian Clearing/512700711692/Indian Clearing",
    //             "Chq/Ref. No.": "UPI-512754566982",
    //             "Withdrawal (Dr.)": "4,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,04,799.65",
    //             "tempId": "27658a1b-0d84-475b-b2c5-20d042c65c02"
    //         },
    //         {
    //             "#": "297",
    //             "Date": "07 May 2025",
    //             "Description": "UPI/SUPRATIM  AUDDY/549334527378/Netflix",
    //             "Chq/Ref. No.": "UPI-512759591551",
    //             "Withdrawal (Dr.)": "163.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,04,636.65",
    //             "tempId": "bd61ded3-7c19-4c2b-945a-7d26c9d95e77"
    //         },
    //         {
    //             "#": "298",
    //             "Date": "07 May 2025",
    //             "Description": "UPI/EMAMI FRANK ROS/549356341755/3836610444",
    //             "Chq/Ref. No.": "UPI-512775756541",
    //             "Withdrawal (Dr.)": "613.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,04,023.65",
    //             "tempId": "a4423702-9be2-4ede-bac4-d809aa27ddc0"
    //         },
    //         {
    //             "#": "299",
    //             "Date": "07 May 2025",
    //             "Description": "UPI/Amazon Pay/512775488929/AmazonChannels",
    //             "Chq/Ref. No.": "UPI-512784840759",
    //             "Withdrawal (Dr.)": "69.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,03,954.65",
    //             "tempId": "bee6d4ce-4bc1-49cc-bddd-f464e24fe0f9"
    //         },
    //         {
    //             "#": "300",
    //             "Date": "08 May 2025",
    //             "Description": "UPI/Compass India F/512832621199/UPI",
    //             "Chq/Ref. No.": "UPI-512839398507",
    //             "Withdrawal (Dr.)": "21.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,03,933.65",
    //             "tempId": "aea86b72-9342-4675-b3db-32036bd5fda6"
    //         },
    //         {
    //             "#": "301",
    //             "Date": "08 May 2025",
    //             "Description": "UPI/Mr DIPANKAR KUN/512889947407/UPI",
    //             "Chq/Ref. No.": "UPI-512863134003",
    //             "Withdrawal (Dr.)": "120.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,03,813.65",
    //             "tempId": "9c5ec1fb-0595-490d-9810-1d5066faff59"
    //         },
    //         {
    //             "#": "302",
    //             "Date": "08 May 2025",
    //             "Description": "UPI/METRO PHARMA 9/512806655246/UPI",
    //             "Chq/Ref. No.": "UPI-512863897762",
    //             "Withdrawal (Dr.)": "624.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,03,189.65",
    //             "tempId": "aa8a6f32-d661-42b4-8a8e-227aae678596"
    //         },
    //         {
    //             "#": "303",
    //             "Date": "08 May 2025",
    //             "Description": "UPI/Mobile Mania/512894256376/UPI",
    //             "Chq/Ref. No.": "UPI-512864643124",
    //             "Withdrawal (Dr.)": "150.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,03,039.65",
    //             "tempId": "bb4b3c4a-156f-408c-bd0c-93f9ac95a1cd"
    //         },
    //         {
    //             "#": "304",
    //             "Date": "08 May 2025",
    //             "Description": "UPI/Godaddy India D/512809655433/collect- pay-req",
    //             "Chq/Ref. No.": "UPI-512868941827",
    //             "Withdrawal (Dr.)": "217.69",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,02,821.96",
    //             "tempId": "d80892cf-798c-48fa-92e2-1b331468af78"
    //         },
    //         {
    //             "#": "305",
    //             "Date": "08 May 2025",
    //             "Description": "UPI/Godaddy India D/512809689079/collect- pay-req",
    //             "Chq/Ref. No.": "UPI-512869452829",
    //             "Withdrawal (Dr.)": "217.69",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,02,604.27",
    //             "tempId": "70a02f27-b96c-4919-afbf-88813cfda0f6"
    //         },
    //         {
    //             "#": "306",
    //             "Date": "08 May 2025",
    //             "Description": "PCI/0024/NAME-CHEAP.COM* C00QAO/+13233080525/21:46",
    //             "Chq/Ref. No.": "512816210058",
    //             "Withdrawal (Dr.)": "102.59",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,02,501.68",
    //             "tempId": "3b346de0-ab0c-42d1-9487-ceb81899873d"
    //         },
    //         {
    //             "#": "307",
    //             "Date": "09 May 2025",
    //             "Description": "UPI/Godaddy India D/512910415870/collect- pay-req",
    //             "Chq/Ref. No.": "UPI-512979857800",
    //             "Withdrawal (Dr.)": "217.69",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,02,283.99",
    //             "tempId": "c52b4aa7-0d6a-48ba-bb5d-360ceae6e46b"
    //         },
    //         {
    //             "#": "308",
    //             "Date": "10 May 2025",
    //             "Description": "UPI/RUNU SENAPATI/104571640061/UPI",
    //             "Chq/Ref. No.": "UPI-513052689336",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "620.00",
    //             "Balance": "6,02,903.99",
    //             "tempId": "0adf398b-f542-4ad6-b5c8-fc45dae8e045"
    //         },
    //         {
    //             "#": "309",
    //             "Date": "10 May 2025",
    //             "Description": "UPI_CRADJ_U2_TDT_070525_549356341755_ 09MAY2025_9C",
    //             "Chq/Ref. No.": "FOS2513079486197",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "613.00",
    //             "Balance": "6,03,516.99",
    //             "tempId": "d7f0064b-ee58-4b6f-ac30-d26e0cf375bf"
    //         },
    //         {
    //             "#": "310",
    //             "Date": "11 May 2025",
    //             "Description": "UPI/NAKUL  AICH/513161328701/UPI",
    //             "Chq/Ref. No.": "UPI-513117458423",
    //             "Withdrawal (Dr.)": "20.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,03,496.99",
    //             "tempId": "08fea489-3c85-4fc5-8b5e-a41510638aab"
    //         },
    //         {
    //             "#": "311",
    //             "Date": "11 May 2025",
    //             "Description": "UPI/SOUMITRA GHOSH/513152025952/UPI",
    //             "Chq/Ref. No.": "UPI-513117599578",
    //             "Withdrawal (Dr.)": "20.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,03,476.99",
    //             "tempId": "566006e7-5d03-461b-b3e5-50b9503e2075"
    //         },
    //         {
    //             "#": "312",
    //             "Date": "11 May 2025",
    //             "Description": "UPI/ARINDAM SEAL/513158965720/UPI",
    //             "Chq/Ref. No.": "UPI-513146627267",
    //             "Withdrawal (Dr.)": "200.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,03,276.99",
    //             "tempId": "94756c25-ee03-434a-9b9f-98c40aecb552"
    //         },
    //         {
    //             "#": "313",
    //             "Date": "13 May 2025",
    //             "Description": "UPI_CRADJ_U2_TDT_080525_512809655433_ 12MAY2025_9C",
    //             "Chq/Ref. No.": "FOS2513379876809",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "217.69",
    //             "Balance": "6,03,494.68",
    //             "tempId": "6fb772ff-061a-404c-a007-3a10f3935c4f"
    //         },
    //         {
    //             "#": "Statement Generated on 17 Mar 2026, 18:41",
    //             "Date": "13 May 2025",
    //             "Description": "UPI_CRADJ_U2_TDT_080525_512809689079_ 12MAY2025_9C",
    //             "Chq/Ref. No.": "FOS2513379876801",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "217.69",
    //             "Balance": "6,03,712.37 Page 8 of  22",
    //             "tempId": "8205bf28-2087-42af-b86b-d85069ed5f35"
    //         },
    //         {
    //             "#": "314",
    //             "Date": "",
    //             "Description": "",
    //             "Chq/Ref. No.": "",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "",
    //             "Balance": "",
    //             "tempId": "eef714ad-99f3-4b26-829d-5b03256cb2d4"
    //         },
    //         {
    //             "#": "315",
    //             "Date": "15 May 2025",
    //             "Description": "UPI/Compass India F/550191231594/UPI",
    //             "Chq/Ref. No.": "UPI-513573878281",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,03,670.37",
    //             "tempId": "618b86fa-8372-4520-be73-88c89f70a333"
    //         },
    //         {
    //             "#": "316",
    //             "Date": "17 May 2025",
    //             "Description": "UPI/ARUP  DAS/513748255878/UPI",
    //             "Chq/Ref. No.": "UPI-513787925116",
    //             "Withdrawal (Dr.)": "15.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,03,655.37",
    //             "tempId": "756680ed-30af-4683-85b3-894de81d9649"
    //         },
    //         {
    //             "#": "317",
    //             "Date": "18 May 2025",
    //             "Description": "UPI/NAKUL  AICH/550465719556/UPI",
    //             "Chq/Ref. No.": "UPI-513845908714",
    //             "Withdrawal (Dr.)": "20.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,03,635.37",
    //             "tempId": "8a79b838-ed7a-4728-bdca-5f04004fb61f"
    //         },
    //         {
    //             "#": "318",
    //             "Date": "19 May 2025",
    //             "Description": "UPI/MS NANILAL GHOS/513977655024/UPI",
    //             "Chq/Ref. No.": "UPI-513950473463",
    //             "Withdrawal (Dr.)": "30.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,03,605.37",
    //             "tempId": "b8a72f6d-fe2a-4f8a-a7ae-e99094f9b861"
    //         },
    //         {
    //             "#": "319",
    //             "Date": "20 May 2025",
    //             "Description": "UPI/ARUP  DAS/514065463620/UPI",
    //             "Chq/Ref. No.": "UPI-514066274185",
    //             "Withdrawal (Dr.)": "25.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,03,580.37",
    //             "tempId": "bbcd2224-d0c4-44cd-bacd-4e37e262cc51"
    //         },
    //         {
    //             "#": "320",
    //             "Date": "21 May 2025",
    //             "Description": "UPI/JIOHOTSTAR/100596758102/UPI Mandate",
    //             "Chq/Ref. No.": "UPI-514175070967",
    //             "Withdrawal (Dr.)": "403.14",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,03,177.23",
    //             "tempId": "c226090c-dbfc-4421-ad3f-61082df9baf1"
    //         },
    //         {
    //             "#": "321",
    //             "Date": "22 May 2025",
    //             "Description": "UPI/BIGTREE ENTERTA/514224239047/UPI",
    //             "Chq/Ref. No.": "UPI-514209536270",
    //             "Withdrawal (Dr.)": "662.04",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,02,515.19",
    //             "tempId": "55aafa16-ce45-456a-afb0-16c0c44426c5"
    //         },
    //         {
    //             "#": "322",
    //             "Date": "22 May 2025",
    //             "Description": "UPI/RIK  SINGHA/514253824811/UPI",
    //             "Chq/Ref. No.": "UPI-514212686000",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "442.00",
    //             "Balance": "6,02,957.19",
    //             "tempId": "fcacf273-5a4f-4b11-9ea1-6da0500791a3"
    //         },
    //         {
    //             "#": "323",
    //             "Date": "22 May 2025",
    //             "Description": "UPI/NEW MEGHBELA MU/514287958067/UPI",
    //             "Chq/Ref. No.": "UPI-514225687305",
    //             "Withdrawal (Dr.)": "767.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,02,190.19",
    //             "tempId": "5c0a9d3b-88da-433f-afc6-e622604d8ed1"
    //         },
    //         {
    //             "#": "324",
    //             "Date": "23 May 2025",
    //             "Description": "PCD/3224/GOOGLE PLAY SER CYBS S/I 224230525/10:15",
    //             "Chq/Ref. No.": "514204250483",
    //             "Withdrawal (Dr.)": "149.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,02,041.19",
    //             "tempId": "b3579838-665a-40d7-a185-207051ae18fa"
    //         },
    //         {
    //             "#": "325",
    //             "Date": "23 May 2025",
    //             "Description": "UPI/BAISHAKHI  MAJH/550994923611/UPI",
    //             "Chq/Ref. No.": "UPI-514368943176",
    //             "Withdrawal (Dr.)": "1,350.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,00,691.19",
    //             "tempId": "08e3b31f-b197-4315-bcd0-9726bf1f3943"
    //         },
    //         {
    //             "#": "326",
    //             "Date": "24 May 2025",
    //             "Description": "UPI/TARAMA CATARER/514492902315/UPI",
    //             "Chq/Ref. No.": "UPI-514444003914",
    //             "Withdrawal (Dr.)": "100.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,00,591.19",
    //             "tempId": "eaa08105-2886-4459-aa33-8e67e06b6af5"
    //         },
    //         {
    //             "#": "327",
    //             "Date": "26 May 2025",
    //             "Description": "UPI/Amazon India/551277914576/You are paying",
    //             "Chq/Ref. No.": "UPI-514637126903",
    //             "Withdrawal (Dr.)": "270.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,00,321.19",
    //             "tempId": "34047fd4-894a-47ad-a062-70f751f137dd"
    //         },
    //         {
    //             "#": "328",
    //             "Date": "27 May 2025",
    //             "Description": "UPI/Compass India F/551301997508/UPI",
    //             "Chq/Ref. No.": "UPI-514700838540",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,00,279.19",
    //             "tempId": "e7ac87e7-c385-4083-a26a-34fd3a2d3a71"
    //         },
    //         {
    //             "#": "329",
    //             "Date": "27 May 2025",
    //             "Description": "UPI/Slent vv00004/514780310452/UPI",
    //             "Chq/Ref. No.": "UPI-514714021624",
    //             "Withdrawal (Dr.)": "35.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,00,244.19",
    //             "tempId": "f3c664aa-da7e-4324-b0dc-2edc818fde27"
    //         },
    //         {
    //             "#": "330",
    //             "Date": "27 May 2025",
    //             "Description": "UPI/Subrata Ghosh/514779805915/UPI",
    //             "Chq/Ref. No.": "UPI-514720334740",
    //             "Withdrawal (Dr.)": "78.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,00,166.19",
    //             "tempId": "6280fe12-533b-4b25-9397-b45e40676585"
    //         },
    //         {
    //             "#": "331",
    //             "Date": "28 May 2025",
    //             "Description": "UPI/Google Play/346420921485/MandateExecute",
    //             "Chq/Ref. No.": "UPI-514869921296",
    //             "Withdrawal (Dr.)": "99.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,00,067.19",
    //             "tempId": "22d68a87-521d-4cc1-ae3e-c44a8e72b269"
    //         },
    //         {
    //             "#": "332",
    //             "Date": "29 May 2025",
    //             "Description": "UPI/ARINDAM SEAL/551589356751/UPI",
    //             "Chq/Ref. No.": "UPI-514936808101",
    //             "Withdrawal (Dr.)": "140.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,99,927.19",
    //             "tempId": "05f87d72-eb7c-45ac-897b-4f832e47ca6b"
    //         },
    //         {
    //             "#": "333",
    //             "Date": "29 May 2025",
    //             "Description": "UPI/ZEPTO/551516655498/UPI",
    //             "Chq/Ref. No.": "UPI-514939914837",
    //             "Withdrawal (Dr.)": "118.19",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,99,809.00",
    //             "tempId": "331480f4-80ab-492b-babd-84ca7f5a466c"
    //         },
    //         {
    //             "#": "334",
    //             "Date": "29 May 2025",
    //             "Description": "UPI/Zepto/551506467837/UPI",
    //             "Chq/Ref. No.": "UPI-514944229225",
    //             "Withdrawal (Dr.)": "117.19",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,99,691.81",
    //             "tempId": "019450c4-4233-4106-a884-92f2b1e23141"
    //         },
    //         {
    //             "#": "335",
    //             "Date": "29 May 2025",
    //             "Description": "UPI/Axis/514921057255/AmazonChannels",
    //             "Chq/Ref. No.": "UPI-514953508507",
    //             "Withdrawal (Dr.)": "99.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,99,592.81",
    //             "tempId": "33e458ea-0e21-448c-9018-e24feac07e9e"
    //         },
    //         {
    //             "#": "336",
    //             "Date": "31 May 2025",
    //             "Description": "UPI_CRADJ_U2_TDT_290525_551516655498_ 30MAY2025_10C",
    //             "Chq/Ref. No.": "FOS2515183925308",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "117.19",
    //             "Balance": "5,99,710.00",
    //             "tempId": "f5ec039a-6582-4925-af10-45d0eebf7c20"
    //         },
    //         {
    //             "#": "337",
    //             "Date": "01 Jun 2025",
    //             "Description": "UPI/LIFE INSURANCE /100658358044/PAYMENT",
    //             "Chq/Ref. No.": "UPI-515297261511",
    //             "Withdrawal (Dr.)": "4,667.48",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,95,042.52",
    //             "tempId": "96a936cb-16a6-48ab-8a58-7e5beff21f9d"
    //         },
    //         {
    //             "#": "338",
    //             "Date": "01 Jun 2025",
    //             "Description": "UPI/SENAPATI D/551844156472/UPI",
    //             "Chq/Ref. No.": "UPI-515201564142",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "30,000.00",
    //             "Balance": "6,25,042.52",
    //             "tempId": "8c0f6a29-3c7c-4360-a206-9b08ee206469"
    //         },
    //         {
    //             "#": "339",
    //             "Date": "01 Jun 2025",
    //             "Description": "UPI/CELEBRATION/551874274224/UPI",
    //             "Chq/Ref. No.": "UPI-515219217237",
    //             "Withdrawal (Dr.)": "80.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,24,962.52",
    //             "tempId": "b2580473-e762-4c46-ad9e-1745c46ebd42"
    //         },
    //         {
    //             "#": "340",
    //             "Date": "01 Jun 2025",
    //             "Description": "UPI/Vishal Kumar/515281421337/UPI",
    //             "Chq/Ref. No.": "UPI-515242583309",
    //             "Withdrawal (Dr.)": "8.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,24,954.52",
    //             "tempId": "80069e36-fc85-4e52-9899-b1d4148278b6"
    //         },
    //         {
    //             "#": "341",
    //             "Date": "02 Jun 2025",
    //             "Description": "UPI/DRIPTA SENAPATI/515374523046/UPI",
    //             "Chq/Ref. No.": "UPI-515359347593",
    //             "Withdrawal (Dr.)": "3,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,21,954.52",
    //             "tempId": "7a8a95af-e625-439e-8ad8-7022a43bb87f"
    //         },
    //         {
    //             "#": "342",
    //             "Date": "02 Jun 2025",
    //             "Description": "UPI/Alamgir Sapui/515324343012/UPI",
    //             "Chq/Ref. No.": "UPI-515372569261",
    //             "Withdrawal (Dr.)": "80.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,21,874.52",
    //             "tempId": "da817ee1-6801-4417-994d-cdc6438f7885"
    //         },
    //         {
    //             "#": "343",
    //             "Date": "02 Jun 2025",
    //             "Description": "UPI/Compass India F/515329040396/UPI",
    //             "Chq/Ref. No.": "UPI-515374393966",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,21,832.52",
    //             "tempId": "17d83cf5-f05d-4f50-9c12-ff8c2078b269"
    //         },
    //         {
    //             "#": "344",
    //             "Date": "02 Jun 2025",
    //             "Description": "UPI/Mrityunjoy  Pau/515335558889/UPI",
    //             "Chq/Ref. No.": "UPI-515394425344",
    //             "Withdrawal (Dr.)": "76.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,21,756.52",
    //             "tempId": "aa6bf33c-bedb-48cc-91c2-cd0f5df1fb32"
    //         },
    //         {
    //             "#": "345",
    //             "Date": "02 Jun 2025",
    //             "Description": "UPI/PharmEasy/515387283879/UPI",
    //             "Chq/Ref. No.": "UPI-515315736256",
    //             "Withdrawal (Dr.)": "2,472.72",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,19,283.80",
    //             "tempId": "6aa8569a-ceef-4d1c-ba04-7361d706add7"
    //         },
    //         {
    //             "#": "346",
    //             "Date": "02 Jun 2025",
    //             "Description": "UPI/Apollo Pharmacy/515329781436/Payment to Apol",
    //             "Chq/Ref. No.": "UPI-515315898895",
    //             "Withdrawal (Dr.)": "714.75",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,18,569.05",
    //             "tempId": "4b67bdd6-29a1-4409-89a2-cf2a2d656d38"
    //         },
    //         {
    //             "#": "347",
    //             "Date": "02 Jun 2025",
    //             "Description": "UPI/RUNU SENAPATI/105829516125/UPI",
    //             "Chq/Ref. No.": "UPI-515315932422",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "3,300.00",
    //             "Balance": "6,21,869.05",
    //             "tempId": "d2590d7e-530f-4683-b665-50b53fc9a693"
    //         },
    //         {
    //             "#": "348",
    //             "Date": "04 Jun 2025",
    //             "Description": "UPI_CRADJ_U2_TDT_020625_515387283879_ 04JUN2025_5C",
    //             "Chq/Ref. No.": "FOS2515584826369",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "254.40",
    //             "Balance": "6,22,123.45",
    //             "tempId": "529d2d85-82e3-4dec-86e8-e5a6f7686434"
    //         },
    //         {
    //             "#": "349",
    //             "Date": "05 Jun 2025",
    //             "Description": "NACH-10-DR-CTRAZORPAY- CAPITALFLOQDE360MV7CDZJD",
    //             "Chq/Ref. No.": "NACHDB050625081347 00",
    //             "Withdrawal (Dr.)": "344.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,21,779.45",
    //             "tempId": "ff012546-69ab-4e12-8e26-9aca8cd2b284"
    //         },
    //         {
    //             "#": "350",
    //             "Date": "05 Jun 2025",
    //             "Description": "UPI/NURUL ISLAM MOL/515672556780/UPI",
    //             "Chq/Ref. No.": "UPI-515670483557",
    //             "Withdrawal (Dr.)": "80.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,21,699.45",
    //             "tempId": "53d61992-40a6-4ea3-a645-07023d7c0f29"
    //         },
    //         {
    //             "#": "351",
    //             "Date": "05 Jun 2025",
    //             "Description": "UPI/Compass India F/515661756748/UPI",
    //             "Chq/Ref. No.": "UPI-515673955898",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,21,657.45",
    //             "tempId": "535c2724-fcae-4a50-9a83-6f85abe470d2"
    //         },
    //         {
    //             "#": "352",
    //             "Date": "05 Jun 2025",
    //             "Description": "UPI/SHREE SIDDHI VI/515606097836/UPI",
    //             "Chq/Ref. No.": "UPI-515604128158",
    //             "Withdrawal (Dr.)": "110.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,21,547.45",
    //             "tempId": "9a3498a3-fb3b-4090-9ff8-be09125ab16f"
    //         },
    //         {
    //             "#": "353",
    //             "Date": "06 Jun 2025",
    //             "Description": "UPI/IRON ARMOUR FIT/552301976388/UPI",
    //             "Chq/Ref. No.": "UPI-515770774712",
    //             "Withdrawal (Dr.)": "5,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,16,547.45",
    //             "tempId": "a1463541-165d-47f1-b568-b792f9e94a69"
    //         },
    //         {
    //             "#": "354",
    //             "Date": "06 Jun 2025",
    //             "Description": "UPI/PHARMEASY/552365990110/UPI",
    //             "Chq/Ref. No.": "UPI-515782327537",
    //             "Withdrawal (Dr.)": "391.42",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,16,156.03",
    //             "tempId": "de945558-7fb6-4c2b-9b02-12212a5d6aa3"
    //         },
    //         {
    //             "#": "355",
    //             "Date": "06 Jun 2025",
    //             "Description": "UPI/RUNU SENAPATI/106055373604/UPI(Value Date: 07-06-2025)",
    //             "Chq/Ref. No.": "UPI-515883217872",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "330.00",
    //             "Balance": "6,16,486.03",
    //             "tempId": "4de2df8f-ca49-435a-8750-ed0bbab76d68"
    //         },
    //         {
    //             "#": "356",
    //             "Date": "07 Jun 2025",
    //             "Description": "UPI/Indian Clearing/515857292745/Indian Clearing",
    //             "Chq/Ref. No.": "UPI-515886815084",
    //             "Withdrawal (Dr.)": "4,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,12,486.03",
    //             "tempId": "60422774-751a-4e41-8b62-ec42d249cd77"
    //         },
    //         {
    //             "#": "Statement Generated on 17 Mar 2026, 18:41",
    //             "Date": "07 Jun 2025",
    //             "Description": "UPI/Indian Clearing/515857295698/Indian Clearing",
    //             "Chq/Ref. No.": "UPI-515886824782",
    //             "Withdrawal (Dr.)": "2,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,10,486.03 Page 9 of  22",
    //             "tempId": "1f040279-63eb-476e-ade1-fa18a1fa9d2d"
    //         },
    //         {
    //             "#": "357",
    //             "Date": "",
    //             "Description": "",
    //             "Chq/Ref. No.": "",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "",
    //             "Balance": "",
    //             "tempId": "77f31963-a305-4518-aa9c-6734a92a37ae"
    //         },
    //         {
    //             "#": "358",
    //             "Date": "07 Jun 2025",
    //             "Description": "UPI/Indian Clearing/515857295784/Indian Clearing",
    //             "Chq/Ref. No.": "UPI-515886825076",
    //             "Withdrawal (Dr.)": "4,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,06,486.03",
    //             "tempId": "62d09d46-270c-49a8-b095-ee1edb04e992"
    //         },
    //         {
    //             "#": "359",
    //             "Date": "07 Jun 2025",
    //             "Description": "UPI/Amazon Pay/515840239124/AmazonChannels",
    //             "Chq/Ref. No.": "UPI-515814138229",
    //             "Withdrawal (Dr.)": "69.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,06,417.03",
    //             "tempId": "68408263-e835-48f6-852a-fb7f0adf7dbf"
    //         },
    //         {
    //             "#": "360",
    //             "Date": "07 Jun 2025",
    //             "Description": "UPI/PRAKASH VISHWAK/515894147953/UPI",
    //             "Chq/Ref. No.": "UPI-515829481426",
    //             "Withdrawal (Dr.)": "10,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,96,417.03",
    //             "tempId": "aff063ca-4872-40ce-9cd6-1905756c723c"
    //         },
    //         {
    //             "#": "361",
    //             "Date": "08 Jun 2025",
    //             "Description": "UPI/PRAKASH VISHWAK/515969883288/UPI",
    //             "Chq/Ref. No.": "UPI-515962527180",
    //             "Withdrawal (Dr.)": "450.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,95,967.03",
    //             "tempId": "33a1eda8-2ab8-49e4-9571-bd61b9bf1411"
    //         },
    //         {
    //             "#": "362",
    //             "Date": "08 Jun 2025",
    //             "Description": "UPI/IRCTC CF/100718487792/IRCTC TICKET BO",
    //             "Chq/Ref. No.": "UPI-515966274254",
    //             "Withdrawal (Dr.)": "221.80",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,95,745.23",
    //             "tempId": "25282d51-98bb-44b4-aaa8-2ff1e89228f8"
    //         },
    //         {
    //             "#": "363",
    //             "Date": "08 Jun 2025",
    //             "Description": "UPI/IRCTC CF/100718512610/IRCTC TICKET BO",
    //             "Chq/Ref. No.": "UPI-515966473453",
    //             "Withdrawal (Dr.)": "221.80",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,95,523.43",
    //             "tempId": "10e3033c-9cf9-45ce-86af-4b556fbcc5a3"
    //         },
    //         {
    //             "#": "364",
    //             "Date": "08 Jun 2025",
    //             "Description": "UPI/Arpita  Sarkar/515932861753/UPI",
    //             "Chq/Ref. No.": "UPI-515966976198",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "444.00",
    //             "Balance": "5,95,967.43",
    //             "tempId": "e67cc12b-015d-4c2b-a010-bb68fc26d0c6"
    //         },
    //         {
    //             "#": "365",
    //             "Date": "08 Jun 2025",
    //             "Description": "UPI/METRO PHARMA 9/552572703234/UPI",
    //             "Chq/Ref. No.": "UPI-515982236314",
    //             "Withdrawal (Dr.)": "1,108.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,94,859.43",
    //             "tempId": "2f0b4134-033b-4bd0-a8d6-81cc2966dac4"
    //         },
    //         {
    //             "#": "366",
    //             "Date": "08 Jun 2025",
    //             "Description": "UPI/ZOMATO/552568917583/UPI",
    //             "Chq/Ref. No.": "UPI-515990225542",
    //             "Withdrawal (Dr.)": "901.55",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,93,957.88",
    //             "tempId": "b3b99db8-cca8-4365-bb30-0cc2f88fba29"
    //         },
    //         {
    //             "#": "367",
    //             "Date": "10 Jun 2025",
    //             "Description": "UPI/RAJENDRA  SWAIN/516127751244/UPI",
    //             "Chq/Ref. No.": "UPI-516178714422",
    //             "Withdrawal (Dr.)": "20.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,93,937.88",
    //             "tempId": "c29830d9-64e4-423e-8cc1-24b2f377190f"
    //         },
    //         {
    //             "#": "368",
    //             "Date": "11 Jun 2025",
    //             "Description": "ATL/0024/622018/SBI HATIBAGAN ONSITE A110625/10:37",
    //             "Chq/Ref. No.": "516210018539",
    //             "Withdrawal (Dr.)": "10,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,83,937.88",
    //             "tempId": "ad30f684-4cb0-4457-bf7f-f3d5b8437298"
    //         },
    //         {
    //             "#": "369",
    //             "Date": "11 Jun 2025",
    //             "Description": "ATL/0024/622018/SBI HATIBAGAN ONSITE A110625/10:38",
    //             "Chq/Ref. No.": "516210005572",
    //             "Withdrawal (Dr.)": "10,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,73,937.88",
    //             "tempId": "b4c7f50a-0887-46d0-9395-fad010861ff4"
    //         },
    //         {
    //             "#": "370",
    //             "Date": "12 Jun 2025",
    //             "Description": "UPI/Compass India F/516368718646/UPI",
    //             "Chq/Ref. No.": "UPI-516318503520",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,73,895.88",
    //             "tempId": "b6eaf0ff-e736-4460-995b-ce816f3cec2a"
    //         },
    //         {
    //             "#": "371",
    //             "Date": "12 Jun 2025",
    //             "Description": "UPI/SERVESEED FOUND/516354850407/UPI",
    //             "Chq/Ref. No.": "UPI-516340869070",
    //             "Withdrawal (Dr.)": "1,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,72,895.88",
    //             "tempId": "43afbc39-32fd-43d5-82b3-831d12eec7be"
    //         },
    //         {
    //             "#": "372",
    //             "Date": "12 Jun 2025",
    //             "Description": "UPI/BAPPAI DEBNATH/516326251091/UPI",
    //             "Chq/Ref. No.": "UPI-516343572441",
    //             "Withdrawal (Dr.)": "77.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,72,818.88",
    //             "tempId": "16237895-5e35-405c-8af4-0f847ba2a450"
    //         },
    //         {
    //             "#": "373",
    //             "Date": "13 Jun 2025",
    //             "Description": "UPI/KABIR EGG SHOP/516448999074/Payment made to",
    //             "Chq/Ref. No.": "UPI-516468265013",
    //             "Withdrawal (Dr.)": "14.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,72,804.88",
    //             "tempId": "e68ff8fa-2987-409a-bffc-ee8ec07ac051"
    //         },
    //         {
    //             "#": "374",
    //             "Date": "13 Jun 2025",
    //             "Description": "UPI/Mr DRIPTA SENAP/516490034122/UPI",
    //             "Chq/Ref. No.": "UPI-516493336414",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "15,000.00",
    //             "Balance": "5,87,804.88",
    //             "tempId": "a09dc458-ddae-461b-ba70-6a5808598b6b"
    //         },
    //         {
    //             "#": "375",
    //             "Date": "14 Jun 2025",
    //             "Description": "UPI/RANADEB SIL/553164668372/UPI",
    //             "Chq/Ref. No.": "UPI-516531704833",
    //             "Withdrawal (Dr.)": "20.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,87,784.88",
    //             "tempId": "3f905830-f1a4-4283-a5a1-c20795b21337"
    //         },
    //         {
    //             "#": "376",
    //             "Date": "14 Jun 2025",
    //             "Description": "UPI/Amazon India/516554340287/You are paying",
    //             "Chq/Ref. No.": "UPI-516535514853",
    //             "Withdrawal (Dr.)": "49.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,87,735.88",
    //             "tempId": "db52d3af-b2ec-44f7-a031-3e71aee3f375"
    //         },
    //         {
    //             "#": "377",
    //             "Date": "14 Jun 2025",
    //             "Description": "UPI/BilldeskCESC/516594198715/collectpayre que",
    //             "Chq/Ref. No.": "UPI-516540129806",
    //             "Withdrawal (Dr.)": "1,580.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,86,155.88",
    //             "tempId": "32a71dde-3d83-41f9-a3d8-1884a8fbc48e"
    //         },
    //         {
    //             "#": "378",
    //             "Date": "14 Jun 2025",
    //             "Description": "UPI/RUNU SENAPATI/106451435789/UPI",
    //             "Chq/Ref. No.": "UPI-516541809339",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "600.00",
    //             "Balance": "5,86,755.88",
    //             "tempId": "5a5eacb8-3ff4-4103-91ea-1dd2e650203d"
    //         },
    //         {
    //             "#": "379",
    //             "Date": "14 Jun 2025",
    //             "Description": "UPI/GHOSH  CO/516500426653/UPI",
    //             "Chq/Ref. No.": "UPI-516574280396",
    //             "Withdrawal (Dr.)": "145.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,86,610.88",
    //             "tempId": "2002c934-3763-4b40-ae50-c4ee1e76da74"
    //         },
    //         {
    //             "#": "380",
    //             "Date": "14 Jun 2025",
    //             "Description": "UPI/Amazon India/516555739924/You are paying",
    //             "Chq/Ref. No.": "UPI-516578703751",
    //             "Withdrawal (Dr.)": "49.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,86,561.88",
    //             "tempId": "39aa4101-cd0a-49e0-aa4f-453bb11f3a10"
    //         },
    //         {
    //             "#": "381",
    //             "Date": "15 Jun 2025",
    //             "Description": "UPI/Swiggy Limited/553266100497/UPI",
    //             "Chq/Ref. No.": "UPI-516631717446",
    //             "Withdrawal (Dr.)": "530.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,86,031.88",
    //             "tempId": "eb06c2b1-cce7-4afa-ae39-37c1f0237791"
    //         },
    //         {
    //             "#": "382",
    //             "Date": "16 Jun 2025",
    //             "Description": "UPI/Compass India F/553327758247/UPI",
    //             "Chq/Ref. No.": "UPI-516761490816",
    //             "Withdrawal (Dr.)": "21.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,86,010.88",
    //             "tempId": "a44009d9-ed59-4960-aafe-1c688d22d712"
    //         },
    //         {
    //             "#": "383",
    //             "Date": "16 Jun 2025",
    //             "Description": "UPI/JAYANTACHAKRABO/516791620321/UPI",
    //             "Chq/Ref. No.": "UPI-516792529600",
    //             "Withdrawal (Dr.)": "100.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,85,910.88",
    //             "tempId": "fabfedfd-cedb-46d3-9647-22c880525aca"
    //         },
    //         {
    //             "#": "384",
    //             "Date": "17 Jun 2025",
    //             "Description": "UPI/PRAKASH VISHWAK/516897454457/UPI",
    //             "Chq/Ref. No.": "UPI-516822145406",
    //             "Withdrawal (Dr.)": "15,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,70,910.88",
    //             "tempId": "bb152749-03ef-4d24-9ddc-f04fa4a5ba03"
    //         },
    //         {
    //             "#": "385",
    //             "Date": "20 Jun 2025",
    //             "Description": "UPI/LIFE INSURANCE /100796935366/PAYMENT",
    //             "Chq/Ref. No.": "UPI-517195347953",
    //             "Withdrawal (Dr.)": "907.98",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,70,002.90",
    //             "tempId": "82ceadd1-8289-48a6-b199-fa1b1cee5ca1"
    //         },
    //         {
    //             "#": "386",
    //             "Date": "20 Jun 2025",
    //             "Description": "UPI/Blinkit/517125583419/PayviaRazorpay",
    //             "Chq/Ref. No.": "UPI-517199825558",
    //             "Withdrawal (Dr.)": "249.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,69,753.90",
    //             "tempId": "b616db1d-a36d-42ce-9ae2-4358c0d8775c"
    //         },
    //         {
    //             "#": "387",
    //             "Date": "20 Jun 2025",
    //             "Description": "UPI/ADI MALANCHA/553773300658/UPI",
    //             "Chq/Ref. No.": "UPI-517125825265",
    //             "Withdrawal (Dr.)": "220.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,69,533.90",
    //             "tempId": "f0bea99a-8ed1-4114-99e3-0e95d98a68ff"
    //         },
    //         {
    //             "#": "388",
    //             "Date": "20 Jun 2025",
    //             "Description": "UPI/BIGTREE ENTERTA/553769110072/UPI",
    //             "Chq/Ref. No.": "UPI-517126408308",
    //             "Withdrawal (Dr.)": "399.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,69,134.90",
    //             "tempId": "da591d94-e5b2-4b31-81e1-0a9765f43073"
    //         },
    //         {
    //             "#": "389",
    //             "Date": "20 Jun 2025",
    //             "Description": "UPI/Axis/517167449574/PrimeVideoAddOn",
    //             "Chq/Ref. No.": "UPI-517140048048",
    //             "Withdrawal (Dr.)": "699.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,68,435.90",
    //             "tempId": "c3353681-b1af-4ed1-b93c-8cb62d6abac8"
    //         },
    //         {
    //             "#": "390",
    //             "Date": "21 Jun 2025",
    //             "Description": "UPI/SENCO GOLD LIMI/553844437620/UPI",
    //             "Chq/Ref. No.": "UPI-517255672520",
    //             "Withdrawal (Dr.)": "3,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,65,435.90",
    //             "tempId": "b6ae84fe-c626-4a72-85b7-add6d6505443"
    //         },
    //         {
    //             "#": "391",
    //             "Date": "21 Jun 2025",
    //             "Description": "UPI/RUNU SENAPATI/106809263906/UPI",
    //             "Chq/Ref. No.": "UPI-517255728374",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "3,908.00",
    //             "Balance": "5,69,343.90",
    //             "tempId": "b14dcf89-71b1-4f34-8ba3-ccb50211d985"
    //         },
    //         {
    //             "#": "392",
    //             "Date": "21 Jun 2025",
    //             "Description": "UPI/Blinkit/553865296423/Blinkit Payment",
    //             "Chq/Ref. No.": "UPI-517289413652",
    //             "Withdrawal (Dr.)": "327.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,69,016.90",
    //             "tempId": "b1d656db-ef35-4de1-aabf-7dd6fb042412"
    //         },
    //         {
    //             "#": "393",
    //             "Date": "22 Jun 2025",
    //             "Description": "UPI/Wow Momo Foods /517322437396/UPI",
    //             "Chq/Ref. No.": "UPI-517339059053",
    //             "Withdrawal (Dr.)": "70.01",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,68,946.89",
    //             "tempId": "9a6ffeb2-cc4e-4d77-9095-0b80e7d46f99"
    //         },
    //         {
    //             "#": "394",
    //             "Date": "22 Jun 2025",
    //             "Description": "UPI/SWIGGY LIMITED/517373661791/UPI",
    //             "Chq/Ref. No.": "UPI-517352078854",
    //             "Withdrawal (Dr.)": "1,233.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,67,713.89",
    //             "tempId": "b490a008-cdf5-45d0-85c8-921625bd121b"
    //         },
    //         {
    //             "#": "395",
    //             "Date": "22 Jun 2025",
    //             "Description": "UPI/Arpita  Sarkar/517327019829/UPI",
    //             "Chq/Ref. No.": "UPI-517353285627",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "500.00",
    //             "Balance": "5,68,213.89",
    //             "tempId": "a1b26418-a728-45da-9381-175f7d37ee9b"
    //         },
    //         {
    //             "#": "396",
    //             "Date": "23 Jun 2025",
    //             "Description": "PCD/3224/GOOGLE PLAY SER CYBS S/I 224230625/10:15",
    //             "Chq/Ref. No.": "517304820219",
    //             "Withdrawal (Dr.)": "149.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,68,064.89",
    //             "tempId": "f3da41e9-0dc9-43a0-a6d0-e4ff2a069f36"
    //         },
    //         {
    //             "#": "397",
    //             "Date": "23 Jun 2025",
    //             "Description": "UPI/MADHA RAJBANSHI/554092139681/UPI",
    //             "Chq/Ref. No.": "UPI-517415923947",
    //             "Withdrawal (Dr.)": "35.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,68,029.89",
    //             "tempId": "c4192325-4c7b-476a-a4a2-9fe021b0361f"
    //         },
    //         {
    //             "#": "398",
    //             "Date": "24 Jun 2025",
    //             "Description": "UPI/Compass India F/554191680871/UPI",
    //             "Chq/Ref. No.": "UPI-517545830001",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,67,987.89",
    //             "tempId": "d0904c47-cee8-4359-92f0-2a0c1b14007d"
    //         },
    //         {
    //             "#": "399",
    //             "Date": "24 Jun 2025",
    //             "Description": "UPI/Compass India F/554125190950/UPI",
    //             "Chq/Ref. No.": "UPI-517558124497",
    //             "Withdrawal (Dr.)": "56.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,67,931.89",
    //             "tempId": "83323fa2-da73-416c-bcc1-ba54e8ff03b6"
    //         },
    //         {
    //             "#": "Statement Generated on 17 Mar 2026, 18:41",
    //             "Date": "24 Jun 2025",
    //             "Description": "UPI/JAY SINGH/517544908918/UPI",
    //             "Chq/Ref. No.": "UPI-517573780808",
    //             "Withdrawal (Dr.)": "80.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,67,851.89 Page 10 of  22",
    //             "tempId": "aefd948b-d72f-4cba-a27d-8a9aa32c883f"
    //         },
    //         {
    //             "#": "400",
    //             "Date": "",
    //             "Description": "",
    //             "Chq/Ref. No.": "",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "",
    //             "Balance": "",
    //             "tempId": "0985c164-da9a-45bd-af02-7568f4b376e3"
    //         },
    //         {
    //             "#": "401",
    //             "Date": "25 Jun 2025",
    //             "Description": "UPI/Blinkit/517641386347/Blinkit Payment",
    //             "Chq/Ref. No.": "UPI-517640576449",
    //             "Withdrawal (Dr.)": "358.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,67,493.89",
    //             "tempId": "38b197cd-934d-4116-817d-7e5f1bcd1908"
    //         },
    //         {
    //             "#": "402",
    //             "Date": "26 Jun 2025",
    //             "Description": "UPI/SWAPAN SARKAR/517709199631/UPI",
    //             "Chq/Ref. No.": "UPI-517758426150",
    //             "Withdrawal (Dr.)": "72.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,67,421.89",
    //             "tempId": "c54639fb-3cbb-42a3-8e6a-1f9f58a3be5f"
    //         },
    //         {
    //             "#": "403",
    //             "Date": "26 Jun 2025",
    //             "Description": "UPI/Compass India F/554316013169/UPI",
    //             "Chq/Ref. No.": "UPI-517766116112",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,67,379.89",
    //             "tempId": "e502acb9-540e-48e4-8975-97aaf0aefd76"
    //         },
    //         {
    //             "#": "404",
    //             "Date": "28 Jun 2025",
    //             "Description": "UPI/Google Play/281456781795/MandateExecute",
    //             "Chq/Ref. No.": "UPI-517998722480",
    //             "Withdrawal (Dr.)": "99.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,67,280.89",
    //             "tempId": "f03db9f3-24ae-4133-af04-05c0a704c78e"
    //         },
    //         {
    //             "#": "405",
    //             "Date": "30 Jun 2025",
    //             "Description": "ATL/0024/622018/SBI HATIBAGAN ONSITE A300625/12:24",
    //             "Chq/Ref. No.": "518112024100",
    //             "Withdrawal (Dr.)": "3,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,64,280.89",
    //             "tempId": "208a283f-44fe-402d-b839-9be735b6fa44"
    //         },
    //         {
    //             "#": "406",
    //             "Date": "30 Jun 2025",
    //             "Description": "UPI/Amazon India/518187227528/You are paying",
    //             "Chq/Ref. No.": "UPI-518114352418",
    //             "Withdrawal (Dr.)": "99.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,64,181.89",
    //             "tempId": "bf1ba402-91b7-4bdc-9d52-2c12b94ee4d7"
    //         },
    //         {
    //             "#": "407",
    //             "Date": "30 Jun 2025",
    //             "Description": "Int.Pd:4613421825:01-04-2025 to 30-06-2025",
    //             "Chq/Ref. No.": "",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "4,127.00",
    //             "Balance": "5,68,308.89",
    //             "tempId": "caadc7f3-2463-4f12-b0b8-292b4aef088b"
    //         },
    //         {
    //             "#": "408",
    //             "Date": "03 Jul 2025",
    //             "Description": "UPI/Mr AZIZ GAZI/518424077983/UPI",
    //             "Chq/Ref. No.": "UPI-518405137973",
    //             "Withdrawal (Dr.)": "61.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,68,247.89",
    //             "tempId": "655feb48-afb8-4480-8c48-91b25b7f0742"
    //         },
    //         {
    //             "#": "409",
    //             "Date": "04 Jul 2025",
    //             "Description": "UPI/Amazon India/555146991803/You are paying",
    //             "Chq/Ref. No.": "UPI-518504273687",
    //             "Withdrawal (Dr.)": "304.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,67,943.89",
    //             "tempId": "98c00327-ca1b-4495-badb-0a7afe27d541"
    //         },
    //         {
    //             "#": "410",
    //             "Date": "04 Jul 2025",
    //             "Description": "UPI/SENAPATI D/555174991045/UPI",
    //             "Chq/Ref. No.": "UPI-518505268072",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "50,000.00",
    //             "Balance": "6,17,943.89",
    //             "tempId": "f80d3eae-f3d4-4c6a-8ded-1963a944cc59"
    //         },
    //         {
    //             "#": "411",
    //             "Date": "04 Jul 2025",
    //             "Description": "ATL/0024/622018/SBI HATIBAGAN ONSITE A040725/20:11",
    //             "Chq/Ref. No.": "518520030004",
    //             "Withdrawal (Dr.)": "10,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,07,943.89",
    //             "tempId": "16b9509d-2861-47a6-af34-53147341dd97"
    //         },
    //         {
    //             "#": "412",
    //             "Date": "05 Jul 2025",
    //             "Description": "UPI/LIFE INSURANCE /100912558072/PAYMENT",
    //             "Chq/Ref. No.": "UPI-518659722101",
    //             "Withdrawal (Dr.)": "6,454.02",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,01,489.87",
    //             "tempId": "66aaa47a-08cf-4f8a-986b-3152cd5453a8"
    //         },
    //         {
    //             "#": "413",
    //             "Date": "06 Jul 2025",
    //             "Description": "UPI/ANIL SHARMA/555336644035/UPI",
    //             "Chq/Ref. No.": "UPI-518712279285",
    //             "Withdrawal (Dr.)": "650.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,00,839.87",
    //             "tempId": "a6c1c976-0b85-4087-a131-e002bbec294d"
    //         },
    //         {
    //             "#": "414",
    //             "Date": "07 Jul 2025",
    //             "Description": "UPI/Indian Clearing/518813122075/Indian Clearing",
    //             "Chq/Ref. No.": "UPI-518852913948",
    //             "Withdrawal (Dr.)": "4,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,96,839.87",
    //             "tempId": "ba526403-8f7e-46ac-b8b4-e0f4086b1d07"
    //         },
    //         {
    //             "#": "415",
    //             "Date": "07 Jul 2025",
    //             "Description": "UPI/Indian Clearing/518813125964/Indian Clearing",
    //             "Chq/Ref. No.": "UPI-518852923717",
    //             "Withdrawal (Dr.)": "4,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,92,839.87",
    //             "tempId": "db5e5951-3d6e-4acc-8f3a-e3f57ecb34d9"
    //         },
    //         {
    //             "#": "416",
    //             "Date": "07 Jul 2025",
    //             "Description": "UPI/Indian Clearing/518813126027/Indian Clearing",
    //             "Chq/Ref. No.": "UPI-518852923855",
    //             "Withdrawal (Dr.)": "2,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,90,839.87",
    //             "tempId": "18f5820f-daa4-4e2c-a9e8-c2c9de3df5cc"
    //         },
    //         {
    //             "#": "417",
    //             "Date": "07 Jul 2025",
    //             "Description": "UPI/PharmEasy/518816113175/UPI",
    //             "Chq/Ref. No.": "UPI-518860310033",
    //             "Withdrawal (Dr.)": "1,821.75",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,89,018.12",
    //             "tempId": "48c0294e-732b-4ec1-a184-d4f29df71edd"
    //         },
    //         {
    //             "#": "418",
    //             "Date": "07 Jul 2025",
    //             "Description": "UPI/Apollo Pharmaci/518858511412/Payment to Apol",
    //             "Chq/Ref. No.": "UPI-518860495816",
    //             "Withdrawal (Dr.)": "799.60",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,88,218.52",
    //             "tempId": "eced2def-1706-4d28-9fc5-86cb2914695b"
    //         },
    //         {
    //             "#": "419",
    //             "Date": "07 Jul 2025",
    //             "Description": "UPI/RUNU SENAPATI/107673594608/UPI",
    //             "Chq/Ref. No.": "UPI-518861511210",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "2,610.00",
    //             "Balance": "5,90,828.52",
    //             "tempId": "d75b0b58-5ecb-453e-8a37-8124b7eb7390"
    //         },
    //         {
    //             "#": "420",
    //             "Date": "08 Jul 2025",
    //             "Description": "UPI/VODAFONEIDEA LI/518952580954/UPI",
    //             "Chq/Ref. No.": "UPI-518918036121",
    //             "Withdrawal (Dr.)": "139.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,90,689.52",
    //             "tempId": "50938e04-4030-4e85-acde-6596d73758b3"
    //         },
    //         {
    //             "#": "421",
    //             "Date": "09 Jul 2025",
    //             "Description": "UPI/bigbasket/519097940183/UPIIntent",
    //             "Chq/Ref. No.": "UPI-519048577646",
    //             "Withdrawal (Dr.)": "405.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,90,284.52",
    //             "tempId": "47d8d244-8f66-43cc-ae1f-728edc875f8c"
    //         },
    //         {
    //             "#": "422",
    //             "Date": "10 Jul 2025",
    //             "Description": "UPI/Compass India F/519124985760/UPI",
    //             "Chq/Ref. No.": "UPI-519174592185",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,90,242.52",
    //             "tempId": "fe3217ad-11c3-413b-894a-183165dd4ddb"
    //         },
    //         {
    //             "#": "423",
    //             "Date": "11 Jul 2025",
    //             "Description": "UPI/Jio Prepaid Rec/555898359000/UPI",
    //             "Chq/Ref. No.": "UPI-519227147274",
    //             "Withdrawal (Dr.)": "3,182.46",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,87,060.06",
    //             "tempId": "50dc970d-14da-4167-bbe4-75cc9450730f"
    //         },
    //         {
    //             "#": "424",
    //             "Date": "11 Jul 2025",
    //             "Description": "UPI/Amazon India/519262914054/You are paying",
    //             "Chq/Ref. No.": "UPI-519273202581",
    //             "Withdrawal (Dr.)": "414.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,86,646.06",
    //             "tempId": "b27716b0-2b4d-4cc7-a6fc-077045d7473d"
    //         },
    //         {
    //             "#": "425",
    //             "Date": "12 Jul 2025",
    //             "Description": "UPI/AMAR MISTANNA/555945424074/UPI",
    //             "Chq/Ref. No.": "UPI-519328104950",
    //             "Withdrawal (Dr.)": "239.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,86,407.06",
    //             "tempId": "b7ec554d-f9c7-43fe-9516-c214b3523319"
    //         },
    //         {
    //             "#": "426",
    //             "Date": "12 Jul 2025",
    //             "Description": "UPI/URMILA SWEETS/555916815058/UPI",
    //             "Chq/Ref. No.": "UPI-519328286928",
    //             "Withdrawal (Dr.)": "100.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,86,307.06",
    //             "tempId": "4378992b-2140-4f64-a0d5-aed465f57a7f"
    //         },
    //         {
    //             "#": "427",
    //             "Date": "13 Jul 2025",
    //             "Description": "ATL/0024/622018/SBI HATIBAGAN ONSITE A130725/10:57",
    //             "Chq/Ref. No.": "519410013353",
    //             "Withdrawal (Dr.)": "6,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,80,307.06",
    //             "tempId": "ef4c9f2f-63d5-4efd-a354-66238f83ea76"
    //         },
    //         {
    //             "#": "428",
    //             "Date": "14 Jul 2025",
    //             "Description": "UPI/Slent vv00003/519539455131/UPI",
    //             "Chq/Ref. No.": "UPI-519552287349",
    //             "Withdrawal (Dr.)": "50.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,80,257.06",
    //             "tempId": "2b0e0b06-e552-4042-af1c-76ace67a5e77"
    //         },
    //         {
    //             "#": "429",
    //             "Date": "17 Jul 2025",
    //             "Description": "UPI/SUPRATIM  AUDDY/556407537446/UPI",
    //             "Chq/Ref. No.": "UPI-519855721303",
    //             "Withdrawal (Dr.)": "326.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,79,931.06",
    //             "tempId": "072a4943-031c-40c4-9283-4bb72617c4a9"
    //         },
    //         {
    //             "#": "430",
    //             "Date": "19 Jul 2025",
    //             "Description": "UPI/Ms TITAS SENAPA/490740760628/Payment from Ph",
    //             "Chq/Ref. No.": "UPI-520020026265",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "3,595.00",
    //             "Balance": "5,83,526.06",
    //             "tempId": "e6045e53-09bf-4f34-a8ac-daa3a48c3b88"
    //         },
    //         {
    //             "#": "431",
    //             "Date": "21 Jul 2025",
    //             "Description": "UPI/SENCO GOLD LIMI/520206420634/UPI",
    //             "Chq/Ref. No.": "UPI-520254266596",
    //             "Withdrawal (Dr.)": "3,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,80,526.06",
    //             "tempId": "eb7fca51-d290-41ec-8c51-fe3d17476eb1"
    //         },
    //         {
    //             "#": "432",
    //             "Date": "21 Jul 2025",
    //             "Description": "UPI/Amazon Pay Gift/520268284516/You are paying",
    //             "Chq/Ref. No.": "UPI-520292515835",
    //             "Withdrawal (Dr.)": "97.02",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,80,429.04",
    //             "tempId": "e20a412a-ecd8-4b81-a2c7-df238494eed2"
    //         },
    //         {
    //             "#": "433",
    //             "Date": "23 Jul 2025",
    //             "Description": "PCD/3224/GOOGLE PLAY SER CYBS S/I 224230725/10:15",
    //             "Chq/Ref. No.": "520304111025",
    //             "Withdrawal (Dr.)": "149.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,80,280.04",
    //             "tempId": "d0917789-ab5c-4c88-92d4-b78e64b181c9"
    //         },
    //         {
    //             "#": "434",
    //             "Date": "23 Jul 2025",
    //             "Description": "UPI/RUNU SENAPATI/108604283288/UPI",
    //             "Chq/Ref. No.": "UPI-520414677967",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "4,400.00",
    //             "Balance": "5,84,680.04",
    //             "tempId": "e9639478-bf2f-4cf9-85eb-a0c301aee94f"
    //         },
    //         {
    //             "#": "435",
    //             "Date": "24 Jul 2025",
    //             "Description": "UPI/Mr SUDIPTO  SAR/520548881959/UPI",
    //             "Chq/Ref. No.": "UPI-520538124838",
    //             "Withdrawal (Dr.)": "67.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,84,613.04",
    //             "tempId": "6fd70658-23c0-4e83-a416-6a23646049db"
    //         },
    //         {
    //             "#": "436",
    //             "Date": "24 Jul 2025",
    //             "Description": "UPI/Compass India F/520538186900/UPI",
    //             "Chq/Ref. No.": "UPI-520547552320",
    //             "Withdrawal (Dr.)": "51.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,84,562.04",
    //             "tempId": "9f5cc318-e658-46aa-a81b-0defbe27b5b1"
    //         },
    //         {
    //             "#": "437",
    //             "Date": "24 Jul 2025",
    //             "Description": "UPI/DIPANKAR  DAS/557168514402/UPI",
    //             "Chq/Ref. No.": "UPI-520565079458",
    //             "Withdrawal (Dr.)": "70.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,84,492.04",
    //             "tempId": "5e7545c1-ba14-4672-9020-db7098318e71"
    //         },
    //         {
    //             "#": "438",
    //             "Date": "25 Jul 2025",
    //             "Description": "UPI/Zomato private /557271194253/UPIIntent",
    //             "Chq/Ref. No.": "UPI-520610754923",
    //             "Withdrawal (Dr.)": "254.80",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,84,237.24",
    //             "tempId": "d3e20173-f2ad-4b82-9354-5bfbf71e1c14"
    //         },
    //         {
    //             "#": "439",
    //             "Date": "25 Jul 2025",
    //             "Description": "UPI/PAUL FOOD AND B/520669801017/UPI",
    //             "Chq/Ref. No.": "UPI-520624952574",
    //             "Withdrawal (Dr.)": "84.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,84,153.24",
    //             "tempId": "e7fc98a9-e7a7-43d6-b928-af076b0d11fb"
    //         },
    //         {
    //             "#": "Statement Generated on 17 Mar 2026, 18:41",
    //             "Date": "27 Jul 2025",
    //             "Description": "UPI/Google",
    //             "Chq/Ref. No.": "UPI-520893607879",
    //             "Withdrawal (Dr.)": "529.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,83,624.24 Page 11 of  22",
    //             "tempId": "c028252f-18cb-43b8-a5c8-edf37507a622"
    //         },
    //         {
    //             "#": "440",
    //             "Date": "",
    //             "Description": "Play/938874772085/MandateExecute",
    //             "Chq/Ref. No.": "",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "",
    //             "Balance": "",
    //             "tempId": "b9f79a29-29a3-4234-92db-fa061bc00170"
    //         },
    //         {
    //             "#": "441",
    //             "Date": "28 Jul 2025",
    //             "Description": "UPI/atanupalit89-1@/557554073597/UPI",
    //             "Chq/Ref. No.": "UPI-520950058059",
    //             "Withdrawal (Dr.)": "90.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,83,534.24",
    //             "tempId": "e023ed75-abca-44c2-bb69-f664e28dd910"
    //         },
    //         {
    //             "#": "442",
    //             "Date": "28 Jul 2025",
    //             "Description": "UPI/Compass India F/557597082181/UPI",
    //             "Chq/Ref. No.": "UPI-520957495353",
    //             "Withdrawal (Dr.)": "21.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,83,513.24",
    //             "tempId": "9e8428d2-5eb9-410d-9122-0e383a9a4be6"
    //         },
    //         {
    //             "#": "443",
    //             "Date": "28 Jul 2025",
    //             "Description": "UPI/Google Play/206886372095/MandateExecute",
    //             "Chq/Ref. No.": "UPI-520969058994",
    //             "Withdrawal (Dr.)": "99.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,83,414.24",
    //             "tempId": "08113717-b20e-4091-811c-d005b90fa1ea"
    //         },
    //         {
    //             "#": "444",
    //             "Date": "31 Jul 2025",
    //             "Description": "UPI/Mr ASHFAQUE ANS/521261713066/UPI",
    //             "Chq/Ref. No.": "UPI-521207173072",
    //             "Withdrawal (Dr.)": "230.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,83,184.24",
    //             "tempId": "30426b73-dae7-4a4d-b908-1043903a6c9f"
    //         },
    //         {
    //             "#": "445",
    //             "Date": "31 Jul 2025",
    //             "Description": "UPI/Compass India F/521291510741/UPI",
    //             "Chq/Ref. No.": "UPI-521210693381",
    //             "Withdrawal (Dr.)": "21.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,83,163.24",
    //             "tempId": "ef96bd19-acdb-4e9f-8424-d986014e6d22"
    //         },
    //         {
    //             "#": "446",
    //             "Date": "31 Jul 2025",
    //             "Description": "UPI/TINKU KUMAR MIS/521294139435/UPI",
    //             "Chq/Ref. No.": "UPI-521221583253",
    //             "Withdrawal (Dr.)": "10.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,83,153.24",
    //             "tempId": "44dd1856-ef4c-4350-bb93-7f17e44e26d3"
    //         },
    //         {
    //             "#": "447",
    //             "Date": "01 Aug 2025",
    //             "Description": "UPI/VODAFONEIDEA LI/521356578087/UPI",
    //             "Chq/Ref. No.": "UPI-521351204189",
    //             "Withdrawal (Dr.)": "489.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,82,664.24",
    //             "tempId": "9343a33c-5755-4f33-9ce6-32fe4c991875"
    //         },
    //         {
    //             "#": "448",
    //             "Date": "01 Aug 2025",
    //             "Description": "UPI/LICPGINEW/289226139435/Oid15250969F Y20",
    //             "Chq/Ref. No.": "UPI-521399598050",
    //             "Withdrawal (Dr.)": "2,323.12",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,80,341.12",
    //             "tempId": "5ebf90b1-8be9-4c39-a315-bfd04304f61c"
    //         },
    //         {
    //             "#": "449",
    //             "Date": "03 Aug 2025",
    //             "Description": "UPI/PharmEasy/521509188887/UPI",
    //             "Chq/Ref. No.": "UPI-521581285028",
    //             "Withdrawal (Dr.)": "2,941.28",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,77,399.84",
    //             "tempId": "bbdca5d0-d266-4477-9d4b-7c61e134f494"
    //         },
    //         {
    //             "#": "450",
    //             "Date": "03 Aug 2025",
    //             "Description": "UPI/RUNU SENAPATI/109153411232/UPI",
    //             "Chq/Ref. No.": "UPI-521581330137",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "2,941.00",
    //             "Balance": "5,80,340.84",
    //             "tempId": "c93850f9-1dc0-4d26-8f69-b85249ece687"
    //         },
    //         {
    //             "#": "451",
    //             "Date": "03 Aug 2025",
    //             "Description": "UPI/Blinkit/558197530009/UPIIntent",
    //             "Chq/Ref. No.": "UPI-521598518274",
    //             "Withdrawal (Dr.)": "338.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,80,002.84",
    //             "tempId": "07a6c9fa-8065-4345-8aab-3b9319d214e1"
    //         },
    //         {
    //             "#": "452",
    //             "Date": "03 Aug 2025",
    //             "Description": "UPI/Krishna Traveli/558193530972/UPI",
    //             "Chq/Ref. No.": "UPI-521502719143",
    //             "Withdrawal (Dr.)": "369.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,79,633.84",
    //             "tempId": "4157a074-7d95-4d3c-ba7e-456601f57574"
    //         },
    //         {
    //             "#": "453",
    //             "Date": "03 Aug 2025",
    //             "Description": "UPI/J S ENTERPRISES/558118428574/UPI",
    //             "Chq/Ref. No.": "UPI-521502983198",
    //             "Withdrawal (Dr.)": "28.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,79,605.84",
    //             "tempId": "7b5d89da-533d-40d4-a09e-ca6f554ace4e"
    //         },
    //         {
    //             "#": "454",
    //             "Date": "03 Aug 2025",
    //             "Description": "UPI/K796 KFC INFINI/558187250664/Generating DYNA",
    //             "Chq/Ref. No.": "UPI-521515154607",
    //             "Withdrawal (Dr.)": "438.45",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,79,167.39",
    //             "tempId": "79c94df3-a3e5-4f99-ba24-f556c018e293"
    //         },
    //         {
    //             "#": "455",
    //             "Date": "03 Aug 2025",
    //             "Description": "UPI/ZOMATO/558134259746/UPI",
    //             "Chq/Ref. No.": "UPI-521517358079",
    //             "Withdrawal (Dr.)": "558.30",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,78,609.09",
    //             "tempId": "50cd0ee5-6e1f-4528-b64a-9ea1727d0cbe"
    //         },
    //         {
    //             "#": "456",
    //             "Date": "04 Aug 2025",
    //             "Description": "UPI/Arpita  Sarkar/521620180555/UPI",
    //             "Chq/Ref. No.": "UPI-521652527279",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "250.00",
    //             "Balance": "5,78,859.09",
    //             "tempId": "f1995a77-1c04-4aa2-b119-509d1cc15e33"
    //         },
    //         {
    //             "#": "457",
    //             "Date": "04 Aug 2025",
    //             "Description": "UPI/Vishal Kumar/521645528874/UPI",
    //             "Chq/Ref. No.": "UPI-521674651927",
    //             "Withdrawal (Dr.)": "12.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,78,847.09",
    //             "tempId": "7c4ec36d-0a89-43ef-acc7-fda426628ec9"
    //         },
    //         {
    //             "#": "458",
    //             "Date": "05 Aug 2025",
    //             "Description": "NACH-10-DR-CTRAZORPAY- CAPITALFLOR1LPZUJZ7WXBM0",
    //             "Chq/Ref. No.": "NACHDB050825062526 00",
    //             "Withdrawal (Dr.)": "2,304.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,76,543.09",
    //             "tempId": "e623f8e3-87b1-454d-8f65-76c2c83cfdc0"
    //         },
    //         {
    //             "#": "459",
    //             "Date": "05 Aug 2025",
    //             "Description": "UPI/SUMIT KUMAR SHA/521728571662/UPI",
    //             "Chq/Ref. No.": "UPI-521701595173",
    //             "Withdrawal (Dr.)": "82.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,76,461.09",
    //             "tempId": "551d49fe-f039-457e-9ee7-b0ee3e031ddb"
    //         },
    //         {
    //             "#": "460",
    //             "Date": "05 Aug 2025",
    //             "Description": "UPI/Compass India F/521770096744/UPI",
    //             "Chq/Ref. No.": "UPI-521707891916",
    //             "Withdrawal (Dr.)": "21.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,76,440.09",
    //             "tempId": "7c57629d-dc77-4d14-9a7c-7d87dda8aac1"
    //         },
    //         {
    //             "#": "461",
    //             "Date": "05 Aug 2025",
    //             "Description": "UPI/mintu.sardar4-1/558335429488/UPI",
    //             "Chq/Ref. No.": "UPI-521741365622",
    //             "Withdrawal (Dr.)": "73.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,76,367.09",
    //             "tempId": "fe173b79-e80f-41f1-99c0-b2be792f80bf"
    //         },
    //         {
    //             "#": "462",
    //             "Date": "06 Aug 2025",
    //             "Description": "UPI/Google India Di/558480448946/UPI",
    //             "Chq/Ref. No.": "UPI-521858775821",
    //             "Withdrawal (Dr.)": "850.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,75,517.09",
    //             "tempId": "fd229a0c-ee38-4057-98ae-fa78c14f0258"
    //         },
    //         {
    //             "#": "463",
    //             "Date": "06 Aug 2025",
    //             "Description": "UPI/BIGTREE ENTERTA/521807630317/UPI",
    //             "Chq/Ref. No.": "UPI-521808627390",
    //             "Withdrawal (Dr.)": "600.80",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,74,916.29",
    //             "tempId": "758f1e45-8c4f-4c30-9957-df84bd26811b"
    //         },
    //         {
    //             "#": "464",
    //             "Date": "07 Aug 2025",
    //             "Description": "UPI/Indian Clearing/521985636235/Indian Clearing",
    //             "Chq/Ref. No.": "UPI-521920978411",
    //             "Withdrawal (Dr.)": "4,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,70,916.29",
    //             "tempId": "4f4ecb27-3b88-4cdc-a425-c1f7a3521d0c"
    //         },
    //         {
    //             "#": "465",
    //             "Date": "07 Aug 2025",
    //             "Description": "UPI/Indian Clearing/521985639420/Indian Clearing",
    //             "Chq/Ref. No.": "UPI-521920985440",
    //             "Withdrawal (Dr.)": "4,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,66,916.29",
    //             "tempId": "9b060e2d-3dcb-4722-921f-996a9f14fb03"
    //         },
    //         {
    //             "#": "466",
    //             "Date": "07 Aug 2025",
    //             "Description": "UPI/Indian Clearing/521985639510/Indian Clearing",
    //             "Chq/Ref. No.": "UPI-521920987866",
    //             "Withdrawal (Dr.)": "2,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,64,916.29",
    //             "tempId": "787ba734-2b7e-4109-b099-d3226b160066"
    //         },
    //         {
    //             "#": "467",
    //             "Date": "07 Aug 2025",
    //             "Description": "UPI/PETER  MONDAL/521945253983/UPI",
    //             "Chq/Ref. No.": "UPI-521933226131",
    //             "Withdrawal (Dr.)": "80.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,64,836.29",
    //             "tempId": "81d736f2-b5db-4c15-a7ff-9126df7d8a62"
    //         },
    //         {
    //             "#": "468",
    //             "Date": "07 Aug 2025",
    //             "Description": "UPI/Compass India F/521962073292/UPI",
    //             "Chq/Ref. No.": "UPI-521939638281",
    //             "Withdrawal (Dr.)": "21.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,64,815.29",
    //             "tempId": "fb0dff6c-c045-4b8c-92ad-b1a4c8643e17"
    //         },
    //         {
    //             "#": "469",
    //             "Date": "07 Aug 2025",
    //             "Description": "UPI/Slent vv00004/521913689754/UPI",
    //             "Chq/Ref. No.": "UPI-521957123664",
    //             "Withdrawal (Dr.)": "80.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,64,735.29",
    //             "tempId": "aa08b659-75b4-4e8e-b44d-44848bd030fc"
    //         },
    //         {
    //             "#": "470",
    //             "Date": "08 Aug 2025",
    //             "Description": "UPI/KULSUM KHATUN/522032506396/UPI",
    //             "Chq/Ref. No.": "UPI-522029994906",
    //             "Withdrawal (Dr.)": "140.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,64,595.29",
    //             "tempId": "d4c5d6e0-88b9-4087-9b01-f5404f278db4"
    //         },
    //         {
    //             "#": "471",
    //             "Date": "08 Aug 2025",
    //             "Description": "UPI/PVR INOX Limite/522013312114/UPI",
    //             "Chq/Ref. No.": "UPI-522039055945",
    //             "Withdrawal (Dr.)": "640.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,63,955.29",
    //             "tempId": "e2a426cf-3343-43f3-afde-91fdd4ee5efc"
    //         },
    //         {
    //             "#": "472",
    //             "Date": "08 Aug 2025",
    //             "Description": "UPI/SANJOY KUMAR SH/522007844121/UPI",
    //             "Chq/Ref. No.": "UPI-522053639464",
    //             "Withdrawal (Dr.)": "350.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,63,605.29",
    //             "tempId": "fef95c9f-032f-4904-82c8-5015e498337e"
    //         },
    //         {
    //             "#": "473",
    //             "Date": "09 Aug 2025",
    //             "Description": "UPI/RUNU SENAPATI/109501260274/UPI",
    //             "Chq/Ref. No.": "UPI-522173176027",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "850.00",
    //             "Balance": "5,64,455.29",
    //             "tempId": "50792dbb-efce-4eb5-9ee0-21b9d1e1e0d1"
    //         },
    //         {
    //             "#": "474",
    //             "Date": "09 Aug 2025",
    //             "Description": "UPI/VIHANA COLLECTI/522186191985/UPI",
    //             "Chq/Ref. No.": "UPI-522198862623",
    //             "Withdrawal (Dr.)": "56.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,64,399.29",
    //             "tempId": "eee83565-a7a4-4aa4-961f-a804af02274d"
    //         },
    //         {
    //             "#": "475",
    //             "Date": "11 Aug 2025",
    //             "Description": "UPI/DAYAL  INTERIOR/522328637560/UPI",
    //             "Chq/Ref. No.": "UPI-522309526425",
    //             "Withdrawal (Dr.)": "90.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,64,309.29",
    //             "tempId": "fb805f05-fb3e-431b-bb39-c8e3e55318f1"
    //         },
    //         {
    //             "#": "476",
    //             "Date": "11 Aug 2025",
    //             "Description": "UPI/Compass India F/522382858970/UPI",
    //             "Chq/Ref. No.": "UPI-522319436525",
    //             "Withdrawal (Dr.)": "21.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,64,288.29",
    //             "tempId": "67821251-f6d4-4b04-96f5-f3c16895b087"
    //         },
    //         {
    //             "#": "477",
    //             "Date": "12 Aug 2025",
    //             "Description": "UPI/IRON ARMOUR FIT/559023990139/UPI",
    //             "Chq/Ref. No.": "UPI-522416499171",
    //             "Withdrawal (Dr.)": "10,500.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,53,788.29",
    //             "tempId": "74fd2862-acb0-4e47-bee9-0434c591707e"
    //         },
    //         {
    //             "#": "478",
    //             "Date": "12 Aug 2025",
    //             "Description": "UPI/SENAPATI D/522479300402/UPI",
    //             "Chq/Ref. No.": "UPI-522425833945",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "60,000.00",
    //             "Balance": "6,13,788.29",
    //             "tempId": "c8b46939-cdc3-465c-ac0c-88c116627fb1"
    //         },
    //         {
    //             "#": "479",
    //             "Date": "13 Aug 2025",
    //             "Description": "UPI/D K GHOSH   CO/522599722646/UPI",
    //             "Chq/Ref. No.": "UPI-522539726028",
    //             "Withdrawal (Dr.)": "18.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,13,770.29",
    //             "tempId": "6f9c70db-1906-4bbd-bed6-7c56506cb543"
    //         },
    //         {
    //             "#": "480",
    //             "Date": "14 Aug 2025",
    //             "Description": "UPI/SHIVENDRA KUMAR/559240906575/UPI",
    //             "Chq/Ref. No.": "UPI-522607390448",
    //             "Withdrawal (Dr.)": "100.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,13,670.29",
    //             "tempId": "b408f07f-1c63-44a1-8530-8d24a4c3fe9a"
    //         },
    //         {
    //             "#": "481",
    //             "Date": "14 Aug 2025",
    //             "Description": "UPI/Compass India F/559232615860/UPI",
    //             "Chq/Ref. No.": "UPI-522617022158",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,13,628.29",
    //             "tempId": "eaa85e90-2969-4200-aab2-929d5908043a"
    //         },
    //         {
    //             "#": "482",
    //             "Date": "14 Aug 2025",
    //             "Description": "UPI/JITENDRA KUMAR /559219856688/UPI",
    //             "Chq/Ref. No.": "UPI-522647909405",
    //             "Withdrawal (Dr.)": "120.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,13,508.29",
    //             "tempId": "5e906c9d-73c8-40e3-a036-e23ff98dcbaa"
    //         },
    //         {
    //             "#": "483",
    //             "Date": "15 Aug 2025",
    //             "Description": "UPI/SUPRATIM  AUDDY/559305378618/UPI",
    //             "Chq/Ref. No.": "UPI-522771747953",
    //             "Withdrawal (Dr.)": "163.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,13,345.29",
    //             "tempId": "f45b6fff-d498-4e14-9838-7236b9ee1af1"
    //         },
    //         {
    //             "#": "Statement Generated on 17 Mar 2026, 18:41",
    //             "Date": "17 Aug 2025",
    //             "Description": "UPI/Ganesh Bhandar/559595671596/UPI",
    //             "Chq/Ref. No.": "UPI-522992370662",
    //             "Withdrawal (Dr.)": "25.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,13,320.29 Page 12 of  22",
    //             "tempId": "d4d736de-d6e0-4efd-b930-4870f7cd8331"
    //         },
    //         {
    //             "#": "484",
    //             "Date": "",
    //             "Description": "",
    //             "Chq/Ref. No.": "",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "",
    //             "Balance": "",
    //             "tempId": "71bbf1b0-7cda-4b0d-8791-e02af95b8195"
    //         },
    //         {
    //             "#": "485",
    //             "Date": "18 Aug 2025",
    //             "Description": "UPI/DEB KUMAR MONDA/523089165714/UPI",
    //             "Chq/Ref. No.": "UPI-523056873683",
    //             "Withdrawal (Dr.)": "110.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,13,210.29",
    //             "tempId": "6b029434-e6e0-4f26-8833-031e31b20f8b"
    //         },
    //         {
    //             "#": "486",
    //             "Date": "18 Aug 2025",
    //             "Description": "UPI/Compass India F/523026383274/UPI",
    //             "Chq/Ref. No.": "UPI-523064746468",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,13,168.29",
    //             "tempId": "746eadc5-59e2-4572-a5dc-a235fca5255e"
    //         },
    //         {
    //             "#": "487",
    //             "Date": "19 Aug 2025",
    //             "Description": "UPI/Cashify/523150810326/TBNB171882331",
    //             "Chq/Ref. No.": "UPI-523124381976",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "6,240.00",
    //             "Balance": "6,19,408.29",
    //             "tempId": "16e672e9-b7f4-48fd-b2f5-41454c0ee6ae"
    //         },
    //         {
    //             "#": "488",
    //             "Date": "19 Aug 2025",
    //             "Description": "UPI/Mr DEEPAK KUMAR/559780791785/UPI",
    //             "Chq/Ref. No.": "UPI-523153673362",
    //             "Withdrawal (Dr.)": "35.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,19,373.29",
    //             "tempId": "e0ab2ff7-9810-447a-8829-934371dc99bf"
    //         },
    //         {
    //             "#": "489",
    //             "Date": "20 Aug 2025",
    //             "Description": "UPI/PACENET MEGHBEL/523251505228/UPI",
    //             "Chq/Ref. No.": "UPI-523266403287",
    //             "Withdrawal (Dr.)": "590.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,18,783.29",
    //             "tempId": "6c263b26-bf0e-49ed-a5f5-7dec83381931"
    //         },
    //         {
    //             "#": "490",
    //             "Date": "20 Aug 2025",
    //             "Description": "UPI/SENAPATI D/523297921924/UPI",
    //             "Chq/Ref. No.": "UPI-523275780236",
    //             "Withdrawal (Dr.)": "10,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,08,783.29",
    //             "tempId": "990f9a92-6bc8-4653-8a74-4ae63ef2cac2"
    //         },
    //         {
    //             "#": "491",
    //             "Date": "20 Aug 2025",
    //             "Description": "UPI/Dominos Pizza/523244962244/UPI",
    //             "Chq/Ref. No.": "UPI-523211665321",
    //             "Withdrawal (Dr.)": "1,378.65",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,07,404.64",
    //             "tempId": "5dc95307-f7c2-4716-b882-85f0ead6ec73"
    //         },
    //         {
    //             "#": "492",
    //             "Date": "22 Aug 2025",
    //             "Description": "UPI/SENCO GOLD LIMI/523403854530/UPI",
    //             "Chq/Ref. No.": "UPI-523444107112",
    //             "Withdrawal (Dr.)": "3,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,04,404.64",
    //             "tempId": "0c0effeb-6f8f-4656-8fbe-5db5661c2a3b"
    //         },
    //         {
    //             "#": "493",
    //             "Date": "23 Aug 2025 5",
    //             "Description": "PCD/3224/GOOGLEPLAY/MUMBAI230825/10:1",
    //             "Chq/Ref. No.": "523504092031",
    //             "Withdrawal (Dr.)": "149.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,04,255.64",
    //             "tempId": "0930e925-46de-4128-bc90-de0176357d4f"
    //         },
    //         {
    //             "#": "494",
    //             "Date": "23 Aug 2025",
    //             "Description": "UPI/D K GHOSH   CO/523548199461/UPI",
    //             "Chq/Ref. No.": "UPI-523570011399",
    //             "Withdrawal (Dr.)": "18.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,04,237.64",
    //             "tempId": "5d328090-7b88-422c-8c64-d8eee4288ae5"
    //         },
    //         {
    //             "#": "495",
    //             "Date": "24 Aug 2025",
    //             "Description": "UPI/KLIKKTECHNOLOGI/523614652707/MAND ATE",
    //             "Chq/Ref. No.": "UPI-523647554897",
    //             "Withdrawal (Dr.)": "5.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,04,232.64",
    //             "tempId": "8169369b-05ef-4860-aab0-d602fc6a7743"
    //         },
    //         {
    //             "#": "496",
    //             "Date": "24 Aug 2025",
    //             "Description": "UPI/Razorpay/113756462365/KLIKKTERefund R9",
    //             "Chq/Ref. No.": "UPI-523647567410",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "5.00",
    //             "Balance": "6,04,237.64",
    //             "tempId": "4981505e-f78e-49dd-adff-4230bf7d62e3"
    //         },
    //         {
    //             "#": "497",
    //             "Date": "24 Aug 2025",
    //             "Description": "UPI/Mr  PINTU  SAW/523629158357/UPI",
    //             "Chq/Ref. No.": "UPI-523676567385",
    //             "Withdrawal (Dr.)": "50.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,04,187.64",
    //             "tempId": "3574e22c-c4c7-4311-9437-b7e154eb1f3e"
    //         },
    //         {
    //             "#": "498",
    //             "Date": "25 Aug 2025",
    //             "Description": "UPI/SWAPAN KUMAR SA/523756985315/UPI",
    //             "Chq/Ref. No.": "UPI-523700051969",
    //             "Withdrawal (Dr.)": "84.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,04,103.64",
    //             "tempId": "51ec973a-9b87-46bc-b397-9c9b83480080"
    //         },
    //         {
    //             "#": "499",
    //             "Date": "25 Aug 2025",
    //             "Description": "UPI/Compass India F/560305911623/UPI",
    //             "Chq/Ref. No.": "UPI-523707482439",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,04,061.64",
    //             "tempId": "dc7f125f-8d07-42e3-9ef8-4d207804cce7"
    //         },
    //         {
    //             "#": "500",
    //             "Date": "26 Aug 2025",
    //             "Description": "UPI/RUNU SENAPATI/560468792558/UPI",
    //             "Chq/Ref. No.": "UPI-523858905333",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "5,000.00",
    //             "Balance": "6,09,061.64",
    //             "tempId": "5e4962d4-03fc-43e7-b6b6-53010386d04b"
    //         },
    //         {
    //             "#": "501",
    //             "Date": "26 Aug 2025",
    //             "Description": "UPI/RAJENDRA SWAIN/560441396478/UPI",
    //             "Chq/Ref. No.": "UPI-523860773905",
    //             "Withdrawal (Dr.)": "15.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,09,046.64",
    //             "tempId": "8f8df506-b368-4181-bf94-27f569f13036"
    //         },
    //         {
    //             "#": "502",
    //             "Date": "27 Aug 2025",
    //             "Description": "UPI/Ganesh Bhandar/560578406979/UPI",
    //             "Chq/Ref. No.": "UPI-523926462514",
    //             "Withdrawal (Dr.)": "247.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,08,799.64",
    //             "tempId": "ddcbd546-8c50-46de-9538-51476de99369"
    //         },
    //         {
    //             "#": "503",
    //             "Date": "28 Aug 2025",
    //             "Description": "UPI/Jio Prepaid Rec/524042112789/UPI",
    //             "Chq/Ref. No.": "UPI-524098135689",
    //             "Withdrawal (Dr.)": "629.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,08,170.64",
    //             "tempId": "c573f56b-2f52-4d7c-b35c-469452703a9f"
    //         },
    //         {
    //             "#": "504",
    //             "Date": "28 Aug 2025",
    //             "Description": "UPI/SENAPATI D/524047934173/UPI",
    //             "Chq/Ref. No.": "UPI-524005941298",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "50,000.00",
    //             "Balance": "6,58,170.64",
    //             "tempId": "c3353b0e-f6b6-4dbc-ac66-81bac3b2b283"
    //         },
    //         {
    //             "#": "505",
    //             "Date": "28 Aug 2025",
    //             "Description": "UPI/Google Play/646250032405/MandateExecute",
    //             "Chq/Ref. No.": "UPI-524009746276",
    //             "Withdrawal (Dr.)": "99.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,58,071.64",
    //             "tempId": "ec0926ae-566e-454d-ad13-8a22d8ab4b27"
    //         },
    //         {
    //             "#": "506",
    //             "Date": "29 Aug 2025",
    //             "Description": "UPI/ZOMATO/560736250180/UPI",
    //             "Chq/Ref. No.": "UPI-524182418075",
    //             "Withdrawal (Dr.)": "605.01",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,57,466.63",
    //             "tempId": "7786beec-51cd-43ae-b8cd-55ace9ba9a44"
    //         },
    //         {
    //             "#": "507",
    //             "Date": "30 Aug 2025",
    //             "Description": "UPI/Ms TITAS SENAPA/284213191472/Payment from Ph",
    //             "Chq/Ref. No.": "UPI-524207461640",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "46.00",
    //             "Balance": "6,57,512.63",
    //             "tempId": "15f7804d-e828-4e08-8f33-21a7e35aeb2d"
    //         },
    //         {
    //             "#": "508",
    //             "Date": "30 Aug 2025",
    //             "Description": "UPI/Ms TITAS SENAPA/571896024328/Payment from Ph",
    //             "Chq/Ref. No.": "UPI-524258506989",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "46.00",
    //             "Balance": "6,57,558.63",
    //             "tempId": "498d4d3c-7241-4261-a6ec-69f3c2c524be"
    //         },
    //         {
    //             "#": "509",
    //             "Date": "30 Aug 2025",
    //             "Description": "UPI/Ms TITAS SENAPA/524204663489/UPI",
    //             "Chq/Ref. No.": "UPI-524259396780",
    //             "Withdrawal (Dr.)": "46.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,57,512.63",
    //             "tempId": "00f2e28f-cef5-4c09-a5e5-23c8c193d841"
    //         },
    //         {
    //             "#": "510",
    //             "Date": "31 Aug 2025",
    //             "Description": "UPI/Amazon Pay Groc/524366088950/You are paying",
    //             "Chq/Ref. No.": "UPI-524376810390",
    //             "Withdrawal (Dr.)": "395.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,57,117.63",
    //             "tempId": "073e7ac1-b90d-4f94-96cc-d69bc2f8e87f"
    //         },
    //         {
    //             "#": "511",
    //             "Date": "31 Aug 2025",
    //             "Description": "UPI/KLIKKTECHNOLOGI/524315995249/MAND ATE",
    //             "Chq/Ref. No.": "UPI-524392944243",
    //             "Withdrawal (Dr.)": "99.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,57,018.63",
    //             "tempId": "cb8d719e-bfd0-476c-8eb8-ef5b3abbb857"
    //         },
    //         {
    //             "#": "512",
    //             "Date": "31 Aug 2025",
    //             "Description": "UPI/Goutam Yadav/560910324593/UPI",
    //             "Chq/Ref. No.": "UPI-524396550336",
    //             "Withdrawal (Dr.)": "220.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,56,798.63",
    //             "tempId": "a1a9a4dd-7f9e-4b70-af86-a5b945c558a5"
    //         },
    //         {
    //             "#": "513",
    //             "Date": "31 Aug 2025",
    //             "Description": "UPI/PAUL FOOD AND B/560920556462/UPI",
    //             "Chq/Ref. No.": "UPI-524312413089",
    //             "Withdrawal (Dr.)": "168.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,56,630.63",
    //             "tempId": "2c133b44-ba6b-4d7b-aa55-8efbf49a5401"
    //         },
    //         {
    //             "#": "514",
    //             "Date": "31 Aug 2025",
    //             "Description": "UPI/Amazon India/560921661994/You are paying",
    //             "Chq/Ref. No.": "UPI-524318471435",
    //             "Withdrawal (Dr.)": "1,054.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,55,576.63",
    //             "tempId": "78d3e6ca-ccae-4aed-92e3-b872d8e05d52"
    //         },
    //         {
    //             "#": "515",
    //             "Date": "01 Sep 2025",
    //             "Description": "UPI/RIK  SINGHA/524447111842/TV",
    //             "Chq/Ref. No.": "UPI-524443421466",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "1,054.00",
    //             "Balance": "6,56,630.63",
    //             "tempId": "afe4ab77-7c90-46b3-bd7c-8d99360d4638"
    //         },
    //         {
    //             "#": "516",
    //             "Date": "01 Sep 2025",
    //             "Description": "UPI/LICPGINEW/524437005573/UPI",
    //             "Chq/Ref. No.": "UPI-524461005673",
    //             "Withdrawal (Dr.)": "1,161.56",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,55,469.07",
    //             "tempId": "e8996469-aa83-4000-8785-a2160fb64045"
    //         },
    //         {
    //             "#": "517",
    //             "Date": "01 Sep 2025",
    //             "Description": "UPI/LICPGINEW/524437005688/UPI",
    //             "Chq/Ref. No.": "UPI-524461100945",
    //             "Withdrawal (Dr.)": "1,161.56",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,54,307.51",
    //             "tempId": "3dc32eda-f041-4f09-8cf7-11237b66c2b5"
    //         },
    //         {
    //             "#": "518",
    //             "Date": "01 Sep 2025",
    //             "Description": "UPI/Arpita  Sarkar/524499020946/UPI",
    //             "Chq/Ref. No.": "UPI-524464961392",
    //             "Withdrawal (Dr.)": "1.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,54,306.51",
    //             "tempId": "2d34baec-86c7-4294-99fb-5eb41d7c786c"
    //         },
    //         {
    //             "#": "519",
    //             "Date": "01 Sep 2025",
    //             "Description": "UPI/RUNU SENAPATI/110648690099/UPI",
    //             "Chq/Ref. No.": "UPI-524491944830",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "600.00",
    //             "Balance": "6,54,906.51",
    //             "tempId": "c706b9ed-37ef-4558-b52d-cc3fda4ee79e"
    //         },
    //         {
    //             "#": "520",
    //             "Date": "02 Sep 2025",
    //             "Description": "UPI/SANTANU  GHOSAL/524501083267/UPI",
    //             "Chq/Ref. No.": "UPI-524511580436",
    //             "Withdrawal (Dr.)": "100.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,54,806.51",
    //             "tempId": "efb8d62d-1b8d-4dad-a3f7-dfc2055b3e5a"
    //         },
    //         {
    //             "#": "521",
    //             "Date": "02 Sep 2025",
    //             "Description": "UPI/Compass India F/561129800925/UPI",
    //             "Chq/Ref. No.": "UPI-524520535592",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,54,764.51",
    //             "tempId": "b4cf52d7-44b9-47e2-a81b-373b617820dd"
    //         },
    //         {
    //             "#": "522",
    //             "Date": "02 Sep 2025",
    //             "Description": "UPI/SOUGATA BISWAS/561122637864/UPI",
    //             "Chq/Ref. No.": "UPI-524553373398",
    //             "Withdrawal (Dr.)": "100.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,54,664.51",
    //             "tempId": "261cb22d-3a78-4d6f-88cf-ee08c036fa14"
    //         },
    //         {
    //             "#": "523",
    //             "Date": "04 Sep 2025",
    //             "Description": "UPI/MD WASIM ASGAR /524766170719/UPI",
    //             "Chq/Ref. No.": "UPI-524748667871",
    //             "Withdrawal (Dr.)": "100.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,54,564.51",
    //             "tempId": "d1a1740f-2c18-4b0c-9adf-5b87b4b9072f"
    //         },
    //         {
    //             "#": "524",
    //             "Date": "04 Sep 2025",
    //             "Description": "UPI/Compass India F/524713998641/UPI",
    //             "Chq/Ref. No.": "UPI-524760691756",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,54,522.51",
    //             "tempId": "0cff64f5-8f05-45d7-a698-a25381c2d065"
    //         },
    //         {
    //             "#": "525",
    //             "Date": "04 Sep 2025",
    //             "Description": "UPI/Google Play/674176552475/MandateExecute",
    //             "Chq/Ref. No.": "UPI-524768121442",
    //             "Withdrawal (Dr.)": "499.50",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,54,023.01",
    //             "tempId": "213c4a9c-bb6c-4a82-bf98-914fe14d07b3"
    //         },
    //         {
    //             "#": "526",
    //             "Date": "04 Sep 2025",
    //             "Description": "UPI/Compass India F/561318921877/UPI",
    //             "Chq/Ref. No.": "UPI-524776912665",
    //             "Withdrawal (Dr.)": "56.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,53,967.01",
    //             "tempId": "f7c113f9-e58d-4ba0-adb3-3281f53c1d03"
    //         },
    //         {
    //             "#": "Statement Generated on 17 Mar 2026, 18:41",
    //             "Date": "04 Sep 2025",
    //             "Description": "UPI/Google India Di/561354650029/UPI",
    //             "Chq/Ref. No.": "UPI-524793021863",
    //             "Withdrawal (Dr.)": "940.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,53,027.01 Page 13 of  22",
    //             "tempId": "afe8e916-72a4-4c38-9c69-6004427c8762"
    //         },
    //         {
    //             "#": "527",
    //             "Date": "",
    //             "Description": "",
    //             "Chq/Ref. No.": "",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "",
    //             "Balance": "",
    //             "tempId": "1f3404b8-6038-4462-9bca-b926fb48fb3a"
    //         },
    //         {
    //             "#": "528",
    //             "Date": "04 Sep 2025",
    //             "Description": "UPI/Google India Di/524799219491/remarks",
    //             "Chq/Ref. No.": "UPI-524793061174",
    //             "Withdrawal (Dr.)": "1.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,53,026.01",
    //             "tempId": "11a6e0fe-7464-4ce8-b829-3d3f9232ce96"
    //         },
    //         {
    //             "#": "529",
    //             "Date": "04 Sep 2025",
    //             "Description": "UPI/Google India Di/706565932475/UPI",
    //             "Chq/Ref. No.": "UPI-524793075234",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "1.00",
    //             "Balance": "6,53,027.01",
    //             "tempId": "35192b05-e71c-4c65-b321-2d3e31ba1fc7"
    //         },
    //         {
    //             "#": "530",
    //             "Date": "05 Sep 2025",
    //             "Description": "NACH-10-DR-CTRAZORPAY- CAPITALFLORDBNGLWJLKNIKP",
    //             "Chq/Ref. No.": "NACHDB050925063025 00",
    //             "Withdrawal (Dr.)": "604.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,52,423.01",
    //             "tempId": "790fe37c-e63d-4766-9d8d-4f1ab873104b"
    //         },
    //         {
    //             "#": "531",
    //             "Date": "06 Sep 2025",
    //             "Description": "UPI/PharmEasy/524971251596/UPI",
    //             "Chq/Ref. No.": "UPI-524969041873",
    //             "Withdrawal (Dr.)": "2,995.51",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,49,427.50",
    //             "tempId": "cc5d274e-6667-48f4-8807-10240784badf"
    //         },
    //         {
    //             "#": "532",
    //             "Date": "06 Sep 2025",
    //             "Description": "UPI/RUNU SENAPATI/524989151282/UPI",
    //             "Chq/Ref. No.": "UPI-524969070668",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "3,940.00",
    //             "Balance": "6,53,367.50",
    //             "tempId": "2fced2fd-6493-47e1-b8f8-39f484f97475"
    //         },
    //         {
    //             "#": "533",
    //             "Date": "06 Sep 2025",
    //             "Description": "REV-UPI/PharmEasy/524971251596/Refund",
    //             "Chq/Ref. No.": "UPI-524990143588",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "10.36",
    //             "Balance": "6,53,377.86",
    //             "tempId": "16a164a5-be64-4c00-9790-205cc98b5501"
    //         },
    //         {
    //             "#": "534",
    //             "Date": "07 Sep 2025",
    //             "Description": "UPI/BIGTREE ENTERTA/561626646328/UPI",
    //             "Chq/Ref. No.": "UPI-525033328182",
    //             "Withdrawal (Dr.)": "584.96",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,52,792.90",
    //             "tempId": "b109f61b-463e-4bae-a7d8-0523c3e2e49e"
    //         },
    //         {
    //             "#": "535",
    //             "Date": "07 Sep 2025",
    //             "Description": "UPI/Indian Clearing/525056752219/Indian Clearing",
    //             "Chq/Ref. No.": "UPI-525036477988",
    //             "Withdrawal (Dr.)": "4,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,48,792.90",
    //             "tempId": "bce494d9-65b7-490a-bba0-a6043e64e466"
    //         },
    //         {
    //             "#": "536",
    //             "Date": "07 Sep 2025",
    //             "Description": "UPI/Indian Clearing/525056755192/Indian Clearing",
    //             "Chq/Ref. No.": "UPI-525036484204",
    //             "Withdrawal (Dr.)": "2,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,46,792.90",
    //             "tempId": "03bb10e6-d821-4633-ab9b-2576201f78b5"
    //         },
    //         {
    //             "#": "537",
    //             "Date": "07 Sep 2025",
    //             "Description": "UPI/Indian Clearing/525056755279/Indian Clearing",
    //             "Chq/Ref. No.": "UPI-525036486377",
    //             "Withdrawal (Dr.)": "4,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,42,792.90",
    //             "tempId": "7e5de582-568f-41d7-a6fc-29a1724002e9"
    //         },
    //         {
    //             "#": "538",
    //             "Date": "07 Sep 2025",
    //             "Description": "UPI/SRI KRISHNA SWE/561663055955/UPI",
    //             "Chq/Ref. No.": "UPI-525046429612",
    //             "Withdrawal (Dr.)": "127.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,42,665.90",
    //             "tempId": "64711902-ca55-4f2e-8c55-35ca3226456b"
    //         },
    //         {
    //             "#": "539",
    //             "Date": "07 Sep 2025",
    //             "Description": "UPI/ZOMATO LIMITED/525099315879/Zomato Payment",
    //             "Chq/Ref. No.": "UPI-525088999663",
    //             "Withdrawal (Dr.)": "570.20",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,42,095.70",
    //             "tempId": "e8dab6ad-4910-416d-ab5e-c290e3796fdc"
    //         },
    //         {
    //             "#": "540",
    //             "Date": "08 Sep 2025",
    //             "Description": "UPI/JUGAL KUNDU/525168548040/UPI",
    //             "Chq/Ref. No.": "UPI-525114702448",
    //             "Withdrawal (Dr.)": "100.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,41,995.70",
    //             "tempId": "ac2dff9e-07b6-4d10-b827-ac366c62388a"
    //         },
    //         {
    //             "#": "541",
    //             "Date": "08 Sep 2025",
    //             "Description": "UPI/Compass India F/525194761742/UPI",
    //             "Chq/Ref. No.": "UPI-525126021323",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,41,953.70",
    //             "tempId": "fdd05ac3-8187-430b-ba32-19f787114ddf"
    //         },
    //         {
    //             "#": "542",
    //             "Date": "08 Sep 2025",
    //             "Description": "UPI/Slent vv00003/561771810244/UPI",
    //             "Chq/Ref. No.": "UPI-525144388515",
    //             "Withdrawal (Dr.)": "40.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,41,913.70",
    //             "tempId": "39441ffc-cdb9-4c3f-9f5c-9331c46d6e2e"
    //         },
    //         {
    //             "#": "543",
    //             "Date": "10 Sep 2025",
    //             "Description": "UPI/GOUR ROY/525387463114/UPI",
    //             "Chq/Ref. No.": "UPI-525350552623",
    //             "Withdrawal (Dr.)": "100.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,41,813.70",
    //             "tempId": "f6dbfccf-1d80-45a6-90df-ace53792f9d3"
    //         },
    //         {
    //             "#": "544",
    //             "Date": "11 Sep 2025",
    //             "Description": "UPI/VODAFONEIDEA LI/562006270079/UPIIntent",
    //             "Chq/Ref. No.": "UPI-525418793289",
    //             "Withdrawal (Dr.)": "175.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,41,638.70",
    //             "tempId": "ec4cc273-f555-491a-b932-71885a294acc"
    //         },
    //         {
    //             "#": "545",
    //             "Date": "11 Sep 2025",
    //             "Description": "UPI/AKASH  DAS/562081864444/UPI",
    //             "Chq/Ref. No.": "UPI-525423668205",
    //             "Withdrawal (Dr.)": "90.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,41,548.70",
    //             "tempId": "295b34c3-968c-4b13-b45b-67a9e2d56403"
    //         },
    //         {
    //             "#": "546",
    //             "Date": "11 Sep 2025",
    //             "Description": "UPI/Compass India F/562061693772/UPI",
    //             "Chq/Ref. No.": "UPI-525432936765",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,41,506.70",
    //             "tempId": "84526ef3-d004-4143-8782-c1b16f39f531"
    //         },
    //         {
    //             "#": "547",
    //             "Date": "11 Sep 2025",
    //             "Description": "UPI/Slent vv00003/525416501953/UPI",
    //             "Chq/Ref. No.": "UPI-525446537711",
    //             "Withdrawal (Dr.)": "40.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,41,466.70",
    //             "tempId": "82011120-61ea-4a40-b252-0fdd4a568f36"
    //         },
    //         {
    //             "#": "548",
    //             "Date": "11 Sep 2025",
    //             "Description": "UPI/ZOMATO/525499344998/UPI",
    //             "Chq/Ref. No.": "UPI-525469732429",
    //             "Withdrawal (Dr.)": "210.15",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,41,256.55",
    //             "tempId": "19f8f7c0-1d5f-4894-b4c0-695f1fa542bc"
    //         },
    //         {
    //             "#": "549",
    //             "Date": "12 Sep 2025",
    //             "Description": "UPI/Blinkit/525554374409/Blinkit Payment",
    //             "Chq/Ref. No.": "UPI-525500735751",
    //             "Withdrawal (Dr.)": "693.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,40,563.55",
    //             "tempId": "b709c13f-9828-4cbf-a083-166336908a3a"
    //         },
    //         {
    //             "#": "550",
    //             "Date": "14 Sep 2025",
    //             "Description": "UPI/PVR INOX Limite/525758156482/UPI",
    //             "Chq/Ref. No.": "UPI-525728693268",
    //             "Withdrawal (Dr.)": "580.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,39,983.55",
    //             "tempId": "1998f8f3-9b56-444a-ba5c-c7585d50abf8"
    //         },
    //         {
    //             "#": "551",
    //             "Date": "14 Sep 2025",
    //             "Description": "UPI/LIFE STYLE INTE/525790780233/Payment for 505",
    //             "Chq/Ref. No.": "UPI-525735380329",
    //             "Withdrawal (Dr.)": "1,259.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,38,724.55",
    //             "tempId": "81f69b50-70b8-4d7f-b9e4-c7aff1a31095"
    //         },
    //         {
    //             "#": "552",
    //             "Date": "14 Sep 2025",
    //             "Description": "UPI/JEET  SAHA/525754989432/UPI",
    //             "Chq/Ref. No.": "UPI-525740620476",
    //             "Withdrawal (Dr.)": "597.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,38,127.55",
    //             "tempId": "09a65010-3bf9-4801-9fbb-5bd9fe4257cb"
    //         },
    //         {
    //             "#": "553",
    //             "Date": "18 Sep 2025",
    //             "Description": "UPI/Sayan Eerprise/526116334328/UPI",
    //             "Chq/Ref. No.": "UPI-526191091867",
    //             "Withdrawal (Dr.)": "100.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,38,027.55",
    //             "tempId": "b66bb8db-b38e-49b1-b592-60e69f7734ac"
    //         },
    //         {
    //             "#": "554",
    //             "Date": "18 Sep 2025",
    //             "Description": "UPI/Compass India F/526184741586/UPI",
    //             "Chq/Ref. No.": "UPI-526100575596",
    //             "Withdrawal (Dr.)": "21.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,38,006.55",
    //             "tempId": "30eeb3dc-9485-4b6e-ae66-df7de8743dfc"
    //         },
    //         {
    //             "#": "555",
    //             "Date": "20 Sep 2025",
    //             "Description": "UPI/ANIL SHARMA/562967487965/UPI",
    //             "Chq/Ref. No.": "UPI-526328188402",
    //             "Withdrawal (Dr.)": "700.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,37,306.55",
    //             "tempId": "620d06c3-487c-4c79-a3e3-f99d2043250e"
    //         },
    //         {
    //             "#": "556",
    //             "Date": "21 Sep 2025",
    //             "Description": "UPI/dassayanta3-3@o/526408959317/UPI",
    //             "Chq/Ref. No.": "UPI-526492048714",
    //             "Withdrawal (Dr.)": "120.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,37,186.55",
    //             "tempId": "c263d71b-e91b-46a5-9d54-59cfb228c44d"
    //         },
    //         {
    //             "#": "557",
    //             "Date": "21 Sep 2025",
    //             "Description": "UPI/SENCO GOLD LIMI/526472272055/UPI",
    //             "Chq/Ref. No.": "UPI-526406617228",
    //             "Withdrawal (Dr.)": "3,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,34,186.55",
    //             "tempId": "8bc61912-e4b7-4388-8ad6-e612bb1a5744"
    //         },
    //         {
    //             "#": "558",
    //             "Date": "22 Sep 2025",
    //             "Description": "UPI/Sayan Eerprise/563146036448/UPI",
    //             "Chq/Ref. No.": "UPI-526554148251",
    //             "Withdrawal (Dr.)": "100.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,34,086.55",
    //             "tempId": "e556d868-2e6a-46b8-9cf3-250442f08a2d"
    //         },
    //         {
    //             "#": "559",
    //             "Date": "22 Sep 2025",
    //             "Description": "UPI/Compass India F/563163264713/UPI",
    //             "Chq/Ref. No.": "UPI-526570876118",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,34,044.55",
    //             "tempId": "9c8e6b9f-5c95-40f0-808c-48fc95a396d8"
    //         },
    //         {
    //             "#": "560",
    //             "Date": "23 Sep 2025 4",
    //             "Description": "PCD/3224/GOOGLEPLAY/MUMBAI230925/10:1",
    //             "Chq/Ref. No.": "526604126495",
    //             "Withdrawal (Dr.)": "149.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,33,895.55",
    //             "tempId": "704b55ea-77ea-4fe8-a1e4-6157d9ce6d1c"
    //         },
    //         {
    //             "#": "561",
    //             "Date": "23 Sep 2025",
    //             "Description": "UPI/SOUMITRA GHOSH/526691334157/UPI",
    //             "Chq/Ref. No.": "UPI-526614330570",
    //             "Withdrawal (Dr.)": "112.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,33,783.55",
    //             "tempId": "2fe560c8-dac7-40e4-883c-c9a0954c2a2c"
    //         },
    //         {
    //             "#": "562",
    //             "Date": "23 Sep 2025",
    //             "Description": "UPI/GIRISH CHANDRA /526690472361/UPI",
    //             "Chq/Ref. No.": "UPI-526657026995",
    //             "Withdrawal (Dr.)": "220.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,33,563.55",
    //             "tempId": "f1f05177-6b21-4cfe-bdd1-9c8e4c9a8830"
    //         },
    //         {
    //             "#": "563",
    //             "Date": "24 Sep 2025",
    //             "Description": "UPI/AXIS BANK LIMIT/563304929975/UPI",
    //             "Chq/Ref. No.": "UPI-526700769841",
    //             "Withdrawal (Dr.)": "590.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,32,973.55",
    //             "tempId": "2c6c0993-9a07-4d29-9a6a-5b86eca8b854"
    //         },
    //         {
    //             "#": "564",
    //             "Date": "24 Sep 2025",
    //             "Description": "UPI/SINGHA  SONS/111716920295/UPI",
    //             "Chq/Ref. No.": "UPI-526726065186",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "6,438.00",
    //             "Balance": "6,39,411.55",
    //             "tempId": "ad2ade6c-6a4b-4ac1-bc99-b2039b61cfed"
    //         },
    //         {
    //             "#": "565",
    //             "Date": "25 Sep 2025",
    //             "Description": "UPI/SUROJIT BAR/563419983899/UPI",
    //             "Chq/Ref. No.": "UPI-526848212586",
    //             "Withdrawal (Dr.)": "110.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,39,301.55",
    //             "tempId": "6ea49ec6-5950-4f86-a324-2bc42396af2e"
    //         },
    //         {
    //             "#": "566",
    //             "Date": "25 Sep 2025",
    //             "Description": "UPI/Compass India F/526854700539/UPI",
    //             "Chq/Ref. No.": "UPI-526860603453",
    //             "Withdrawal (Dr.)": "107.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,39,194.55",
    //             "tempId": "b880fd7d-141b-4be5-a302-07769b072952"
    //         },
    //         {
    //             "#": "567",
    //             "Date": "25 Sep 2025",
    //             "Description": "UPI/TINKU KUMAR MIS/526831414962/UPI",
    //             "Chq/Ref. No.": "UPI-526880030240",
    //             "Withdrawal (Dr.)": "25.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,39,169.55",
    //             "tempId": "6095a029-daf9-4cf4-9104-0a59a28a8344"
    //         },
    //         {
    //             "#": "568",
    //             "Date": "25 Sep 2025",
    //             "Description": "UPI/souravdubeyji03/526860341748/UPI",
    //             "Chq/Ref. No.": "UPI-526890717931",
    //             "Withdrawal (Dr.)": "354.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,38,815.55",
    //             "tempId": "b26593e5-1842-4706-ba47-bd8f72b40ad8"
    //         },
    //         {
    //             "#": "569",
    //             "Date": "28 Sep 2025",
    //             "Description": "UPI/LICPGINEW/292417555653/Oid22756532F Y20",
    //             "Chq/Ref. No.": "UPI-527146948567",
    //             "Withdrawal (Dr.)": "888.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,37,927.55",
    //             "tempId": "78420349-3044-4f5b-96a2-9a16435ce9ad"
    //         },
    //         {
    //             "#": "570",
    //             "Date": "28 Sep 2025",
    //             "Description": "UPI/RUNU SENAPATI/527176056842/UPI",
    //             "Chq/Ref. No.": "UPI-527147036220",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "888.00",
    //             "Balance": "6,38,815.55",
    //             "tempId": "9fafdcbf-9031-423e-923a-704aaadc70de"
    //         },
    //         {
    //             "#": "Statement Generated on 17 Mar 2026, 18:41",
    //             "Date": "28 Sep 2025",
    //             "Description": "NACH-10-DR-LIC OF INDIA-4777103460925",
    //             "Chq/Ref. No.": "NACHDB280925143138",
    //             "Withdrawal (Dr.)": "1,136.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,37,679.55 Page 14 of  22",
    //             "tempId": "83683b8c-e0a2-487f-8269-022a09d1341b"
    //         },
    //         {
    //             "#": "571",
    //             "Date": "",
    //             "Description": "",
    //             "Chq/Ref. No.": "00",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "",
    //             "Balance": "",
    //             "tempId": "f5571b86-2ca2-401e-8f64-8d2c6ff59367"
    //         },
    //         {
    //             "#": "572",
    //             "Date": "28 Sep 2025",
    //             "Description": "NACH-10-DR-LIC OF INDIA-4777103470925",
    //             "Chq/Ref. No.": "NACHDB280925143141 00",
    //             "Withdrawal (Dr.)": "1,136.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,36,543.55",
    //             "tempId": "dcdb06c6-3009-49de-852b-359155616487"
    //         },
    //         {
    //             "#": "573",
    //             "Date": "28 Sep 2025",
    //             "Description": "NACH-10-DR-LIC OF INDIA-4321413420925",
    //             "Chq/Ref. No.": "NACHDB280925143141 00",
    //             "Withdrawal (Dr.)": "4,040.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,32,503.55",
    //             "tempId": "98e8e3ec-1dde-4a00-8998-84ef43b4f910"
    //         },
    //         {
    //             "#": "574",
    //             "Date": "28 Sep 2025",
    //             "Description": "UPI/Google Play/602934722715/MandateExecute",
    //             "Chq/Ref. No.": "UPI-527167668788",
    //             "Withdrawal (Dr.)": "99.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,32,404.55",
    //             "tempId": "322f060b-96bf-4cc6-a8e8-6195e3e03cce"
    //         },
    //         {
    //             "#": "575",
    //             "Date": "28 Sep 2025",
    //             "Description": "UPI/CHOWMAN HOSPITA/563726011651/UPI",
    //             "Chq/Ref. No.": "UPI-527182207463",
    //             "Withdrawal (Dr.)": "1,375.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,31,029.55",
    //             "tempId": "3956b8d3-c593-4a8d-8fa9-be59723a3efa"
    //         },
    //         {
    //             "#": "576",
    //             "Date": "29 Sep 2025",
    //             "Description": "UPI/KLIKKTECHNOLOGI/527215588957/MAND ATE",
    //             "Chq/Ref. No.": "UPI-527224380383",
    //             "Withdrawal (Dr.)": "99.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,30,930.55",
    //             "tempId": "7ce054a3-9b03-4ce8-9bee-0e6d1f36451b"
    //         },
    //         {
    //             "#": "577",
    //             "Date": "30 Sep 2025",
    //             "Description": "UPI/ETERNAL LIMITED/527380576429/ZomatoOnlineOrd",
    //             "Chq/Ref. No.": "UPI-527315693392",
    //             "Withdrawal (Dr.)": "197.25",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,30,733.30",
    //             "tempId": "42c785dd-73fe-4343-952f-995953f78ab5"
    //         },
    //         {
    //             "#": "578",
    //             "Date": "30 Sep 2025",
    //             "Description": "UPI/driptasenapati9/527307290747/UPI",
    //             "Chq/Ref. No.": "UPI-527324955192",
    //             "Withdrawal (Dr.)": "500.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,30,233.30",
    //             "tempId": "b29e8917-f719-4ccc-8548-f899894f9444"
    //         },
    //         {
    //             "#": "579",
    //             "Date": "30 Sep 2025",
    //             "Description": "Int.Pd:4613421825:01-07-2025 to 30-09-2025",
    //             "Chq/Ref. No.": "",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "3,870.00",
    //             "Balance": "6,34,103.30",
    //             "tempId": "87823671-ab85-4fcb-b214-20b5db59bb10"
    //         },
    //         {
    //             "#": "580",
    //             "Date": "01 Oct 2025",
    //             "Description": "UPI/RIK  SINGHA/527405497877/ice cream",
    //             "Chq/Ref. No.": "UPI-527430091887",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "40.00",
    //             "Balance": "6,34,143.30",
    //             "tempId": "4d1d05fd-85cf-43b6-8712-e6b6fa2b26a2"
    //         },
    //         {
    //             "#": "581",
    //             "Date": "02 Oct 2025",
    //             "Description": "UPI/ZOMATO/527568479944/UPI",
    //             "Chq/Ref. No.": "UPI-527563755610",
    //             "Withdrawal (Dr.)": "625.25",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,33,518.05",
    //             "tempId": "bc2e521f-52c8-40f6-afb1-3fd73a69e151"
    //         },
    //         {
    //             "#": "582",
    //             "Date": "02 Oct 2025",
    //             "Description": "UPI/ZOMATO LIMITED/527518264818/Zomato Payment",
    //             "Chq/Ref. No.": "UPI-527563845291",
    //             "Withdrawal (Dr.)": "500.30",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,33,017.75",
    //             "tempId": "1a527e46-150c-45a4-b7f4-f9e9b4aa8032"
    //         },
    //         {
    //             "#": "583",
    //             "Date": "07 Oct 2025",
    //             "Description": "UPI/Indian Clearing/528039468584/Indian Clearing",
    //             "Chq/Ref. No.": "UPI-528058374765",
    //             "Withdrawal (Dr.)": "4,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,29,017.75",
    //             "tempId": "2e9d69cf-f45b-4333-9130-65c843bbb51f"
    //         },
    //         {
    //             "#": "584",
    //             "Date": "07 Oct 2025",
    //             "Description": "UPI/Indian Clearing/528039472076/Indian Clearing",
    //             "Chq/Ref. No.": "UPI-528058383371",
    //             "Withdrawal (Dr.)": "4,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,25,017.75",
    //             "tempId": "957b2a2c-b788-410f-bf33-c0e636f26a80"
    //         },
    //         {
    //             "#": "585",
    //             "Date": "07 Oct 2025",
    //             "Description": "UPI/Indian Clearing/528039472223/Indian Clearing",
    //             "Chq/Ref. No.": "UPI-528058383654",
    //             "Withdrawal (Dr.)": "2,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,23,017.75",
    //             "tempId": "55584173-0723-413c-8165-4f161d3032b0"
    //         },
    //         {
    //             "#": "586",
    //             "Date": "07 Oct 2025",
    //             "Description": "UPI/PHARMEASY/528061823920/UPI",
    //             "Chq/Ref. No.": "UPI-528009940679",
    //             "Withdrawal (Dr.)": "2,148.13",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,20,869.62",
    //             "tempId": "98078a23-c925-4358-ae8c-adffec4c91b7"
    //         },
    //         {
    //             "#": "587",
    //             "Date": "07 Oct 2025",
    //             "Description": "DEBIT CARD ANNUAL FEE X3224 FOR 2025",
    //             "Chq/Ref. No.": "811CC-46afc4c7-26ba-",
    //             "Withdrawal (Dr.)": "588.82",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,20,280.80",
    //             "tempId": "6b5f5036-c5aa-4556-be62-3e883fe935bf"
    //         },
    //         {
    //             "#": "588",
    //             "Date": "08 Oct 2025",
    //             "Description": "UPI/Jio Prepaid Rec/528146183561/UPI",
    //             "Chq/Ref. No.": "UPI-528153749802",
    //             "Withdrawal (Dr.)": "3,182.46",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,17,098.34",
    //             "tempId": "0575773b-0082-430a-ab00-9709fb5c270e"
    //         },
    //         {
    //             "#": "589",
    //             "Date": "08 Oct 2025",
    //             "Description": "UPI/SENAPATI D/528192891045/UPI",
    //             "Chq/Ref. No.": "UPI-528156218747",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "60,000.00",
    //             "Balance": "6,77,098.34",
    //             "tempId": "e126610e-555f-4101-9e10-9b5e4eedd4e6"
    //         },
    //         {
    //             "#": "590",
    //             "Date": "09 Oct 2025",
    //             "Description": "UPI/Amazon India/528210719140/Request from Am",
    //             "Chq/Ref. No.": "UPI-528212644565",
    //             "Withdrawal (Dr.)": "354.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,76,744.34",
    //             "tempId": "8aac5c6f-192e-466f-9819-979d322410a0"
    //         },
    //         {
    //             "#": "591",
    //             "Date": "09 Oct 2025",
    //             "Description": "UPI/Google India Di/528261418550/remarks",
    //             "Chq/Ref. No.": "UPI-528272867255",
    //             "Withdrawal (Dr.)": "1,110.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,75,634.34",
    //             "tempId": "5fbdf718-3597-41b5-a850-11add3fe3307"
    //         },
    //         {
    //             "#": "592",
    //             "Date": "10 Oct 2025",
    //             "Description": "UPI/Amazon India/528311125433/Request from Am",
    //             "Chq/Ref. No.": "UPI-528389894384",
    //             "Withdrawal (Dr.)": "198.03",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,75,436.31",
    //             "tempId": "80b0ae15-ae28-4469-9edb-689d90286541"
    //         },
    //         {
    //             "#": "593",
    //             "Date": "10 Oct 2025",
    //             "Description": "UPI/RUNU SENAPATI/112463125617/UPI",
    //             "Chq/Ref. No.": "UPI-528339420825",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "3,258.00",
    //             "Balance": "6,78,694.31",
    //             "tempId": "2f78a2b8-c13e-4268-ad7a-4e768a7d9273"
    //         },
    //         {
    //             "#": "594",
    //             "Date": "12 Oct 2025",
    //             "Description": "UPI/Blinkit/565142380953/PayviaRazorpay",
    //             "Chq/Ref. No.": "UPI-528531782799",
    //             "Withdrawal (Dr.)": "338.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,78,356.31",
    //             "tempId": "96e17af0-1bbf-4c01-8cb0-15203cbb0f01"
    //         },
    //         {
    //             "#": "595",
    //             "Date": "12 Oct 2025",
    //             "Description": "UPI/Jalajoga mishti/565129499844/UPI",
    //             "Chq/Ref. No.": "UPI-528534420220",
    //             "Withdrawal (Dr.)": "120.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,78,236.31",
    //             "tempId": "29f89c63-d1dc-4a84-9364-1261c3a2d110"
    //         },
    //         {
    //             "#": "596",
    //             "Date": "12 Oct 2025",
    //             "Description": "UPI/amazon pay groc/528512155854/Request from Am",
    //             "Chq/Ref. No.": "UPI-528580812723",
    //             "Withdrawal (Dr.)": "1,005.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,77,231.31",
    //             "tempId": "8e57bebc-d120-43fe-9e6f-52c7e14269ea"
    //         },
    //         {
    //             "#": "597",
    //             "Date": "12 Oct 2025",
    //             "Description": "UPI/MR RIK SINGHA/528543577842/birthday gift",
    //             "Chq/Ref. No.": "UPI-528581104328",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "1,005.00",
    //             "Balance": "6,78,236.31",
    //             "tempId": "29e91e71-74a9-4b26-8506-e8002d9fd2c6"
    //         },
    //         {
    //             "#": "598",
    //             "Date": "14 Oct 2025",
    //             "Description": "UPI/BLINKIT COMMERC/528728062682/Blinkit Payment",
    //             "Chq/Ref. No.": "UPI-528799630244",
    //             "Withdrawal (Dr.)": "257.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,77,979.31",
    //             "tempId": "3d3f4219-b74f-410a-a5ce-2d3a1da5bebe"
    //         },
    //         {
    //             "#": "599",
    //             "Date": "15 Oct 2025",
    //             "Description": "UPI/INDRA NARAYAN O/565400126369/UPI",
    //             "Chq/Ref. No.": "UPI-528848018167",
    //             "Withdrawal (Dr.)": "260.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,77,719.31",
    //             "tempId": "deda9baa-d914-44e9-83af-06345e622875"
    //         },
    //         {
    //             "#": "600",
    //             "Date": "15 Oct 2025",
    //             "Description": "UPI/Compass India F/565462058900/UPI",
    //             "Chq/Ref. No.": "UPI-528863880408",
    //             "Withdrawal (Dr.)": "151.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,77,568.31",
    //             "tempId": "a8f58f14-15f8-45da-a4b6-a0a2f51ab17e"
    //         },
    //         {
    //             "#": "601",
    //             "Date": "15 Oct 2025",
    //             "Description": "UPI/Mr Kishor Rames/528804706969/UPI",
    //             "Chq/Ref. No.": "UPI-528894437412",
    //             "Withdrawal (Dr.)": "260.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,77,308.31",
    //             "tempId": "259467e4-0ae7-433a-ae09-09490b1459f0"
    //         },
    //         {
    //             "#": "602",
    //             "Date": "15 Oct 2025",
    //             "Description": "UPI/SUDAKSHINA CHOW/528816703064/UPI",
    //             "Chq/Ref. No.": "UPI-528896774355",
    //             "Withdrawal (Dr.)": "2,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,75,308.31",
    //             "tempId": "5df0d97c-26c9-42df-aa3c-b882df6c9d87"
    //         },
    //         {
    //             "#": "603",
    //             "Date": "15 Oct 2025",
    //             "Description": "UPI/SUDAKSHINA CHOW/528844313770/UPI",
    //             "Chq/Ref. No.": "UPI-528896829731",
    //             "Withdrawal (Dr.)": "2,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,73,308.31",
    //             "tempId": "4404cf3e-0cfd-473e-b270-be7fc5aa0fc4"
    //         },
    //         {
    //             "#": "604",
    //             "Date": "15 Oct 2025",
    //             "Description": "UPI/SUDAKSHINA CHOW/528898814127/UPI",
    //             "Chq/Ref. No.": "UPI-528896983320",
    //             "Withdrawal (Dr.)": "2,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,71,308.31",
    //             "tempId": "ecc44c78-ae22-40e5-9684-a55cdc6dfad1"
    //         },
    //         {
    //             "#": "605",
    //             "Date": "15 Oct 2025",
    //             "Description": "UPI/SUDAKSHINA CHOW/528852300592/UPI",
    //             "Chq/Ref. No.": "UPI-528897043454",
    //             "Withdrawal (Dr.)": "1,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,70,308.31",
    //             "tempId": "a16630e7-187d-4026-b62b-af07151b8474"
    //         },
    //         {
    //             "#": "606",
    //             "Date": "16 Oct 2025",
    //             "Description": "UPI/Mr RAGHUNATH GH/528928342121/UPI",
    //             "Chq/Ref. No.": "UPI-528921647772",
    //             "Withdrawal (Dr.)": "120.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,70,188.31",
    //             "tempId": "c28d367b-44ed-4d43-a907-c7a8c028910e"
    //         },
    //         {
    //             "#": "607",
    //             "Date": "16 Oct 2025",
    //             "Description": "UPI/Compass India F/528942164788/UPI",
    //             "Chq/Ref. No.": "UPI-528933789745",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,70,146.31",
    //             "tempId": "2220fae5-54c6-4121-963a-261cc87abe5f"
    //         },
    //         {
    //             "#": "608",
    //             "Date": "16 Oct 2025",
    //             "Description": "UPI/RAHUL SINGH/565511911373/UPI",
    //             "Chq/Ref. No.": "UPI-528966547992",
    //             "Withdrawal (Dr.)": "110.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,70,036.31",
    //             "tempId": "f182889f-fd1e-4408-8f4d-573b896483ee"
    //         },
    //         {
    //             "#": "609",
    //             "Date": "17 Oct 2025",
    //             "Description": "UPI/ROHIT SHAW/565691546657/UPI",
    //             "Chq/Ref. No.": "UPI-529093499034",
    //             "Withdrawal (Dr.)": "90.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,69,946.31",
    //             "tempId": "3877aec5-7cf1-49e3-a996-029599502954"
    //         },
    //         {
    //             "#": "Statement Generated on 17 Mar 2026, 18:41",
    //             "Date": "17 Oct 2025",
    //             "Description": "UPI/Compass India F/565611291812/UPI",
    //             "Chq/Ref. No.": "UPI-529011684671",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,69,904.31 Page 15 of  22",
    //             "tempId": "2542068e-c71b-4058-a0e5-4f379de7d153"
    //         },
    //         {
    //             "#": "610",
    //             "Date": "",
    //             "Description": "",
    //             "Chq/Ref. No.": "",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "",
    //             "Balance": "",
    //             "tempId": "b63975b5-3194-450e-9d23-24b347e3ac7a"
    //         },
    //         {
    //             "#": "611",
    //             "Date": "18 Oct 2025",
    //             "Description": "UPI/AROJIT SAHA/565794215119/UPI",
    //             "Chq/Ref. No.": "UPI-529197529337",
    //             "Withdrawal (Dr.)": "350.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,69,554.31",
    //             "tempId": "1824284d-4fcc-4989-aa71-20fb80d92899"
    //         },
    //         {
    //             "#": "612",
    //             "Date": "18 Oct 2025",
    //             "Description": "UPI/SENCO GOLD LIMI/565701654371/UPI",
    //             "Chq/Ref. No.": "UPI-529111250546",
    //             "Withdrawal (Dr.)": "9,250.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,60,304.31",
    //             "tempId": "66ad66d1-39d1-4afe-8820-9b360b12b5d5"
    //         },
    //         {
    //             "#": "613",
    //             "Date": "18 Oct 2025",
    //             "Description": "UPI/PACENET MEGHBEL/565895261095/UPI(Value Date: 19- 10-2025)",
    //             "Chq/Ref. No.": "UPI-529229964680",
    //             "Withdrawal (Dr.)": "590.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,59,714.31",
    //             "tempId": "c051171c-4ef6-4849-a093-f4ca13d5ee8f"
    //         },
    //         {
    //             "#": "614",
    //             "Date": "19 Oct 2025",
    //             "Description": "UPI/Jio Prepaid Rec/529287729765/UPI",
    //             "Chq/Ref. No.": "UPI-529258233519",
    //             "Withdrawal (Dr.)": "629.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,59,085.31",
    //             "tempId": "08868198-9823-48d5-859e-ca9155329d9b"
    //         },
    //         {
    //             "#": "615",
    //             "Date": "20 Oct 2025",
    //             "Description": "UPI/VODAFONEIDEA LI/565950601915/UPIIntent",
    //             "Chq/Ref. No.": "UPI-529314055518",
    //             "Withdrawal (Dr.)": "489.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,58,596.31",
    //             "tempId": "b963cd64-a33f-4780-8116-8fcf0754cd1a"
    //         },
    //         {
    //             "#": "616",
    //             "Date": "20 Oct 2025",
    //             "Description": "UPI/ZEPTONOW/565998181493/UPI",
    //             "Chq/Ref. No.": "UPI-529361384748",
    //             "Withdrawal (Dr.)": "221.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,58,375.31",
    //             "tempId": "1be857e5-fbc4-48de-a859-f7a8c3dc74db"
    //         },
    //         {
    //             "#": "617",
    //             "Date": "20 Oct 2025",
    //             "Description": "UPI/ASHOK SINGH/565943090840/UPI",
    //             "Chq/Ref. No.": "UPI-529364378854",
    //             "Withdrawal (Dr.)": "50.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,58,325.31",
    //             "tempId": "3750631a-2a6e-4cbf-92f2-0fddcb2e259f"
    //         },
    //         {
    //             "#": "618",
    //             "Date": "21 Oct 2025",
    //             "Description": "UPI/SENAPATI D/529447048630/UPI",
    //             "Chq/Ref. No.": "UPI-529499372321",
    //             "Withdrawal (Dr.)": "20,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,38,325.31",
    //             "tempId": "864a4aa2-398b-43d2-9fc0-db560ef14cfe"
    //         },
    //         {
    //             "#": "619",
    //             "Date": "21 Oct 2025",
    //             "Description": "UPI/SENAPATI D/566058305282/UPI",
    //             "Chq/Ref. No.": "UPI-529433762001",
    //             "Withdrawal (Dr.)": "3,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,35,325.31",
    //             "tempId": "d5efefea-d409-41da-a39e-b88e996c39f8"
    //         },
    //         {
    //             "#": "620",
    //             "Date": "23 Oct 2025 4",
    //             "Description": "PCD/3224/GOOGLEPLAY/MUMBAI231025/10:1",
    //             "Chq/Ref. No.": "529604587515",
    //             "Withdrawal (Dr.)": "149.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,35,176.31",
    //             "tempId": "8fe02d8b-d426-44bc-9829-fd3c46240872"
    //         },
    //         {
    //             "#": "621",
    //             "Date": "23 Oct 2025",
    //             "Description": "UPI/VISHWAS  GUPTA/529654252629/Google console",
    //             "Chq/Ref. No.": "UPI-529632028382",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "2,500.00",
    //             "Balance": "6,37,676.31",
    //             "tempId": "0ff6dc49-7ae3-45fa-a307-c1104788e851"
    //         },
    //         {
    //             "#": "622",
    //             "Date": "23 Oct 2025",
    //             "Description": "UPI/DRIPTA SENAPATI/529637256033/UPI",
    //             "Chq/Ref. No.": "UPI-529632051418",
    //             "Withdrawal (Dr.)": "2,500.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,35,176.31",
    //             "tempId": "0b351ab9-316b-4e5e-b4eb-671fe4a63627"
    //         },
    //         {
    //             "#": "623",
    //             "Date": "23 Oct 2025",
    //             "Description": "UPI/TARAMA CATARER/566288401768/UPI",
    //             "Chq/Ref. No.": "UPI-529654325860",
    //             "Withdrawal (Dr.)": "40.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,35,136.31",
    //             "tempId": "f98f85ed-a81b-4efd-877b-97efd28f92a1"
    //         },
    //         {
    //             "#": "624",
    //             "Date": "24 Oct 2025",
    //             "Description": "Chrg: ECS Mandate- 67993570 06-Sep-2025",
    //             "Chq/Ref. No.": "TBMS-1770862690",
    //             "Withdrawal (Dr.)": "59.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,35,077.31",
    //             "tempId": "b80a457a-098b-4378-847a-aee7ae943041"
    //         },
    //         {
    //             "#": "625",
    //             "Date": "24 Oct 2025",
    //             "Description": "Chrg: ECS Mandate- 67992441 06-Sep-2025",
    //             "Chq/Ref. No.": "TBMS-1771036124",
    //             "Withdrawal (Dr.)": "59.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,35,018.31",
    //             "tempId": "6b134855-1a92-4141-8a81-7a4385c1d410"
    //         },
    //         {
    //             "#": "626",
    //             "Date": "24 Oct 2025",
    //             "Description": "Chrg: ECS Mandate- 67992338 06-Sep-2025",
    //             "Chq/Ref. No.": "TBMS-1771043373",
    //             "Withdrawal (Dr.)": "59.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,34,959.31",
    //             "tempId": "087fbce5-cee9-4423-84b4-fc7bb95d8ade"
    //         },
    //         {
    //             "#": "627",
    //             "Date": "24 Oct 2025",
    //             "Description": "UPI/Farmpool Privat/529776214790/FarmpoolPrivate",
    //             "Chq/Ref. No.": "UPI-529719008246",
    //             "Withdrawal (Dr.)": "4.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,34,955.31",
    //             "tempId": "055f5254-909b-4a62-b138-cc30bc120767"
    //         },
    //         {
    //             "#": "628",
    //             "Date": "25 Oct 2025",
    //             "Description": "UPI/sarkartrinath19/529822847049/UPI",
    //             "Chq/Ref. No.": "UPI-529849180080",
    //             "Withdrawal (Dr.)": "500.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,34,455.31",
    //             "tempId": "7ffb41ae-414d-4c14-b408-78a7277f0992"
    //         },
    //         {
    //             "#": "629",
    //             "Date": "26 Oct 2025",
    //             "Description": "UPI/SENAPATI D/529972887410/UPI",
    //             "Chq/Ref. No.": "UPI-529982724540",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "55,000.00",
    //             "Balance": "6,89,455.31",
    //             "tempId": "c708c14f-3852-47d0-846f-8b1a80da4913"
    //         },
    //         {
    //             "#": "630",
    //             "Date": "26 Oct 2025",
    //             "Description": "UPI/BLINKIT COMMERC/566529509140/Blinkit Payment",
    //             "Chq/Ref. No.": "UPI-529997971720",
    //             "Withdrawal (Dr.)": "214.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,89,241.31",
    //             "tempId": "a045203b-1079-4c1f-93fd-8f5a2a4c167a"
    //         },
    //         {
    //             "#": "631",
    //             "Date": "26 Oct 2025",
    //             "Description": "UPI/ZOMATO/566524447435/UPI",
    //             "Chq/Ref. No.": "UPI-529927788335",
    //             "Withdrawal (Dr.)": "708.85",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,88,532.46",
    //             "tempId": "87561ce1-1908-4b80-b25f-9c3223fe7212"
    //         },
    //         {
    //             "#": "632",
    //             "Date": "27 Oct 2025",
    //             "Description": "UPI/JOYDEB DAS/566697771976/UPI",
    //             "Chq/Ref. No.": "UPI-530056004735",
    //             "Withdrawal (Dr.)": "110.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,88,422.46",
    //             "tempId": "a92c390d-307e-45f3-9ac9-92d6be13d8d1"
    //         },
    //         {
    //             "#": "633",
    //             "Date": "27 Oct 2025",
    //             "Description": "UPI/Compass India F/530082001629/UPI",
    //             "Chq/Ref. No.": "UPI-530067871915",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,88,380.46",
    //             "tempId": "d8527b8c-20f2-4fa7-91ba-ae72eb7e4bd1"
    //         },
    //         {
    //             "#": "634",
    //             "Date": "27 Oct 2025",
    //             "Description": "UPI/SAILESH KUMAR G/530016335656/UPI",
    //             "Chq/Ref. No.": "UPI-530096083626",
    //             "Withdrawal (Dr.)": "90.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,88,290.46",
    //             "tempId": "846c6ead-d822-4ad4-866d-97fb372fecc2"
    //         },
    //         {
    //             "#": "635",
    //             "Date": "28 Oct 2025",
    //             "Description": "NACH-10-DR-LIC OF INDIA-4777103461025",
    //             "Chq/Ref. No.": "NACHDB281025061040 00",
    //             "Withdrawal (Dr.)": "1,136.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,87,154.46",
    //             "tempId": "df4f6d0a-a1c5-44e3-ac33-d59d911ec8b2"
    //         },
    //         {
    //             "#": "636",
    //             "Date": "28 Oct 2025",
    //             "Description": "NACH-10-DR-LIC OF INDIA-4777103471025",
    //             "Chq/Ref. No.": "NACHDB281025061040 00",
    //             "Withdrawal (Dr.)": "1,136.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,86,018.46",
    //             "tempId": "9f5f2588-a4ac-4cf8-95d2-33fcf4d0fb9b"
    //         },
    //         {
    //             "#": "637",
    //             "Date": "28 Oct 2025",
    //             "Description": "UPI/runusenapati65@/530117745885/UPI",
    //             "Chq/Ref. No.": "UPI-530114790669",
    //             "Withdrawal (Dr.)": "60,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,26,018.46",
    //             "tempId": "2b4b17ef-17cf-4607-8170-082e998f36ca"
    //         },
    //         {
    //             "#": "638",
    //             "Date": "28 Oct 2025",
    //             "Description": "UPI/KLIKKTECHNOLOGI/530115028340/MAND ATE",
    //             "Chq/Ref. No.": "UPI-530133565375",
    //             "Withdrawal (Dr.)": "99.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,25,919.46",
    //             "tempId": "45823e8d-197e-4a51-8651-55f0b20bc886"
    //         },
    //         {
    //             "#": "639",
    //             "Date": "28 Oct 2025",
    //             "Description": "UPI/Google Play/591025033015/MandateExecute",
    //             "Chq/Ref. No.": "UPI-530141805693",
    //             "Withdrawal (Dr.)": "99.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,25,820.46",
    //             "tempId": "e15b64da-2009-44ed-8451-54f9532959b7"
    //         },
    //         {
    //             "#": "640",
    //             "Date": "31 Oct 2025",
    //             "Description": "UPI/Ms TITAS SENAPA/567037894852/UPI",
    //             "Chq/Ref. No.": "UPI-530454191107",
    //             "Withdrawal (Dr.)": "35,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,90,820.46",
    //             "tempId": "a742f6bf-26db-478d-8a6b-496164cd5dce"
    //         },
    //         {
    //             "#": "641",
    //             "Date": "01 Nov 2025",
    //             "Description": "UPI/MAHADWIP  MONDA/530500625768/UPI",
    //             "Chq/Ref. No.": "UPI-530574398107",
    //             "Withdrawal (Dr.)": "5,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,85,820.46",
    //             "tempId": "ebe58b75-ff7b-4492-9931-5ffa3facdaf8"
    //         },
    //         {
    //             "#": "642",
    //             "Date": "01 Nov 2025",
    //             "Description": "UPI/DRIPTA SENAPATI/530544062857/UPI",
    //             "Chq/Ref. No.": "UPI-530588567824",
    //             "Withdrawal (Dr.)": "14,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,71,820.46",
    //             "tempId": "3d767652-4f01-4143-95d6-cfee0db6c23d"
    //         },
    //         {
    //             "#": "643",
    //             "Date": "01 Nov 2025",
    //             "Description": "UPI/PharmEasy/567272818574/UPI(Value Date: 02-11-2025)",
    //             "Chq/Ref. No.": "UPI-530634784285",
    //             "Withdrawal (Dr.)": "2,156.19",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,69,664.27",
    //             "tempId": "6141a696-7665-4f9e-9086-96e147240859"
    //         },
    //         {
    //             "#": "644",
    //             "Date": "01 Nov 2025",
    //             "Description": "UPI/RUNU SENAPATI/113514191251/UPI(Value Date: 02-11-2025)",
    //             "Chq/Ref. No.": "UPI-530634797425",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "2,156.00",
    //             "Balance": "5,71,820.27",
    //             "tempId": "ee536d9d-4cf1-40fc-9431-d93971eca4d8"
    //         },
    //         {
    //             "#": "645",
    //             "Date": "01 Nov 2025",
    //             "Description": "UPI/PharmEasy/567268022836/UPI(Value Date: 02-11-2025)",
    //             "Chq/Ref. No.": "UPI-530634851488",
    //             "Withdrawal (Dr.)": "245.65",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,71,574.62",
    //             "tempId": "81083348-9aa0-48f3-95e0-7d272f57647e"
    //         },
    //         {
    //             "#": "646",
    //             "Date": "01 Nov 2025",
    //             "Description": "UPI/RUNU SENAPATI/113514223785/UPI(Value Date: 02-11-2025)",
    //             "Chq/Ref. No.": "UPI-530634862385",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "247.00",
    //             "Balance": "5,71,821.62",
    //             "tempId": "ddfd72e0-e1c3-4c5f-a6c1-ace48cc8c0d7"
    //         },
    //         {
    //             "#": "647",
    //             "Date": "02 Nov 2025",
    //             "Description": "UPI/DRIPTA SENAPATI/567246430419/UPI",
    //             "Chq/Ref. No.": "UPI-530647263068",
    //             "Withdrawal (Dr.)": "2,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,69,821.62",
    //             "tempId": "0ac0234d-f132-47d4-ba02-a3790f970726"
    //         },
    //         {
    //             "#": "648",
    //             "Date": "03 Nov 2025",
    //             "Description": "UPI/SAFIKUL  SA/530706948377/UPI",
    //             "Chq/Ref. No.": "UPI-530725321263",
    //             "Withdrawal (Dr.)": "110.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,69,711.62",
    //             "tempId": "ee26d4d9-5a6c-4787-aacd-549d8c636a11"
    //         },
    //         {
    //             "#": "649",
    //             "Date": "03 Nov 2025",
    //             "Description": "UPI/Compass India F/530786270649/UPI",
    //             "Chq/Ref. No.": "UPI-530737522193",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,69,669.62",
    //             "tempId": "2bf2474c-376f-4c1d-8da0-2829e60c0138"
    //         },
    //         {
    //             "#": "Statement Generated on 17 Mar 2026, 18:41",
    //             "Date": "03 Nov 2025",
    //             "Description": "UPI/shawbikash496-4/567309308211/UPI",
    //             "Chq/Ref. No.": "UPI-530763437260",
    //             "Withdrawal (Dr.)": "90.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,69,579.62 Page 16 of  22",
    //             "tempId": "5b09797c-35ae-4c81-86e9-b3398a1b5215"
    //         },
    //         {
    //             "#": "650",
    //             "Date": "",
    //             "Description": "",
    //             "Chq/Ref. No.": "",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "",
    //             "Balance": "",
    //             "tempId": "dd57e038-93ed-496f-9ce2-9be496d7400c"
    //         },
    //         {
    //             "#": "651",
    //             "Date": "04 Nov 2025",
    //             "Description": "UPI/PharmEasy/530808080158/express",
    //             "Chq/Ref. No.": "UPI-530892179510",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "8.79",
    //             "Balance": "5,69,588.41",
    //             "tempId": "edda2b29-99ca-48d2-a096-78b63096c7b9"
    //         },
    //         {
    //             "#": "652",
    //             "Date": "04 Nov 2025",
    //             "Description": "UPI/BLINKIT COMMERC/567469338006/Blinkit Payment",
    //             "Chq/Ref. No.": "UPI-530892962713",
    //             "Withdrawal (Dr.)": "139.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,69,449.41",
    //             "tempId": "5202bd66-3dc3-46f3-a89d-cf8918fbc8b8"
    //         },
    //         {
    //             "#": "653",
    //             "Date": "04 Nov 2025",
    //             "Description": "DEBIT CARD ANNUAL FEE X0024 FOR 2025",
    //             "Chq/Ref. No.": "811CC-2a511113-7af3-",
    //             "Withdrawal (Dr.)": "399.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,69,050.41",
    //             "tempId": "6b7e395c-9cc1-4eba-9e71-7103225a13c7"
    //         },
    //         {
    //             "#": "654",
    //             "Date": "05 Nov 2025",
    //             "Description": "UPI/ARINDAM SEAL/567521602832/UPI",
    //             "Chq/Ref. No.": "UPI-530901497212",
    //             "Withdrawal (Dr.)": "170.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,68,880.41",
    //             "tempId": "e9e0f3a3-2b37-43d8-b585-524fa812c0c7"
    //         },
    //         {
    //             "#": "655",
    //             "Date": "06 Nov 2025",
    //             "Description": "NEFT HDFCH00593185309 QUANT MUTUAL FUND   COMMON",
    //             "Chq/Ref. No.": "NEFTINW-1387895461",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "38,553.25",
    //             "Balance": "6,07,433.66",
    //             "tempId": "34770240-be8b-469c-8774-ab90a343a395"
    //         },
    //         {
    //             "#": "656",
    //             "Date": "06 Nov 2025",
    //             "Description": "UPI/PharmEasy/531006908567/express",
    //             "Chq/Ref. No.": "UPI-531039130074",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "245.65",
    //             "Balance": "6,07,679.31",
    //             "tempId": "d3c32af3-85df-4c35-8e0f-a8d54e2e0306"
    //         },
    //         {
    //             "#": "657",
    //             "Date": "06 Nov 2025",
    //             "Description": "UPI/OpenAI LLC/531023902726/Mandate Request",
    //             "Chq/Ref. No.": "UPI-531087467911",
    //             "Withdrawal (Dr.)": "1.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,07,678.31",
    //             "tempId": "04d40091-e79e-4299-9a84-c61871bb4650"
    //         },
    //         {
    //             "#": "658",
    //             "Date": "06 Nov 2025",
    //             "Description": "REV-UPI/OpenAI LLC/531023902726/Refund",
    //             "Chq/Ref. No.": "UPI-531087576392",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "1.00",
    //             "Balance": "6,07,679.31",
    //             "tempId": "c9f045d5-afec-4947-9ab6-e630e8ea5e52"
    //         },
    //         {
    //             "#": "659",
    //             "Date": "07 Nov 2025",
    //             "Description": "UPI/Indian Clearing/531127498232/Indian Clearing",
    //             "Chq/Ref. No.": "UPI-531191648736",
    //             "Withdrawal (Dr.)": "4,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,03,679.31",
    //             "tempId": "ffeef524-a401-45df-9f1d-c204c11c9a19"
    //         },
    //         {
    //             "#": "660",
    //             "Date": "07 Nov 2025",
    //             "Description": "UPI/Indian Clearing/531127503046/Indian Clearing",
    //             "Chq/Ref. No.": "UPI-531191662211",
    //             "Withdrawal (Dr.)": "2,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "6,01,679.31",
    //             "tempId": "527eb396-55f4-443b-92d7-a9bdd6cf90a2"
    //         },
    //         {
    //             "#": "661",
    //             "Date": "07 Nov 2025",
    //             "Description": "UPI/MAHADWIP  MONDA/531104444281/UPI",
    //             "Chq/Ref. No.": "UPI-531102231529",
    //             "Withdrawal (Dr.)": "1,00,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,01,679.31",
    //             "tempId": "9d0fa908-d160-4faa-b127-9b51ebe4b22c"
    //         },
    //         {
    //             "#": "662",
    //             "Date": "07 Nov 2025",
    //             "Description": "UPI/NOV DIGITAL ENT/101909918311/No Remarks",
    //             "Chq/Ref. No.": "UPI-531117520735",
    //             "Withdrawal (Dr.)": "1,499.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "5,00,180.31",
    //             "tempId": "21540cce-ef86-4205-af09-44a002c6a034"
    //         },
    //         {
    //             "#": "663",
    //             "Date": "08 Nov 2025",
    //             "Description": "UPI/RRB Chennai Gra/567849169067/RRB Chennai Gra",
    //             "Chq/Ref. No.": "UPI-531277363707",
    //             "Withdrawal (Dr.)": "250.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "4,99,930.31",
    //             "tempId": "2d6549fc-7b6b-4f7a-9090-ad12caf7bd8e"
    //         },
    //         {
    //             "#": "664",
    //             "Date": "08 Nov 2025",
    //             "Description": "UPI/RRB Chennai Und/567854483468/RRB Chennai Und",
    //             "Chq/Ref. No.": "UPI-531277979602",
    //             "Withdrawal (Dr.)": "250.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "4,99,680.31",
    //             "tempId": "650e27b3-9e50-44be-b082-eb3bb266ac74"
    //         },
    //         {
    //             "#": "665",
    //             "Date": "08 Nov 2025",
    //             "Description": "UPI/Arpita  Sarkar/531269611083/UPI",
    //             "Chq/Ref. No.": "UPI-531202521730",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "500.00",
    //             "Balance": "5,00,180.31",
    //             "tempId": "614f78fa-98fc-4383-b15b-2e3e2f186297"
    //         },
    //         {
    //             "#": "666",
    //             "Date": "09 Nov 2025",
    //             "Description": "PCD/0024/Reliance Retail Ltd/KOLKATA091125/13:33",
    //             "Chq/Ref. No.": "531313515077",
    //             "Withdrawal (Dr.)": "20,234.24",
    //             "Deposit (Cr.)": "",
    //             "Balance": "4,79,946.07",
    //             "tempId": "55816590-48f6-4ed8-9bba-ce08f01ec7e5"
    //         },
    //         {
    //             "#": "667",
    //             "Date": "09 Nov 2025",
    //             "Description": "UPI/Google India Di/531340092200/remarks",
    //             "Chq/Ref. No.": "UPI-531393614721",
    //             "Withdrawal (Dr.)": "940.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "4,79,006.07",
    //             "tempId": "8bfc08e0-bfb0-4a78-85ef-7ada839e44e2"
    //         },
    //         {
    //             "#": "668",
    //             "Date": "10 Nov 2025",
    //             "Description": "UPI/SUBHAJIT DAW/568094068013/UPI",
    //             "Chq/Ref. No.": "UPI-531415943296",
    //             "Withdrawal (Dr.)": "80.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "4,78,926.07",
    //             "tempId": "bccfcd18-4e97-4595-be6f-26fc5b291028"
    //         },
    //         {
    //             "#": "669",
    //             "Date": "10 Nov 2025",
    //             "Description": "UPI/Compass India F/568090894302/UPI",
    //             "Chq/Ref. No.": "UPI-531432238702",
    //             "Withdrawal (Dr.)": "43.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "4,78,883.07",
    //             "tempId": "e373d78a-7c1a-4a51-86ae-de07d79f2869"
    //         },
    //         {
    //             "#": "670",
    //             "Date": "10 Nov 2025",
    //             "Description": "UPI/RABIN DAS/531469231090/UPI",
    //             "Chq/Ref. No.": "UPI-531462572232",
    //             "Withdrawal (Dr.)": "90.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "4,78,793.07",
    //             "tempId": "c6b39886-1b7f-429d-ac05-21925dbae264"
    //         },
    //         {
    //             "#": "671",
    //             "Date": "11 Nov 2025",
    //             "Description": "UPI/SENAPATI D/531542050506/UPI",
    //             "Chq/Ref. No.": "UPI-531583333291",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "20,500.00",
    //             "Balance": "4,99,293.07",
    //             "tempId": "10508003-02b3-47bc-bfe0-fd00a311d795"
    //         },
    //         {
    //             "#": "672",
    //             "Date": "12 Nov 2025",
    //             "Description": "UPI/PAPAI ROY/531690411293/UPI",
    //             "Chq/Ref. No.": "UPI-531697275430",
    //             "Withdrawal (Dr.)": "90.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "4,99,203.07",
    //             "tempId": "955f7c80-2a8e-453e-88de-3e4f26d57444"
    //         },
    //         {
    //             "#": "673",
    //             "Date": "12 Nov 2025",
    //             "Description": "UPI/SPUDDY SPORTS C/531619730518/UPI",
    //             "Chq/Ref. No.": "UPI-531610724055",
    //             "Withdrawal (Dr.)": "80.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "4,99,123.07",
    //             "tempId": "64e03ac1-1015-4b15-989a-42c7ea7fda4e"
    //         },
    //         {
    //             "#": "674",
    //             "Date": "12 Nov 2025",
    //             "Description": "UPI/ROHIT  PRASAD/531646033574/UPI",
    //             "Chq/Ref. No.": "UPI-531611650490",
    //             "Withdrawal (Dr.)": "80.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "4,99,043.07",
    //             "tempId": "dfa32d66-9a83-4978-9e5e-313649bc6158"
    //         },
    //         {
    //             "#": "675",
    //             "Date": "14 Nov 2025",
    //             "Description": "UPI/MAHADWIP  MONDA/568479748439/UPI",
    //             "Chq/Ref. No.": "UPI-531896671188",
    //             "Withdrawal (Dr.)": "1,00,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,99,043.07",
    //             "tempId": "fe13007a-a1f1-4b80-afcf-f0b2360b749d"
    //         },
    //         {
    //             "#": "676",
    //             "Date": "15 Nov 2025",
    //             "Description": "UPI/DRIPTA SENAPATI/531928255383/UPI",
    //             "Chq/Ref. No.": "UPI-531975146620",
    //             "Withdrawal (Dr.)": "20,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,79,043.07",
    //             "tempId": "bfe1aab2-36fe-4e8d-8230-ab5affb469b0"
    //         },
    //         {
    //             "#": "677",
    //             "Date": "16 Nov 2025",
    //             "Description": "UPI/Rajib Shaw/568650754037/UPI",
    //             "Chq/Ref. No.": "UPI-532036757934",
    //             "Withdrawal (Dr.)": "5.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,79,038.07",
    //             "tempId": "96fd1e5e-015c-44fb-a6cb-56a4222eae44"
    //         },
    //         {
    //             "#": "678",
    //             "Date": "16 Nov 2025",
    //             "Description": "UPI/MAHADWIP  MONDA/568612681529/UPI",
    //             "Chq/Ref. No.": "UPI-532047937730",
    //             "Withdrawal (Dr.)": "30,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,49,038.07",
    //             "tempId": "48aef9ea-2c8c-4f6a-842e-2c5108bf60f0"
    //         },
    //         {
    //             "#": "679",
    //             "Date": "16 Nov 2025",
    //             "Description": "UPI/SAUTRIK GHOSH/532031602532/UPI",
    //             "Chq/Ref. No.": "UPI-532076638391",
    //             "Withdrawal (Dr.)": "325.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,48,713.07",
    //             "tempId": "8eed1e09-f552-4481-9fee-fd627ae04d95"
    //         },
    //         {
    //             "#": "680",
    //             "Date": "16 Nov 2025",
    //             "Description": "UPI/R A A ARSALAN E/532047212840/Pay To  R A A A",
    //             "Chq/Ref. No.": "UPI-532077243737",
    //             "Withdrawal (Dr.)": "214.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,48,499.07",
    //             "tempId": "8987dc3c-67b8-4392-a0b8-4fac40d9e449"
    //         },
    //         {
    //             "#": "681",
    //             "Date": "17 Nov 2025",
    //             "Description": "UPI/PAROMITA GUPTA/532140344736/UPI",
    //             "Chq/Ref. No.": "UPI-532106077647",
    //             "Withdrawal (Dr.)": "100.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,48,399.07",
    //             "tempId": "98c19d4f-e6c1-4363-910a-4d64b91bad40"
    //         },
    //         {
    //             "#": "682",
    //             "Date": "17 Nov 2025",
    //             "Description": "UPI/Compass India F/532191553726/UPI",
    //             "Chq/Ref. No.": "UPI-532115998727",
    //             "Withdrawal (Dr.)": "145.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,48,254.07",
    //             "tempId": "70d94df2-117a-4103-9f77-a1116658b85f"
    //         },
    //         {
    //             "#": "683",
    //             "Date": "17 Nov 2025",
    //             "Description": "UPI/SUBRATA DAS/532173898663/UPI",
    //             "Chq/Ref. No.": "UPI-532146907413",
    //             "Withdrawal (Dr.)": "80.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,48,174.07",
    //             "tempId": "6b19cc96-8748-4ed9-81ee-75c133ba4765"
    //         },
    //         {
    //             "#": "684",
    //             "Date": "19 Nov 2025",
    //             "Description": "UPI/SENCO GOLD LIMI/532354904610/UPI",
    //             "Chq/Ref. No.": "UPI-532325844525",
    //             "Withdrawal (Dr.)": "5,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,43,174.07",
    //             "tempId": "4c2bffc2-9ec9-4bdd-8bbe-ab03e62e6039"
    //         },
    //         {
    //             "#": "685",
    //             "Date": "19 Nov 2025",
    //             "Description": "UPI/ASHIM  GHOSH/532308776583/UPI",
    //             "Chq/Ref. No.": "UPI-532378297365",
    //             "Withdrawal (Dr.)": "42.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,43,132.07",
    //             "tempId": "2f4915fe-d259-498c-815a-4813960ccbe1"
    //         },
    //         {
    //             "#": "686",
    //             "Date": "19 Nov 2025",
    //             "Description": "UPI/RUNU SENAPATI/568931911414/UPI",
    //             "Chq/Ref. No.": "UPI-532393683196",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "5,000.00",
    //             "Balance": "3,48,132.07",
    //             "tempId": "b9e7f6e0-a9ab-4672-9b96-3ac9b43414c4"
    //         },
    //         {
    //             "#": "687",
    //             "Date": "20 Nov 2025",
    //             "Description": "UPI/SUBHAS  SANDHU/569065614720/UPI",
    //             "Chq/Ref. No.": "UPI-532411125822",
    //             "Withdrawal (Dr.)": "90.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,48,042.07",
    //             "tempId": "41d104a1-7776-4b4a-ac33-157218f342f5"
    //         },
    //         {
    //             "#": "688",
    //             "Date": "20 Nov 2025",
    //             "Description": "UPI/Compass India F/569066128330/UPI",
    //             "Chq/Ref. No.": "UPI-532419664177",
    //             "Withdrawal (Dr.)": "151.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,47,891.07",
    //             "tempId": "e8aac5d9-4469-4808-8125-91e004b65925"
    //         },
    //         {
    //             "#": "689",
    //             "Date": "20 Nov 2025",
    //             "Description": "UPI/Ms TITAS SENAPA/569045343118/UPI",
    //             "Chq/Ref. No.": "UPI-532428211628",
    //             "Withdrawal (Dr.)": "11,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,36,891.07",
    //             "tempId": "3283d0b2-9d18-4fa8-a463-3eca3a59f482"
    //         },
    //         {
    //             "#": "690",
    //             "Date": "20 Nov 2025",
    //             "Description": "UPI/SOMNATH  DAS/569049586767/UPI",
    //             "Chq/Ref. No.": "UPI-532446182418",
    //             "Withdrawal (Dr.)": "100.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,36,791.07",
    //             "tempId": "ee6a4a22-34d6-4a0a-ae7b-8475f7735dc8"
    //         },
    //         {
    //             "#": "691",
    //             "Date": "20 Nov 2025",
    //             "Description": "UPI/PINTU  MUKHERJE/569029084285/UPI",
    //             "Chq/Ref. No.": "UPI-532452578499",
    //             "Withdrawal (Dr.)": "80.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,36,711.07",
    //             "tempId": "bdf64e92-b83c-4c8d-b5c1-947604b4e1c2"
    //         },
    //         {
    //             "#": "692",
    //             "Date": "20 Nov 2025",
    //             "Description": "UPI/SPUDDY SPORTS C/569024698966/UPI",
    //             "Chq/Ref. No.": "UPI-532460571377",
    //             "Withdrawal (Dr.)": "60.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,36,651.07",
    //             "tempId": "a4b10c69-bf19-4740-a174-bec21af50953"
    //         },
    //         {
    //             "#": "Statement Generated on 17 Mar 2026, 18:41",
    //             "Date": "20 Nov 2025",
    //             "Description": "UPI/KUNAL  DAS/532438302189/UPI",
    //             "Chq/Ref. No.": "UPI-532462071138",
    //             "Withdrawal (Dr.)": "80.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,36,571.07 Page 17 of  22",
    //             "tempId": "35d2e1e3-bab5-4fb5-bc61-1477f5e24e3a"
    //         },
    //         {
    //             "#": "693",
    //             "Date": "",
    //             "Description": "",
    //             "Chq/Ref. No.": "",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "",
    //             "Balance": "",
    //             "tempId": "18f772ca-d6e1-4417-b323-db3713528f6b"
    //         },
    //         {
    //             "#": "694",
    //             "Date": "20 Nov 2025",
    //             "Description": "UPI/CRED Club/569036391751/payment on CRED",
    //             "Chq/Ref. No.": "UPI-532463690283",
    //             "Withdrawal (Dr.)": "5,469.97",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,31,101.10",
    //             "tempId": "af66957b-db16-428c-a056-66509e7be951"
    //         },
    //         {
    //             "#": "695",
    //             "Date": "21 Nov 2025",
    //             "Description": "UPI/ANIL SHARMA/532546417230/UPI",
    //             "Chq/Ref. No.": "UPI-532584111104",
    //             "Withdrawal (Dr.)": "650.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,30,451.10",
    //             "tempId": "aee99c2a-f53a-4c9c-8ca5-6aa669e98c0e"
    //         },
    //         {
    //             "#": "696",
    //             "Date": "21 Nov 2025",
    //             "Description": "UPI/SOMNATH   CHAKR/532532627634/UPI",
    //             "Chq/Ref. No.": "UPI-532591218301",
    //             "Withdrawal (Dr.)": "105.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,30,346.10",
    //             "tempId": "1f7a3540-4de5-40d1-84a8-f5322f8bdbe0"
    //         },
    //         {
    //             "#": "697",
    //             "Date": "21 Nov 2025",
    //             "Description": "UPI/MUNNI YADAV/532504780751/UPI",
    //             "Chq/Ref. No.": "UPI-532517969605",
    //             "Withdrawal (Dr.)": "428.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,29,918.10",
    //             "tempId": "e4effd20-2ca2-44f4-9aeb-614f8b35ee9c"
    //         },
    //         {
    //             "#": "698",
    //             "Date": "21 Nov 2025",
    //             "Description": "UPI/SANJIT YADAV/532539489024/UPI",
    //             "Chq/Ref. No.": "UPI-532531159138",
    //             "Withdrawal (Dr.)": "290.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,29,628.10",
    //             "tempId": "52efa58d-82c1-4932-8eaf-d3ce643b2ade"
    //         },
    //         {
    //             "#": "699",
    //             "Date": "22 Nov 2025",
    //             "Description": "UPI/Blinkit/569200324881/Blinkit Payment",
    //             "Chq/Ref. No.": "UPI-532649653563",
    //             "Withdrawal (Dr.)": "319.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,29,309.10",
    //             "tempId": "aa40b305-52df-4eaf-bc45-c9f1f90440fc"
    //         },
    //         {
    //             "#": "700",
    //             "Date": "23 Nov 2025 4",
    //             "Description": "PCD/3224/GOOGLEPLAY/MUMBAI231125/10:1",
    //             "Chq/Ref. No.": "532704473170",
    //             "Withdrawal (Dr.)": "149.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,29,160.10",
    //             "tempId": "e65bde1d-dfeb-4d91-9a47-cae011db671e"
    //         },
    //         {
    //             "#": "701",
    //             "Date": "23 Nov 2025",
    //             "Description": "UPI/BLINKIT/532738719942/PayviaRazorpay",
    //             "Chq/Ref. No.": "UPI-532718488626",
    //             "Withdrawal (Dr.)": "160.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,29,000.10",
    //             "tempId": "08ff96ac-0a8d-4298-8b64-60a1bd6ccfac"
    //         },
    //         {
    //             "#": "702",
    //             "Date": "23 Nov 2025",
    //             "Description": "UPI/K003 KFC Salt L/532796386084/UPI",
    //             "Chq/Ref. No.": "UPI-532751768055",
    //             "Withdrawal (Dr.)": "732.90",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,28,267.20",
    //             "tempId": "185bff63-2133-4c12-b3a5-4894e5f96e79"
    //         },
    //         {
    //             "#": "703",
    //             "Date": "25 Nov 2025",
    //             "Description": "UPI/DADARHOTEL/532961221041/UPI",
    //             "Chq/Ref. No.": "UPI-532960268518",
    //             "Withdrawal (Dr.)": "50.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,28,217.20",
    //             "tempId": "f6c74c95-2e1a-4e6b-818f-5e3079c0efa1"
    //         },
    //         {
    //             "#": "704",
    //             "Date": "25 Nov 2025",
    //             "Description": "PCI/0024/CANVA* PAAAAG43RW7TMFC/+17372251125/21:31",
    //             "Chq/Ref. No.": "532916431802",
    //             "Withdrawal (Dr.)": "75.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,28,142.20",
    //             "tempId": "4973ff7d-2c6e-4441-9229-5add030635fa"
    //         },
    //         {
    //             "#": "705",
    //             "Date": "25 Nov 2025",
    //             "Description": "PCI/0024/CANVA* PAAAAG43RW7TMFC/+17372251125/21:32",
    //             "Chq/Ref. No.": "532916431802",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "75.00",
    //             "Balance": "3,28,217.20",
    //             "tempId": "b29c80c1-502f-432b-acc9-64c5e9402968"
    //         },
    //         {
    //             "#": "706",
    //             "Date": "26 Nov 2025",
    //             "Description": "UPI/KLIKKTECHNOLOGI/533015130782/MAND ATE",
    //             "Chq/Ref. No.": "UPI-533033267178",
    //             "Withdrawal (Dr.)": "99.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,28,118.20",
    //             "tempId": "a63f398d-51ee-4102-a98a-0f03ddcb6ae4"
    //         },
    //         {
    //             "#": "707",
    //             "Date": "26 Nov 2025",
    //             "Description": "UPI/KISHOR/533067709112/UPI",
    //             "Chq/Ref. No.": "UPI-533065933251",
    //             "Withdrawal (Dr.)": "12.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,28,106.20",
    //             "tempId": "483866be-00dd-4346-bc34-4213d853e6c7"
    //         },
    //         {
    //             "#": "708",
    //             "Date": "27 Nov 2025",
    //             "Description": "UPI/Ms TITAS SENAPA/533165551730/UPI",
    //             "Chq/Ref. No.": "UPI-533109682383",
    //             "Withdrawal (Dr.)": "21,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,07,106.20",
    //             "tempId": "cffb70cb-d271-450f-b25b-441e643bf30d"
    //         },
    //         {
    //             "#": "709",
    //             "Date": "27 Nov 2025",
    //             "Description": "UPI/The West Bengal/533193280827/Pay",
    //             "Chq/Ref. No.": "UPI-533127589079",
    //             "Withdrawal (Dr.)": "150.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,06,956.20",
    //             "tempId": "d0f74dd1-7c0b-483a-b8d4-1ed15421c5e2"
    //         },
    //         {
    //             "#": "710",
    //             "Date": "27 Nov 2025",
    //             "Description": "UPI/The West Bengal/533117780199/Pay",
    //             "Chq/Ref. No.": "UPI-533127805377",
    //             "Withdrawal (Dr.)": "150.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,06,806.20",
    //             "tempId": "fb88cfd0-d1f0-45f7-9dbb-66a3403ff9b1"
    //         },
    //         {
    //             "#": "711",
    //             "Date": "28 Nov 2025",
    //             "Description": "NACH-10-DR-LIC OF INDIA-4777103461125",
    //             "Chq/Ref. No.": "NACHDB281125061310 00",
    //             "Withdrawal (Dr.)": "1,136.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,05,670.20",
    //             "tempId": "4c664ff1-21cf-4756-a774-7da374d9cbae"
    //         },
    //         {
    //             "#": "712",
    //             "Date": "28 Nov 2025",
    //             "Description": "NACH-10-DR-LIC OF INDIA-4777103471125",
    //             "Chq/Ref. No.": "NACHDB281125061310 00",
    //             "Withdrawal (Dr.)": "1,136.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,04,534.20",
    //             "tempId": "9378c10a-8507-499f-9418-45dc961abb6b"
    //         },
    //         {
    //             "#": "713",
    //             "Date": "28 Nov 2025",
    //             "Description": "UPI/RAJ  KUMAR/569870616538/UPI",
    //             "Chq/Ref. No.": "UPI-533250295167",
    //             "Withdrawal (Dr.)": "120.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,04,414.20",
    //             "tempId": "c7308d22-aaef-440f-af26-90d5ae8cd409"
    //         },
    //         {
    //             "#": "714",
    //             "Date": "28 Nov 2025",
    //             "Description": "UPI/Google Play/804499523325/MandateExecute",
    //             "Chq/Ref. No.": "UPI-533277642243",
    //             "Withdrawal (Dr.)": "99.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,04,315.20",
    //             "tempId": "4b16fa95-4dbf-4b2d-8831-04ee82920dd4"
    //         },
    //         {
    //             "#": "715",
    //             "Date": "28 Nov 2025",
    //             "Description": "UPI/Blinkit/569818173727/Blinkit Payment",
    //             "Chq/Ref. No.": "UPI-533201395175",
    //             "Withdrawal (Dr.)": "150.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,04,165.20",
    //             "tempId": "e235660e-46c9-4f94-be27-e28e06b2a6ce"
    //         },
    //         {
    //             "#": "716",
    //             "Date": "29 Nov 2025",
    //             "Description": "UPI/DADARHOTEL/533315010982/UPI",
    //             "Chq/Ref. No.": "UPI-533332702587",
    //             "Withdrawal (Dr.)": "10.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,04,155.20",
    //             "tempId": "cf71342f-28fd-41f4-96e9-a5fe9ba6aece"
    //         },
    //         {
    //             "#": "717",
    //             "Date": "30 Nov 2025",
    //             "Description": "UPI/GOUR ROY/533412484391/UPI",
    //             "Chq/Ref. No.": "UPI-533488083596",
    //             "Withdrawal (Dr.)": "190.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,03,965.20",
    //             "tempId": "f16d352c-b8d8-4ae2-bd2a-9e5b45e6ad5f"
    //         },
    //         {
    //             "#": "718",
    //             "Date": "30 Nov 2025",
    //             "Description": "UPI/SENAPATI D/533481581169/UPI",
    //             "Chq/Ref. No.": "UPI-533492979483",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "50,000.00",
    //             "Balance": "3,53,965.20",
    //             "tempId": "9eceb98c-98e4-453a-ac36-ac1feae12de3"
    //         },
    //         {
    //             "#": "719",
    //             "Date": "30 Nov 2025",
    //             "Description": "UPI/SUPRATIM AUDDY/533458678452/UPI",
    //             "Chq/Ref. No.": "UPI-533493397073",
    //             "Withdrawal (Dr.)": "163.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,53,802.20",
    //             "tempId": "807c2d3f-2cd4-485f-b7a2-0dbbb14d0fa5"
    //         },
    //         {
    //             "#": "720",
    //             "Date": "02 Dec 2025",
    //             "Description": "UPI/PharmEasy/570209078296/UPI",
    //             "Chq/Ref. No.": "UPI-533696097264",
    //             "Withdrawal (Dr.)": "3,108.29",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,50,693.91",
    //             "tempId": "49ea2ccc-6dfc-4016-b700-610e22b98bad"
    //         },
    //         {
    //             "#": "721",
    //             "Date": "02 Dec 2025",
    //             "Description": "UPI/RUNU SENAPATI/570204589302/UPI",
    //             "Chq/Ref. No.": "UPI-533696107907",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "3,108.00",
    //             "Balance": "3,53,801.91",
    //             "tempId": "49efd597-b6d0-4ffa-8352-ae53828a57e6"
    //         },
    //         {
    //             "#": "722",
    //             "Date": "05 Dec 2025",
    //             "Description": "UPI/NEPAL KUMAR NAN/533902006103/UPI",
    //             "Chq/Ref. No.": "UPI-533966241455",
    //             "Withdrawal (Dr.)": "110.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,53,691.91",
    //             "tempId": "bf8ebf65-f2b3-4cf2-aa36-f1f8c9bd5cf0"
    //         },
    //         {
    //             "#": "723",
    //             "Date": "05 Dec 2025",
    //             "Description": "UPI/Compass India F/533995510534/UPI",
    //             "Chq/Ref. No.": "UPI-533982488093",
    //             "Withdrawal (Dr.)": "43.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,53,648.91",
    //             "tempId": "b239cee1-0c71-4d48-a39e-665b170af21d"
    //         },
    //         {
    //             "#": "724",
    //             "Date": "05 Dec 2025",
    //             "Description": "UPI/Slent vv00004/533929141734/UPI",
    //             "Chq/Ref. No.": "UPI-533996807768",
    //             "Withdrawal (Dr.)": "40.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,53,608.91",
    //             "tempId": "958605c1-ade5-4ef3-8911-c699a63b7f32"
    //         },
    //         {
    //             "#": "725",
    //             "Date": "05 Dec 2025",
    //             "Description": "UPI/Md Nowrez Khan/533903350925/UPI",
    //             "Chq/Ref. No.": "UPI-533906272790",
    //             "Withdrawal (Dr.)": "90.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,53,518.91",
    //             "tempId": "7a8f98c9-fe83-4a9b-96c6-d85ac8c37e96"
    //         },
    //         {
    //             "#": "726",
    //             "Date": "06 Dec 2025",
    //             "Description": "UPI/MAHADWIP  MONDA/570603305557/UPI",
    //             "Chq/Ref. No.": "UPI-534047640085",
    //             "Withdrawal (Dr.)": "50,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "3,03,518.91",
    //             "tempId": "cc13699a-05ac-4e84-96aa-0ec419f89219"
    //         },
    //         {
    //             "#": "727",
    //             "Date": "07 Dec 2025",
    //             "Description": "UPI/SENAPATI D/570720075169/UPI",
    //             "Chq/Ref. No.": "UPI-534194533911",
    //             "Withdrawal (Dr.)": "50,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,53,518.91",
    //             "tempId": "133ef548-778c-486c-abbf-b0a8be416fe1"
    //         },
    //         {
    //             "#": "728",
    //             "Date": "07 Dec 2025",
    //             "Description": "UPI/Indian Clearing/108709739438/Indian Clearing",
    //             "Chq/Ref. No.": "UPI-534197355445",
    //             "Withdrawal (Dr.)": "4,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,49,518.91",
    //             "tempId": "acc84473-61df-42fa-895c-32991f19c864"
    //         },
    //         {
    //             "#": "729",
    //             "Date": "07 Dec 2025",
    //             "Description": "UPI/Indian Clearing/108709742344/Indian Clearing",
    //             "Chq/Ref. No.": "UPI-534197362738",
    //             "Withdrawal (Dr.)": "2,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,47,518.91",
    //             "tempId": "c4358558-a21e-4272-b047-743f97b1281f"
    //         },
    //         {
    //             "#": "730",
    //             "Date": "07 Dec 2025",
    //             "Description": "UPI/Indian Clearing/108709742433/Indian Clearing",
    //             "Chq/Ref. No.": "UPI-534197362883",
    //             "Withdrawal (Dr.)": "4,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,43,518.91",
    //             "tempId": "d8e1c85c-ea1f-4241-832c-d360b91c6c22"
    //         },
    //         {
    //             "#": "731",
    //             "Date": "07 Dec 2025",
    //             "Description": "UPI/RUNU SENAPATI/534197313382/UPI",
    //             "Chq/Ref. No.": "UPI-534116747602",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "112.00",
    //             "Balance": "2,43,630.91",
    //             "tempId": "a608d381-5c50-436e-8b04-bcac3dccd1b4"
    //         },
    //         {
    //             "#": "732",
    //             "Date": "07 Dec 2025",
    //             "Description": "UPI/Arpita  Sarkar/534100780045/UPI",
    //             "Chq/Ref. No.": "UPI-534157585453",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "240.00",
    //             "Balance": "2,43,870.91",
    //             "tempId": "a8f72eea-3b2c-4d97-8a07-a67180d0efb3"
    //         },
    //         {
    //             "#": "733",
    //             "Date": "08 Dec 2025",
    //             "Description": "NEFT SBIN425342059484 ITDTAX REFUND 2025 26 GMIPS",
    //             "Chq/Ref. No.": "NEFTINW-1420907276",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "56,060.00",
    //             "Balance": "2,99,930.91",
    //             "tempId": "ebc2cc7f-16a6-4f03-97f9-e46e41ef9498"
    //         },
    //         {
    //             "#": "Statement Generated on 17 Mar 2026, 18:41",
    //             "Date": "08 Dec 2025",
    //             "Description": "UPI/Google India Di/534290166244/remarks",
    //             "Chq/Ref. No.": "UPI-534294202833",
    //             "Withdrawal (Dr.)": "730.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,99,200.91 Page 18 of  22",
    //             "tempId": "4f749772-2dad-4212-bdc7-e09ac2871767"
    //         },
    //         {
    //             "#": "734",
    //             "Date": "",
    //             "Description": "",
    //             "Chq/Ref. No.": "",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "",
    //             "Balance": "",
    //             "tempId": "cb45a1b5-993f-4e85-a90f-c3a6920deb3a"
    //         },
    //         {
    //             "#": "735",
    //             "Date": "08 Dec 2025",
    //             "Description": "UPI/DIBYENDU MUKHER/570883745418/UPI",
    //             "Chq/Ref. No.": "UPI-534224263879",
    //             "Withdrawal (Dr.)": "14,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,85,200.91",
    //             "tempId": "ff049043-cd17-45f1-a947-504f14aa07b1"
    //         },
    //         {
    //             "#": "736",
    //             "Date": "08 Dec 2025",
    //             "Description": "UPI/SOMNATH  KUNDU/570885242867/UPI",
    //             "Chq/Ref. No.": "UPI-534228325934",
    //             "Withdrawal (Dr.)": "90.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,85,110.91",
    //             "tempId": "6c980921-9a38-4645-8aa0-477297180344"
    //         },
    //         {
    //             "#": "737",
    //             "Date": "08 Dec 2025",
    //             "Description": "UPI/RUNU SENAPATI/115342270381/UPI",
    //             "Chq/Ref. No.": "UPI-534234577589",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "730.00",
    //             "Balance": "2,85,840.91",
    //             "tempId": "5d2b7104-b4b3-44fb-981e-1d595c2807be"
    //         },
    //         {
    //             "#": "738",
    //             "Date": "09 Dec 2025",
    //             "Description": "UPI/RIK  SINGHA/570974261387/UPI",
    //             "Chq/Ref. No.": "UPI-534340343959",
    //             "Withdrawal (Dr.)": "2,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,83,840.91",
    //             "tempId": "52437f6b-26ec-42bf-b42b-865bc869da7d"
    //         },
    //         {
    //             "#": "739",
    //             "Date": "09 Dec 2025",
    //             "Description": "UPI/CELEBRATION/570908472503/UPI",
    //             "Chq/Ref. No.": "UPI-534354030257",
    //             "Withdrawal (Dr.)": "396.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,83,444.91",
    //             "tempId": "49d45650-d664-4732-bff5-6c3d4c378e95"
    //         },
    //         {
    //             "#": "740",
    //             "Date": "09 Dec 2025",
    //             "Description": "UPI/Cakermon/534310454176/UPI",
    //             "Chq/Ref. No.": "UPI-534306204225",
    //             "Withdrawal (Dr.)": "44.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,83,400.91",
    //             "tempId": "11a8350e-cd65-48ed-b30d-db9cd33fa6be"
    //         },
    //         {
    //             "#": "741",
    //             "Date": "10 Dec 2025",
    //             "Description": "ATL/0024/622018/SBI HATIBAGAN ONSITE A101225/10:48",
    //             "Chq/Ref. No.": "534410020440",
    //             "Withdrawal (Dr.)": "10,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,73,400.91",
    //             "tempId": "24d2cc81-9347-4383-ba1c-ce53db462200"
    //         },
    //         {
    //             "#": "742",
    //             "Date": "10 Dec 2025",
    //             "Description": "ATL/0024/622018/SBI HATIBAGAN ONSITE A101225/10:49",
    //             "Chq/Ref. No.": "534410004197",
    //             "Withdrawal (Dr.)": "10,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,63,400.91",
    //             "tempId": "8aa19a7f-9121-4e24-98af-b064b7e5483d"
    //         },
    //         {
    //             "#": "743",
    //             "Date": "10 Dec 2025",
    //             "Description": "ATL/0024/622018/SBI HATIBAGAN ONSITE A101225/10:51",
    //             "Chq/Ref. No.": "534410018469",
    //             "Withdrawal (Dr.)": "3,500.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,59,900.91",
    //             "tempId": "b09bd766-e5cc-46dc-843b-023e3cb0015e"
    //         },
    //         {
    //             "#": "744",
    //             "Date": "12 Dec 2025",
    //             "Description": "UPI/SENAPATI D/571248142990/UPI",
    //             "Chq/Ref. No.": "UPI-534614881708",
    //             "Withdrawal (Dr.)": "200.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,59,700.91",
    //             "tempId": "9901c99d-1fc4-41d5-b12c-206603f330d9"
    //         },
    //         {
    //             "#": "745",
    //             "Date": "12 Dec 2025",
    //             "Description": "UPI/RUNU SENAPATI/115533093001/UPI",
    //             "Chq/Ref. No.": "UPI-534614764883",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "200.00",
    //             "Balance": "2,59,900.91",
    //             "tempId": "ba2c14cd-60e0-4c37-b96f-321ae0161c0d"
    //         },
    //         {
    //             "#": "746",
    //             "Date": "13 Dec 2025",
    //             "Description": "UPI/SENAPATI D/725653131064/Payment from Ph",
    //             "Chq/Ref. No.": "UPI-534735769949",
    //             "Withdrawal (Dr.)": "1.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,59,899.91",
    //             "tempId": "afdb4bc0-74ea-45a4-a7b7-f2892a8896da"
    //         },
    //         {
    //             "#": "747",
    //             "Date": "13 Dec 2025",
    //             "Description": "UPI/Ms TITAS SENAPA/114161345138/Payment from Ph",
    //             "Chq/Ref. No.": "UPI-534751175349",
    //             "Withdrawal (Dr.)": "1.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,59,898.91",
    //             "tempId": "a252a8e8-45bb-497f-9887-3e1ba3dddb76"
    //         },
    //         {
    //             "#": "748",
    //             "Date": "13 Dec 2025",
    //             "Description": "UPI/BIDYUT PRATISTH/571312061698/UPI",
    //             "Chq/Ref. No.": "UPI-534757370753",
    //             "Withdrawal (Dr.)": "80.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,59,818.91",
    //             "tempId": "04e6ed3a-187d-4c9b-a97f-e8aed8a8359c"
    //         },
    //         {
    //             "#": "749",
    //             "Date": "13 Dec 2025",
    //             "Description": "UPI/ANIL SHARMA/571339475464/UPI",
    //             "Chq/Ref. No.": "UPI-534759391053",
    //             "Withdrawal (Dr.)": "60.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,59,758.91",
    //             "tempId": "a5a719c9-683b-4b5e-940c-ab330e5f6f68"
    //         },
    //         {
    //             "#": "750",
    //             "Date": "13 Dec 2025",
    //             "Description": "UPI/DADARHOTEL/571355789376/UPI",
    //             "Chq/Ref. No.": "UPI-534760157330",
    //             "Withdrawal (Dr.)": "70.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,59,688.91",
    //             "tempId": "4f3e018f-b735-4953-a061-ab375df9126b"
    //         },
    //         {
    //             "#": "751",
    //             "Date": "13 Dec 2025",
    //             "Description": "UPI/RUNU SENAPATI/115564101495/UPI",
    //             "Chq/Ref. No.": "UPI-534760659557",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "50.00",
    //             "Balance": "2,59,738.91",
    //             "tempId": "6db03bd5-b946-4ac0-b151-72df95b5a1c2"
    //         },
    //         {
    //             "#": "752",
    //             "Date": "13 Dec 2025",
    //             "Description": "UPI/Sourav Majumder/534760819494/UPI",
    //             "Chq/Ref. No.": "UPI-534782585100",
    //             "Withdrawal (Dr.)": "20.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,59,718.91",
    //             "tempId": "567c55c0-3106-422a-8491-74ae0df30634"
    //         },
    //         {
    //             "#": "753",
    //             "Date": "14 Dec 2025",
    //             "Description": "UPI/Amazon India/534874859435/You are paying",
    //             "Chq/Ref. No.": "UPI-534819022429",
    //             "Withdrawal (Dr.)": "928.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,58,790.91",
    //             "tempId": "33a1b1a5-8a27-4a28-8368-3ff0856b6fb8"
    //         },
    //         {
    //             "#": "754",
    //             "Date": "14 Dec 2025",
    //             "Description": "UPI/RUNU SENAPATI/534820271043/UPI",
    //             "Chq/Ref. No.": "UPI-534819060100",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "928.00",
    //             "Balance": "2,59,718.91",
    //             "tempId": "fe0cd280-8d92-4417-9e70-3f2446e1099d"
    //         },
    //         {
    //             "#": "755",
    //             "Date": "14 Dec 2025",
    //             "Description": "UPI/JB HATIBAGAN/534831768837/UPI",
    //             "Chq/Ref. No.": "UPI-534820310006",
    //             "Withdrawal (Dr.)": "39.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,59,679.91",
    //             "tempId": "567d76f3-ce93-4210-bb10-2d0512ae89f6"
    //         },
    //         {
    //             "#": "756",
    //             "Date": "14 Dec 2025",
    //             "Description": "UPI/RUNU SENAPATI/115638777935/UPI",
    //             "Chq/Ref. No.": "UPI-534863471549",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "267.00",
    //             "Balance": "2,59,946.91",
    //             "tempId": "b8d7d3e7-00ac-41b7-924a-ae56c65dadd5"
    //         },
    //         {
    //             "#": "757",
    //             "Date": "15 Dec 2025",
    //             "Description": "UPI/SENCO GOLD LIMI/571575748067/UPI",
    //             "Chq/Ref. No.": "UPI-534988748961",
    //             "Withdrawal (Dr.)": "5,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,54,946.91",
    //             "tempId": "d9ffce4b-e0db-445b-854a-e7dcc98c7198"
    //         },
    //         {
    //             "#": "758",
    //             "Date": "15 Dec 2025",
    //             "Description": "UPI/RUNU SENAPATI/571543749006/UPI",
    //             "Chq/Ref. No.": "UPI-534988792796",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "5,000.00",
    //             "Balance": "2,59,946.91",
    //             "tempId": "7811e830-2d93-4c5c-bc22-b98c13ba305f"
    //         },
    //         {
    //             "#": "759",
    //             "Date": "15 Dec 2025",
    //             "Description": "UPI/Amazon India/534930418927/You are paying",
    //             "Chq/Ref. No.": "UPI-534948326021",
    //             "Withdrawal (Dr.)": "229.42",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,59,717.49",
    //             "tempId": "dded0bf5-b6b6-47e2-9289-edb9e0814b24"
    //         },
    //         {
    //             "#": "760",
    //             "Date": "15 Dec 2025",
    //             "Description": "UPI/RUNU SENAPATI/534979522422/UPI",
    //             "Chq/Ref. No.": "UPI-534948450228",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "229.00",
    //             "Balance": "2,59,946.49",
    //             "tempId": "baf22a2c-b5ed-4ddc-b050-70dc1695ab13"
    //         },
    //         {
    //             "#": "761",
    //             "Date": "16 Dec 2025",
    //             "Description": "UPI/KOLKATA METRO R/535087194966/MOPSUPITxn",
    //             "Chq/Ref. No.": "UPI-535099951457",
    //             "Withdrawal (Dr.)": "100.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,59,846.49",
    //             "tempId": "f2c8e1e7-9215-4bf3-83b7-ad6451346ec2"
    //         },
    //         {
    //             "#": "762",
    //             "Date": "18 Dec 2025",
    //             "Description": "UPI/ABHIJIT ROY/571814808148/UPI",
    //             "Chq/Ref. No.": "UPI-535256884566",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "100.00",
    //             "Balance": "2,59,946.49",
    //             "tempId": "aa1a5b6b-d395-415a-b9b3-8c1ed0c7453b"
    //         },
    //         {
    //             "#": "763",
    //             "Date": "19 Dec 2025",
    //             "Description": "UPI/Jio Prepaid Rec/571916219642/UPI",
    //             "Chq/Ref. No.": "UPI-535361133052",
    //             "Withdrawal (Dr.)": "629.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,59,317.49",
    //             "tempId": "5b9191ab-7508-4906-a74b-e37a0a9ac649"
    //         },
    //         {
    //             "#": "764",
    //             "Date": "19 Dec 2025",
    //             "Description": "UPI/SENAPATI D/571928216475/UPI",
    //             "Chq/Ref. No.": "UPI-535361142454",
    //             "Withdrawal (Dr.)": "100.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,59,217.49",
    //             "tempId": "5b84f506-8dec-4032-81da-e518ae7b294b"
    //         },
    //         {
    //             "#": "765",
    //             "Date": "19 Dec 2025",
    //             "Description": "UPI/Ms TITAS SENAPA/571987050845/UPI",
    //             "Chq/Ref. No.": "UPI-535384151116",
    //             "Withdrawal (Dr.)": "15,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,44,217.49",
    //             "tempId": "82ea884c-aa9e-43d3-b5f5-b396ce38857e"
    //         },
    //         {
    //             "#": "766",
    //             "Date": "19 Dec 2025",
    //             "Description": "UPI/APURBA PHARMACY/571918379205/UPI",
    //             "Chq/Ref. No.": "UPI-535302150839",
    //             "Withdrawal (Dr.)": "188.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,44,029.49",
    //             "tempId": "17781d58-760b-4496-970e-ee63ce8fbd31"
    //         },
    //         {
    //             "#": "767",
    //             "Date": "19 Dec 2025",
    //             "Description": "UPI/Blinkit/535375215528/UPIIntent",
    //             "Chq/Ref. No.": "UPI-535328947128",
    //             "Withdrawal (Dr.)": "155.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,43,874.49",
    //             "tempId": "8c2562a4-ae9f-451d-aa3c-59a281ec4fee"
    //         },
    //         {
    //             "#": "768",
    //             "Date": "19 Dec 2025",
    //             "Description": "UPI/RUNU SENAPATI/115895338643/UPI",
    //             "Chq/Ref. No.": "UPI-535328975608",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "100.00",
    //             "Balance": "2,43,974.49",
    //             "tempId": "9b110a8a-33cd-4c32-9b73-c26e564c4577"
    //         },
    //         {
    //             "#": "769",
    //             "Date": "20 Dec 2025",
    //             "Description": "UPI/VODAFONE IDEA L/535440656966/UPI",
    //             "Chq/Ref. No.": "UPI-535453368421",
    //             "Withdrawal (Dr.)": "139.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,43,835.49",
    //             "tempId": "8b3ded36-d6a0-44d8-b575-8877fac2e35b"
    //         },
    //         {
    //             "#": "770",
    //             "Date": "21 Dec 2025",
    //             "Description": "UPI/Haldiram Chowri/572152465525/UPI",
    //             "Chq/Ref. No.": "UPI-535549671515",
    //             "Withdrawal (Dr.)": "266.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,43,569.49",
    //             "tempId": "3afbcfb0-f0fa-4593-b930-69fe794df083"
    //         },
    //         {
    //             "#": "771",
    //             "Date": "21 Dec 2025",
    //             "Description": "UPI/Zomatofood/572133767724/UPIIntent",
    //             "Chq/Ref. No.": "UPI-535554564351",
    //             "Withdrawal (Dr.)": "167.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,43,402.49",
    //             "tempId": "0ae54586-c25a-448c-ba72-feb07529e04b"
    //         },
    //         {
    //             "#": "772",
    //             "Date": "21 Dec 2025",
    //             "Description": "UPI/ZOMATO LIMITED/572107781046/Zomato Payment",
    //             "Chq/Ref. No.": "UPI-535559334560",
    //             "Withdrawal (Dr.)": "1,234.50",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,42,167.99",
    //             "tempId": "d58b562e-e390-458b-b0c3-ceff6e81eef1"
    //         },
    //         {
    //             "#": "773",
    //             "Date": "21 Dec 2025",
    //             "Description": "UPI/Arpita  Sarkar/572117093490/UPI",
    //             "Chq/Ref. No.": "UPI-535565275721",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "550.00",
    //             "Balance": "2,42,717.99",
    //             "tempId": "89529df6-5a0a-4b7b-99b8-be710f04d3ba"
    //         },
    //         {
    //             "#": "774",
    //             "Date": "22 Dec 2025",
    //             "Description": "UPI/RISHI RAJ DAS/572234698513/UPI",
    //             "Chq/Ref. No.": "UPI-535684609046",
    //             "Withdrawal (Dr.)": "100.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,42,617.99",
    //             "tempId": "820c9c86-b9bc-4560-bc9f-a0c6f884224c"
    //         },
    //         {
    //             "#": "775",
    //             "Date": "22 Dec 2025",
    //             "Description": "UPI/Compass India F/535617528570/UPI",
    //             "Chq/Ref. No.": "UPI-535692230051",
    //             "Withdrawal (Dr.)": "162.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,42,455.99",
    //             "tempId": "d9367b72-2806-4530-a524-d48f0e86adfc"
    //         },
    //         {
    //             "#": "776",
    //             "Date": "22 Dec 2025",
    //             "Description": "UPI/Mr  BISWARUP  P/535635764722/UPI",
    //             "Chq/Ref. No.": "UPI-535625335580",
    //             "Withdrawal (Dr.)": "100.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,42,355.99",
    //             "tempId": "03f48a54-26b4-4312-9d23-14b9e10acbb3"
    //         },
    //         {
    //             "#": "777",
    //             "Date": "22 Dec 2025",
    //             "Description": "UPI/ZEPTO MARKETPLA/535622078215/UPI",
    //             "Chq/Ref. No.": "UPI-535636757373",
    //             "Withdrawal (Dr.)": "152.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,42,203.99",
    //             "tempId": "9f4d3a70-7b30-446b-b22f-c1dbdefa8e2f"
    //         },
    //         {
    //             "#": "Statement Generated on 17 Mar 2026, 18:41",
    //             "Date": "23 Dec 2025",
    //             "Description": "PCD/3224/GOOGLEPLAY/MUMBAI231225/10:1",
    //             "Chq/Ref. No.": "535704477645",
    //             "Withdrawal (Dr.)": "149.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,42,054.99 Page 19 of  22",
    //             "tempId": "b33f7806-b7ec-4e7f-ba36-92db4be6f6ce"
    //         },
    //         {
    //             "#": "778",
    //             "Date": "5",
    //             "Description": "",
    //             "Chq/Ref. No.": "",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "",
    //             "Balance": "",
    //             "tempId": "b15983dc-3d86-4567-a2a0-2e741be53247"
    //         },
    //         {
    //             "#": "779",
    //             "Date": "23 Dec 2025",
    //             "Description": "UPI/DADARHOTEL/572391417348/UPI",
    //             "Chq/Ref. No.": "UPI-535764245735",
    //             "Withdrawal (Dr.)": "150.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,41,904.99",
    //             "tempId": "ec302571-5eff-4b10-aad4-ae555f85197f"
    //         },
    //         {
    //             "#": "780",
    //             "Date": "23 Dec 2025",
    //             "Description": "UPI/UTS- direct/572307245930/UPI",
    //             "Chq/Ref. No.": "UPI-535782032888",
    //             "Withdrawal (Dr.)": "10.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,41,894.99",
    //             "tempId": "fd8df656-28ea-420c-b956-e673355cec39"
    //         },
    //         {
    //             "#": "781",
    //             "Date": "23 Dec 2025",
    //             "Description": "UPI/ZOMATO/572301467990/UPI",
    //             "Chq/Ref. No.": "UPI-535701939433",
    //             "Withdrawal (Dr.)": "340.25",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,41,554.74",
    //             "tempId": "d7b148f1-463c-48e5-8087-d3233956494b"
    //         },
    //         {
    //             "#": "782",
    //             "Date": "23 Dec 2025",
    //             "Description": "UPI/ABHIJIT ROY/572366868523/UPI",
    //             "Chq/Ref. No.": "UPI-535706785369",
    //             "Withdrawal (Dr.)": "397.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,41,157.74",
    //             "tempId": "0c25bdc4-215b-4d1a-991a-7b071d43d97e"
    //         },
    //         {
    //             "#": "783",
    //             "Date": "24 Dec 2025",
    //             "Description": "UPI/MUNMUN SADHUKHA/572412576489/UPI",
    //             "Chq/Ref. No.": "UPI-535808938291",
    //             "Withdrawal (Dr.)": "50.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,41,107.74",
    //             "tempId": "af7b19e3-cd46-41b6-af8d-b35cff14db5e"
    //         },
    //         {
    //             "#": "784",
    //             "Date": "24 Dec 2025",
    //             "Description": "UPI/Amazon India/535840552640/Request from Am",
    //             "Chq/Ref. No.": "UPI-535827330011",
    //             "Withdrawal (Dr.)": "700.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,40,407.74",
    //             "tempId": "002dc427-3853-4bec-8558-6ae307cdff15"
    //         },
    //         {
    //             "#": "785",
    //             "Date": "24 Dec 2025",
    //             "Description": "UPI/ABHIJIT ROY/572435916463/auto fare",
    //             "Chq/Ref. No.": "UPI-535834887087",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "30.00",
    //             "Balance": "2,40,437.74",
    //             "tempId": "8e518c8d-2b92-4673-bc02-93332ca8d44a"
    //         },
    //         {
    //             "#": "786",
    //             "Date": "24 Dec 2025",
    //             "Description": "UPI/AVISHEK SAHA/535897251065/UPI",
    //             "Chq/Ref. No.": "UPI-535869789288",
    //             "Withdrawal (Dr.)": "110.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,40,327.74",
    //             "tempId": "c9d293a9-5089-45e2-b87e-3b3db69b4d66"
    //         },
    //         {
    //             "#": "787",
    //             "Date": "25 Dec 2025",
    //             "Description": "UPI/ANIL SHARMA/535975090654/UPI",
    //             "Chq/Ref. No.": "UPI-535904746957",
    //             "Withdrawal (Dr.)": "60.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,40,267.74",
    //             "tempId": "7811bc05-fec0-48ac-8bae-9a4c87cb8a96"
    //         },
    //         {
    //             "#": "788",
    //             "Date": "25 Dec 2025",
    //             "Description": "UPI/KLIKKTECHNOLOGI/535915281640/MAND ATE",
    //             "Chq/Ref. No.": "UPI-535912770635",
    //             "Withdrawal (Dr.)": "99.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,40,168.74",
    //             "tempId": "ec64a7f0-c8ad-4079-bc02-97caac07ba02"
    //         },
    //         {
    //             "#": "789",
    //             "Date": "26 Dec 2025",
    //             "Description": "UPI/RUNU SENAPATI/116204706767/UPI",
    //             "Chq/Ref. No.": "UPI-536071931151",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "500.00",
    //             "Balance": "2,40,668.74",
    //             "tempId": "9e0e7c7c-a5b1-4d70-8b7d-ada290018d81"
    //         },
    //         {
    //             "#": "790",
    //             "Date": "27 Dec 2025",
    //             "Description": "UPI/DADARHOTEL/536118663908/UPI",
    //             "Chq/Ref. No.": "UPI-536136745313",
    //             "Withdrawal (Dr.)": "120.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,40,548.74",
    //             "tempId": "543785ee-143b-47bf-9222-fe16f8acde5b"
    //         },
    //         {
    //             "#": "791",
    //             "Date": "28 Dec 2025",
    //             "Description": "NACH-10-DR-LIC OF INDIA-4777103461225",
    //             "Chq/Ref. No.": "NACHDB281225120959 00",
    //             "Withdrawal (Dr.)": "1,136.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,39,412.74",
    //             "tempId": "a98cc7e4-5d31-4274-a5e5-91a1ccf3ad51"
    //         },
    //         {
    //             "#": "792",
    //             "Date": "28 Dec 2025",
    //             "Description": "NACH-10-DR-LIC OF INDIA-4321413421225",
    //             "Chq/Ref. No.": "NACHDB281225120959 00",
    //             "Withdrawal (Dr.)": "4,040.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,35,372.74",
    //             "tempId": "3f6ff2f3-2529-4d9a-b22f-1450a1bd4440"
    //         },
    //         {
    //             "#": "793",
    //             "Date": "28 Dec 2025",
    //             "Description": "NACH-10-DR-LIC OF INDIA-4777103471225",
    //             "Chq/Ref. No.": "NACHDB281225120959 00",
    //             "Withdrawal (Dr.)": "1,136.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,34,236.74",
    //             "tempId": "a82c9b9e-9e41-4fd3-b7cc-f46af0a36239"
    //         },
    //         {
    //             "#": "794",
    //             "Date": "28 Dec 2025",
    //             "Description": "UPI/Amazon India/536242276341/Request from Am",
    //             "Chq/Ref. No.": "UPI-536210868687",
    //             "Withdrawal (Dr.)": "280.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,33,956.74",
    //             "tempId": "1c6cf839-57ec-444d-bd32-53cd12a8a10b"
    //         },
    //         {
    //             "#": "795",
    //             "Date": "28 Dec 2025",
    //             "Description": "UPI/VISHA WORLD/572812763491/VISHAWORLD",
    //             "Chq/Ref. No.": "UPI-536212207160",
    //             "Withdrawal (Dr.)": "150.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,33,806.74",
    //             "tempId": "c5969a2a-2fd0-4f63-a37c-fb5b1d47fab6"
    //         },
    //         {
    //             "#": "796",
    //             "Date": "28 Dec 2025",
    //             "Description": "UPI/Google Play/239976393625/MandateExecute",
    //             "Chq/Ref. No.": "UPI-536225965594",
    //             "Withdrawal (Dr.)": "99.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,33,707.74",
    //             "tempId": "e71a98a6-fbe3-40ea-a935-227a564119bb"
    //         },
    //         {
    //             "#": "797",
    //             "Date": "28 Dec 2025",
    //             "Description": "UPI/ZOMATO LIMITED/536219107216/Zomato Payment",
    //             "Chq/Ref. No.": "UPI-536241575583",
    //             "Withdrawal (Dr.)": "574.40",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,33,133.34",
    //             "tempId": "c2bf40e7-6a5a-475f-b387-181aee523e50"
    //         },
    //         {
    //             "#": "798",
    //             "Date": "29 Dec 2025",
    //             "Description": "Chrg: DCC Fee for 0024 ECOM txn on 25-Nov- 2025",
    //             "Chq/Ref. No.": "TBMS-1856080252",
    //             "Withdrawal (Dr.)": "0.89",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,33,132.45",
    //             "tempId": "63dc96b1-c80d-4b29-88d0-5abcd78d94d2"
    //         },
    //         {
    //             "#": "799",
    //             "Date": "29 Dec 2025",
    //             "Description": "PCD/0024/GODADDY INDIA DOMAIN/02267425291225/20:33",
    //             "Chq/Ref. No.": "536315816111",
    //             "Withdrawal (Dr.)": "552.24",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,32,580.21",
    //             "tempId": "b9532019-4a51-4b9a-b604-1c45066eb105"
    //         },
    //         {
    //             "#": "800",
    //             "Date": "29 Dec 2025",
    //             "Description": "UPI/SAYAN SARKAR/572976527586/UPI",
    //             "Chq/Ref. No.": "UPI-536319525353",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "552.00",
    //             "Balance": "2,33,132.21",
    //             "tempId": "65ba16d6-3549-4f8c-8677-6712c17b0bd5"
    //         },
    //         {
    //             "#": "801",
    //             "Date": "30 Dec 2025",
    //             "Description": "UPI/Amazon India/536443251792/Request from Am",
    //             "Chq/Ref. No.": "UPI-536479694438",
    //             "Withdrawal (Dr.)": "280.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,32,852.21",
    //             "tempId": "2e5a042f-f0d3-443a-a2e1-4d36a09227da"
    //         },
    //         {
    //             "#": "802",
    //             "Date": "31 Dec 2025",
    //             "Description": "UPI/D K GHOSH   CO/536540116969/UPI",
    //             "Chq/Ref. No.": "UPI-536506641755",
    //             "Withdrawal (Dr.)": "40.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,32,812.21",
    //             "tempId": "237174bb-f617-46ad-9699-a958cee76d02"
    //         },
    //         {
    //             "#": "803",
    //             "Date": "31 Dec 2025",
    //             "Description": "UPI/Mr Nakul  Aich/536509310120/UPI",
    //             "Chq/Ref. No.": "UPI-536506724239",
    //             "Withdrawal (Dr.)": "40.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,32,772.21",
    //             "tempId": "85b636ad-4d71-4928-9d76-078268f9ac46"
    //         },
    //         {
    //             "#": "804",
    //             "Date": "31 Dec 2025",
    //             "Description": "ATL/0024/622018/SBI HATIBAGAN ONSITE A311225/11:29",
    //             "Chq/Ref. No.": "536511024360",
    //             "Withdrawal (Dr.)": "10,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,22,772.21",
    //             "tempId": "86e49053-2fd5-440b-8410-b2b294bc2b3e"
    //         },
    //         {
    //             "#": "805",
    //             "Date": "31 Dec 2025",
    //             "Description": "ATL/0024/622018/SBI HATIBAGAN ONSITE A311225/11:30",
    //             "Chq/Ref. No.": "536511028670",
    //             "Withdrawal (Dr.)": "2,000.00",
    //             "Deposit (Cr.)": "",
    //             "Balance": "2,20,772.21",
    //             "tempId": "cb9fc417-0ca6-460d-ba48-2f3111255476"
    //         },
    //         {
    //             "#": "806",
    //             "Date": "31 Dec 2025",
    //             "Description": "Recd:IMPS/536512718917/RUNUSENAPA/KKB K/X5626/Trans",
    //             "Chq/Ref. No.": "IMPS-536512365076",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "5,000.00",
    //             "Balance": "2,25,772.21",
    //             "tempId": "eb54adc2-31b7-4eea-8fe2-bc4b1d44bd42"
    //         },
    //         {
    //             "#": "807",
    //             "Date": "31 Dec 2025",
    //             "Description": "UPI/DRIPTA SENAPATI/536582039146/UPI",
    //             "Chq/Ref. No.": "UPI-536520254857",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "12,000.00",
    //             "Balance": "2,37,772.21",
    //             "tempId": "1ccb44bc-ac33-418b-8633-15de92a35ffb"
    //         },
    //         {
    //             "#": "808",
    //             "Date": "31 Dec 2025",
    //             "Description": "UPI/SENAPATI D/536514439917/UPI",
    //             "Chq/Ref. No.": "UPI-536520370349",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "50,000.00",
    //             "Balance": "2,87,772.21",
    //             "tempId": "cb3d3d7f-3fbc-41ce-9bbf-2d7eed7db4b7"
    //         },
    //         {
    //             "#": "809",
    //             "Date": "31 Dec 2025",
    //             "Description": "Recd:IMPS/536514719691/RUNUSENAPA/KKB K/X5626/Trans",
    //             "Chq/Ref. No.": "IMPS-536514503441",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "45,000.00",
    //             "Balance": "3,32,772.21",
    //             "tempId": "5f3e28e2-a035-4956-b36b-761d2f7f75f2"
    //         },
    //         {
    //             "#": "Statement Generated on 17 Mar 2026, 18:41",
    //             "Date": "31 Dec 2025",
    //             "Description": "Int.Pd:4613421825:01-10-2025 to 31-12-2025",
    //             "Chq/Ref. No.": "",
    //             "Withdrawal (Dr.)": "",
    //             "Deposit (Cr.)": "2,826.00",
    //             "Balance": "3,35,598.21 Page 20 of  22",
    //             "tempId": "0cf21bd0-bb22-4645-8df0-662d638a7522"
    //         }
    //     ]
    // }
}

export { pdfExtractorToolNode };