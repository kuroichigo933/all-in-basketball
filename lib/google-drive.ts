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

export type DrillFile = {
  id: string;
  name: string;
  // proxy URL — streams through /api/video/[fileId] so no Drive UI
  videoUrl: string;
  mimeType: string;
  checklist?: string[];
};

export type DrillTier = {
  tier: string;
  drills: DrillFile[];
};

export type DrillCategory = {
  category: string;
  tiers: DrillTier[];
};

async function getAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  console.log("[Drive] getAccessToken — email:", email ? email : "MISSING");
  console.log("[Drive] getAccessToken — key present:", !!rawKey, rawKey ? `(${rawKey.slice(0, 40)}...)` : "");

  if (!email || !rawKey) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY");

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: email,
    scope: "https://www.googleapis.com/auth/drive.readonly",
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
  return json.access_token;
}

async function listChildren(folderId: string, token: string, label = folderId): Promise<any[]> {
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    `'${folderId}' in parents and trashed = false`
  )}&fields=files(id,name,mimeType)&orderBy=name&pageSize=200`;

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
  console.log(`[Drive] listChildren(${label}) — ${files.length} item(s):`, files.map((f) => `${f.name} [${f.mimeType}]`).join(", ") || "(empty)");
  return files;
}

// "shooting-form-stationary-#1.mp4" → "Form Stationary"
// "shooting-form-stationary-#2.mp4" → "Form Stationary #2"
function formatDrillName(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, ""); // strip extension
  const parts = base.split("-").map((p) => p.trim()).filter(Boolean);
  const last2 = parts.slice(-2);
  // drop #1 only (not #2, #3, ...)
  const filtered = last2.filter((p) => !/^#?1$/i.test(p));
  const name = filtered
    .map((p) => p.replace(/\b([a-z])/g, (c) => c.toUpperCase()))
    .join(" ")
    .trim();

  const rawName = name || base;

  // Deduplicate adjacent identical words (e.g. "Beginner Beginner 2" -> "Beginner 2")
  const words = rawName.split(/\s+/);
  const deduped: string[] = [];
  for (let i = 0; i < words.length; i++) {
    if (i === 0 || words[i].toLowerCase() !== words[i - 1].toLowerCase()) {
      deduped.push(words[i]);
    }
  }
  return deduped.join(" ");
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
    // Check if line starts with a video number, e.g., "1. video_name" or "1) video_name" or just "1.video_name"
    const videoMatch = line.match(/^\d+\s*[\.\)]\s*(.*)$/i);
    if (videoMatch) {
      let videoName = videoMatch[1].trim();
      // Remove trailing comma if any
      if (videoName.endsWith(",")) {
        videoName = videoName.slice(0, -1).trim();
      }
      currentVideoName = videoName;
      result[currentVideoName] = [];
      continue;
    }
    
    // If we are currently under a video, any non-video line is a checklist item!
    if (currentVideoName) {
      let cleanItem = line;
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

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.[^/.]+$/, "") // remove extension
    .replace(/[^a-z0-9]/g, ""); // remove non-alphanumeric
}

function getWordSet(name: string): Set<string> {
  const clean = name.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const words = clean.split(/\s+/).filter(Boolean);
  return new Set(words);
}

function wordSetsMatch(setA: Set<string>, setB: Set<string>): boolean {
  if (setA.size === 0 || setB.size === 0) return false;
  
  let intersectCount = 0;
  setA.forEach((word) => {
    if (setB.has(word)) intersectCount++;
  });
  
  // If one set is a subset of another, it's a match
  const minSize = Math.min(setA.size, setB.size);
  if (intersectCount >= minSize) return true;
  
  // Or if they share at least 75% of words
  const maxSize = Math.max(setA.size, setB.size);
  if (intersectCount / maxSize >= 0.75) return true;
  
  return false;
}

function findChecklistForDrill(drillName: string, originalFileName: string, checklistMap: { [key: string]: string[] }): string[] {
  const normDrill = normalizeName(drillName);
  const normFile = normalizeName(originalFileName);
  
  // 1. Direct normalized matching
  for (const key of Object.keys(checklistMap)) {
    const normKey = normalizeName(key);
    if (
      normKey === normDrill ||
      normKey === normFile ||
      normFile.includes(normKey) ||
      normKey.includes(normFile) ||
      normDrill.includes(normKey) ||
      normKey.includes(normDrill)
    ) {
      return checklistMap[key];
    }
  }
  
  // 2. Fuzzy word-set matching
  const setDrill = getWordSet(drillName);
  const setFile = getWordSet(originalFileName);
  
  for (const key of Object.keys(checklistMap)) {
    const setKey = getWordSet(key);
    if (wordSetsMatch(setKey, setDrill) || wordSetsMatch(setKey, setFile)) {
      return checklistMap[key];
    }
  }
  
  return [];
}

export async function getDrillLibrary(): Promise<DrillCategory[]> {
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
  const categories: DrillCategory[] = [];

  const categoryFolders = (await listChildren(rootId, token, "root")).filter((f) => f.mimeType === FOLDER);
  console.log(`[Drive] found ${categoryFolders.length} category folder(s)`);

  for (const cat of categoryFolders) {
    const tierFolders = (await listChildren(cat.id, token, cat.name)).filter((f) => f.mimeType === FOLDER);
    console.log(`[Drive] category "${cat.name}" — ${tierFolders.length} tier folder(s)`);

    const tiers: DrillTier[] = [];
    for (const tier of tierFolders) {
      const files = (await listChildren(tier.id, token, `${cat.name}/${tier.name}`)).filter((f) => f.mimeType !== FOLDER);
      console.log(`[Drive] "${cat.name}/${tier.name}" — ${files.length} file(s)`);
      
      // Support BOTH Google Docs (document) and Google Sheets (spreadsheet)
      const docFiles = files.filter(
        (f) =>
          f.mimeType === "application/vnd.google-apps.document" ||
          f.mimeType === "application/vnd.google-apps.spreadsheet"
      );
      const videoFiles = files.filter((f) => f.mimeType && f.mimeType.startsWith("video/"));
      
      const checklistMap: { [key: string]: string[] } = {};
      if (docFiles.length === 0) {
        console.log(`[Drive] ⚠️ No checklist document/spreadsheet found in "${cat.name}/${tier.name}"`);
      } else {
        for (const doc of docFiles) {
          try {
            console.log(`[Drive] 🔍 Found checklist file: "${doc.name}" in "${cat.name}/${tier.name}"`);
            const docText = await exportDriveFileAsText(doc.id, doc.mimeType, token);
            const parsed = parseGoogleDocChecklist(docText);
            console.log(`[Drive] 📄 Parsed ${Object.keys(parsed).length} keys from checklist file "${doc.name}"`);
            Object.assign(checklistMap, parsed);
          } catch (err) {
            console.error(`[Drive] ❌ Failed to fetch/parse doc/sheet checklist for ${doc.name} (${doc.id}):`, err);
          }
        }
      }

      const drills: DrillFile[] = videoFiles.map((f) => {
        const drillName = formatDrillName(f.name);
        const checklist = findChecklistForDrill(drillName, f.name, checklistMap);
        if (checklist && checklist.length > 0) {
          console.log(`[Drive] ✅ Matched checklist for drill "${drillName}" (${checklist.length} items)`);
        } else {
          console.log(`[Drive] ⚠️ No checklist match found for drill "${drillName}" (using fallback)`);
        }
        return {
          id: f.id,
          name: drillName,
          videoUrl: `/api/video/${f.id}`,
          mimeType: f.mimeType,
          ...(checklist && checklist.length > 0 ? { checklist } : {}),
        };
      });

      if (drills.length > 0) tiers.push({ tier: tier.name, drills });
    }
    if (tiers.length > 0) categories.push({ category: cat.name, tiers });
  }

  console.log(`[Drive] final result — ${categories.length} categorie(s):`, categories.map((c) => `${c.category}(${c.tiers.map((t) => `${t.tier}:${t.drills.length}`).join(",")})`).join(" | "));
  return categories;
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
