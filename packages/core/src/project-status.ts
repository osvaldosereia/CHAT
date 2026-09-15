export const projectStatuses = [
  'new',
  'collecting_references',
  'building_briefing',
  'waiting_customer',
  'ready_to_generate',
  'generating_art',
  'validating_art',
  'generating_mockup',
  'waiting_approval',
  'change_requested',
  'needs_review',
  'approved',
  'failed',
] as const;

export type ProjectStatus = (typeof projectStatuses)[number];

const transitions: Record<ProjectStatus, readonly ProjectStatus[]> = {
  new: ['collecting_references', 'building_briefing', 'failed'],
  collecting_references: ['building_briefing', 'waiting_customer', 'failed'],
  building_briefing: ['waiting_customer', 'ready_to_generate', 'failed'],
  waiting_customer: ['collecting_references', 'building_briefing', 'failed'],
  ready_to_generate: ['generating_art', 'failed'],
  generating_art: ['validating_art', 'failed'],
  validating_art: ['generating_art', 'generating_mockup', 'needs_review', 'failed'],
  generating_mockup: ['waiting_approval', 'needs_review', 'failed'],
  waiting_approval: ['approved', 'change_requested', 'failed'],
  change_requested: ['building_briefing', 'ready_to_generate', 'failed'],
  needs_review: ['building_briefing', 'ready_to_generate', 'failed'],
  approved: [],
  failed: [],
};

export function canTransition(from: ProjectStatus, to: ProjectStatus): boolean {
  return transitions[from].includes(to);
}

export function assertTransition(from: ProjectStatus, to: ProjectStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid project transition: ${from} -> ${to}`);
  }
}
