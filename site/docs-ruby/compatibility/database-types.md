---
title: Database Type Compatibility
---

This page is part of the [Compatibility Guide](../compatibility) and explains plugin compatibility with database types and deployments. Some plugins need metadata that only particular database types provide, and some depend on features a deployment does not offer.

Legend: ✅ compatible · ❌ not compatible · a numbered footnote `[^n]` links to the reason in [Notes](#notes) · blank = no constraint recorded.

## Compatibility matrix

| Plugin | Aurora Global Database (MySQL and PG) | Aurora Cluster (MySQL and PG) | RDS Multi-AZ DB Cluster deployment (3 instances) (MySQL and PG) | RDS Multi-AZ DB Instance deployment (2 instances) (MySQL and PG) | RDS Single-AZ Instance deployment (1 instance) (MySQL and PG) | Community Database (MySQL and PG) | 
| --- | --- | --- | --- | --- | --- | --- | 
| [`custom_endpoint`](../using-plugins/custom-endpoint) | ✅ | ✅ | ✅ | ❌ [^1] | ❌ [^1] | ❌ [^1] | 
| [`failover`](../enhanced-failover) | ❌ [^2] | ✅ | ✅ | ❌ [^3] | ❌ [^3] | ❌ [^3] | 
| [`gdb_failover`](../using-plugins/gdb-failover) | ✅ | ❌ [^4] | ❌ [^4] | ❌ [^5] | ❌ [^5] | ❌ [^5] | 
| [`iam`](../using-plugins/iam-authentication) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ [^6] | 
| [`secrets_manager`](../using-plugins/aws-secrets-manager) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ [^6] | 
| [`initial_connection`](../using-plugins/initial-connection-strategy) | ✅ | ✅ | ✅ | ❌ [^7] | ❌ [^7] | ❌ [^7] | 
| [`bg`](../using-plugins/blue-green) | ❌ [^8] | ✅ | ❌ [^9] | ✅ | ✅ | ❌ [^10] | 

## Notes

[^1]: The custom endpoint plugin tracks an Aurora custom endpoint, which only exists on an Aurora cluster; there is nothing for it to track here.

[^2]: On an Aurora global database, use the global database failover plugin (`gdb_failover`) instead — it is region-aware and reconnects across the global cluster's regions, which the standard failover plugin does not do.

[^3]: The failover plugin needs a cluster with more than one instance to promote; this deployment has no other instance to fail over to.

[^4]: The global database failover plugin can function here, but the failover plugin is recommended instead — it provides the same failover coverage for a single-region cluster while consuming fewer resources.

[^5]: The global database failover plugin needs an Aurora global database spanning regions; this deployment is not one.

[^6]: IAM and Secrets Manager authentication are Amazon RDS/Aurora features; a community database you run yourself does not support them.

[^7]: The initial connection plugin resolves a cluster endpoint to an instance; this deployment has no cluster topology to resolve.

[^8]: AWS does not support Blue/Green deployments on Aurora global databases.

[^9]: AWS Blue/Green deployments are not available for RDS Multi-AZ DB clusters (only for Multi-AZ DB instance deployments).

[^10]: Blue/Green deployments are an Amazon RDS/Aurora feature; a community database you run yourself cannot use one.

