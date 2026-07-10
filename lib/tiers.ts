export type Tier = "free" | "basic" | "professional";

const rank: Record<Tier, number> = { free: 0, basic: 1, professional: 2 };

export function hasTier(userTier: Tier, required: Tier) {
  return rank[userTier] >= rank[required];
}

// The specific drills allowed for free/trial users.
export const ALLOWED_FREE_DRILLS = [
  // Ball handling
  "wall taps 2",
  "on the move 1",
  "Punch series 2",
  "Tennis ball 1",
  
  // Shooting
  "Form shots sitting 1",
  "One dribble pull up off catch",
  "Punch dribble pull up",
  "Balance shooting 1",

  // Finishing
  "Mikan drill 2",
  "Two foot vs one foot 1",
  "inside hand off one foot 1",
  "same foot same hand 1"
];

export function isAllowedFreeDrill(drillName: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalizedName = normalize(drillName);
  return ALLOWED_FREE_DRILLS.some(allowed => normalize(allowed) === normalizedName);
}
