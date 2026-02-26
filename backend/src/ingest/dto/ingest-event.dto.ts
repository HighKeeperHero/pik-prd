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
  ValidateNested,
} from 'class-validator';

export class IngestEventDto {
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
