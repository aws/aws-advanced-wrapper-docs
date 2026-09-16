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
  encryption_audit_logging_enabled: true
)

```

Verify plugin compatibility within your Ruby configuration using the [compatibility guide](../compatibility).

## Configuration parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `encryption_kms_region` | String | Yes | AWS_REGION env var | AWS region for KMS encryption operations.<br/><br/>Example: `us-east-1` |
| `encryption_kms_endpoint` | String | No | none | Endpoint URL override for KMS.<br/><br/>Example: `http://localhost:4566` |
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
On its own, the plugin cannot guarantee that an encrypted column never holds
a plaintext value: it only sees statements this wrapper sends over a
connection with the plugin enabled, and it identifies which columns to
encrypt by best-effort SQL parsing. A database-side HMAC-validation trigger
is **required** on every encrypted column to prevent plaintext writes. The
server-side trigger — not the SQL parser — is what guarantees an encrypted
column never holds plaintext.
:::

The plugin treats reads and writes differently. A **read fails closed**: a
value that does not verify (not a valid encrypted payload, or a failed HMAC)
raises `Errors::EncryptionError` rather than being handed back. A **write**
mostly stays out of the way and leaves the value to the server-side
enforcement, with one exception — it **fails closed** with
`Errors::MetadataError` when it can confirm a column is encrypted and sees
the statement writing it with something other than a bind parameter.


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

A column can also be named explicitly with an annotation, which takes
precedence over anything the parser found:

```ruby
conn.exec_params('INSERT INTO users (name, ssn) VALUES ($1, /*@encrypt:users.ssn*/ $2)', ...)
```

Encryption is randomized (a fresh IV per value), so an equality search
against an encrypted column never matches — filter, look up, and enforce
uniqueness on a column that is not encrypted instead.

:::caution
**On MySQL with ActiveRecord, set `prepared_statements: true` on the
connection.** The `aws_mysql2` adapter defaults prepared statements off, and
with them off ActiveRecord writes values into the SQL text as literals,
which the plugin cannot encrypt (a write to an encrypted column is refused
with `Errors::MetadataError`). The `aws_postgresql` adapter already defaults
prepared statements on. Weigh the trade-off before enabling them
fleet-wide, because server-side prepared statements interact poorly with
connection poolers and count against MySQL's `max_prepared_stmt_count`.
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
BEGIN
  EXECUTE format('SELECT ($1).%I', col_name) INTO col_value USING NEW;
  IF col_value IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    hmac_key := decode(current_setting(cache_key), 'hex');
  EXCEPTION WHEN OTHERS THEN
    SELECT ks.hmac_key INTO hmac_key
      FROM encrypt.encryption_metadata em
      JOIN encrypt.key_storage ks ON em.key_id = ks.id
     WHERE em.table_name = TG_TABLE_NAME AND em.column_name = col_name;

    IF hmac_key IS NULL THEN
      RAISE EXCEPTION 'No HMAC key is configured for %.%', TG_TABLE_NAME, col_name;
    END IF;

    PERFORM set_config(cache_key, encode(hmac_key, 'hex'), true);
  END;

  IF length(col_value) < 65
     OR substring(col_value from 1 for 32) <> hmac(substring(col_value from 33), hmac_key, 'sha256') THEN
    RAISE EXCEPTION 'Column %.% does not carry a valid HMAC tag (plaintext or tampered value)', TG_TABLE_NAME, col_name;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger for every column that you want to encrypt.
CREATE TRIGGER users_ssn_encrypted
BEFORE INSERT OR UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION enforce_encrypted_column('ssn');

-- Create the trigger for another column.
CREATE TRIGGER users_dob_encrypted
BEFORE INSERT OR UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION enforce_encrypted_column('dob');
```

### MySQL

MySQL has no built-in HMAC function, so the equivalent builds HMAC-SHA256 out
of `SHA2()`. Create the two functions and the validation procedure once per
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

-- Called from a BEFORE INSERT / BEFORE UPDATE trigger to reject a value that is
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
    CALL validate_encrypted_data_hmac_before_insert('users', 'ssn', NEW.ssn);
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
    CALL validate_encrypted_data_hmac_before_insert('users', 'dob', NEW.dob);
END$$
DELIMITER ;
```


## Hardening the deployment

Two access-control boundaries keep the encryption meaningful:

- **Restrict the KMS keys the application can use.** At runtime the plugin
  only decrypts stored data keys, so grant the application's role just
  `kms:Decrypt` on the specific master key ARN(s) — never `Resource: "*"`.
  Run the administrative side (`KeyManagementUtility`) under a separate
  admin-only credential.
- **Restrict write access to the metadata schema.** Anyone who can write
  `encryption_metadata` or `key_storage` can defeat the protection. Grant
  the application's role `SELECT` and reserve `INSERT`/`UPDATE`/`DELETE` for
  the administrative role:

```sql
-- PostgreSQL
GRANT USAGE ON SCHEMA encrypt TO app_role;
GRANT SELECT ON ALL TABLES IN SCHEMA encrypt TO app_role;
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA encrypt FROM app_role;
```

