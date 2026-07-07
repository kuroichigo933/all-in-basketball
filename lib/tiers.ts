export type Tier = "free" | "basic" | "professional";

const rank: Record<Tier, number> = { free: 0, basic: 1, professional: 2 };

export function hasTier(userTier: Tier, required: Tier) {
  return rank[userTier] >= rank[required];
}
