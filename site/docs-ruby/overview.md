---
title: Overview
---

# Ruby — Overview

The **AWS Advanced Ruby Driver Wrapper** adds fast failover, IAM and AWS Secrets Manager authentication, Blue/Green Deployment support, and more to your database
connections, while staying a thin drop-in over the underlying driver.

You are currently viewing the **Ruby** documentation. Use the
wrapper switcher in the top navigation bar to change wrappers — the page you're on
will follow your choice where an equivalent page exists.

## What's here

- **[Set up by Scenario](setup)** — answer a few questions about your application and get a working configuration, with add-ons you can toggle
- **[Using Plugins](enhanced-failover)** — the feature plugins, what each one does, and how to configure it
- **[Shared Configuration](configuring-tls)** — settings that several plugins rely on rather than belonging to any one of them
- **[Compatibility](compatibility)** — which plugins work with which database types, endpoint types, and each other
- **[Development Guide](development-guide)** — internals, for contributing to the wrapper rather than using it

## Getting started

Requires Ruby 3.3 or later. Tested with Active Record 7.2, 8.0, and 8.1, `pg` 1.6.3 or later, and `mysql2` 0.5.7 or later.

### 1. Add the gem

```ruby
# Gemfile
gem 'aws_advanced_ruby_driver_wrapper'
gem 'pg'        # or: gem 'mysql2'
```

```bash
bundle install
```

Bundler requires the gem for you (in a plain Ruby script, add `require 'aws_advanced_ruby_driver_wrapper'`). That single require registers the Active Record adapters and makes the connection classes, error classes, and other public API available for direct use.

### 2. Point Active Record at your cluster

The wrapper registers two adapters, `aws_postgresql` and `aws_mysql2`, which are drop-in replacements for `postgresql` and `mysql2`. Change the adapter name and point the host at your cluster endpoint:

```yaml
# config/database.yml
production:
  adapter: aws_postgresql
  host: my-cluster.cluster-xyz.us-east-1.rds.amazonaws.com
  database: mydb
  username: <username>
  password: <password>
```

That is the whole change — no application code moves. When `wrapper_plugins` is not set, the wrapper loads `failover` and `initial_connection`, so connections made through this adapter already recover when the cluster promotes a new writer. Enable more by adding wrapper properties alongside the Active Record keys. Setting `wrapper_plugins` replaces the default list rather than adding to it, so list the defaults you want to keep:

```yaml
production:
  adapter: aws_postgresql
  # ...
  wrapper_plugins: failover,initial_connection,iam
  iam_region: us-east-1
  failover_timeout_sec: 300.0     # seconds
```

Active Record keeps its own connection pool and its reading and writing roles; the wrapper's plugins run underneath both.

### Or connect with the driver directly

If you use the `pg` or `mysql2` gem without Active Record, the wrapper provides connection classes that stand in for `PG::Connection` and `Mysql2::Client`:

```ruby
# PostgreSQL (pg)
conn = AwsAdvancedRubyDriverWrapper::WrapperPgConnection.new(
  host: 'my-cluster.cluster-xyz.us-east-1.rds.amazonaws.com',
  dbname: 'mydb',
  user: '<username>',
  password: '<password>',
  wrapper_plugins: 'failover',
  failover_timeout_sec: 300.0
)
```

```ruby
# MySQL (mysql2)
conn = AwsAdvancedRubyDriverWrapper::WrapperMysql2Client.new(
  host: 'my-cluster.cluster-xyz.us-east-1.rds.amazonaws.com',
  database: 'mydb',
  username: '<username>',
  password: '<password>',
  wrapper_plugins: 'failover',
  failover_timeout_sec: 300.0
)
```

The calls your code already makes on the driver connection keep working, and the plugins act on each one. Like `PG::Connection.new`, `WrapperPgConnection.new` (and its alias `open`) also accepts a block: it yields the connection and closes it when the block returns.

### Next

Not sure which plugins you need? [Set up by Scenario](setup) builds a configuration from a few questions about your application. To check a combination before shipping, see [Plugin Compatibility](compatibility).

