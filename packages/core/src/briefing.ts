export type CreationMode = 'reference' | 'from_scratch';

export type BriefingRequirementLevel = 'required' | 'preference' | 'creative_freedom';

export interface BriefingReference {
  mediaId: string;
  order: number;
  role?: string;
}

export interface Briefing {
  creationMode: CreationMode;
  occasion?: string;
  recipient?: string;
  mainTheme?: string;
  desiredStyle?: string;
  colorPreferences: string[];
  mandatoryText: string[];
  names: string[];
  dates: string[];
  mandatoryElements: string[];
  forbiddenElements: string[];
  references: BriefingReference[];
  compositionNotes?: string;
  creativeDirection?: string;
  missingInformation: string[];
  confidenceScore: number;
  readyToGenerate: boolean;
}
