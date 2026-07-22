export const PRODUCTION_SITE_URL = "https://allinbasketball.app";

export function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_ENV === "production" ? PRODUCTION_SITE_URL : "http://localhost:3000");
}
