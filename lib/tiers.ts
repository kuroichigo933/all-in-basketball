export type Tier = "free" | "member" | "allin";

const rank: Record<Tier, number> = { free: 0, member: 1, allin: 2 };

export function hasTier(userTier: Tier, required: Tier) {
  return rank[userTier] >= rank[required];
}

export const TIER_LABEL: Record<Tier, string> = {
  free: "Free",
  member: "Member",
  allin: "All In",
};
