// Google Drive drill library integration.
//
// Folder structure expected in Drive:
//   <DRIVE_FOLDER_ID> (root)
//   ├── Shooting/
//   │   ├── Beginner/   ← video files here
//   │   ├── Intermediate/
//   │   └── Expert/
//   ├── Dribbling/
//   │   ├── Beginner/
//   │   ├── Intermediate/
//   │   └── Expert/
//   └── Conditioning/
//
// Required env vars:
//   GOOGLE_SERVICE_ACCOUNT_EMAIL
//   GOOGLE_PRIVATE_KEY          (PEM block, newlines as \n)
//   GOOGLE_DRIVE_FOLDER_ID

import { unstable_cache } from "next/cache";

export type DrillFile = {
  id: string;
  name: string;
  // proxy URL — streams through /api/video/[fileId] so no Drive UI
  videoUrl: string;
  mimeType: string;
  checklist?: string[];
  thumbnailUrl?: string;
  createdTime?: string; // Drive file creation (ISO) — drives the 7-day early-access lock
};

export type DrillTier = {
  tier: string;
  drills: DrillFile[];
};

export type DrillCategory = {
  category: string;
  tiers: DrillTier[];
};

// Token cache variables
let cachedToken: string | null = null;
let tokenExpiresAt = 0; // Epoch timestamp in seconds

export async function getAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!email || !rawKey) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY");

  const now = Math.floor(Date.now() / 1000);

  // Use cached token if still valid (with a 60 second safety buffer)
  if (cachedToken && tokenExpiresAt > now + 60) {
    return cachedToken;
  }

  console.log("[Drive] Fetching NEW Google access token (no valid cached token found)...");
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: email,
    // Read-only Drive (drill library) + Sheets (append feedback rows). No Drive
    // writes are performed, so the narrower read-only scope limits blast radius.
    scope: "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  function b64(obj: object) {
    return Buffer.from(JSON.stringify(obj)).toString("base64url");
  }

  const unsigned = `${b64(header)}.${b64(payload)}`;

  const keyData = rawKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binaryKey = Buffer.from(keyData, "base64");

  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey(
      "pkcs8", binaryKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false, ["sign"]
    );
    console.log("[Drive] importKey — OK");
  } catch (err) {
    console.error("[Drive] importKey — FAILED:", err);
    throw err;
  }

  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${Buffer.from(sig).toString("base64url")}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const json = await res.json();
  console.log("[Drive] token response status:", res.status, "— access_token present:", !!json.access_token);
  if (!json.access_token) {
    console.error("[Drive] token error detail:", JSON.stringify(json));
    throw new Error(`Drive auth failed: ${JSON.stringify(json)}`);
  }

  // Cache the new token
  cachedToken = json.access_token;
  const expiresIn = json.expires_in || 3600;
  tokenExpiresAt = Math.floor(Date.now() / 1000) + expiresIn;
  console.log(`[Drive] Cached NEW token. Expiration set to ${expiresIn} seconds from now.`);

  return json.access_token;
}

