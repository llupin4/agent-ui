/**
 * SYNTHETIC DATA. Every activity, venue, price and time below is invented
 * for this playground. Nothing here describes a real place or event.
 */
export interface Activity {
  id: string;
  name: string;
  category: "outdoors" | "food" | "culture" | "games" | "family";
  setting: "indoor" | "outdoor";
  durationHours: number;
  costUsd: number;
  bestTime: "morning" | "afternoon" | "evening";
  blurb: string;
}

export const SYNTHETIC_ACTIVITIES: Activity[] = [
  { id: "act-01", name: "Lantern Creek Loop Hike", category: "outdoors", setting: "outdoor", durationHours: 3, costUsd: 0, bestTime: "morning", blurb: "Shaded 4-mile loop with a creek crossing (synthetic)." },
  { id: "act-02", name: "Paddle Hour at Mirror Pond", category: "outdoors", setting: "outdoor", durationHours: 2, costUsd: 25, bestTime: "morning", blurb: "Kayak rental on a calm, made-up pond (synthetic)." },
  { id: "act-03", name: "Night Market Tasting Walk", category: "food", setting: "outdoor", durationHours: 2, costUsd: 30, bestTime: "evening", blurb: "Six small plates across invented stalls (synthetic)." },
  { id: "act-04", name: "Dumpling Folding Workshop", category: "food", setting: "indoor", durationHours: 2, costUsd: 45, bestTime: "afternoon", blurb: "Hands-on class, eat what you fold (synthetic)." },
  { id: "act-05", name: "Tin Robot Museum", category: "culture", setting: "indoor", durationHours: 2, costUsd: 12, bestTime: "afternoon", blurb: "A fictional collection of wind-up robots (synthetic)." },
  { id: "act-06", name: "Rooftop Silent Film Night", category: "culture", setting: "outdoor", durationHours: 3, costUsd: 15, bestTime: "evening", blurb: "Live piano under the stars (synthetic)." },
  { id: "act-07", name: "Board Game Cafe Marathon", category: "games", setting: "indoor", durationHours: 3, costUsd: 10, bestTime: "afternoon", blurb: "Flat table fee, 400 imaginary games (synthetic)." },
  { id: "act-08", name: "Retro Arcade Free-Play", category: "games", setting: "indoor", durationHours: 2, costUsd: 18, bestTime: "evening", blurb: "Unlimited cabinets for one wristband (synthetic)." },
  { id: "act-09", name: "Backyard Rocket Build", category: "family", setting: "outdoor", durationHours: 2, costUsd: 20, bestTime: "morning", blurb: "Water-rocket kits and a launch field (synthetic)." },
  { id: "act-10", name: "Puppet Theatre Matinee", category: "family", setting: "indoor", durationHours: 1, costUsd: 8, bestTime: "afternoon", blurb: "A 45-minute show for all ages (synthetic)." },
];

export interface ActivityQuery {
  category?: Activity["category"];
  setting?: Activity["setting"];
  maxCostUsd?: number;
  maxDurationHours?: number;
  limit?: number;
}

export function searchActivities(query: ActivityQuery): Activity[] {
  return SYNTHETIC_ACTIVITIES.filter(
    (a) =>
      (!query.category || a.category === query.category) &&
      (!query.setting || a.setting === query.setting) &&
      (query.maxCostUsd === undefined || a.costUsd <= query.maxCostUsd) &&
      (query.maxDurationHours === undefined || a.durationHours <= query.maxDurationHours),
  ).slice(0, Math.min(query.limit ?? 3, 5));
}
