CREATE TABLE IF NOT EXISTS knowledge_entities (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, role TEXT NOT NULL, name TEXT NOT NULL,
 kind TEXT NOT NULL, canonical_url TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'discovered',
 summary TEXT NOT NULL DEFAULT '', profile TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_entity_identity ON knowledge_entities(owner,role,canonical_url);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS knowledge_entities_scope ON knowledge_entities(owner,role,updated_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS source_items (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, role TEXT NOT NULL, entity_id TEXT NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
 type TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL, canonical_url TEXT NOT NULL, excerpt TEXT NOT NULL,
 published_at TEXT, collected_at TEXT NOT NULL, visibility TEXT NOT NULL, claim_type TEXT NOT NULL,
 content_hash TEXT NOT NULL, lineage_key TEXT NOT NULL, document_id TEXT, extraction_mode TEXT NOT NULL, extraction_note TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_source_identity ON source_items(owner,role,entity_id,canonical_url,content_hash);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS knowledge_sources_scope ON source_items(owner,role,entity_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS claims (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, role TEXT NOT NULL, subject_id TEXT NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
 metric TEXT NOT NULL, value TEXT NOT NULL, unit TEXT NOT NULL DEFAULT '', currency TEXT NOT NULL DEFAULT '', period TEXT NOT NULL DEFAULT '', scope TEXT NOT NULL DEFAULT '',
 source_id TEXT NOT NULL REFERENCES source_items(id) ON DELETE CASCADE, excerpt TEXT NOT NULL, published_at TEXT, collected_at TEXT NOT NULL,
 claim_type TEXT NOT NULL, status TEXT NOT NULL, visibility TEXT NOT NULL, confidence TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS knowledge_claims_scope ON claims(owner,role,subject_id,metric);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS relationships (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, role TEXT NOT NULL, subject_id TEXT NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
 object_id TEXT NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE, type TEXT NOT NULL, status TEXT NOT NULL,
 source_id TEXT REFERENCES source_items(id) ON DELETE SET NULL, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_relationship_identity ON relationships(owner,role,subject_id,object_id,type);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS risk_findings (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, role TEXT NOT NULL, entity_id TEXT NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
 title TEXT NOT NULL, finding TEXT NOT NULL, category TEXT NOT NULL, priority TEXT NOT NULL, comparison TEXT NOT NULL,
 claim_ids TEXT NOT NULL, source_ids TEXT NOT NULL, hypotheses TEXT NOT NULL, next_action TEXT NOT NULL,
 review_status TEXT NOT NULL DEFAULT 'pending', review_note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS knowledge_findings_scope ON risk_findings(owner,role,entity_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS knowledge_runs (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, role TEXT NOT NULL, action TEXT NOT NULL, status TEXT NOT NULL,
 query TEXT NOT NULL, source TEXT NOT NULL, entity_ids TEXT NOT NULL, source_ids TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS knowledge_runs_scope ON knowledge_runs(owner,role,created_at);
