const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const envPath = path.join(process.cwd(), ".env.local");
let url, key;

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  content.split("\n").forEach((line) => {
    const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)$/);
    if (match) {
      const k = match[1].trim();
      let v = match[2].trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
      if (k === "NEXT_PUBLIC_SUPABASE_URL") url = v;
      if (k === "SUPABASE_SERVICE_ROLE_KEY") key = v;
    }
  });
}

if (!url || !key) {
  console.log("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key);

async function run() {
  const { data: users, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error("Auth error:", error);
    return;
  }
  
  const targetEmail = "sunnyc93@gmail.com";
  const user = users.users.find(u => u.email === targetEmail) || users.users[0];
  
  if (!user) {
    console.log("No users found.");
    return;
  }
  
  console.log("--- AUTH USER METADATA ---");
  console.log(JSON.stringify(user.user_metadata, null, 2));
  
  console.log("\n--- PROFILE TABLE DATA ---");
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  console.log(JSON.stringify(profile, null, 2));
}

run();