async function listChildren(folderId: string, token: string, label = folderId): Promise<any[]> {
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    `'${folderId}' in parents and trashed = false`
  )}&fields=files(id,name,mimeType,thumbnailLink,createdTime)&orderBy=name&pageSize=200`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const json = await res.json();

  if (!res.ok) {
    console.error(`[Drive] listChildren(${label}) — HTTP ${res.status}:`, JSON.stringify(json));
    return [];
  }

  const files: any[] = json.files ?? [];
  // Silenced the noisy directory listing log here
  return files;
}

// Files are named "<order> - <title>", e.g. "0 - Form Shooting.mp4".
// The leading number sets the display order; the title is everything after the
// "<number> -" prefix (the number and dash are not shown). Files without that
// prefix keep their full name and sort last.
// "0 - Form Shooting.mp4" → { order: 0, title: "Form Shooting" }
function parseDrillName(filename: string): { order: number; title: string } {
  const base = filename.replace(/\.[^.]+$/, "").trim(); // strip extension
  const m = base.match(/^(\d+)\s*-\s*(.+)$/);
  if (m) return { order: parseInt(m[1], 10), title: m[2].trim() };
  return { order: Number.MAX_SAFE_INTEGER, title: base };
}

async function exportDriveFileAsText(fileId: string, mimeType: string, token: string): Promise<string> {
  const exportMime = mimeType === "application/vnd.google-apps.spreadsheet" ? "text/csv" : "text/plain";
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${exportMime}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    console.error(`[Drive] exportDriveFileAsText(${fileId}, ${mimeType}) — HTTP ${res.status}`);
    return "";
  }
  let text = await res.text();
  
  if (mimeType === "application/vnd.google-apps.spreadsheet") {
    // If it's a CSV, clean up quotes/cell formatting from rows to make it plain-text-like
    text = text
      .split(/\r?\n/)
      .map(line => {
        return line
          .replace(/^"|"$/g, "") // strip leading/trailing quotes of row
          .replace(/","/g, ", ") // replace cell separators with spaces/commas
          .replace(/""/g, '"') // unescape double quotes
          .trim();
      })
      .join("\n");
  }
  return text;
}

export function parseGoogleDocChecklist(text: string): { [videoName: string]: string[] } {
  const result: { [videoName: string]: string[] } = {};
  
  // Split into lines
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  
  let currentVideoName: string | null = null;
  
  for (const line of lines) {
    // A heading is "<number> - <title>" — the same convention as the video
    // files, e.g. "1 - Beginner 1". Everything until the next heading is its
    // checklist items. (The spaced dash avoids matching item lines like
    // "20x each hand …" or "1-2 dribbles".)
    // Google Docs exports numbered/bulleted lists with their OWN marker, so a
    // heading exports as "1. 1 - Beginner 1" (Docs' "1." + our "1 - …") and an
    // item as "1. 20x each hand". Strip that leading list marker first.
    const core = line.replace(/^(?:\d+[.)]|[a-zA-Z][.)]|[-*])\s+/, "").trim();

    // Heading: "<number> - <title>", e.g. "1 - Beginner 1". The spaced dash
    // avoids matching item lines like "20x each hand …".
    const videoMatch = core.match(/^\d+\s*-\s+(.+)$/);
    if (videoMatch) {
      currentVideoName = videoMatch[1].replace(/,+$/, "").trim();
      result[currentVideoName] = [];
      continue;
    }
    
    // If we are currently under a video, any non-video line is a checklist item!
    if (currentVideoName) {
      let cleanItem = core;
      // Strip any list prefix (like "a.", "b)", "-", "*", bullets, etc.)
      const prefixMatch = cleanItem.match(/^(?:[a-zA-Z\d]+[\.\)]|[\-\*•◦▪▫–—\u2013\u2014\u25e6\u25aa\u25ab])\s*(.*)$/);
      if (prefixMatch) {
        cleanItem = prefixMatch[1].trim();
      }
      
      // Clean up any trailing commas from comma-separated formatting if they were copied
      if (cleanItem.endsWith(",")) {
        cleanItem = cleanItem.slice(0, -1).trim();
      }
      
      if (cleanItem) {
        result[currentVideoName].push(cleanItem);
      }
    }
  }
  return result;
}

// Exact match. The checklist doc uses the same "<number> - <title>" naming as
// the video files, so we match on the title alone (case- and whitespace-
// normalized) — no fuzzy matching. The checklist heading "1 - Beginner 1" and
// the video file "1 - Beginner 1.mp4" both reduce to the title "Beginner 1".
function findChecklistForDrill(drillName: string, originalFileName: string, checklistMap: { [key: string]: string[] }): string[] {
  const keyify = (s: string) => s.trim().replace(/[-_]+/g, " ").replace(/\s+/g, " ").toLowerCase();
  const targets = [keyify(drillName), keyify(parseDrillName(originalFileName).title)];
  for (const key of Object.keys(checklistMap)) {
    if (targets.includes(keyify(key))) return checklistMap[key];
  }
  return [];
}

export async function getDrillLibrary(includeChecklists: boolean = false): Promise<DrillCategory[]> {
  const rootId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  console.log("[Drive] getDrillLibrary — rootId:", rootId ?? "MISSING");

  if (!rootId) {
    console.warn("[Drive] GOOGLE_DRIVE_FOLDER_ID not set — skipping Drive fetch");
    return [];
  }

  let token: string;
  try {
    token = await getAccessToken();
  } catch (err) {
    console.error("[Drive] failed to get access token:", err);
    return [];
  }

  const FOLDER = "application/vnd.google-apps.folder";

  const categoryFolders = (await listChildren(rootId, token, "root")).filter((f) => f.mimeType === FOLDER);
  console.log(`[Drive] found ${categoryFolders.length} category folder(s)`);

  // Fetch all categories (and their tiers) in parallel rather than sequentially,
  // so the whole tree comes back in ~2 round-trips of depth instead of N.
  const categoryResults = await Promise.all(
    categoryFolders.map(async (cat): Promise<DrillCategory | null> => {
      const tierFolders = (await listChildren(cat.id, token, cat.name)).filter((f) => f.mimeType === FOLDER);

      const tierResults = await Promise.all(
        tierFolders.map(async (tier): Promise<DrillTier | null> => {
          const files = (await listChildren(tier.id, token, `${cat.name}/${tier.name}`)).filter((f) => f.mimeType !== FOLDER);

          const docFiles = files.filter(
            (f) =>
              f.mimeType === "application/vnd.google-apps.document" ||
              f.mimeType === "application/vnd.google-apps.spreadsheet"
          );
          // Files named "XXXX..." are hidden from the library and train/session builder.
          const videoFiles = files.filter(
            (f) => f.mimeType && f.mimeType.startsWith("video/") && !/^xxxx/i.test(f.name)
          );

          const checklistMap: { [key: string]: string[] } = {};
          if (includeChecklists && docFiles.length > 0) {
            const parsedDocs = await Promise.all(
              docFiles.map(async (doc) => {
                try {
                  return parseGoogleDocChecklist(await exportDriveFileAsText(doc.id, doc.mimeType, token));
                } catch (err) {
                  console.error(`[Drive] ❌ Failed to fetch/parse checklist for ${doc.name} (${doc.id}):`, err);
                  return {};
                }
              })
            );
            for (const parsed of parsedDocs) Object.assign(checklistMap, parsed);
          }

          // Order videos by their filename number prefix ("0 - ", "1 - ", …).
          const orderedVideos = [...videoFiles].sort(
            (a, b) => parseDrillName(a.name).order - parseDrillName(b.name).order
          );

          const drills: DrillFile[] = orderedVideos.map((f) => {
            const { title } = parseDrillName(f.name);
            const checklist = findChecklistForDrill(title, f.name, checklistMap);
            return {
              id: f.id,
              name: title,
              videoUrl: `/api/video/${f.id}`,
              mimeType: f.mimeType,
              thumbnailUrl: f.thumbnailLink,
              createdTime: f.createdTime,
              ...(checklist && checklist.length > 0 ? { checklist } : {}),
            };
          });

          return drills.length > 0 ? { tier: tier.name, drills } : null;
        })
      );

      const tiers = tierResults.filter((t): t is DrillTier => t !== null);
      return tiers.length > 0 ? { category: cat.name, tiers } : null;
    })
  );

  const categories = categoryResults.filter((c): c is DrillCategory => c !== null);
  console.log(`[Drive] final result — ${categories.length} categorie(s)`);
  return categories;
}

// Cached wrapper — the drill library changes rarely, so persist the whole tree
// in Next's Data Cache for 10 minutes (shared across requests, even on dynamic
// pages). The `includeChecklists` arg is part of the cache key.
export const getDrillLibraryCached = unstable_cache(
  (includeChecklists: boolean = false) => getDrillLibrary(includeChecklists),
  ["drill-library"],
  { revalidate: 600, tags: ["drill-library"] }
);

// True if fileId is a video in the (cached) drill library. The video proxy uses
// this so it can't be abused to stream arbitrary Drive files the service account
// can see.
export async function isLibraryVideo(fileId: string): Promise<boolean> {
  const cats = await getDrillLibraryCached();
  for (const c of cats)
    for (const t of c.tiers)
      for (const d of t.drills) if (d.id === fileId) return true;
  return false;
}

// Early access: drills uploaded to Drive within the last 7 days are Professional
// (and coach) only. For anyone else (Basic tier), drop them so they're hidden
// until they age out. `canSeeNew` should be true for coaches and professional tier.
const EARLY_ACCESS_DAYS = 7;
export function filterEarlyAccess(categories: DrillCategory[], canSeeNew: boolean): DrillCategory[] {
  if (canSeeNew) return categories;
  const cutoff = Date.now() - EARLY_ACCESS_DAYS * 24 * 60 * 60 * 1000;
  const isFresh = (d: DrillFile) => !!d.createdTime && new Date(d.createdTime).getTime() >= cutoff;
  return categories
    .map((c) => ({
      category: c.category,
      tiers: c.tiers
        .map((t) => ({ tier: t.tier, drills: t.drills.filter((d) => !isFresh(d)) }))
        .filter((t) => t.drills.length > 0),
    }))
    .filter((c) => c.tiers.length > 0);
}

// Stream a Drive file through the server (keeps videos private, no Drive UI).
// Forwards Range header so seeking works correctly.
export async function getVideoStream(fileId: string, range?: string): Promise<{
  stream: ReadableStream;
  contentType: string;
  contentLength?: number;
  contentRange?: string;
  status: number;
}> {
  const token = await getAccessToken();
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (range) headers["Range"] = range;

  const res = await fetch(url, { headers });

  if (!res.ok && res.status !== 206) {
    throw new Error(`Drive fetch failed: ${res.status} ${res.statusText}`);
  }

  const contentType = res.headers.get("content-type") ?? "video/mp4";
  const contentLength = res.headers.get("content-length");
  const contentRange = res.headers.get("content-range");

  return {
    stream: res.body as ReadableStream,
    contentType,
    contentLength: contentLength ? Number(contentLength) : undefined,
    contentRange: contentRange ?? undefined,
    status: res.status,
  };
}

export async function getChecklistsForSpecificDrills(drills: { id: string, name: string, category: string, tier: string }[]): Promise<Record<string, string[]>> {
  const rootId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!rootId || drills.length === 0) return {};

  let token: string;
  try {
    token = await getAccessToken();
  } catch (err) {
    return {};
  }

  const FOLDER = "application/vnd.google-apps.folder";

  // Group drills by category and tier to avoid duplicate folder lookups
  const categoryTierPairs = new Set(drills.map(d => `${d.category}|${d.tier}`));
  
  const checklistMap: { [key: string]: string[] } = {};

  const categoryFolders = (await listChildren(rootId, token, "root")).filter((f) => f.mimeType === FOLDER);

  for (const pair of Array.from(categoryTierPairs)) {
    const [catName, tierName] = pair.split("|");
    const catFolder = categoryFolders.find(f => f.name === catName);
    if (!catFolder) continue;

    const tierFolders = (await listChildren(catFolder.id, token, catName)).filter((f) => f.mimeType === FOLDER);
    const tierFolder = tierFolders.find(f => f.name === tierName);
    if (!tierFolder) continue;

    const files = (await listChildren(tierFolder.id, token, `${catName}/${tierName}`)).filter((f) => f.mimeType !== FOLDER);
    const docFiles = files.filter(
        (f) =>
          f.mimeType === "application/vnd.google-apps.document" ||
          f.mimeType === "application/vnd.google-apps.spreadsheet"
    );

    for (const doc of docFiles) {
      try {
        const docText = await exportDriveFileAsText(doc.id, doc.mimeType, token);
        const parsed = parseGoogleDocChecklist(docText);
        Object.assign(checklistMap, parsed);
      } catch (err) {}
    }
  }

  // Now map the requested drills to the parsed checklists
  const results: Record<string, string[]> = {};
  for (const d of drills) {
    const checklist = findChecklistForDrill(d.name, d.name, checklistMap);
    if (checklist && checklist.length > 0) {
      results[d.id] = checklist;
    }
  }

  return results;
}

