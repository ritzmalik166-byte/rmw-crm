-- Who ended a connected AI call: USER (customer hung up), AGENT (the AI agent ended it) or SYSTEM
-- (silence / time limit / network). Read from the provider (Bolna telephony_data.hangup_by / hangup_reason).
ALTER TABLE ai_calls ADD COLUMN ended_by VARCHAR(10) NULL AFTER ended_reason;
