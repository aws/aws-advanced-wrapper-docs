---
title: Federated Authentication Plugin
---

The Federated Authentication Plugin adds support for authenticating through a
federated identity provider — [Microsoft Active Directory Federation Services
(AD FS)](https://learn.microsoft.com/en-us/windows-server/identity/active-directory-federation-services) —
and then connecting to the database with AWS IAM. The plugin signs in to AD FS,
obtains a SAML assertion, exchanges it for temporary AWS credentials, and uses
those credentials to generate an IAM authentication token for the connection.


:::info Available since
Version 1.1.0
:::

:::warning Only one authentication plugin at a time
Only one authentication plugin may be enabled per connection. Do not use `federated_auth` together with any of the other authentication plugins (`iam`, `secrets_manager`, `okta`) at the same time for the same connection. Configuring more than one raises a `PluginConflictError` at connection initialization.
:::

## What is federated identity

Federated identity lets users authenticate once with an external identity provider (IdP) and use that single identity to reach services across organizations. The IdP authenticates the user and issues a signed security token — a SAML assertion — and any service provider that trusts the IdP accepts that assertion instead of managing its own credentials.

This plugin applies that flow to database access. It signs in to your IdP with the configured credentials, receives a SAML assertion, exchanges the assertion for temporary AWS credentials through AWS STS `AssumeRoleWithSAML`, and uses those credentials to generate an AWS IAM authentication token. That IAM token is what the plugin uses to connect, so **AWS IAM database authentication must be enabled** on the target database.

## Prerequisites

:::warning
This plugin requires the AWS SDK for RDS. Add it to your Gemfile:

```ruby
gem 'aws-sdk-rds'
```
:::

The plugin signs in to your identity provider over HTTPS using Ruby's standard
library HTTP client, so no additional SAML or XML parsing gem is required. It
obtains AWS credentials from the SAML assertion through AWS STS
`AssumeRoleWithSAML`; it does not read `aws_credentials_provider` or the AWS SDK
default credential provider chain.

Before using the plugin, enable IAM database authentication on your database,
create an [IAM SAML identity provider](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_saml.html)
and an IAM role granting `rds-db:connect`, and create a database account mapped
to IAM:

- MySQL: `CREATE USER iam_user IDENTIFIED WITH AWSAuthenticationPlugin AS 'RDS';`
- PostgreSQL: `CREATE USER iam_user; GRANT rds_iam TO iam_user;`


## How to enable

The plugin depends on AWS IAM database authentication: after it obtains a SAML assertion from your IdP, the assertion is exchanged for an AWS IAM authentication token, which is then used to connect to the database. Before enabling the plugin:

1. [Enable IAM database authentication](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.html) on your RDS or Aurora database.
2. Set up an [IAM SAML identity provider](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_saml.html) and an IAM role whose policy grants `rds-db:connect`, then federate your IdP into that AWS account.

Then add the plugin code `federated_auth` to the `wrapper_plugins` parameter and set the parameters required for your environment.

```ruby
require 'aws_advanced_ruby_driver_wrapper/postgresql'

conn = AwsAdvancedRubyDriverWrapper::WrapperPgConnection.new(
  host: "my-cluster.cluster-xyz.us-east-1.rds.amazonaws.com",
  wrapper_plugins: "federated_auth",
  db_user: "iam_user",
  idp_endpoint: "adfs.example.com",
  idp_username: "someFederatedUsername@example.com",
  idp_password: "someFederatedPassword",
  iam_role_arn: "arn:aws:iam::123456789012:role/adfs_example_iam_role",
  iam_idp_arn: "arn:aws:iam::123456789012:saml-provider/adfs_example",
  iam_region: "us-east-1",
  sslmode: "verify-full",
  sslrootcert: "/path/to/global-bundle.pem"
)

```

Verify plugin compatibility within your Ruby configuration using the [compatibility guide](../compatibility).

## Configuration parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `db_user` | String | Yes | — | The database username the generated IAM authentication token is minted for — the IAM-mapped database account the connection is made as.<br/><br/>Example: `iam_user` |
| `idp_endpoint` | String | Yes | — | The host name of the AD FS identity provider used to authenticate.<br/><br/>Example: `adfs.example.com` |
| `idp_username` | String | No | connection user | The username used to sign in to the identity provider. If not set, the plugin falls back to the connection `user`/`username`.<br/><br/>Example: `someFederatedUsername@example.com` |
| `idp_password` | String | No | connection password | The password used to sign in to the identity provider. If not set, the plugin falls back to the connection `password`.<br/><br/>Example: `someFederatedPassword` |
| `idp_port` | Integer | No | `443` | The port the AD FS host listens on, used to build the sign-on URL.<br/><br/>Example: `443` |
| `rp_identifier` | String | No | `urn:amazon:webservices` | The relying-party identifier sent to AD FS when requesting the SAML assertion.<br/><br/>Example: `urn:amazon:webservices` |
| `iam_role_arn` | String | Yes | — | The ARN of the IAM role assumed through the SAML assertion to obtain temporary AWS credentials.<br/><br/>Example: `arn:aws:iam::123456789012:role/adfs_example_iam_role` |
| `iam_idp_arn` | String | Yes | — | The ARN of the SAML identity provider registered in AWS IAM.<br/><br/>Example: `arn:aws:iam::123456789012:saml-provider/adfs_example` |
| `iam_region` | String | No | parsed from host | Overrides the AWS region used to generate the IAM token. By default it is parsed from the connection host.<br/><br/>Example: `us-east-1` |
| `iam_host` | String | No | derived from host | Overrides the host used to generate the IAM token. By default it is derived from the connection host.<br/><br/>Example: `my-cluster.cluster-xyz.us-east-1.rds.amazonaws.com` |
| `iam_port` | Integer | No | dialect default | Overrides the port used to generate the IAM token. By default it is taken from the connection, or the dialect's default port.<br/><br/>Example: `5432` |
| `iam_expiration_sec` | Float | No | `870.0` | Fallback cache lifetime, in seconds, for a generated IAM token. A cached token normally lives for the lifetime signed into the token itself (15 minutes) minus a 60-second safety margin; this value is used only when that lifetime cannot be read from the token. It is capped at a maximum of `870.0` — the default — so a cached token is never used after it expires. A value greater than `870.0` or less than or equal to `0` is rejected. The token cache is shared with the `iam` and `okta` plugins. *(sec)*<br/><br/>Example: `600.0 (maximum 870.0)` |
| `ssl_insecure` | Boolean | No | `false` | When `true`, disables TLS certificate verification on the HTTPS requests the plugin makes to the identity provider. Intended for development only.<br/><br/>Example: `true` |
| `http_client_socket_timeout_sec` | Float | No | `60.0` | Read (socket) timeout for the HTTPS requests the plugin makes to the identity provider. *(sec)*<br/><br/>Example: `60.0` |
| `http_client_connect_timeout_sec` | Float | No | `60.0` | Connect timeout for the HTTPS requests the plugin makes to the identity provider. *(sec)*<br/><br/>Example: `60.0` |

## Using this plugin with Global Databases

When connecting to an
[Amazon Aurora Global Database](https://aws.amazon.com/rds/aurora/global-database/),
the IAM role assumed through the SAML assertion requires the additional
`rds:DescribeGlobalClusters` permission so the plugin can resolve the writer
region before generating the IAM token.

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
[Initial Connection Strategy plugin](./initial-connection-strategy)
(`initial_connection`). A global endpoint carries no region and points at
whichever regional cluster is currently the primary, so it must be resolved to the
writer instance before the IAM token is generated.

For a global **writer** cluster, set `iam_region` explicitly when you can. Without
it, the plugin must perform one extra sign-in to your identity provider up front to
obtain the credentials needed to look up the writer region.

## Use TLS/SSL with federated authentication

:::warning
Use a **TLS/SSL 1.2+ connection**. The plugin injects the generated IAM token as
the connection password, and TLS ensures it is encrypted in transit.
:::

**PostgreSQL (`pg`):** set `sslmode: "verify-full"` and point `sslrootcert` at the
[AWS global certificate bundle](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html).

```ruby
AwsAdvancedRubyDriverWrapper::WrapperPgConnection.new(
  host: "my-cluster.cluster-xyz.us-east-1.rds.amazonaws.com",
  wrapper_plugins: "federated_auth",
  db_user: "iam_user",
  idp_endpoint: "adfs.example.com",
  idp_username: "someFederatedUsername@example.com",
  idp_password: "someFederatedPassword",
  iam_role_arn: "arn:aws:iam::123456789012:role/adfs_example_iam_role",
  iam_idp_arn: "arn:aws:iam::123456789012:saml-provider/adfs_example",
  iam_region: "us-east-1",
  sslmode: "verify-full",
  sslrootcert: "/path/to/global-bundle.pem"
)
```

**MySQL (`mysql2`):** set `ssl_mode: "verify_identity"`, point `sslca` at the
global certificate bundle, and set `enable_cleartext_plugin: true`. RDS/Aurora
MySQL IAM authentication relies on the MySQL `mysql_clear_password` client plugin
because the token must be sent to the server in cleartext; the wrapper does
**not** set this for you.

```ruby
AwsAdvancedRubyDriverWrapper::WrapperMysql2Client.new(
  host: "my-cluster.cluster-xyz.us-east-1.rds.amazonaws.com",
  wrapper_plugins: "federated_auth",
  db_user: "iam_user",
  idp_endpoint: "adfs.example.com",
  idp_username: "someFederatedUsername@example.com",
  idp_password: "someFederatedPassword",
  iam_role_arn: "arn:aws:iam::123456789012:role/adfs_example_iam_role",
  iam_idp_arn: "arn:aws:iam::123456789012:saml-provider/adfs_example",
  iam_region: "us-east-1",
  enable_cleartext_plugin: true,
  sslca: "/path/to/global-bundle.pem",
  ssl_mode: "verify_identity"
)
```

For the full picture, see [Configuring TLS/SSL](../configuring-tls).

