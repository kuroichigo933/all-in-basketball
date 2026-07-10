export type StructuredPlan = {
  name: string;
  description: string;
  drillNames: string[];
};

export const STRUCTURED_PLANS: StructuredPlan[] = [
  {
    name: "Beginner - Intermediate Program",
    description: "Our signature progression targeting fundamental ball-handling, wall taps, basic finishing, mikan drills, footwork, and shooting mechanics in a structured 11-step routine.",
    drillNames: [
      "Crossover 1",
      "Between the legs 1",
      "Wall taps 1",
      "Ball wraps 1",
      "Cone drills 1",
      "Basic finishing 1",
      "Mikan drill 1",
      "Reverse finish 1",
      "Foot work 1",
      "Shooting drill 1",
      "One dribble pull up"
    ]
  }
];
