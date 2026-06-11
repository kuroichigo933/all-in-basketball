import { createClient as createSb } from "@supabase/supabase-js";

// Service-role client. Server only (webhooks, credit grants). Never import in client components.
export function createAdminClient() {
  return createSb(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
