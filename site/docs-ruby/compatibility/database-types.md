---
title: Database Type Compatibility
---

This page is part of the [Compatibility Guide](../compatibility) and explains plugin compatibility with database types and deployments. Some plugins need metadata that only particular database types provide, and some depend on features a deployment does not offer.

Legend: ✅ compatible · ❌ not compatible · blank = no constraint recorded.

## Compatibility matrix

| Plugin | Aurora Global Database (MySQL and PG) | Aurora Cluster (MySQL and PG) | RDS Multi-AZ DB Cluster deployment (3 instances) (MySQL and PG) | RDS Multi-AZ DB Instance deployment (2 instances) (MySQL and PG) | RDS Single-AZ Instance deployment (1 instance) (MySQL and PG) | Community Database (MySQL and PG) | 
| --- | --- | --- | --- | --- | --- | --- | 
| [`custom_endpoint`](../using-plugins/custom-endpoint) | ✅ | ✅ | ✅ | ❌ [^1] | ❌ [^1] | ❌ [^1] | 
| [`failover`](../enhanced-failover) | ✅ | ✅ | ✅ | ❌ [^2] | ❌ [^2] | ❌ [^2] | 
| [`gdb_failover`](../using-plugins/gdb-failover) | ✅ | ❌ [^3] | ❌ [^3] | ❌ [^4] | ❌ [^4] | ❌ [^4] | 
| [`iam`](../using-plugins/iam-authentication) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ [^5] | 
| [`secrets_manager`](../using-plugins/aws-secrets-manager) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ [^5] | 
| [`initial_connection`](../using-plugins/initial-connection-strategy) | ✅ | ✅ | ✅ | ❌ [^6] | ❌ [^6] | ❌ [^6] | 
| [`bg`](../using-plugins/blue-green) | ❌ [^7] | ✅ | ❌ [^8] | ✅ | ✅ | ❌ [^9] | 

## Notes

[^1]: The custom endpoint plugin tracks an Aurora custom endpoint, which only exists on an Aurora cluster; there is nothing for it to track here.

[^2]: The failover plugin needs a cluster with more than one instance to promote; this deployment has no other instance to fail over to.

[^3]: The global database failover plugin can function here, but the failover plugin is recommended instead — it provides the same failover coverage for a single-region cluster while consuming fewer resources.

[^4]: The global database failover plugin needs an Aurora global database spanning regions; this deployment is not one.

[^5]: IAM and Secrets Manager authentication are Amazon RDS/Aurora features; a community database you run yourself does not support them.

[^6]: The initial connection plugin resolves a cluster endpoint to an instance; this deployment has no cluster topology to resolve.

[^7]: AWS does not support Blue/Green deployments on Aurora global databases.

[^8]: AWS Blue/Green deployments are not available for RDS Multi-AZ DB clusters (only for Multi-AZ DB instance deployments).

[^9]: Blue/Green deployments are an Amazon RDS/Aurora feature; a community database you run yourself cannot use one.

