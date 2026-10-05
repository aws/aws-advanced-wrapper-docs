---
title: IAM Authentication Plugin
---

AWS Identity and Access Management (IAM) grants users access control across
AWS services with granular permissions. The IAM Authentication Plugin enables
[IAM database authentication](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.html)
for connections: instead of a static password, the plugin generates a
short-lived IAM authentication token and injects it into the connection
properties before each connection attempt. For more information on IAM, see
the [IAM documentation](https://docs.aws.amazon.com/IAM/latest/UserGuide/introduction.html).


:::info Available since
Version 1.0.0
:::

:::warning Only one authentication plugin at a time
The `iam` and `secrets_manager` plugins are mutually exclusive — only one authentication plugin may be active at a time. Configuring both in `wrapper_plugins` raises a `PluginConflictError` at connection initialization.
:::

## Prerequisites

:::warning
To use this plugin, add `aws-sdk-rds` to your Gemfile:

```ruby
gem 'aws-sdk-rds'
```
:::

:::warning
To use this plugin, you must provide valid AWS credentials through the AWS
SDK credential provider chain. Temporary credentials (AWS STS, IAM roles,
SSO) expire, so ensure your provider refreshes them before they lapse to
avoid authentication failures. For more information, see the
[AWS credentials documentation](https://docs.aws.amazon.com/sdk-for-ruby/v3/developer-guide/setup-config.html).
:::

Then enable IAM database authentication on your RDS or Aurora instance,
create an [IAM policy](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.IAMPolicy.html)
granting `rds-db:connect`, and create a database account mapped to IAM:

- MySQL: `CREATE USER iam_user IDENTIFIED WITH AWSAuthenticationPlugin AS 'RDS';`
- PostgreSQL: `CREATE USER iam_user; GRANT rds_iam TO iam_user;`


## Use TLS/SSL with IAM authentication

:::warning
It is strongly recommended to use a **TLS/SSL 1.2+ connection** with IAM
database authentication. IAM tokens are sent as passwords, and SSL ensures
they are encrypted in transit.
:::

**MySQL (`mysql2`):**

```ruby
AwsAdvancedRubyDriverWrapper::WrapperMysql2Client.new(
  host: "my-cluster.cluster-xyz.us-east-1.rds.amazonaws.com",
  username: "iam_user",
  wrapper_plugins: "iam",
  enable_cleartext_plugin: true,
  sslca: "/path/to/global-bundle.pem",
  ssl_mode: "verify_identity"
)
```

**PostgreSQL (`pg`):**

```ruby
AwsAdvancedRubyDriverWrapper::WrapperPgConnection.new(
  host: "my-cluster.cluster-xyz.us-east-1.rds.amazonaws.com",
  user: "iam_user",
  wrapper_plugins: "iam",
  sslmode: "verify-full",
  sslrootcert: "/path/to/global-bundle.pem"
)
```

When connecting directly to an RDS or Aurora endpoint, use the AWS global
certificate bundle from the
[RDS SSL/TLS documentation](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html).

If you connect through something that is not an RDS endpoint — a proxy, or your
own domain name — two things change together. Set `iam_host` to a valid Amazon
RDS endpoint so the token is generated for the right host, and supply the
certificate authority appropriate for the endpoint you are *connecting* to
rather than the one you are generating the token for.

For the full picture, including what the wrapper does and does not enforce, see
[Configuring TLS/SSL](../configuring-tls).


## MySQL requires the cleartext plugin

:::caution
**MySQL requires `enable_cleartext_plugin: true`.** RDS/Aurora MySQL IAM
authentication relies on the MySQL `mysql_clear_password` client plugin,
because the IAM token must be sent to the server in cleartext. The wrapper
does **not** set this for you, so pass `enable_cleartext_plugin: true` when
using the plugin with MySQL. Because the token is sent in cleartext, you
must also use a TLS/SSL connection so it is encrypted in transit. This does
not apply to PostgreSQL (`pg`).
:::


## Host requirements

When using IAM database authentication, the connection host must be a valid
Amazon RDS endpoint — not a custom domain or an IP address — for example
`my-cluster.cluster-xyz.us-east-1.rds.amazonaws.com`. When connecting
through a custom Aurora cluster endpoint, set the host override parameter to a
valid RDS endpoint instead. IAM database authentication is limited to certain database
engines; see the
[IAM database authentication documentation](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.html).


## How to enable

Add the plugin code `iam` to the `wrapper_plugins` parameter.

```ruby
conn = AwsAdvancedRubyDriverWrapper::WrapperPgConnection.new(
  host: "my-cluster.cluster-xyz.us-east-1.rds.amazonaws.com",
  user: "iam_user",
  wrapper_plugins: "iam",
  sslmode: "verify-full",
  sslrootcert: "/path/to/global-bundle.pem"
)

```

Verify plugin compatibility within your Ruby configuration using the [compatibility guide](../compatibility).

## Configuration parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `iam_host` | String | No | derived from host | Overrides the hostname used to generate the IAM token. Required when connecting through a custom endpoint. The default is derived from the connection host.<br/><br/>Example: `my-cluster.cluster-xyz.us-east-1.rds.amazonaws.com` |
| `iam_port` | Integer | No | dialect default | Overrides the port used to generate the IAM token. The default is determined from the underlying driver protocol or the dialect default.<br/><br/>Example: `5432` |
| `iam_region` | String | No | parsed from host | Overrides the AWS region used to generate the IAM token. The default is parsed from the connection string.<br/><br/>Example: `us-east-1` |
| `iam_expiration_sec` | Float | No | `870.0` | Fallback cache lifetime, in seconds, for a generated IAM token. A cached token normally lives for the lifetime signed into the token itself (15 minutes) minus a 60-second safety margin; this value is used only when that lifetime cannot be read from the token. It is capped at a maximum of `870.0` — the default — so a cached token is never used after it expires. A value greater than `870.0` or less than or equal to `0` is rejected. *(sec)*<br/><br/>Example: `600.0 (maximum 870.0)` |
| `iam_access_token_property_name` | Symbol | No | `:password` | The connection property name the generated token is injected into. Some underlying drivers require a specific property name for the token.<br/><br/>Example: `:password` |
| `aws_credentials_provider` | Object | No | SDK default chain | A custom AWS credentials provider instance. One property is read by the IAM authentication, Secrets Manager and KMS encryption plugins, so setting it once covers all of them. When unset, each falls back to the AWS SDK default credential provider chain.<br/><br/>Example: `Aws::AssumeRoleCredentials.new(...)` |

## Using IAM authentication with Global Databases

When using IAM authentication with
[Amazon Aurora Global Databases](https://aws.amazon.com/rds/aurora/global-database/),
the IAM user or role requires the additional `rds:DescribeGlobalClusters`
permission so the token-generation path can resolve the writer region.

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "rds-db:connect",
                "rds:DescribeGlobalClusters"
            ],
            "Resource": "*"
        }
    ]
}
```

When you connect through an **Aurora Global Database endpoint**, also enable the
[Initial Connection Strategy plugin](./initial-connection-strategy) (`initial_connection`).
A global endpoint carries no region and points at whichever regional cluster is
currently the primary, so the plugin resolves it to the actual writer instance
before the IAM token is generated — without it, the token may be minted for the
wrong host or region. This applies specifically to the global endpoint; when you
connect through a regular regional cluster endpoint (writer, reader, or custom) the
region is already part of the hostname and IAM works without `initial_connection`.


## Token caching

The plugin caches generated tokens keyed by region, host, port, user, and the
identity of the AWS credentials that signed the token, so connections using
different credentials never share a token, and a credentials provider that
refreshes to a new access key gets a new token. When the credentials provider
resolves to no credentials, the token is not cached.

A cached token is reused until 60 seconds before the expiry signed into it
(`iam_expiration_sec` applies only when that expiry cannot be read). If a
login error occurs with a cached token, the plugin automatically fetches a
fresh token and retries the connection once.

## Related

- [AWS Credentials](../aws-credentials) — the plugin calls RDS to generate each
  token, so it needs credentials the SDK can refresh.
- [Configuring TLS/SSL](../configuring-tls) — the token is sent as the password,
  and on MySQL it is sent in cleartext.

