/** Attaches the shared `set_updated_at()` trigger to `table`'s `updated_at` column. */
function addUpdatedAtTrigger(pgm, table) {
  pgm.createTrigger(table, `${table}_set_updated_at`, {
    when: 'BEFORE',
    operation: 'UPDATE',
    level: 'ROW',
    function: 'set_updated_at',
  });
}

module.exports = { addUpdatedAtTrigger };
