export type SampleDrill = {
  title: string;
  description: string;
  cue: string;
  image: string;
};

export type SampleProgram = {
  id: "shooting" | "dribbling" | "conditioning" | "balance";
  title: string;
  tagline: string;
  description: string;
  cover: string;
  drills: SampleDrill[];
};

// Unsplash photos — basketball / training imagery.
// Each drill is 12 minutes; five drills = 60-minute session.
export const SAMPLE_PROGRAMS: SampleProgram[] = [
  {
    id: "shooting",
    title: "Shooting",
    tagline: "One hour, all net.",
    description:
      "A full hour of shot reps designed to lock in form, range, and rhythm. Start close, end deep.",
    cover:
      "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=900&auto=format&fit=crop",
    drills: [
      {
        title: "Form shooting from the block",
        description:
          "One hand under the ball, guide hand off. Knees bent, elbow in, snap the wrist. Start two feet from the rim, work back to the foul line.",
        cue: "Hold your follow-through until it hits the net.",
        image:
          "https://images.unsplash.com/photo-1518614368389-99c1d3f9a6c6?w=900&auto=format&fit=crop",
      },
      {
        title: "Five-spot mid-range",
        description:
          "Catch and shoot from baseline, wing, top, opposite wing, opposite baseline. Make 4 of 5 before moving on.",
        cue: "Feet set before the catch, eyes on the back of the rim.",
        image:
          "https://images.unsplash.com/photo-1574623452334-1e0ac2b3ccb4?w=900&auto=format&fit=crop",
      },
      {
        title: "Pull-up off one dribble",
        description:
          "Jab right or left, rip through, one hard dribble into a balanced pull-up jumper. 10 reps each side.",
        cue: "Land where you took off — no drifting.",
        image:
          "https://images.unsplash.com/photo-1504450758481-7338eba7524a?w=900&auto=format&fit=crop",
      },
      {
        title: "Three-point rhythm shooting",
        description:
          "Five spots around the arc, 8 shots per spot. Track makes and misses by spot.",
        cue: "Same routine every shot — dip, lift, release.",
        image:
          "https://images.unsplash.com/photo-1577412647305-991150c7d163?w=900&auto=format&fit=crop",
      },
      {
        title: "Free throws under fatigue",
        description:
          "10 reps of suicides, then shoot 10 free throws. Repeat once. This is how you learn to make them in the 4th quarter.",
        cue: "Same breath, same routine, every time.",
        image:
          "https://images.unsplash.com/photo-1519861531473-9200262188bf?w=900&auto=format&fit=crop",
      },
    ],
  },
  {
    id: "dribbling",
    title: "Dribbling",
    tagline: "Tight ball, loose hips.",
    description:
      "Handle the rock under pressure. Game-speed combos, both hands, eyes up the whole time.",
    cover:
      "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=900&auto=format&fit=crop",
    drills: [
      {
        title: "Stationary two-ball pound",
        description:
          "Two balls, pound dribble at thigh height. 30 seconds same height, 30 seconds alternating, 30 seconds one high one low.",
        cue: "Fingertips, not palms. Eyes up.",
        image:
          "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=900&auto=format&fit=crop",
      },
      {
        title: "Cone weave — crossover series",
        description:
          "Five cones in a line. Crossover, between the legs, behind the back through each cone. Three trips each move.",
        cue: "Get low. The lower you go, the harder you are to guard.",
        image:
          "https://images.unsplash.com/photo-1504450758481-7338eba7524a?w=900&auto=format&fit=crop",
      },
      {
        title: "Full-court speed dribble",
        description:
          "Baseline to baseline at top speed, right hand down, left hand back. 10 trips. Don't let the ball get behind you.",
        cue: "Push the ball out front, chase it down.",
        image:
          "https://images.unsplash.com/photo-1551627040-7fc8b6e5fe92?w=900&auto=format&fit=crop",
      },
      {
        title: "Attack and counter",
        description:
          "Attack a cone like a defender. Jab, cross, hesi — one move, one counter, finish at the rim. 5 each move, each hand.",
        cue: "Sell the first move so the second one works.",
        image:
          "https://images.unsplash.com/photo-1577412647305-991150c7d163?w=900&auto=format&fit=crop",
      },
      {
        title: "Pick-up game tempo handle",
        description:
          "Imaginary live defender. Bring the ball up against pressure, dribble out of a double, attack a closeout. 5 minutes each scenario.",
        cue: "Decision first, then move.",
        image:
          "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=900&auto=format&fit=crop",
      },
    ],
  },
  {
    id: "conditioning",
    title: "Conditioning",
    tagline: "Be the one not tired.",
    description:
      "Basketball-specific conditioning. Builds the legs and lungs you need to play hard in the 4th.",
    cover:
      "https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=900&auto=format&fit=crop",
    drills: [
      {
        title: "Dynamic warm-up + tempo run",
        description:
          "5 minutes of dynamic stretches, then 6 minutes of 30-second jog / 30-second sprint at full court.",
        cue: "Open up the hips before you ask them to sprint.",
        image:
          "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=900&auto=format&fit=crop",
      },
      {
        title: "17s",
        description:
          "Sideline to sideline, 17 touches in under 65 seconds. Rest 90 seconds. Five rounds.",
        cue: "Plant the outside foot — don't slide the cut.",
        image:
          "https://images.unsplash.com/photo-1551958219-acbc608c6377?w=900&auto=format&fit=crop",
      },
      {
        title: "Defensive slide ladder",
        description:
          "Slide the lane width, touch the line, slide back. 30 seconds on, 15 off. Eight rounds.",
        cue: "Hips low. Don't bounce.",
        image:
          "https://images.unsplash.com/photo-1593079831268-3381b0db4a77?w=900&auto=format&fit=crop",
      },
      {
        title: "Layup runs at game speed",
        description:
          "Right-hand layups baseline to baseline, sprint pace. Then left. Twelve trips total.",
        cue: "Finish high off the glass — no lazy layups.",
        image:
          "https://images.unsplash.com/photo-1519861531473-9200262188bf?w=900&auto=format&fit=crop",
      },
      {
        title: "Closeout cooldown circuit",
        description:
          "Sprint to a spot, controlled closeout, slide, recover. Two minutes on, one off. Three rounds, then cool down walk.",
        cue: "Land balanced — high hands, choppy feet.",
        image:
          "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=900&auto=format&fit=crop",
      },
    ],
  },
  {
    id: "balance",
    title: "Balance",
    tagline: "Strong base. Soft landing.",
    description:
      "Single-leg strength, ankle stability, and core control — the unseen work that keeps you on the floor.",
    cover:
      "https://images.unsplash.com/photo-1554344728-77cf90d9ed7e?w=900&auto=format&fit=crop",
    drills: [
      {
        title: "Single-leg balance + reach",
        description:
          "Stand on one leg, reach the other foot forward, side, and back without touching down. 8 reps per direction, both legs.",
        cue: "Soft knee — don't lock it out.",
        image:
          "https://images.unsplash.com/photo-1554344728-77cf90d9ed7e?w=900&auto=format&fit=crop",
      },
      {
        title: "BOSU squats",
        description:
          "Squat on a BOSU ball or a folded towel. 3 sets of 10. Control the descent.",
        cue: "Knees track over the middle toes.",
        image:
          "https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=900&auto=format&fit=crop",
      },
      {
        title: "Lateral bounds with stick",
        description:
          "Jump sideways, land on the outside leg, hold for 2 seconds. 10 each side, 3 rounds.",
        cue: "Stick the landing like a gymnast. No wobble.",
        image:
          "https://images.unsplash.com/photo-1518310383802-640c2de311b2?w=900&auto=format&fit=crop",
      },
      {
        title: "Single-leg deadlift",
        description:
          "Light dumbbell in opposite hand. Hinge at the hip, back flat, opposite leg back. 8 per side, 3 rounds.",
        cue: "Hips square — don't open up.",
        image:
          "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=900&auto=format&fit=crop",
      },
      {
        title: "Core anti-rotation finisher",
        description:
          "Pallof press (band or cable). 12 reps each side, 3 rounds. Then 1-minute plank to close.",
        cue: "Resist the twist. That's the whole drill.",
        image:
          "https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=900&auto=format&fit=crop",
      },
    ],
  },
];

export function getSampleProgram(id: string): SampleProgram | undefined {
  return SAMPLE_PROGRAMS.find((p) => p.id === id);
}
