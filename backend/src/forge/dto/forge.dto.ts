// src/forge/dto/forge.dto.ts
// ============================================================
// The Forge — DTOs (Sprint 33)
// ============================================================

import {
  IsString, IsOptional, IsInt, IsNumber, IsBoolean, IsArray,
  IsIn, Min, Max, ValidateNested, ArrayMaxSize, MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EXERCISE_CATEGORIES, EXERCISE_EQUIPMENT } from '../exercise-library';

export const LOG_TYPES = ['weight_reps', 'reps', 'duration', 'distance'] as const;

// ── Exercise library ───────────────────────────────────────────────────────────

export class CreateExerciseDto {
  @IsString()
  @MaxLength(80)
  name: string;

  @IsString()
  @IsIn(EXERCISE_CATEGORIES as unknown as string[])
  category: string;

  @IsOptional()
  @IsString()
  @IsIn(EXERCISE_EQUIPMENT as unknown as string[])
  equipment?: string;

  @IsOptional()
  @IsString()
  @IsIn(LOG_TYPES as unknown as string[])
  log_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  theme_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  instructions?: string;
}

// ── Regimens ───────────────────────────────────────────────────────────────────

export class RegimenExerciseDto {
  @IsString()
  exercise_id: string;

  @IsOptional()
  @IsInt() @Min(1) @Max(20)
  target_sets?: number;

  @IsOptional()
  @IsInt() @Min(1) @Max(1000)
  target_reps?: number;

  @IsOptional()
  @IsInt() @Min(0) @Max(1800)
  rest_sec?: number;

  @IsOptional()
  @IsString() @MaxLength(200)
  notes?: string;
}

export class SaveRegimenDto {
  @IsString()
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsString() @MaxLength(80)
  theme_title?: string;

  @IsOptional()
  @IsString() @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => RegimenExerciseDto)
  exercises?: RegimenExerciseDto[];
}

// ── Sessions ───────────────────────────────────────────────────────────────────

export class StartSessionDto {
  @IsOptional()
  @IsString()
  regimen_id?: string;

  @IsOptional()
  @IsString() @MaxLength(80)
  name?: string;
}

export class AddSessionExerciseDto {
  @IsString()
  exercise_id: string;
}

export class LogSetDto {
  @IsString()
  session_exercise_id: string;

  @IsOptional()
  @IsNumber() @Min(0) @Max(10000)
  weight?: number;

  @IsOptional()
  @IsInt() @Min(0) @Max(10000)
  reps?: number;

  @IsOptional()
  @IsInt() @Min(0) @Max(86400)
  duration_sec?: number;

  @IsOptional()
  @IsInt() @Min(0) @Max(1000000)
  distance_m?: number;

  @IsOptional()
  @IsNumber() @Min(1) @Max(10)
  rpe?: number;

  @IsOptional()
  @IsBoolean()
  is_warmup?: boolean;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}

export class UpdateSetDto {
  @IsOptional()
  @IsNumber() @Min(0) @Max(10000)
  weight?: number;

  @IsOptional()
  @IsInt() @Min(0) @Max(10000)
  reps?: number;

  @IsOptional()
  @IsInt() @Min(0) @Max(86400)
  duration_sec?: number;

  @IsOptional()
  @IsInt() @Min(0) @Max(1000000)
  distance_m?: number;

  @IsOptional()
  @IsNumber() @Min(1) @Max(10)
  rpe?: number;

  @IsOptional()
  @IsBoolean()
  is_warmup?: boolean;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}

export class FinishSessionDto {
  @IsOptional()
  @IsString() @MaxLength(500)
  notes?: string;
}
