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
- **[Development Guide](development-guide)** — internals, for contributing to the wrapper rather than using it

## Getting started

Requires Ruby 3.3 or later.

### 1. Add the gem

```ruby
# Gemfile
gem 'aws-advanced-ruby-driver-wrapper', require: 'aws_advanced_ruby_driver_wrapper'
gem 'pg'        # or: gem 'mysql2'
```

```bash
bundle install
```

That single require does everything: it registers the Active Record adapters and defines the connection classes for direct use.

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

That is the whole change — no application code moves. Failover is the default plugin, so connections made through this adapter already recover when the cluster promotes a new writer. Enable more by adding wrapper properties alongside the Active Record keys:

```yaml
production:
  adapter: aws_postgresql
  # ...
  wrapper_plugins: failover,iam
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

The calls your code already makes on the driver connection keep working, and the plugins act on each one.

### Next

Not sure which plugins you need? [Set up by Scenario](setup) builds a configuration from a few questions about your application.

