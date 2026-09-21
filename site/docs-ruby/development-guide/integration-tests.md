---
title: Integration Tests
---

# Integration Tests

## Prerequisites

- Docker Desktop:
  - [Docker Desktop for Mac](https://docs.docker.com/desktop/install/mac-install/)
  - [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/)
- [Environment variables](#environment-variables)

### Aurora Test Requirements

- An AWS account with:
  - RDS permissions to create, describe, and delete Aurora clusters and instances used by the tests — for example `rds:CreateDBCluster`, `rds:CreateDBInstance`, `rds:DescribeDBClusters`, `rds:DescribeDBInstances`, `rds:DeleteDBCluster`, `rds:DeleteDBInstance`, and (for global-database tests) `rds:CreateGlobalCluster` / `rds:DescribeGlobalClusters` / `rds:DeleteGlobalCluster`.
  - `rds-db:connect` for the database user when exercising the IAM authentication suite.
  - EC2 permissions so integration tests can add the current IP address to the Aurora cluster's security group — `ec2:DescribeSecurityGroups` and `ec2:AuthorizeSecurityGroupIngress`.
  - For more information, see: [Setting Up for Amazon RDS User Guide](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_SettingUp.html).
- An available Aurora PostgreSQL or MySQL DB cluster is required if you're running the tests against an existing DB cluster.

## Aurora Integration Tests

The Aurora integration tests are focused on testing connection strings and failover capabilities of the wrapper. The tests are run in Docker but make a connection to test against an Aurora cluster. PostgreSQL and MySQL tests are currently supported.

## Standard Integration Tests

These integration tests are focused on testing connection strings against a local database inside a Docker container. PostgreSQL and MySQL tests are currently supported.

## Environment Variables

If the environment variable `REUSE_RDS_DB` is set to true, the integration tests will use the existing cluster defined by your environment variables. Otherwise, the integration tests will create a new Aurora cluster and then delete it automatically when the tests are done. Note that you will need a valid Docker environment to run any of the integration tests because they are run using a Docker environment as a host. The appropriate Docker containers will be created automatically when you run the tests, so you will not need to execute any Docker commands manually.

| Environment Variable Name | Required | Description                                                                                                | Example Value                                 |
|---------------------------|----------|------------------------------------------------------------------------------------------------------------|-----------------------------------------------|
| `DB_USERNAME`             | Yes      | The username to access the database.                                                                       | `admin`                                       |
| `DB_PASSWORD`             | Yes      | The database cluster password.                                                                             | `password`                                    |
| `DB_DATABASE_NAME`        | No       | Name of the database that will be used by the tests. The default database name is test.                    | `test_db_name`                                |
| `RDS_DB_NAME`             | Yes      | The database identifier for your Aurora or RDS cluster. Must be a unique value to avoid conflicts.          | `db-identifier`                               |
| `RDS_DB_DOMAIN`           | If running against an existing database, yes; otherwise, no.       | The existing database connection suffix. Use this variable to run against an existing database.            | `xyz.us-east-1.rds.amazonaws.com`             |
| `IAM_USER`                | No       | User within the database that is identified for AWS IAM Authentication.                                    | `example_user_name`                           |
| `AWS_ACCESS_KEY_ID`       | Yes      | An AWS access key associated with an IAM user or role with RDS permissions.                                | `ABCDEFGH12345EXAMPLE`                        |
| `AWS_SECRET_ACCESS_KEY`   | Yes      | The secret key associated with the provided AWS_ACCESS_KEY_ID.                                             | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`    |
| `AWS_SESSION_TOKEN`       | No       | AWS Session Token for CLI, SDK, & API access. This value is for MFA credentials only.                      | `AQoDYXdzEJr...<remainder of session token>`  |
| `REUSE_RDS_DB`            | Yes      | Set to true if you would like to use an existing cluster for your tests.                                   | `false`                                       |
| `RDS_DB_REGION`           | Yes      | The database region.                                                                                       | `us-east-1`                                   |
| `FILTER`                  | No       | Filter tests to a specific file or `file:line`. When unset, runs all tests in `spec/integration/container`.| `spec/integration/container/failover_spec.rb` |
| `DEBUG_ENV`               | No       | The debugging environment; values are `VSCODE` (default) or `TERMINAL`.                                    | `VSCODE`                                      |

## Running the Integration Tests

To run the integration tests, you can select from a number of tasks:

- `test-docker`: run all standard (local Docker database) tests
- `test-aurora`: run all Aurora tests
- `test-pg-aurora`: run the PostgreSQL Aurora tests
- `test-mysql-aurora`: run the MySQL Aurora tests
- `test-multi-az`: run the RDS Multi-AZ cluster tests
- `test-gdb-pg` / `test-gdb-mysql`: run the Global Database tests
- `debug-aurora`, `debug-docker`, `debug-pg-aurora`, `debug-mysql-aurora`, `debug-all-environments`: the corresponding debug tasks

For example, to run the Aurora integration tests:

```bash
./gradlew test-aurora
```

You can configure which test environments a task runs against by editing/adding system property values on the task in `spec/integration/host/build.gradle.kts` (for example, add `systemProperty("exclude-mysql-engine", "true")` to skip MySQL Aurora tests).

To filter to a single spec file or line, set the `FILTER` environment variable:

```bash
FILTER=spec/integration/container/failover_spec.rb ./gradlew test-aurora
```

Test results can be found at `coverage/index.html`.

### Unit vs integration tests

Unit tests run purely with RSpec (`bundle exec rspec spec/unit`) against `spec/unit`.
The integration tests live under `spec/integration` and are orchestrated by
Gradle in Docker against a real (or reused) Aurora cluster, using the
standardized env-vars and tasks above.
