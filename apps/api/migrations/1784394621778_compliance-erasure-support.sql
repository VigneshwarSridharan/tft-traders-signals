-- Up Migration

-- GDPR erasure (Task 21) hard-deletes the customer row but keeps the
-- anonymized email_messages rows for aggregate history — so customer_id
-- must be nullable, and the FK must let the customer row go rather than
-- blocking on it.
ALTER TABLE email_messages ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE email_messages DROP CONSTRAINT email_messages_customer_id_fkey;
ALTER TABLE email_messages
  ADD CONSTRAINT email_messages_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE SET NULL;

-- Down Migration

ALTER TABLE email_messages DROP CONSTRAINT email_messages_customer_id_fkey;
ALTER TABLE email_messages
  ADD CONSTRAINT email_messages_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES customers (id);
ALTER TABLE email_messages ALTER COLUMN customer_id SET NOT NULL;
