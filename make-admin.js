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
  const targetEmail = process.argv[2];
  
  if (!targetEmail) {
    console.log("Please provide an email address.");
    console.log("Usage: node make-admin.js <email>");
    return;
  }

  console.log(`Looking up user: ${targetEmail}`);
  const { data: users, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error("Auth error:", error);
    return;
  }
  
  const user = users.users.find(u => u.email === targetEmail);
  
  if (!user) {
    console.log(`❌ No user found with email ${targetEmail}`);
    return;
  }
  
  console.log(`✅ Found user ID: ${user.id}`);
  console.log(`Updating role to 'coach'...`);
  
  const { data: profile, error: updateError } = await supabase
    .from("profiles")
    .update({ role: "coach" })
    .eq("id", user.id)
    .select()
    .single();
    
  if (updateError) {
    console.error("❌ Failed to update role:", updateError);
  } else {
    console.log("🎉 Success! User role is now:", profile.role);
    console.log("They can now access the Coach Desk and the AI Tracker tab.");
  }
}

run();
