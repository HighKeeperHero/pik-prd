-- The loot engine minted hand gear as slot 'hands' while the
-- equipment model's slot is 'arms' — those items could never be
-- equipped (2026-07-13). Normalize existing rows; the mint path is
-- fixed in gear.service.
UPDATE gear_items SET slot = 'arms' WHERE slot = 'hands';
