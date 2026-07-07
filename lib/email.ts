// Transactional email via Gmail SMTP (Nodemailer).
//
// Required env vars:
//   GMAIL_USER            the Gmail address to send FROM / log in as
//   GMAIL_APP_PASSWORD    16-char Google App Password (needs 2FA on the account)
// Optional:
//   REVIEW_NOTIFY_TO      coach recipient (defaults to sanarshamdeen3@gmail.com)

import nodemailer from "nodemailer";

const COACH_FALLBACK = "sanarshamdeen3@gmail.com";

function getTransport() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error("Email not configured — set GMAIL_USER and GMAIL_APP_PASSWORD.");
  }
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export type ReviewEmailInput = {
  replyTo: string; // uploading user's email — coach replies go here
  playerName: string;
  ageGroup?: string | null;
  skillLevel?: string | null;
  focus: string; // e.g. "shooting form" or "Other: my float in traffic"
  notes: string;
  videoLink: string;
};

export async function sendReviewEmail(input: ReviewEmailInput): Promise<void> {
  const { replyTo, playerName, ageGroup, skillLevel, focus, notes, videoLink } = input;
  const from = process.env.GMAIL_USER!;
  const to = process.env.REVIEW_NOTIFY_TO || COACH_FALLBACK;

  const name = playerName?.trim() || "A player";
  const rows: [string, string][] = [
    ["Player", name],
    ["Reply to", replyTo],
    ["Age group", ageGroup || "—"],
    ["Skill level", skillLevel || "—"],
    ["Focus", focus],
    ["Notes", notes?.trim() || "—"],
  ];

  const rowsHtml = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#888;vertical-align:top;white-space:nowrap">${esc(
          k
        )}</td><td style="padding:4px 0;color:#111">${esc(v)}</td></tr>`
    )
    .join("");

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto">
    <h2 style="margin:0 0 4px">New film review from ${esc(name)}</h2>
    <p style="color:#666;margin:0 0 16px">A player submitted a clip for coaching.</p>
    <table style="border-collapse:collapse;font-size:14px;margin-bottom:20px">${rowsHtml}</table>
    <a href="${esc(videoLink)}"
       style="display:inline-block;background:#f5610a;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">
      ▶ Watch the film
    </a>
    <p style="color:#999;font-size:12px;margin-top:20px">
      Reply to this email to respond directly to ${esc(name)}.
    </p>
  </div>`;

  const text = [
    `New film review from ${name}`,
    ``,
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ``,
    `Watch the film: ${videoLink}`,
  ].join("\n");

  await getTransport().sendMail({
    from: `All-In Basketball <${from}>`,
    to,
    replyTo,
    subject: `New film review — ${name} (${focus})`,
    text,
    html,
  });
}

export type BookingEmailInput = {
  name: string;
  email: string; // person's email — used as reply-to so the coach can respond
  age: string;
  experience: string; // beginner | intermediate | advanced
  message?: string;
};

export async function sendBookingEmail(input: BookingEmailInput): Promise<void> {
  const { name, email, age, experience, message } = input;
  const from = process.env.GMAIL_USER!;
  const to = process.env.REVIEW_NOTIFY_TO || COACH_FALLBACK;

  const who = name?.trim() || "Someone";
  const rows: [string, string][] = [
    ["Name", who],
    ["Email", email],
    ["Age", age?.trim() || "—"],
    ["Experience", experience || "—"],
    ["Message", message?.trim() || "—"],
  ];

  const rowsHtml = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#888;vertical-align:top;white-space:nowrap">${esc(
          k
        )}</td><td style="padding:4px 0;color:#111">${esc(v)}</td></tr>`
    )
    .join("");

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto">
    <h2 style="margin:0 0 4px">In-person training request from ${esc(who)}</h2>
    <p style="color:#666;margin:0 0 16px">Someone wants to get in the gym.</p>
    <table style="border-collapse:collapse;font-size:14px;margin-bottom:20px">${rowsHtml}</table>
    <p style="color:#999;font-size:12px;margin-top:8px">
      Reply to this email to reach ${esc(who)} directly.
    </p>
  </div>`;

  const text = [
    `In-person training request from ${who}`,
    ``,
    ...rows.map(([k, v]) => `${k}: ${v}`),
  ].join("\n");

  await getTransport().sendMail({
    from: `All-In Basketball <${from}>`,
    to,
    replyTo: email,
    subject: `Training request — ${who} (${experience})`,
    text,
    html,
  });
}

export type FeedbackEmailInput = {
  name: string;
  email: string;
  type: string;
  message: string;
};

export async function sendFeedbackEmail(input: FeedbackEmailInput): Promise<void> {
  const { name, email, type, message } = input;
  const from = process.env.GMAIL_USER!;
  const sanarEmail = process.env.REVIEW_NOTIFY_TO || COACH_FALLBACK;
  const recipients = Array.from(new Set(["sunnyc93@gmail.com", sanarEmail]));

  const who = name?.trim() || "Someone";
  const rows: [string, string][] = [
    ["Name", who],
    ["Email", email],
    ["Type", type],
    ["Message", message?.trim() || "—"],
  ];

  const rowsHtml = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#888;vertical-align:top;white-space:nowrap">${esc(
          k
        )}</td><td style="padding:4px 0;color:#111">${esc(v)}</td></tr>`
    )
    .join("");

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto">
    <h2 style="margin:0 0 4px">New feedback from ${esc(who)}</h2>
    <p style="color:#666;margin:0 0 16px">A user has submitted feedback via the app.</p>
    <table style="border-collapse:collapse;font-size:14px;margin-bottom:20px">${rowsHtml}</table>
    <p style="color:#999;font-size:12px;margin-top:8px">
      Reply to this email to reach the user directly.
    </p>
  </div>`;

  const text = [
    `New feedback from ${who}`,
    ``,
    ...rows.map(([k, v]) => `${k}: ${v}`),
  ].join("\n");

  await getTransport().sendMail({
    from: `All-In Basketball <${from}>`,
    to: recipients.join(", "),
    replyTo: email,
    subject: `New Feedback — ${type} from ${who}`,
    text,
    html,
  });
}

