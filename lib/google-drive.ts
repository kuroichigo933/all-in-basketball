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
  embedUrl: string;
  thumbnailUrl: string | null;
  mimeType: string;
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
  )}&fields=files(id,name,mimeType,thumbnailLink)&orderBy=name&pageSize=200`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 300 },
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
  return name || base; // fallback to full base if everything was filtered
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
      const drills: DrillFile[] = files.map((f) => ({
        id: f.id,
        name: formatDrillName(f.name),
        embedUrl: `https://drive.google.com/file/d/${f.id}/preview`,
        thumbnailUrl: f.thumbnailLink ?? null,
        mimeType: f.mimeType,
      }));
      if (drills.length > 0) tiers.push({ tier: tier.name, drills });
    }
    if (tiers.length > 0) categories.push({ category: cat.name, tiers });
  }

  console.log(`[Drive] final result — ${categories.length} categorie(s):`, categories.map((c) => `${c.category}(${c.tiers.map((t) => `${t.tier}:${t.drills.length}`).join(",")})`).join(" | "));
  return categories;
}
