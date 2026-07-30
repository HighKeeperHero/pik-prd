// src/training/dto/training.dto.ts

import { IsString, IsOptional, IsInt, Min, Max, IsIn } from 'class-validator';

export const PILLARS   = ['forge', 'lore', 'veil'] as const;
// Expanded 2026-07-30 (Legacy Development brief). The original ten
// stay valid — existing TrainingEntry rows keep their meaning.
// Distributions live in src/training/legacy.ts ACTIVITY_CATALOG.
export const ACTIVITIES = [
  // forge (Physical)
  'workout', 'cardio', 'walking', 'sport', 'stretching', 'nutrition', 'challenge',
  // lore (Mental)
  'reading', 'learning', 'studying', 'writing', 'art', 'research', 'practice', 'teaching',
  // veil (Spiritual / Reflective)
  'prayer', 'meditation', 'journaling', 'gratitude', 'service', 'planning',
  'other',
] as const;

export type Pillar   = typeof PILLARS[number];
export type Activity = typeof ACTIVITIES[number];

export class LogTrainingDto {
  @IsString()
  @IsIn(PILLARS)
  pillar: Pillar;

  @IsString()
  @IsIn(ACTIVITIES)
  activity_type: Activity;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(480)
  duration_min?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  daily_rite_id?: string; // If completing a specific daily rite
}

export class CompleteRiteDto {
  @IsString()
  rite_id: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class DeclareOathDto {
  @IsString()
  @IsIn(PILLARS)
  pillar: Pillar;

  @IsString()
  declaration: string;
}

export class ResolveOathDto {
  @IsString()
  @IsIn(['kept', 'broken'])
  status: 'kept' | 'broken';
}
