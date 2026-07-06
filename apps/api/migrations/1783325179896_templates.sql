-- Up Migration

-- template_categories <-> email_templates <-> template_versions form a
-- three-way circular reference (default template, current version pointer,
-- versions belong to a template). Create tables first with the columns but
-- no FK yet where it would point forward, then backfill the constraints.

CREATE TABLE template_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  default_template_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_template_categories_updated_at
  BEFORE UPDATE ON template_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES template_categories (id),
  name text NOT NULL,
  status template_status NOT NULL DEFAULT 'draft',
  current_version_id uuid,
  created_by uuid REFERENCES users (id),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_templates_category_id ON email_templates (category_id);

CREATE TRIGGER set_email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES email_templates (id) ON DELETE CASCADE,
  version_no int NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  body_text text,
  placeholders text[] NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version_no)
);

CREATE TRIGGER set_template_versions_updated_at
  BEFORE UPDATE ON template_versions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE email_templates
  ADD CONSTRAINT fk_email_templates_current_version
  FOREIGN KEY (current_version_id) REFERENCES template_versions (id);

ALTER TABLE template_categories
  ADD CONSTRAINT fk_template_categories_default_template
  FOREIGN KEY (default_template_id) REFERENCES email_templates (id);

-- Down Migration

ALTER TABLE template_categories DROP CONSTRAINT IF EXISTS fk_template_categories_default_template;
ALTER TABLE email_templates DROP CONSTRAINT IF EXISTS fk_email_templates_current_version;

DROP TABLE IF EXISTS template_versions;
DROP TABLE IF EXISTS email_templates;
DROP TABLE IF EXISTS template_categories;
