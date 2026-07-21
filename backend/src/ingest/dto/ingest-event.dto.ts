// ============================================================
// PIK — Ingest Event DTO
//
// Validates POST /api/ingest request body.
// Supports all 5 event types from the MVP:
//   - progression.session_completed
//   - progression.xp_granted
//   - progression.node_completed
//   - progression.title_granted
//   - progression.fate_marker
//
// Place at: src/ingest/dto/ingest-event.dto.ts
// ============================================================

import {
  IsString,
  IsNotEmpty,
  IsObject,
  IsOptional,
  MaxLength,
} from 'class-validator';

export class IngestEventDto {
  /**
   * Idempotency key — a stable identifier for the real-world occurrence
   * this event describes (e.g. the venue's own session/encounter id).
   * Retrying with the same event_id returns the original response and
   * grants nothing further.
   *
   * Optional for backward compatibility with partners integrated before
   * Phase 2 Slice 0. Omitting it means the request is NOT deduplicated;
   * the response carries a `deduplicated: false` warning, and it becomes
   * required at the Phase 2 partner-contract freeze.
   */
  @IsString()
  @IsOptional()
  @MaxLength(200)
  event_id?: string;

  /**
   * The RootID of the user receiving this event.
   */
  @IsString()
  @IsNotEmpty()
  root_id: string;

  /**
   * The event type. Must be one of the supported progression types.
   */
  @IsString()
  @IsNotEmpty()
  event_type: string;

  /**
   * Event-specific payload. Structure depends on event_type:
   *
   * session_completed: { difficulty, nodes_completed, boss_damage_pct }
   * xp_granted:        { xp }
   * node_completed:    { node_id }
   * title_granted:     { title_id }
   * fate_marker:       { marker }
   */
  @IsObject()
  payload: Record<string, unknown>;
}
