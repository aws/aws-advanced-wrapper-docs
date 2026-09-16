---
title: AWS Secrets Manager Plugin
---

The AWS Secrets Manager Plugin allows connections to use database credentials
stored as secrets in [AWS Secrets Manager](https://aws.amazon.com/secrets-manager/).
When a new connection is created with this plugin enabled, the plugin
retrieves the secret and creates the connection with the credentials inside
it.


:::info Available since
Version 1.0.0
:::

:::warning Only one authentication plugin at a time
The `secrets_manager` and `iam` plugins are mutually exclusive — only one authentication plugin may be active at a time. Configuring both in `wrapper_plugins` raises a `PluginConflictError` at connection initialization.
:::

## Prerequisites

:::warning
To use this plugin, add `aws-sdk-secretsmanager` to your Gemfile:

```ruby
gem 'aws-sdk-secretsmanager'
```
:::

:::warning
To use this plugin, you must provide valid AWS credentials through the AWS
SDK credential provider chain. Temporary credentials (AWS STS, IAM roles,
SSO) expire, so ensure your provider refreshes them, monitor expiration in
production, and handle credential-related failures.
:::

See [AWS Credentials](../aws-credentials) for which credential sources the SDK
refreshes automatically and which it does not.


## How to enable

Add the plugin code `secrets_manager` to the `wrapper_plugins` parameter.

```ruby
conn = AwsAdvancedRubyDriverWrapper::WrapperPgConnection.new(
  host: "my-cluster.cluster-xyz.us-east-1.rds.amazonaws.com",
  dbname: "mydb",
  wrapper_plugins: "secrets_manager",
  secret_id: "my-db-secret",
  secret_region: "us-east-1"
)

```

## Configuration parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `secret_id` | String | Yes | none | The name or ARN of the secret to retrieve.<br/><br/>Example: `my-db-secret` |
| `secret_region` | String | Yes, unless the secret id is an ARN | none | The AWS region the secret is in. When the secret id is an ARN, the region is parsed from it automatically.<br/><br/>Example: `us-east-1` |
| `secret_endpoint` | String | No | none | Endpoint URL override used to retrieve the secret. Must include a valid protocol (for example `http://`) and domain. A port is not required.<br/><br/>Example: `http://localhost:1234` |
| `secret_expiration_sec` | Float | No | `870.0` | Time in seconds that secrets are cached before being re-fetched. *(s)*<br/><br/>Example: `600.0 (minimum 300.0)` |
| `secret_username_key` | String | No | `username` | The key in the JSON secret that contains the username for the database connection.<br/><br/>Example: `writerUsername` |
| `secret_password_key` | String | No | `password` | The key in the JSON secret that contains the password for the database connection.<br/><br/>Example: `readerPassword` |
| `aws_credentials_provider` | Object | No | SDK default chain | A custom AWS credentials provider instance. One property is read by every plugin that calls AWS — IAM authentication, Secrets Manager and KMS encryption — so setting it once covers all of them. When unset, each falls back to the AWS SDK default credential provider chain.<br/><br/>Example: `Aws::AssumeRoleCredentials.new(...)` |
| `secret_rotation_retry_timeout_sec` | Float | No | `0.0` | Total time budget for retrying a connection that failed to log in, re-fetching the credentials before each retry. `0` disables retrying. *(s)*<br/><br/>Example: `30.0` |
| `secret_rotation_retry_base_delay_sec` | Float | No | `0.5` | Initial delay before a failed connection is retried. The delay grows exponentially between attempts. Only used when the retry timeout is greater than `0`. *(s)*<br/><br/>Example: `1.0` |

## Secret data

The secret stored in AWS Secrets Manager should be a JSON object containing
the `username` and `password` keys. If the secret uses different key names,
specify them with the username and password key parameters.

A Secret ARN has the format
`arn:aws:secretsmanager:<Region>:<AccountId>:secret:SecretName-6RandomCharacters`.


## Secret rotation

AWS Secrets Manager does not require credential rotation, and the wrapper does
not enforce it. We recommend enabling
[automatic rotation](https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotating-secrets.html)
anyway, so that credentials change on a schedule and a leaked secret has a
bounded lifetime.

The plugin is built to keep working across a rotation:

- Retrieved credentials are cached for `secret_expiration_sec` (`870.0` seconds by
  default) and then re-fetched, so a rotated secret is picked up on its own once
  the cache entry expires.
- If a connection fails to authenticate with cached credentials, the plugin
  forces an immediate re-fetch and retries once. That covers the common case
  where the rotation happened between two connections.
- For the brief window while a rotation is actually in progress, set
  `secret_rotation_retry_timeout_sec` to a non-zero value and the plugin retries
  with exponential backoff, tunable through
  `secret_rotation_retry_base_delay_sec`. This bridges the gap until the newly
  rotated credentials become valid.

## Related

- [Configuring TLS/SSL](../configuring-tls) — the retrieved password travels over
  the connection like any other password, so verify the server and encrypt the
  traffic.
- [AWS Credentials](../aws-credentials) — what this plugin needs in order to call
  Secrets Manager.

