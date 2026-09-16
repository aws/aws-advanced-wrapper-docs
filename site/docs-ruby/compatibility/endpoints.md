---
title: Database URL Type Compatibility
---

This page is part of the [Compatibility Guide](../compatibility) and explains plugin compatibility with database endpoints. Many endpoint types can be used with the AWS Advanced Ruby Driver Wrapper, but some endpoints are not compatible with some plugins.

## Endpoint types

- [Aurora Global Database Endpoint](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-global-database-connecting.html) — `<global-db-name>.global-<XYZ>.global.rds.amazonaws.com`
- [Aurora Cluster Writer Endpoint](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Endpoints.Cluster.html) — `<cluster-name>.cluster-<XYZ>.<region>.rds.amazonaws.com`
- [Aurora Cluster Reader Endpoint](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Endpoints.Reader.html) — `<cluster-name>.cluster-ro-<XYZ>.<region>.rds.amazonaws.com`
- [Aurora Cluster Custom Endpoint](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Endpoints.Custom.html) — `<custom-endpoint-name>.cluster-custom-<XYZ>.<region>.rds.amazonaws.com`
- [Aurora Instance Endpoint](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Endpoints.Instance.html) — `<instance-name>.<XYZ>.<region>.rds.amazonaws.com`
- [RDS Multi-AZ DB Cluster Writer Endpoint](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/multi-az-db-clusters-concepts-connection-management.html) — `<cluster-name>.cluster-<XYZ>.<region>.rds.amazonaws.com`
- [RDS Multi-AZ DB Cluster Reader Endpoint](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/multi-az-db-clusters-concepts-connection-management.html) — `<cluster-name>.cluster-ro-<XYZ>.<region>.rds.amazonaws.com`
- [RDS Instance Endpoint](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/multi-az-db-clusters-concepts-connection-management.html) — `<instance-name>.<XYZ>.<region>.rds.amazonaws.com`
- [RDS Proxy Endpoint](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/rds-proxy-endpoints.html) — `<proxy-name>.proxy-<XYZ>.<region>.rds.amazonaws.com`
- [DB Shard Group Endpoint (Aurora Limitless)](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/limitless-shard.html) — `<shard-group-name>.shardgrp-<XYZ>.<region>.rds.amazonaws.com`
- [IP address](https://en.wikipedia.org/wiki/IP_address) — `IPv4 or IPv6, for example 8.8.0.0`
- User custom domain (CNAME alias) — `any other domain name, for example my-database.my-domain.com`
## Compatibility matrix

Legend: ✅ compatible · ❌ not compatible · blank = no constraint recorded.

| Plugin | Aurora Global Database Endpoint | Aurora Cluster Writer Endpoint | Aurora Cluster Reader Endpoint | Aurora Cluster Custom Endpoint | Aurora Instance Endpoint, RDS Instance Endpoint | RDS Multi-AZ DB Cluster Writer Endpoint | RDS Multi-AZ DB Cluster Reader Endpoint | RDS Proxy Endpoint | DB Shard Group Endpoint (Aurora Limitless) | IP address | User custom domain (CNAME alias) | 
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | 
| [`custom_endpoint`](../using-plugins/custom-endpoint) | ❌ [^1] | ❌ [^1] | ❌ [^1] | ✅ | ❌ [^1] | ❌ [^1] | ❌ [^1] | ❌ [^1] | ❌ [^1] | ❌ [^1] | ❌ [^1] | 
| [`failover`](../enhanced-failover) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ [^2] | ❌ [^3] | ✅ (requires special configuration) | ✅ (requires special configuration) | 
| [`gdb_failover`](../using-plugins/gdb-failover) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ [^2] | ❌ [^4] | ✅ (requires special configuration) | ✅ (requires special configuration) | 
| [`iam`](../using-plugins/iam-authentication) | ✅ (requires `initialConnection` plugin) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (requires special configuration) | ✅ (requires special configuration) | 
| [`secrets_manager`](../using-plugins/aws-secrets-manager) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (requires special configuration) | ✅ (requires special configuration) | 
| [`initial_connection`](../using-plugins/initial-connection-strategy) | ✅ | ✅ | ✅ | ❌ [^5] | ❌ [^6] | ✅ | ✅ | ❌ [^6] | ❌ [^6] | ❌ [^6] | ❌ [^6] | 
| [`bg`](../using-plugins/blue-green) | ❌ [^7] | ✅ | ✅ | ✅ | ✅ | ❌ [^8] | ❌ [^8] | ✅ | ❌ [^9] | ✅ (requires special configuration) | ❌ [^10] | 

## Notes

[^1]: The custom endpoint plugin only applies to an Aurora custom endpoint; on any other endpoint there is no custom endpoint membership to track.

[^2]: An RDS Proxy performs its own failover. Connecting through that endpoint with a simple retry is the recommended configuration for handling a failover event.

[^3]: Aurora Limitless shard groups manage their own routing; the failover plugin does not operate on the Limitless shard-group endpoint.

[^4]: Aurora Limitless shard groups manage their own routing; the global database failover plugin does not operate on the Limitless shard-group endpoint.

[^5]: The initial connection plugin is incompatible with the Aurora custom endpoint URL type.

[^6]: The initial connection plugin needs a cluster endpoint to resolve; this endpoint points at a single host or has no discoverable topology.

[^7]: AWS does not support Blue/Green deployments on Aurora global databases.

[^8]: AWS Blue/Green deployments are not available for RDS Multi-AZ DB clusters (only for Multi-AZ DB instance deployments).

[^9]: Aurora Limitless shard groups manage their own routing; the Blue/Green plugin does not operate on the Limitless shard-group endpoint.

[^10]: The Blue/Green plugin resolves the deployment from a recognizable RDS endpoint; it cannot follow a switchover behind a custom domain name.

