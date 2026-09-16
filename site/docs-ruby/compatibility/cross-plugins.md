---
title: Cross-Plugin Compatibility
---

This page is part of the [Compatibility Guide](../compatibility) and explains compatibility between plugins. Combining plugins in one configuration is normal, but some plugins do not work correctly together, either because of a design constraint, a logical conflict, or because the combination is meaningless.

Legend: ✅ compatible · ❌ not compatible (see the numbered note) · — same plugin · blank = no constraint, or the pair is shown in the other table.

Each pair of plugins appears once. Read a row against the columns; a ❌ links to the reason in [Notes](#notes) below.


**Columns: `custom_endpoint`, `failover`, `gdb_failover`, `iam`**

| Plugin | `custom_endpoint` | `failover` | `gdb_failover` | `iam` | 
| --- | --- | --- | --- | --- | 
| [`custom_endpoint`](../using-plugins/custom-endpoint) | — |  |  |  | 
| [`failover`](../enhanced-failover) | ✅ | — |  |  | 
| [`gdb_failover`](../using-plugins/gdb-failover) | ❌ [^1] | ❌ [^2] | — |  | 
| [`iam`](../using-plugins/iam-authentication) | ✅ | ✅ | ✅ | — | 
| [`secrets_manager`](../using-plugins/aws-secrets-manager) | ✅ | ✅ | ✅ | ❌ [^3] | 
| [`initial_connection`](../using-plugins/initial-connection-strategy) | ✅ | ✅ | ✅ | ✅ | 
| [`bg`](../using-plugins/blue-green) | ❌ [^4] | ✅ | ❌ [^5] | ✅ | 
| [`kms_encryption`](../using-plugins/kms-encryption) | ✅ | ✅ | ✅ | ✅ | 

**Columns: `secrets_manager`, `initial_connection`, `bg`, `kms_encryption`**

| Plugin | `secrets_manager` | `initial_connection` | `bg` | `kms_encryption` | 
| --- | --- | --- | --- | --- | 
| [`secrets_manager`](../using-plugins/aws-secrets-manager) | — |  |  |  | 
| [`initial_connection`](../using-plugins/initial-connection-strategy) | ✅ | — |  |  | 
| [`bg`](../using-plugins/blue-green) | ✅ | ✅ | — |  | 
| [`kms_encryption`](../using-plugins/kms-encryption) | ✅ | ✅ | ✅ | — | 

## Notes

[^1]: Meaningless: a custom endpoint is a single-region Aurora cluster construct, while gdb_failover operates across regions on a global database.

[^2]: Both drive cluster failover; gdb_failover is the region-aware superset, so running both means two components contend over reconnection and topology.

[^3]: Two authentication plugins both trying to set the connection credential; only one authentication plugin may be active at a time.

[^4]: Meaningless: a Blue/Green switchover replaces the whole deployment, so a custom endpoint's hand-picked instance subset does not carry over.

[^5]: Meaningless: Blue/Green deployments are not supported on Aurora global databases.

