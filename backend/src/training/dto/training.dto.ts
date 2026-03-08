// src/training/dto/training.dto.ts

import { IsString, IsOptional, IsInt, Min, Max, IsIn } from 'class-validator';

export const PILLARS   = ['forge', 'lore', 'veil'] as const;
export const ACTIVITIES = [
  'workout', 'cardio', 'sport',           // forge
  'reading', 'writing', 'learning',       // lore
  'meditation', 'prayer', 'service',      // veil
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
