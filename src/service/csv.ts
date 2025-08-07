import Papa from "papaparse";
import { SentenceCard } from "../types/Cards";

export function createCSV(sentences: SentenceCard[]): string {
    // Create CSV data
    const csvRows = [
      ["Sentence", "Reading", "Meaning"],
      ...sentences.map((s) => [s.text, s.reading, s.meaning]),
    ];

    const csv = Papa.unparse(csvRows);

    // Add BOM to the CSV string
    const csvWithBOM = "\ufeff" + csv + "\n";

    return csvWithBOM;
}