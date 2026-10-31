// "Do this again" (Past plans, 31 Oct): hands a past beacon's what, places and who to the light sheet on home.
// The time is never copied: it's a new plan.

export type PlanTemplate = {
  activities: string[];
  places: { place_id: string | null; label: string | null; starred: boolean }[];
  audience_all: boolean;
  audience_circle_ids: string[];
};

let pending: PlanTemplate | null = null;

export function setTemplate(t: PlanTemplate) {
  pending = t;
}

/** Home takes it once when it comes back into view. */
export function takeTemplate(): PlanTemplate | null {
  const t = pending;
  pending = null;
  return t;
}
