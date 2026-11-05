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

Requires Ruby 3.3 or later. The gem is `aws_advanced_ruby_driver_wrapper` on RubyGems. Tested with Active Record 7.2, 8.0, and 8.1, `pg` 1.6.3 or later, `mysql2` 0.5.7 or later, and `trilogy` 2.13.2 or later.

### 1. Add the gem

```ruby
# Gemfile
gem 'aws_advanced_ruby_driver_wrapper'
gem 'pg'        # or: gem 'mysql2' / gem 'trilogy' for MySQL
```

```bash
bundle install
```

Without Bundler, `gem install aws_advanced_ruby_driver_wrapper pg` does the same thing.

:::warning
Which extra gems your Gemfile needs depends on your Ruby version, your platform, and whether you are using Active Record:

| Version | Using Active Record | Extra gems | Reason |
| --- | --- | --- | --- |
| Ruby 3.3 | Either | None | `base64`, `bigdecimal` and `logger` are all still default gems |
| Ruby 3.4 | No | `base64`, `bigdecimal` | Ruby 3.4 removed both from the default gems |
| Ruby 3.4 | Yes | None | Active Record declares both itself |
| Ruby 4.0 or later | No | `base64`, `bigdecimal`, `logger` | Ruby 4.0 removed `logger` as well |
| Ruby 4.0 or later | Yes | None | Active Record declares all three itself |
| Ruby 4.0 or later, on Windows with `mysql2` | Either | `fiddle` | `mysql2` loads `libmysql.dll` through `fiddle` without declaring it, and neither does Active Record |

A bundle missing any of them raises `LoadError` on the first require.
:::


### 2. Point Active Record at your cluster

The wrapper registers three adapters, `aws_postgresql`, `aws_mysql2`, and `aws_trilogy`, which are drop-in replacements for `postgresql`, `mysql2`, and `trilogy`.

Bundler requires the gem for you. In a plain Ruby script, add `require 'aws_advanced_ruby_driver_wrapper'` first: that single require is what registers all three adapters, and without it Active Record reports `aws_postgresql` as a nonexistent adapter.

If you are starting without a Rails application, add `gem 'activerecord'` to the Gemfile from step 1 (outside Rails, nothing else installs it), run `bundle install`, and this is a complete program. Save it as `main.rb` and run it:

```ruby
# main.rb
require 'active_record'
require 'aws_advanced_ruby_driver_wrapper'

ActiveRecord::Base.establish_connection(
  adapter: 'aws_postgresql',
  host: 'my-cluster.cluster-xyz.us-east-1.rds.amazonaws.com',
  database: 'mydb',
  username: '<username>',
  password: '<password>',
  wrapper_plugins: 'failover'
)

puts ActiveRecord::Base.connection.select_value('SELECT version()')
```

```bash
bundle exec ruby main.rb
```

In a Rails application the same keys go in `config/database.yml` instead, and Bundler has already done the require. The adapter name is the only key that changes; leave the host as whichever endpoint you already connect to:

```yaml
# config/database.yml
production:
  adapter: aws_postgresql
  host: my-cluster.cluster-xyz.us-east-1.rds.amazonaws.com
  database: mydb
  username: <username>
  password: <password>
```

That is the whole change — no application code moves, and connections made through this adapter already recover when the cluster promotes a new writer. Wrapper properties go alongside the Active Record keys, under the same connection:

```yaml
production:
  adapter: aws_postgresql
  # ...
  wrapper_plugins: failover,initial_connection,iam
  iam_region: us-east-1
  failover_timeout_sec: 300.0     # seconds
```

`wrapper_plugins` is optional — leaving it out loads `failover,initial_connection`. Setting it replaces the default list rather than adding to it, so list the defaults you want to keep.

Active Record keeps its own connection pool and its reading and writing roles; the wrapper's plugins run underneath both.

:::note Mixing wrapped and standard adapters in one application
The wrapped adapters register their type information under the underlying
`postgresql`, `mysql2`, and `trilogy` adapter names. If one application uses
both a standard connection (`postgresql`/`mysql2`/`trilogy`) and a wrapped one
(`aws_postgresql`/`aws_mysql2`/`aws_trilogy`), a custom type registered for
one is shared with the other, because both resolve under the same underlying
adapter key.
:::


:::note Keeping the password out of your source
Read it from the environment with `ENV.fetch('PGPASSWORD')` in Ruby, or
`<%= ENV.fetch('PGPASSWORD') %>` in `config/database.yml`, or have
AWS manage it: add `secrets_manager` to `wrapper_plugins` and drop the
`password:` key, as described on
[AWS Secrets Manager Plugin](using-plugins/aws-secrets-manager). For a
database user with no password at all, consider using `iam` instead; see
[IAM Authentication Plugin](using-plugins/iam-authentication).
:::


:::note Keeping the password out of your source
Read it from the environment with `ENV.fetch('PGPASSWORD')`, or have
AWS manage it: add `secrets_manager` to `wrapper_plugins` and drop the
`password:` key, as described on
[AWS Secrets Manager Plugin](using-plugins/aws-secrets-manager). For a
database user with no password at all, consider using `iam` instead; see
[IAM Authentication Plugin](using-plugins/iam-authentication).
:::


### Or connect with the driver directly

Without Active Record, the wrapper provides connection classes that stand in for `PG::Connection`, `Mysql2::Client`, and `Trilogy`. This is a complete program; save it as `main.rb` and run it:

```ruby
# main.rb
require 'aws_advanced_ruby_driver_wrapper/postgresql'

conn = AwsAdvancedRubyDriverWrapper::WrapperPgConnection.new(
  host: 'my-cluster.cluster-xyz.us-east-1.rds.amazonaws.com',
  dbname: 'mydb',
  user: '<username>',
  password: '<password>',
  wrapper_plugins: 'failover',
  failover_timeout_sec: 300.0
)

begin
  result = conn.exec('SELECT version()')
  puts result.first['version']
ensure
  conn.close
end
```

```bash
bundle exec ruby main.rb
```

For PostgreSQL, `require 'aws_advanced_ruby_driver_wrapper/postgresql'` and use `AwsAdvancedRubyDriverWrapper::WrapperPgConnection`, which stands in for `PG::Connection` and takes `dbname:` and `user:`. For MySQL, `require 'aws_advanced_ruby_driver_wrapper/mysql'` and use `AwsAdvancedRubyDriverWrapper::WrapperMysql2Client`, which stands in for `Mysql2::Client` and takes `database:` and `username:`. To use the Trilogy driver instead, `require 'aws_advanced_ruby_driver_wrapper/trilogy'` and use `AwsAdvancedRubyDriverWrapper::WrapperTrilogyClient`, which stands in for `Trilogy` and takes the same `database:` and `username:`. Either way the calls your code already makes keep working, and the plugins act on each one.

### Next

The wrapper supports other plugins and wrapper properties. For further information see the plugin pages, starting with [Enhanced Failover Plugin](enhanced-failover). Every wrapper property the examples did not use is listed with its type, default and unit on the plugin page that reads it. To check a combination before shipping, see [Plugin Compatibility](compatibility).

Not sure which plugins you need? [Set up by Scenario](setup) builds a configuration from a few questions about your application.

