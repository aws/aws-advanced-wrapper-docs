---
title: KMS Encryption Plugin
---

The KMS Encryption Plugin provides transparent client-side, column-level
encryption using [AWS Key Management Service (KMS)](https://aws.amazon.com/kms/).
It encrypts sensitive column values before they are stored in the database and
decrypts them when they are read back, based on metadata configured in the
database rather than in application code. The plaintext never reaches the
server, and neither does any data key: only a KMS-encrypted copy of each data
key is stored.

:::warning
**A database-side HMAC-validation trigger is required on every encrypted
column.** On its own, the plugin cannot guarantee that an encrypted column never
holds a plaintext value — it only sees statements sent over a connection with the
plugin enabled, and it identifies encrypted columns by best-effort SQL parsing.
The server-side trigger, not the SQL parser, is what guarantees an encrypted
column never holds plaintext. See [Server-side enforcement is required](#server-side-enforcement-is-required)
and [Enforce encryption in the database](#enforce-encryption-in-the-database) below.
:::


:::info Available since
Version 1.0.0
:::

## Prerequisites

:::warning
To use this plugin, add `aws-sdk-kms` to your Gemfile:

```ruby
gem 'aws-sdk-kms'
```
:::

:::warning
On PostgreSQL, this plugin also needs `pg_query`, which it uses to work out
which bind parameters belong to encrypted columns. Add it to your Gemfile:

```ruby
gem 'pg_query'
```

If `pg_query` is missing, connections with the plugin enabled fail with a
`LoadError` when they are set up. MySQL does not need `pg_query`.
`pg_query` builds a C extension when it is installed, so the first install
takes longer than for a pure-Ruby gem.
:::

:::warning
To use this plugin, you must provide valid AWS credentials through the AWS
SDK credential provider chain. Temporary credentials (AWS STS, IAM roles,
SSO) expire, so ensure your provider refreshes them before they lapse.
:::

The plugin expects two tables in the schema named by
`encryption_metadata_schema`: `encryption_metadata`, which records the
encrypted columns, and `key_storage`, which holds each KMS-encrypted data
key alongside the HMAC key that signs its values. Every encrypted column
must be a binary column (`bytea` on PostgreSQL, `VARBINARY` or `BLOB` on
MySQL). Manage columns and keys through
`Plugins::Encryption::KeyManagementUtility` rather than editing the tables
by hand; a column is only usable once a matching data key exists in
`key_storage`.


## How to enable

Add the plugin code `kms_encryption` to the `wrapper_plugins` parameter.

```ruby
conn = AwsAdvancedRubyDriverWrapper::WrapperPgConnection.new(
  host: "my-cluster.cluster-xyz.us-east-1.rds.amazonaws.com",
  dbname: "mydb",
  wrapper_plugins: "kms_encryption",
  encryption_kms_region: "us-east-1",
  encryption_allowed_master_key_arns: "arn:aws:kms:us-east-1:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab",
  encryption_audit_logging_enabled: true
)

```

Verify plugin compatibility within your Ruby configuration using the [compatibility guide](../compatibility).

## Configuration parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `encryption_kms_region` | String | Yes | AWS_REGION env var | AWS region for KMS encryption operations.<br/><br/>Example: `us-east-1` |
| `encryption_kms_endpoint` | String | No | none | Endpoint URL override for KMS.<br/><br/>Example: `http://localhost:4566` |
| `encryption_allowed_master_key_arns` | String | Yes | none | The KMS master keys the plugin may use, as a comma-separated string or an array. The plugin refuses to start without it. Each entry must match a `key_storage.master_key_arn` value exactly (the same ARN, alias, or key id that was used to set up the column). A data key that names any other master key, or none, is refused before KMS is called. See [Restrict the KMS keys the application can use](#restrict-the-kms-keys-the-application-can-use).<br/><br/>Example: `arn:aws:kms:us-east-1:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab` |
| `encryption_metadata_schema` | String | No | `encrypt` | Schema (or database, on MySQL) holding the `encryption_metadata` and `key_storage` tables.<br/><br/>Example: `app_encrypt` |
| `encryption_metadata_cache_enabled` | Boolean | No | `true` | Cache the encryption metadata in memory. Leave enabled in production; when disabled, a short-lived metadata connection is opened for every statement that touches an encrypted column.<br/><br/>Example: `true` |
| `encryption_metadata_cache_expiration_sec` | Float | No | `3600.0` | How long cached encryption metadata stays valid. *(sec)*<br/><br/>Example: `600.0` |
| `encryption_metadata_cache_refresh_interval_sec` | Float | No | `300.0` | How often the encryption metadata is refreshed in the background. *(sec)*<br/><br/>Example: `60.0` |
| `encryption_data_key_cache_enabled` | Boolean | No | `true` | Cache decrypted data keys in memory. Leave enabled in production; when disabled, a KMS `Decrypt` call is made for every statement that touches an encrypted column.<br/><br/>Example: `true` |
| `encryption_data_key_cache_max_size` | Integer | No | `1000` | Maximum number of decrypted data keys held in memory.<br/><br/>Example: `100` |
| `encryption_data_key_cache_expiration_sec` | Float | No | `300.0` | How long a decrypted data key stays cached. *(sec)*<br/><br/>Example: `600.0` |
| `encryption_key_management_max_retries` | Integer | No | `3` | Maximum number of retries for throttled or failed key-management (KMS) operations.<br/><br/>Example: `5` |
| `encryption_key_management_retry_backoff_base_sec` | Float | No | `0.1` | Base delay for the exponential backoff between key-management (KMS) retries. *(sec)*<br/><br/>Example: `0.25` |
| `encryption_audit_logging_enabled` | Boolean | No | `false` | Log an audit record for every key-management, encryption, and decryption operation.<br/><br/>Example: `true` |
| `aws_credentials_provider` | Object | No | SDK default chain | A custom AWS credentials provider instance. One property is read by every plugin that calls AWS — IAM authentication, Secrets Manager and KMS encryption — so setting it once covers all of them. When unset, each falls back to the AWS SDK default credential provider chain.<br/><br/>Example: `Aws::AssumeRoleCredentials.new(...)` |
| `encryption_return_unverified_data` | Boolean | No | `false` | **Do not enable in production.** On read, return a value as stored when it cannot be confirmed to be this column's encrypted data instead of raising. Intended only for reading data written before the column was encrypted.<br/><br/>Example: `false` |

## Server-side enforcement is required

:::warning
A database-side HMAC-validation trigger is **required** on every encrypted
column to prevent plaintext writes, because the plugin alone cannot guarantee
an encrypted column never holds a plaintext (see the intro above). The
server-side trigger — not the plugin's SQL parsing — is what provides that
guarantee. See [Enforce encryption in the database](#enforce-encryption-in-the-database)
to set it up, and [Paths that are not covered](#paths-that-are-not-covered)
for exactly where the plugin relies on it.
:::


## Paths that are covered

Encryption applies to **bind parameters**, so a value can be encrypted only
when it is bound rather than written into the SQL text:

```ruby
# pg
conn.exec_params('INSERT INTO users (name, ssn) VALUES ($1, $2)', ['Jo', '123-45-6789'])
conn.exec_params('SELECT ssn FROM users WHERE name = $1', ['Jo']).each { |row| row['ssn'] }

# mysql2
client.prepare('INSERT INTO users (name, ssn) VALUES (?, ?)').execute('Jo', '123-45-6789')
```

:::caution
**On MySQL with ActiveRecord, set `prepared_statements: true` on the
connection.** The `aws_mysql2` adapter (like the underlying `mysql2`
adapter) defaults prepared statements **off**, and with them off
ActiveRecord writes a value into the SQL text as a literal rather than
binding it. The plugin cannot encrypt a literal, so a write to an encrypted
column is refused (`Errors::MetadataError`, see
[Refused, so the plaintext is not stored](#refused-so-the-plaintext-is-not-stored)).
Enable them in `database.yml` so values are bound and can be encrypted:

```yaml
production:
  adapter: aws_mysql2
  prepared_statements: true
  # ...
```

The `aws_postgresql` adapter already defaults prepared statements on, so
PostgreSQL needs no change.

Prepared statements are off by default on the mysql2 adapter for a reason,
so weigh the trade-off before enabling them fleet-wide:

- **Connection poolers/proxies.** Server-side prepared statements are bound
  to a specific backend connection. A pooler that multiplexes many clients
  onto fewer backends — Amazon RDS Proxy, ProxySQL, PgBouncer in transaction
  mode — may be unable to reuse them, which forces session pinning (defeating
  much of the pooling benefit) or surfaces `Unknown prepared statement
  handler` errors.
- **Server statement limits.** Each prepared statement consumes a handle
  against MySQL's `max_prepared_stmt_count`; many long-lived pooled
  connections each preparing many distinct statements can exhaust it and
  start failing with `Can't create more than max_prepared_stmt_count
  statements`.

If you cannot enable prepared statements, the plugin still cannot encrypt an
inlined literal — scope the encrypted columns to writes you can issue as
bound parameters (a raw prepared/`exec_params` statement, or an
`/*@encrypt:table.column*/` annotation on a bound value), and rely on the
required [server-side trigger](#enforce-encryption-in-the-database) to reject
any plaintext that slips through.
:::

The following paths are covered:

- Bind parameters of an `INSERT`, `UPDATE`, or `REPLACE` whose columns the
  plugin can read from the statement, including a multi-row `VALUES` list and
  the assignments of an upsert (`ON CONFLICT ... DO UPDATE` on PostgreSQL,
  `ON DUPLICATE KEY UPDATE` on MySQL). On PostgreSQL this also covers a
  `MERGE`'s `WHEN MATCHED ... UPDATE` / `WHEN NOT MATCHED ... INSERT` clauses
  and a data-modifying common table expression, for example
  `WITH w AS (INSERT INTO users (ssn) VALUES ($1) RETURNING id) SELECT * FROM w`.
- Bind parameters compared against an encrypted column in a `WHERE` clause.
  Note that encryption is randomized, with a fresh IV per value, so the
  ciphertext differs every time and an equality search against an encrypted
  column will not match anything — it silently returns no rows rather than
  matching, and nothing leaks through deterministic ciphertext. In an
  ActiveRecord app the same applies to finders and validations that compare
  an encrypted column: `where(ssn: x)`, `find_by(ssn: x)`, and
  `validates_uniqueness_of :ssn` never match an existing row, so a uniqueness
  validation silently passes even when a duplicate exists. Filter, look up,
  and enforce uniqueness on a column that is not encrypted instead.
- Statements run by name after being prepared, whether prepared by the
  driver's own `prepare` or by a `PREPARE` sent as a statement. A `PREPARE`
  is also checked as it is sent, so a plaintext written into the statement it
  carries is caught at that point.
- Reads, however the rows come back. A row read as a hash is matched to its
  columns by name; a row read as a **bare array** of values is matched by
  position, using the column names the result reports — which is what lets
  **ActiveRecord** reads decrypt even though it fetches rows as arrays
  (mysql2 in `as: :array` mode, `PG::Result#values`). This covers
  `PG::Result#each`, `#each_row`, `#to_a`, `#[]`, `#values`, `#field_values`,
  `#column_values`, `#tuple`, `#tuple_values` and `#getvalue`, its
  single-row-mode `#stream_each`/`#stream_each_row`/`#stream_each_tuple`, and
  mysql2's hash and array results alike. A decrypted value is always returned
  as a **string**, whatever type it had when it was written: an encrypted
  column is a binary column (`bytea` or `VARBINARY`), and a string keeps the
  read consistent with the column's real type and with how ActiveRecord
  treats it. Cast the value on read when you need another type, for example
  `row['age'].to_i`. The one exception is `COPY ... TO`, whose rows are a
  stream rather than values the plugin can replace, so it hands back the
  stored payload as-is.
- A column named explicitly with an annotation, which takes precedence over
  anything the parser found. This is the escape hatch for a statement the
  plugin cannot read:

  ```ruby
  conn.exec_params('INSERT INTO users (name, ssn) VALUES ($1, /*@encrypt:users.ssn*/ $2)', ...)
  ```

The plugin treats reads and writes differently. A **read fails closed**: a
value read from an encrypted column that does not verify — it is not a valid
encrypted payload, or its integrity tag does not match — is refused with an
`Errors::EncryptionError` rather than handed back, so the application never
receives a value the wrapper cannot vouch for. A consequence worth noting: a
value that reached an encrypted column outside the plugin, including data
that predates the column being encrypted, will raise when read back through
the plugin, so encrypt existing data before it is read through an encrypted
column (or, only for a controlled migration, see
[reading data written before encryption](#reading-data-written-before-encryption)).
A **write** is the opposite — when the plugin cannot do its job it mostly
stays out of the way and leaves the value to the
[server-side enforcement](#enforce-encryption-in-the-database), which is what
actually guarantees an encrypted column never holds a plaintext, with one
exception: it **fails closed** and raises `Errors::MetadataError` when it can
confirm a column is encrypted and sees the statement writing it with
something other than a bind parameter, which cannot be encrypted and is
almost always a mistake. Everything else on a write it cannot fully read, it
passes through — see
[paths that are not covered](#paths-that-are-not-covered).


## Reading data written before encryption

When you enable encryption on a column that already holds plaintext, those
existing rows are not encrypted payloads, so reading them back through the
plugin fails closed and raises. The supported way to handle this is to
**encrypt the existing data** (read each value and write it back through the
plugin so it is stored encrypted) before the application reads the column
normally.

For a controlled migration where that is not yet possible,
`encryption_return_unverified_data` (default `false`) makes the read
**lenient**: a value that cannot be confirmed to be this column's encrypted
data — too short to be a payload, or a failed HMAC — is returned exactly as
the database holds it instead of raising, so legacy plaintext reads back
untouched while genuinely encrypted values still decrypt.

:::warning
**Do not enable `encryption_return_unverified_data` in production.** It lets
unverified data reach the application and removes the read path's tamper
detection: a value that fails its integrity check can no longer be told apart
from a value that was never encrypted, so a tampered or corrupted value is
returned silently. Use it only for a bounded migration of pre-existing data,
then turn it off. Even when it is enabled, a value that verifies but cannot
be decrypted (a wrong or mismatched data key) still raises, because that
indicates a real key fault rather than legacy plaintext.
:::


## Paths that are not covered

Only the required
[server-side enforcement](#enforce-encryption-in-the-database) guarantees an
encrypted column never holds a plaintext. The plugin encrypts what it can
confidently identify and, apart from the one refusal below, leaves everything
else to that enforcement rather than refusing statements it cannot fully
read — which would reject legitimate statements that never touch an encrypted
column.

### Refused, so the plaintext is not stored

A write **raises `Errors::MetadataError`** in one case: the plugin can
confirm a column is encrypted, but the statement writes it with something
other than a bind parameter — a value in the SQL text, an expression around a
parameter, a `DEFAULT`, or a `COPY ... FROM` that names the column. None of
these can be encrypted, and it is almost always a mistake, so the write is
refused with advice to bind the value (or, for a `COPY`, use `INSERT`). An
annotation naming the column overrides this wherever there is a parameter for
it to name, which a `COPY` does not have.

### Passed through, relying on the database

When the plugin can see a statement writes but cannot establish which
columns — so it cannot be sure an encrypted column is even involved — it lets
the statement through and leaves any plaintext for the database to reject,
rather than refusing a statement that may touch no encrypted column at all.
This covers an `INSERT` that does not name its columns, an `INSERT` whose
values come from a nested `SELECT`, an `UPDATE` naming more than one table
(which of them an assignment belongs to cannot be established), a `MERGE`
clause or data-modifying CTE whose written columns cannot be enumerated, a
`COPY ... FROM` that names no columns, a statement prepared somewhere the
connection could not read, a write the parser could not read at all, and any
statement while the plugin's own metadata tables are unreadable. It is
logged — at `warn` when the target table is known to have encrypted columns,
at `debug` otherwise.

A table or column name the plugin cannot read in the connection's encoding
is also left to the database, and logged at `warn`; see
[Character encodings](#character-encodings).

### Not seen at all, so a plaintext is stored silently

:::warning
On the paths below the plugin never sees the write at all, so a plaintext
goes to the server and is stored, with nothing raised and nothing logged at
write time. The server-side HMAC-validation trigger (see
[enforce encryption in the database](#enforce-encryption-in-the-database)) is
what stops these paths from storing a plaintext. Without the trigger the
plaintext is stored; a later read of it through the plugin fails closed and
raises, but a read that does not go through the plugin still returns it in
the clear.
:::

- `LOAD DATA INFILE` on MySQL, and a `COPY ... FROM` whose statement text
  cannot be parsed.
- Anything the server runs on the application's behalf: `CALL`, `DO`, a
  function, a stored routine, a trigger.
- MySQL's `PREPARE stmt FROM '<statement text>'` together with
  `EXECUTE stmt USING @vars`, and SQL-level `EXECUTE` with inline literals:
  the values live in server-side variables the plugin never sees.
- The second and later statements of a multi-statement string.
- Everything that reaches the column without passing through a connection
  that has the plugin enabled: `psql` or the `mysql` client, a migration
  tool, another service, a wrapper connection whose `wrapper_plugins` does
  not include `kms_encryption`, and whatever was already in the table before
  the column was configured.


## Character encodings

**String values** are encrypted as UTF-8 text, whatever encoding the Ruby
string is in, and are always decrypted to a UTF-8 `String`. A UTF-16 or
Latin-1 `"grün"` reads back as the UTF-8 `"grün"`. A binary (`ASCII-8BIT`) string is treated as raw bytes
and reads back as binary. A string that has no UTF-8 form, for example
because it contains bytes that are invalid in its encoding, is refused with
`Errors::EncryptionError`.

**SQL** can be in any encoding. The plugin reads a UTF-8 copy of each
statement to find its encrypted columns, while the driver is sent the SQL
exactly as your application wrote it.

### Known limitations

Both limitations below need a table or column name that isn't plain ASCII.
Encrypted tables and columns with ASCII names are unaffected.

- **Names the connection's encoding can't be read in.** On a connection that
  isn't UTF-8, the plugin converts table and column names to UTF-8 to match
  them against the encryption metadata. Ruby can't convert every character of
  every encoding. For example, some characters of PostgreSQL's
  `SHIFT_JIS_2004` and `EUC_JIS_2004` can't be converted, and Ruby can't
  convert the `MULE_INTERNAL`, `EUC_TW`, `WIN1258` and `JOHAB` encodings at
  all. When a name contains such a character, the plugin can't tell whether
  its column is encrypted. It logs a warning, once for each name, and doesn't
  encrypt or decrypt that column:
  - A **write** is left to the [server-side trigger](#enforce-encryption-in-the-database),
    which rejects the plaintext value.
  - A **read** returns the stored encrypted bytes instead of the decrypted
    value.
- **Binary SQL on a connection that isn't UTF-8.** A statement passed as a
  binary (`ASCII-8BIT`) string has no encoding of its own, so the plugin reads
  its bytes as UTF-8. On a connection in another encoding, a non-ASCII table
  or column name in such a statement can't be read, and it's handled as in the
  previous limitation.

:::tip
To avoid these limitations, use a UTF-8 connection (`client_encoding: 'UTF8'`
on PostgreSQL, `encoding: 'utf8mb4'` on MySQL, which are the defaults for
most setups), give encrypted tables and columns ASCII names, and pass SQL as
strings tagged with their real encoding rather than as binary.
:::


## Enforce encryption in the database

A database-side HMAC-validation trigger is required on every encrypted
column. The trigger needs no help from the application, because the HMAC key
that signs each value is stored unencrypted in `key_storage`: the server can
verify that a value carries a valid integrity tag without holding the data
key.

### PostgreSQL

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Replace 'encrypt' below if encryption_metadata_schema is set to something else.
CREATE OR REPLACE FUNCTION enforce_encrypted_column() RETURNS trigger AS $$
DECLARE
  col_name  text := TG_ARGV[0];
  col_value bytea;
  hmac_key  bytea;
  cache_key text := 'hmac_key.' || TG_TABLE_NAME || '.' || col_name;
  unchanged boolean;
BEGIN
  -- An UPDATE that leaves the encrypted value as it was is not re-checked; see
  -- "Updates after a key rotation".
  IF TG_OP = 'UPDATE' THEN
    EXECUTE format('SELECT ($1).%I IS NOT DISTINCT FROM ($2).%I', col_name, col_name)
      INTO unchanged USING NEW, OLD;
    IF unchanged THEN
      RETURN NEW;
    END IF;
  END IF;

  EXECUTE format('SELECT ($1).%I', col_name) INTO col_value USING NEW;
  IF col_value IS NULL THEN
    RETURN NEW;
  END IF;

  -- A setting cached by an earlier transaction reads back as '' rather than being
  -- undefined, so an empty value is treated as not cached.
  hmac_key := decode(NULLIF(current_setting(cache_key, true), ''), 'hex');
  IF hmac_key IS NULL THEN
    SELECT ks.hmac_key INTO hmac_key
      FROM encrypt.encryption_metadata em
      JOIN encrypt.key_storage ks ON em.key_id = ks.id
     WHERE em.table_name = TG_TABLE_NAME AND em.column_name = col_name;

    IF hmac_key IS NULL THEN
      RAISE EXCEPTION 'No HMAC key is configured for %.%', TG_TABLE_NAME, col_name;
    END IF;

    PERFORM set_config(cache_key, encode(hmac_key, 'hex'), true);
  END IF;

  IF length(col_value) < 65
     OR substring(col_value from 1 for 32) <> hmac(substring(col_value from 33), hmac_key, 'sha256') THEN
    RAISE EXCEPTION 'Column %.% does not carry a valid HMAC tag (plaintext or tampered value)', TG_TABLE_NAME, col_name;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

Then create a trigger for every column that you want to encrypt:

```sql
-- Create the trigger for every column that you want to encrypt.
CREATE TRIGGER users_ssn_encrypted
BEFORE INSERT OR UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION enforce_encrypted_column('ssn');

-- Create the trigger for another column.
CREATE TRIGGER users_dob_encrypted
BEFORE INSERT OR UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION enforce_encrypted_column('dob');
```

The HMAC key is cached for the length of the transaction rather than the
session, so that a key rotation takes effect immediately. Widen it to the
session with `set_config(..., false)` if the per-transaction metadata lookup
costs more than the rotation delay is worth.

### MySQL

MySQL has no built-in HMAC function, so the equivalent builds HMAC-SHA256 out
of `SHA2()`. Create the two functions and the two validation procedures once per
schema, then add a `BEFORE INSERT` and a `BEFORE UPDATE` trigger per encrypted
column. Replace `SCHEMA_NAME` with the value of `encryption_metadata_schema`
(`encrypt` by default). Requires MySQL 5.7+ / MariaDB 10.2+ for `SHA2()`. On
Aurora/RDS MySQL, creating the functions may require the cluster parameter
`log_bin_trust_function_creators` to be set to `1`.

```sql
DELIMITER $$

-- HMAC-SHA256 built from SHA2(), which MySQL has no native HMAC for.
DROP FUNCTION IF EXISTS hmac_sha256$$
CREATE FUNCTION hmac_sha256(
    message VARBINARY(65535),
    key_data VARBINARY(64)
)
RETURNS VARBINARY(32)
DETERMINISTIC
NO SQL
BEGIN
    DECLARE block_size INT DEFAULT 64;  -- SHA-256 block size
    DECLARE key_padded VARBINARY(64);
    DECLARE ipad VARBINARY(64);
    DECLARE opad VARBINARY(64);
    DECLARE i INT DEFAULT 1;
    DECLARE key_byte INT;

    -- Reduce an over-long key to its hash, then zero-pad the key to the block size.
    IF LENGTH(key_data) > block_size THEN
        SET key_padded = CONCAT(UNHEX(SHA2(key_data, 256)), REPEAT(X'00', block_size - 32));
    ELSE
        SET key_padded = CONCAT(key_data, REPEAT(X'00', block_size - LENGTH(key_data)));
    END IF;

    -- ipad = key XOR 0x36 per byte, opad = key XOR 0x5C per byte, one raw byte at a time.
    SET ipad = X'';
    SET opad = X'';
    WHILE i <= block_size DO
        SET key_byte = ASCII(SUBSTRING(key_padded, i, 1));
        SET ipad = CONCAT(ipad, UNHEX(LPAD(HEX(key_byte ^ 0x36), 2, '0')));
        SET opad = CONCAT(opad, UNHEX(LPAD(HEX(key_byte ^ 0x5C), 2, '0')));
        SET i = i + 1;
    END WHILE;

    RETURN UNHEX(SHA2(CONCAT(opad, UNHEX(SHA2(CONCAT(ipad, message), 256))), 256));
END$$

-- Verifies that a stored value carries a valid HMAC for the given HMAC key.
DROP FUNCTION IF EXISTS verify_encrypted_data_hmac$$
CREATE FUNCTION verify_encrypted_data_hmac(
    data VARBINARY(65535),
    hmac_key VARBINARY(32)
)
RETURNS BOOLEAN
DETERMINISTIC
NO SQL
BEGIN
    -- Minimum payload: 32 (HMAC) + 4 (key id) + 1 (type) + 12 (IV) + 0 (ciphertext) + 16 (GCM tag) = 65.
    IF data IS NULL OR LENGTH(data) < 65 THEN
        RETURN FALSE;
    END IF;

    RETURN SUBSTRING(data, 1, 32) = hmac_sha256(SUBSTRING(data, 33), hmac_key);
END$$

-- Called from a BEFORE INSERT trigger (and by the BEFORE UPDATE procedure) to reject a value that is
-- not a valid kms_encryption payload. Replace SCHEMA_NAME with encryption_metadata_schema.
DROP PROCEDURE IF EXISTS validate_encrypted_data_hmac_before_insert$$
CREATE PROCEDURE validate_encrypted_data_hmac_before_insert(
    IN p_table_name VARCHAR(64),
    IN p_column_name VARCHAR(64),
    IN column_value VARBINARY(65535)
)
BEGIN
    DECLARE v_hmac_key VARBINARY(32);

    IF column_value IS NOT NULL THEN
        SELECT ks.hmac_key INTO v_hmac_key
        FROM SCHEMA_NAME.encryption_metadata em
        JOIN SCHEMA_NAME.key_storage ks ON em.key_id = ks.id
        WHERE em.table_name = p_table_name
          AND em.column_name = p_column_name
        LIMIT 1;

        IF v_hmac_key IS NULL THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'No HMAC key is configured for the encrypted column';
        END IF;

        IF NOT verify_encrypted_data_hmac(column_value, v_hmac_key) THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Column does not carry a valid HMAC tag (plaintext or tampered value)';
        END IF;
    END IF;
END$$

-- Called from a BEFORE UPDATE trigger. An UPDATE that leaves the value as it was is not
-- re-checked; see "Updates after a key rotation".
DROP PROCEDURE IF EXISTS validate_encrypted_data_hmac_before_update$$
CREATE PROCEDURE validate_encrypted_data_hmac_before_update(
    IN p_table_name VARCHAR(64),
    IN p_column_name VARCHAR(64),
    IN new_value VARBINARY(65535),
    IN old_value VARBINARY(65535)
)
BEGIN
    IF NOT (new_value <=> old_value) THEN
        CALL validate_encrypted_data_hmac_before_insert(p_table_name, p_column_name, new_value);
    END IF;
END$$

DELIMITER ;
```

Then create a pair of triggers for every column that you want to encrypt. For
example, on `users.ssn`:

```sql
DELIMITER $$
-- Create both triggers for every column that you want to encrypt.
CREATE TRIGGER users_ssn_hmac_check
BEFORE INSERT ON users
FOR EACH ROW
BEGIN
    CALL validate_encrypted_data_hmac_before_insert('users', 'ssn', NEW.ssn);
END$$

CREATE TRIGGER users_ssn_hmac_check_update
BEFORE UPDATE ON users
FOR EACH ROW
BEGIN
    CALL validate_encrypted_data_hmac_before_update('users', 'ssn', NEW.ssn, OLD.ssn);
END$$

-- Repeat the pair for another column, e.g. users.dob.
CREATE TRIGGER users_dob_hmac_check
BEFORE INSERT ON users
FOR EACH ROW
BEGIN
    CALL validate_encrypted_data_hmac_before_insert('users', 'dob', NEW.dob);
END$$

CREATE TRIGGER users_dob_hmac_check_update
BEFORE UPDATE ON users
FOR EACH ROW
BEGIN
    CALL validate_encrypted_data_hmac_before_update('users', 'dob', NEW.dob, OLD.dob);
END$$
DELIMITER ;
```

### Updates after a key rotation

Both triggers check a value against the column's **current** HMAC key, and
rotating a column's data key also gives it a new HMAC key. Values written
before the rotation keep the previous key's HMAC tag, which is still valid
for them: the plugin reads them with the key they were written with.

So the triggers skip the check when an `UPDATE` leaves the encrypted value
unchanged. Without that, every update to a row written before the rotation,
even one that only changes another column, would be rejected until the row's
encrypted values were re-encrypted. A value that is new to the row - an
`INSERT`, or an `UPDATE` that changes the encrypted column - is still
checked, and must carry the current key's tag. The plugin always writes new
values with the current key, so its writes pass.


## Hardening the deployment

Two access-control boundaries do most of the work of keeping the encryption
meaningful: which KMS keys the application can reach, and who can write the
metadata schema.

### Restrict the KMS keys the application can use

The plugin does not take the master key for a column from its own
configuration: it reads it from the column's `key_storage` row and asks KMS
to decrypt the data key under it. Two independent controls keep a changed row
from pointing the plugin at a key it should not use.

**List the permitted master keys in `encryption_allowed_master_key_arns`.**
This property is required. Before every KMS call, the plugin checks the
master key named by `key_storage` against the list. A key that is not listed,
or a row that names no key, is refused with an `Errors::KeyManagementError`
(code `KEY07`), and KMS is never called. The refusal applies to reads and
writes alike, and `encryption_return_unverified_data` does not bypass it. The
comparison is exact, so list each key in the same form (ARN, alias, or key
id) that was passed to `Plugins::Encryption::KeyManagementUtility` when the column was set up. Add a
new master key to the list before rotating a column onto it, or the
application will refuse that column until the list is updated. Keep the old
master key listed, and allowed `kms:Decrypt` in the application's IAM
policy, until every value written before the rotation has been re-encrypted:
those values are still wrapped under the old key, and reading one fails
with `KEY07` once that key is removed from the list.
`Plugins::Encryption::KeyManagementUtility` does not require the property, so a script can create a
master key and use it straight away, but it enforces the list when one is
configured. Without the list, `rotate_data_key` must be passed the master key
to rotate onto: keeping the current one would mean trusting whatever ARN
`key_storage` holds.

**Scope the application's IAM permissions to the same keys.** Grant the
credentials the plugin runs under only the KMS actions they need, on the
specific master key ARN(s) the columns use - never `Resource: "*"`. Use a
distinct key per environment. This also blocks a key in another AWS
account: using one requires permission in your own account's policy as
well as in that key's policy.

At runtime the plugin only decrypts stored data keys, so the application's
role needs just `kms:Decrypt` on those keys:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "kms:Decrypt",
      "Resource": "arn:aws:kms:us-east-1:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab"
    }
  ]
}
```

The administrative side (`Plugins::Encryption::KeyManagementUtility`: creating master keys, turning
encryption on for a column, rotating data keys) additionally calls
`kms:GenerateDataKey`, `kms:CreateKey`, `kms:CreateAlias`, and
`kms:DescribeKey`. Run it under a separate, admin-only credential rather than
granting those actions to the application's runtime role.

Do not add a `kms:ViaService` condition to these policies. That condition
only matches requests an AWS service makes to KMS on your behalf, and the
plugin calls KMS directly from the application, so every `Decrypt` would be
denied.

### Restrict write access to the metadata schema

`encryption_metadata` records which columns are encrypted, and `key_storage`
holds each column's KMS-encrypted data key alongside its HMAC key (in the
clear). Anyone who can **write** those tables can defeat the protection:
substituting a known HMAC key lets them forge values that pass the
server-side trigger. Repointing a column at a master key they control is
refused by `encryption_allowed_master_key_arns`, but they can still delete or
swap the key material of listed keys and make a column unreadable. Whether the
column holds only ciphertext is only as strong as who can change
`key_storage`.

At runtime the plugin only reads the metadata schema, so grant the
application's database role `SELECT` on it and nothing more. Reserve
`INSERT`/`UPDATE`/`DELETE` for the administrative role that runs
`Plugins::Encryption::KeyManagementUtility`.

```sql
-- PostgreSQL
GRANT USAGE ON SCHEMA encrypt TO app_role;
GRANT SELECT ON ALL TABLES IN SCHEMA encrypt TO app_role;
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA encrypt FROM app_role;
```

```sql
-- MySQL (the encrypt schema is a database)
GRANT SELECT ON encrypt.* TO 'app_user'@'%';
-- grant INSERT/UPDATE/DELETE on encrypt.* only to the administrative user
```

The application's role does still need `SELECT` on `key_storage`, both to
read key material and because the server-side trigger reads the HMAC key as
the invoking user.

### Encrypted values are not tied to their row

Each stored value is checked against its column's keys: its HMAC tag and its
AES-GCM authentication tag must both verify before it is decrypted. Nothing in
the value identifies the row it belongs to, though. An encrypted value copied
from one row into another row of the **same column** still verifies, is
accepted by the server-side trigger, and decrypts normally.

So anyone who can `UPDATE` a table with encrypted columns can move encrypted
values between its rows without holding any key. For example, they could copy
another user's encrypted SSN into their own row and then read it through the
application in plaintext, or overwrite a value with an older one. This
includes the application's own database role, and so any SQL injection in
the application. Moving a value into a **different** column does not work:
each column has its own data key and HMAC key (as `Plugins::Encryption::KeyManagementUtility` sets
up), so the server-side trigger refuses the write.

To limit the exposure:

- Grant `UPDATE` on tables with encrypted columns only to the roles that
  need it, and treat that privilege as sensitive.
- Keep SQL injection out of the application. Binding values, which the plugin
  already requires for writes to encrypted columns, does most of this.
- Where a value must provably belong to its row, have the application tie them
  together itself. For example, write the row's key as part of the value (such
  as `"#{user_id}:#{ssn}"`) and check it after reading.

