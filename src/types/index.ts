// src/types/index.ts

export type Status = 'urgent' | 'monitor' | 'optimal';
export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type SubscriptionTier = 'free' | 'core' | 'premium' | 'family';
export type Sex = 'male' | 'female' | 'other';

export interface Profile {
  id:                   string;
  createdAt:            string;
  updatedAt:            string;
  firstName:            string | null;
  lastName:             string | null;
  dateOfBirth:          string | null;
  sex:                  'male' | 'female' | 'other' | null;
  heightCm:             number | null;
  weightKg:             number | null;
  subscriptionTier:     'free' | 'core' | 'premium' | 'family';
  onboardingCompleted:  boolean;
  primaryGoals:         string[] | null;
}

export interface AuthError {
  message: string;
  field?:  'email' | 'password' | 'confirmPassword' | 'general';
}

export interface RegisterFormData {
  firstName: string; lastName: string; email: string;
  password: string; confirmPassword: string;
  acceptTerms: boolean; acceptPrivacy: boolean;
}

export interface LoginFormData {
  email: string; password: string; rememberMe: boolean;
}

export interface Medication {
  id: string; userId: string; name: string; brandName?: string;
  dose?: string; frequency?: string; durationCategory?: string;
  prescribingCondition?: string; isActive: boolean;
}

export interface Symptom {
  id: string; userId: string; symptom: string; severity: number;
  duration?: string; timing?: string;
}

// Lab data
export interface LabDraw {
  id: string; userId: string; createdAt: string; drawDate: string;
  labName: string | null; orderingProvider: string | null;
  rawPdfUrl: string | null;
  processingStatus: 'pending' | 'processing' | 'complete' | 'failed';
  notes: string | null;
}

export interface LabValue {
  id: string; drawId: string; userId: string;
  markerName: string; markerCategory: string | null;
  value: number; unit: string | null;
  standardLow: number | null; standardHigh: number | null;
  optimalLow: number | null; optimalHigh: number | null;
  standardFlag: 'normal' | 'low' | 'high' | 'critical_low' | 'critical_high' | null;
  optimalFlag: 'optimal' | 'suboptimal_low' | 'suboptimal_high' | 'deficient' | 'elevated' | null;
  drawDate: string | null;
}

// Wellness plans
export interface WellnessPlan {
  id: string; userId: string; createdAt: string; updatedAt: string;
  title: string | null; planData: WellnessPlanData | null;
  isActive: boolean; version: number;
}

export interface WellnessPlanData {
  executiveSummary: string;
  supplementStack?: { tier1: SupplementItem[]; tier2: SupplementItem[]; tier3: SupplementItem[]; };
  nutritionPlan?: Record<string, unknown>;
  exercisePrescription?: Record<string, unknown>;
  sleepProtocol?: Record<string, unknown>;
  testingRecommendations?: TestRecommendation[];
  milestones?: { day30: string[]; day60: string[]; day90: string[]; };
}

export interface SupplementItem {
  name: string; dose: string; timing: string; reason: string;
  evidenceRating: number; monthlyCost?: string;
}

export interface TestRecommendation {
  testName: string; icd10Codes: string[];
  medicalNecessity: string; priority: 'urgent' | 'high' | 'moderate';
}

// Progress
export interface ProgressEntry {
  id: string; userId: string; entryDate: string;
  weightKg: number | null; energyLevel: number | null;
  sleepQuality: number | null; mood: number | null; notes: string | null;
}

export interface SupplementCompliance {
  id: string; userId: string; takenDate: string;
  supplementName: string; taken: boolean;
}

// Priority alerts
export interface PriorityAlert {
  id: string; userId: string; createdAt: string;
  status: 'urgent' | 'monitor' | 'optimal';
  title: string; description: string | null;
  source: string | null; actionLabel: string | null;
  actionPath: string | null; dismissed: boolean;
  drawId: string | null;
}

// Health score
export interface HealthScore {
  score: number; label: string; color: string;
  totalMarkers: number; optimalCount: number;
  monitorCount: number; urgentCount: number;
  trend: 'up' | 'down' | 'stable' | 'new';
  previousScore?: number;
}
