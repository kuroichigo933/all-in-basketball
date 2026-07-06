// Append rows to a Google Sheet using the same service account as the drill
// library. Requires: the Google Sheets API enabled in the GCP project, and the
// target sheet shared with GOOGLE_SERVICE_ACCOUNT_EMAIL as an Editor.

import { getAccessToken } from "@/lib/google-drive";

const SHEET_ID = process.env.FEEDBACK_SHEET_ID || "1L4mQwCwoPjJ-8FH21khY5S-Kvbjo80XO1ZC4Oh4xnY0";
const RANGE = process.env.FEEDBACK_SHEET_RANGE || "A1"; // append into the first sheet

export type FeedbackRow = {
  name: string;
  email: string;
  type: string; // "New Feature" | "Bug/Issue"
  message: string;
  status: string; // e.g. "New"
  submittedAt: string; // ISO timestamp
};

export async function appendFeedbackRow({ name, email, type, message, status, submittedAt }: FeedbackRow): Promise<void> {
  const token = await getAccessToken();
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(RANGE)}:append` +
    `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    // Column order: User Name | User Email | New Feature or Bug | Details | Status | Submitted At
    body: JSON.stringify({ values: [[name, email, type, message, status, submittedAt]] }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error(`[Sheets] appendFeedbackRow — HTTP ${res.status}:`, detail);
    throw new Error(`Sheets append failed: ${res.status}`);
  }
}
