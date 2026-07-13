-- Reference titles lived only in prisma/seed.ts, which never ran on
-- prod or staging — claiming any quest with a title reward FK-failed
-- (story_first_augury → title_awakened, 2026-07-13). Idempotent.
INSERT INTO titles (title_id, display_name, category, description) VALUES
  ('title_fate_awakened',   'FATE AWAKENED',       'fate',    'Reached Fate Level 2'),
  ('title_fate_burning',    'FATE BURNING',        'fate',    'Reached Fate Level 5'),
  ('title_fate_ascendant',  'FATE ASCENDANT',      'fate',    'Reached Fate Level 10'),
  ('title_veilbreaker_50',  'VEIL TOUCHED',        'boss',    '50%+ boss damage in a single session'),
  ('title_veilbreaker_75',  'VEIL SLAYER',         'boss',    '75%+ boss damage in a single session'),
  ('title_veilbreaker_100', 'VEIL SHATTERER',      'boss',    '100% boss damage in a single session'),
  ('title_first_session',   'INITIATED',           'session', 'Completed first session'),
  ('title_five_sessions',   'PROVEN',              'session', 'Completed 5 sessions'),
  ('title_node_master',     'NODE MASTER',         'session', 'Completed all nodes in a session'),
  ('title_multi_source',    'REALM WALKER',        'meta',    'Progressed from 2+ sources'),
  ('first_veil_seal',       'FIRST SEAL',          'veil',    'Sealed your first Veil tear'),
  ('dormant_rift_sealed',   'DORMANT RIFT SEALED', 'veil',    'Sealed a dormant (T3) tear'),
  ('convergence_survived',  'CONVERGENCE SURVIVED','veil',    'Survived a double (T4) convergence tear'),
  ('title_awakened',        'AWAKENED',            'story',   'Completed the Remembering — Chapter I'),
  ('title_tearwarden',      'TEARWARDEN',          'story',   'Weathered the Gathering Storm — Chapter II')
ON CONFLICT (title_id) DO NOTHING;
