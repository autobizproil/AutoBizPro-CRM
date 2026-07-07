-- Migrate lead status values to action-oriented values (data migration)
-- Mirrors: database/migrations/2026_06_01_000010_migrate_lead_statuses.php
-- All ADD COLUMN statements use IF NOT EXISTS per project rules.

-- Map legacy status values to new action-oriented values
UPDATE `leads` SET `status` = 'NEW_LEAD'       WHERE `status` = 'new';
UPDATE `leads` SET `status` = 'DISCOVERY_CALL' WHERE `status` = 'contacted';
UPDATE `leads` SET `status` = 'PROPOSAL_SENT'  WHERE `status` = 'qualified';
UPDATE `leads` SET `status` = 'PROPOSAL_SENT'  WHERE `status` = 'proposal';
UPDATE `leads` SET `status` = 'WON'            WHERE `status` = 'closed_won';
UPDATE `leads` SET `status` = 'LOST'           WHERE `status` = 'closed_lost';

-- Any remaining unknown values → NEW_LEAD
UPDATE `leads` SET `status` = 'NEW_LEAD'
WHERE `status` NOT IN ('NEW_LEAD', 'DISCOVERY_CALL', 'PROPOSAL_SENT', 'CONTRACT_PENDING', 'WON', 'LOST');

-- Update column default (Laravel: $table->string('status')->default('NEW_LEAD')->change())
ALTER TABLE `leads` MODIFY `status` VARCHAR(255) NOT NULL DEFAULT 'NEW_LEAD';
