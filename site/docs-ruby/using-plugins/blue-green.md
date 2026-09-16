---
title: Blue/Green Deployment Plugin
---

The [Blue/Green Deployment](https://docs.aws.amazon.com/whitepapers/latest/blue-green-deployments/introduction.html)
technique releases changes by shifting traffic between two identical
environments running different versions, reducing downtime and rollback risk.
During an
[RDS/Aurora Blue/Green switchover](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/blue-green-deployments-switching.html),
connections to blue nodes terminate, endpoints are redirected, internal node
names change, and certificates are regenerated — all of which can disrupt an
application.

The Blue/Green Deployment Plugin minimizes that disruption. It actively
monitors switchover status; before the switchover it inventories the blue and
green endpoints and their IP addresses; during the active switchover it
temporarily suspends calls to blue nodes and substitutes hostnames with the
corresponding IP addresses to avoid stale DNS; after the switchover it monitors
DNS until blue endpoints are reconfigured, then stops substituting; and it
rejects new connections to green nodes once switchover completes. It also
detects switchover failures and rollbacks and restores normal handling.


:::info Available since
Version 1.0.0
:::

:::warning
**Currently supported deployments:**
- Aurora MySQL and PostgreSQL clusters
- RDS MySQL and PostgreSQL instances

**Unsupported deployments and configurations:**
- RDS MySQL and PostgreSQL Multi-AZ clusters
- Aurora Global Database for MySQL and PostgreSQL
- Connecting to database nodes using CNAME aliases

Full Blue/Green support requires a minimum database version that includes a
specific metadata table. For RDS PostgreSQL you also need to install the
`rds_tools` extension (`CREATE EXTENSION rds_tools;`). If the database version
does not support the metadata table, the plugin automatically detects its
absence and falls back to its previous behavior, subject to the same
limitations. No action is required for that fallback.

:::

```mermaid
stateDiagram-v2
  [*] --> Created: Deployment created
  Created --> Preparation: Switchover initiated
  Preparation --> InProgress: Blue/Green traffic suspended
  InProgress --> Post: Endpoints redirected to green
  Post --> Completed: Blue DNS reconfigured
  Completed --> [*]

  note right of Preparation
    Inventory blue/green endpoints and IP addresses
  end note
  note right of InProgress
    Suspend calls to blue nodes;
    substitute hostnames with IP addresses
  end note
  note right of Post
    Monitor DNS; stop substitution;
    reject new connections to green nodes
  end note
```

*The plugin tracks the switchover through these phases. During the active phase it holds new blue connections and substitutes IP addresses to avoid stale DNS; after the switchover it monitors DNS until blue endpoints are reconfigured, then resumes normal handling. A detected failure or rollback returns the deployment to normal handling.*

## How to enable

Add the plugin code `bg` to the `wrapper_plugins` parameter.

```ruby
conn = AwsAdvancedRubyDriverWrapper::WrapperPgConnection.new(
  host: "my-cluster.cluster-xyz.us-east-1.rds.amazonaws.com",
  dbname: "mydb",
  wrapper_plugins: "bg"
)

```

## Configuration parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `bgd_id` | String | Yes for multiple deployments; otherwise No | `1` | Identifier that distinguishes different Blue/Green Deployments. Required when supporting multiple deployments: all connection strings for the same deployment must share the same value, and different deployments must use distinct values.<br/><br/>Example: `abc-1` |
| `bg_connect_timeout_sec` | Float | No | `30.0` | Maximum waiting time for establishing new connections during a switchover while blue and green traffic is temporarily suspended. *(s)*<br/><br/>Example: `30.0` |
| `bg_baseline_sec` | Float | No | `60.0` | Baseline interval for checking Blue/Green Deployment status. Keep this below 900 s (15 minutes). *(s)*<br/><br/>Example: `60.0` |
| `bg_increased_sec` | Float | No | `1.0` | Increased interval for checking Blue/Green Deployment status. Configure within 0.5–2 s. *(s)*<br/><br/>Example: `1.0` |
| `bg_high_sec` | Float | No | `0.1` | High-frequency interval for checking Blue/Green Deployment status. Configure within 0.05–0.5 s. *(s)*<br/><br/>Example: `0.1` |
| `bg_switchover_timeout_sec` | Float | No | `180.0` | Maximum duration allowed for switchover completion. If the process stalls or exceeds this, the wrapper assumes completion and resumes normal operations. *(s)*<br/><br/>Example: `180.0` |

## Configuring monitoring connections

The plugin establishes dedicated monitoring connections to track Blue/Green Deployment status. To apply specific settings to these monitoring connections, prefix any configuration parameter with `bg_monitoring_`:

```ruby
conn = AwsAdvancedRubyDriverWrapper::WrapperPgConnection.new(
  host: "my-cluster.cluster-xyz.us-east-1.rds.amazonaws.com",
  dbname: "mydb",
  wrapper_plugins: "bg",
  bg_monitoring_connect_timeout: 10,
  bg_monitoring_socket_timeout: 10
)

```

## Known limitation

Support for Blue/Green deployments requires specific metadata tables. Refer
to the supported database engine versions before relying on the plugin.

