---
title: Plugin Compatibility
---

# Plugin Compatibility

Some plugins depend on metadata that only particular database types provide, and some
plugins do not work correctly alongside others. This guide records those constraints for
the AWS Advanced Ruby Driver Wrapper.

The following matrices help you verify plugin compatibility with other plugins and with database types. Some plugins are also sensitive to the endpoint used in the connection string.

- [Database type compatibility](./compatibility/database-types)
- [Database URL type compatibility](./compatibility/endpoints)
- [Cross-plugin compatibility](./compatibility/cross-plugins)

Legend: ✅ compatible · ❌ not compatible · blank = no constraint recorded.

## Compatible with everything

These plugins record no database-type, endpoint, or cross-plugin constraints:

- [`kms_encryption`](./using-plugins/kms-encryption) — Transparent column-level encryption using AWS KMS.