-- Up Migration

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company text,
  email citext NOT NULL,
  phone text,
  notes text,
  tracking_opt_out boolean NOT NULL DEFAULT false,
  engagement_score int NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Email is unique only among non-deleted customers so a re-imported/erased
-- address can be reused.
CREATE UNIQUE INDEX idx_customers_email_active ON customers (email) WHERE deleted_at IS NULL;
CREATE INDEX idx_customers_name_trgm ON customers USING gin (name gin_trgm_ops);

CREATE TRIGGER set_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE custom_field_defs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  label text NOT NULL,
  field_type custom_field_type NOT NULL DEFAULT 'text',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_custom_field_defs_updated_at
  BEFORE UPDATE ON custom_field_defs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE customer_field_values (
  customer_id uuid NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  field_def_id uuid NOT NULL REFERENCES custom_field_defs (id) ON DELETE CASCADE,
  value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, field_def_id)
);

CREATE TRIGGER set_customer_field_values_updated_at
  BEFORE UPDATE ON customer_field_values
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TABLE IF EXISTS customer_field_values;
DROP TABLE IF EXISTS custom_field_defs;
DROP TABLE IF EXISTS customers;
