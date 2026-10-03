---
title: Development Guide
---

# Development Guide

This guide is for **open-source contributors to the AWS Advanced Ruby Driver Wrapper** and for **developers who want to understand the project more deeply** — whether to build their own plugins or to adapt the code for their own purposes. If you are simply using the wrapper in your application, see the [Overview](../overview.md) instead.

## Setup

Make sure you have Ruby 3.3+ installed, along with your choice of underlying driver gem (`pg` or `mysql2`).

Clone the AWS Advanced Ruby Driver Wrapper repository, then you can make changes in the repository. This project is built using Bundler + RSpec.

### Setting Up the AWS Advanced Ruby Driver Wrapper

Clone the repository and install the gem's dependencies with Bundler:

```bash
cd aws-advanced-ruby-driver-wrapper
bundle install
```

To test against a specific ActiveRecord version, use one of the matrix
gemfiles:

```bash
BUNDLE_GEMFILE=gemfiles/activerecord_8.0.gemfile bundle install
```

### Running the Tests

Unit tests run with RSpec and also validate your environment is set up
correctly:

```bash
bundle exec rspec spec/unit
```

### Linting

CI also runs RuboCop, so run it before opening a pull request. `-a` applies
the safe autocorrections:

```bash
bundle exec rubocop
bundle exec rubocop -a
```

## Testing Overview

The AWS Advanced Ruby Driver Wrapper uses the following tests to verify its correctness and performance:

| Tests                                | Description                                                                                                                          |
|--------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------|
| Unit tests                           | Tests for AWS Advanced Ruby Driver Wrapper correctness.                                                                                           |
| Integration tests                    | End-to-end tests that exercise the plugins over real connections to actual RDS/Aurora databases and instances.                       |
| Connection plugin manager benchmarks | Measures the overhead from executing Ruby method calls with multiple connection plugins enabled.                                   |

### Integration Tests

For more information on how to run the integration tests, please visit [Integration Tests](./integration-tests.md).

### Sample Code

A minimal connection example using the wrapper:

```ruby
require 'aws_advanced_ruby_driver_wrapper/postgresql'

conn = AwsAdvancedRubyDriverWrapper::WrapperPgConnection.new(
  host: "my-cluster.cluster-xyz.us-east-1.rds.amazonaws.com",
  dbname: "mydb",
  user: "<username>",
  password: "<password>",
  wrapper_plugins: "failover"
)

conn.exec("SELECT 1")
```

For the plugin guides, see **Using Plugins** in the left sidebar.

## Architecture

For more information on how the AWS Advanced Ruby Driver Wrapper functions and how it is structured, please visit [Architecture](./architecture.md).
