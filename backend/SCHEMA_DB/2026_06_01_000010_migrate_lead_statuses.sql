-- Migrate lead statuses to action-oriented values
UPDATE leads SET status = 'NEW_LEAD'         WHERE status = 'new';
UPDATE leads SET status = 'DISCOVERY_CALL'   WHERE status = 'contacted';
UPDATE leads SET status = 'PROPOSAL_SENT'    WHERE status IN ('qualified', 'proposal');
UPDATE leads SET status = 'WON'              WHERE status = 'closed_won';
UPDATE leads SET status = 'LOST'             WHERE status = 'closed_lost';
UPDATE leads SET status = 'NEW_LEAD'         WHERE status NOT IN ('NEW_LEAD','DISCOVERY_CALL','PROPOSAL_SENT','CONTRACT_PENDING','WON','LOST');
