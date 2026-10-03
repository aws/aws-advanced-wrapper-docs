---
title: Integration Tests
---

# Integration Tests

## Prerequisites

- Docker Desktop:
  - [Docker Desktop for Mac](https://docs.docker.com/desktop/install/mac-install/)
  - [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/)
- [Environment variables](#environment-variables)
- A JDK to run Gradle (CI uses [Amazon Corretto 8](https://aws.amazon.com/corretto/)).

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
| `DB_DATABASE_NAME`        | No       | Name of the database that will be used by the tests. The default database name is `test_database`.        | `test_db_name`                                |
| `RDS_DB_NAME`             | Yes      | The database identifier for your Aurora or RDS cluster. Must be a unique value to avoid conflicts.          | `db-identifier`                               |
| `RDS_DB_DOMAIN`           | If running against an existing database, yes; otherwise, no.       | The existing database connection suffix. Use this variable to run against an existing database.            | `xyz.us-east-1.rds.amazonaws.com`             |
| `IAM_USER`                | No       | User within the database that is identified for AWS IAM Authentication.                                    | `example_user_name`                           |
| `AWS_ACCESS_KEY_ID`       | Yes      | An AWS access key associated with an IAM user or role with RDS permissions.                                | `ABCDEFGH12345EXAMPLE`                        |
| `AWS_SECRET_ACCESS_KEY`   | Yes      | The secret key associated with the provided AWS_ACCESS_KEY_ID.                                             | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`    |
| `AWS_SESSION_TOKEN`       | No       | AWS Session Token for CLI, SDK, & API access. This value is for MFA credentials only.                      | `AQoDYXdzEJr...<remainder of session token>`  |
| `REUSE_RDS_DB`            | Yes      | Set to true if you would like to use an existing cluster for your tests.                                   | `false`                                       |
| `RDS_DB_REGION`           | Yes      | The database region.                                                                                       | `us-east-1`                                   |
| `FILTER`                  | No       | Filter tests to a specific file or `file:line`. When unset, runs all tests in `spec/integration/container`.| `spec/integration/container/failover_spec.rb` |
| `KMS_KEY_ID`              | No       | KMS master key identifier (id, ARN, or alias) used by the KMS encryption tests. Required only for the encryption suite; those specs skip themselves when it is unset. See [Running the KMS encryption tests](#running-the-kms-encryption-tests). | `arn:aws:kms:us-east-1:123456789012:key/abcd` |
| `DEBUG_ENV`               | No       | The debugging environment used by the `debug-*` tasks; values are `VSCODE` (default) or `TERMINAL`. See [Debugging the integration tests](#debugging-the-integration-tests). | `VSCODE`                                      |

## Running the Integration Tests

To run the integration tests, you can select from a number of tasks:

- `test-docker`: run all standard (local Docker database) tests
- `test-aurora`: run all Aurora tests
- `test-pg-aurora`: run the PostgreSQL Aurora tests
- `test-mysql-aurora`: run the MySQL Aurora tests
- `test-multi-az`: run the RDS Multi-AZ cluster tests
- `test-gdb-pg` / `test-gdb-mysql`: run the Global Database tests
- `test-encryption`, `test-pg-encryption`, `test-mysql-encryption`: run the KMS encryption tests (see [Running the KMS encryption tests](#running-the-kms-encryption-tests))
- `debug-aurora`, `debug-docker`, `debug-pg-aurora`, `debug-mysql-aurora`, `debug-all-environments`: the corresponding debug tasks

For example, to run the Aurora integration tests:

```bash
./gradlew test-aurora
```

You can configure which test environments a task runs against by editing/adding system property values on the task in `spec/integration/host/build.gradle.kts` (for example, add `systemProperty("exclude-mysql-engine", "true")` to skip MySQL Aurora tests).

To filter to a single spec file or line, set the `FILTER` environment variable:

```bash
FILTER=spec/integration/container/failover_spec.rb ./gradlew test-aurora
FILTER=spec/integration/container/failover_spec.rb:74 ./gradlew test-aurora
```

Test results can be found at the Gradle console output; the Gradle test report is written to `spec/integration/host/build/reports/tests`, and performance test results are written as CSV files to `spec/integration/container/reports`.

### Unit vs integration tests

Unit tests run purely with RSpec (`bundle exec rspec spec/unit`) against `spec/unit`.
The integration tests live under `spec/integration` and are orchestrated by
Gradle in Docker against a real (or reused) Aurora cluster, using the
standardized env-vars and tasks above.

### Managing environment variables

Gradle reads the variables from your shell. One way to manage them is to keep
them in a `.env` file at the repository root and load it on demand:

1. Define your environment variables in a `.env` file in the repository root.
2. Add this helper function to your `~/.zshrc`:
   ```bash
   loadenv() { set -a; source "${1:-.env}"; set +a; }
   ```
3. Reload your shell configuration: `source ~/.zshrc`.
4. Run `loadenv` from the repository root to export the variables into your shell.

After editing `.env`, run `loadenv` again.

### Running the KMS encryption tests

The KMS encryption specs (`spec/integration/container/kms_encryption_*_spec.rb`)
run in a dedicated encryption-only environment rather than alongside the normal
suite. The `test-encryption`, `test-pg-encryption`, and `test-mysql-encryption`
tasks set `test-encryption-only=true`, which reaches the test container as
`RUN_ENCRYPTION_ONLY` and selects only the KMS encryption specs; every other task
excludes them.

The specs need a KMS master key in `KMS_KEY_ID` and skip themselves when it is
unset. The AWS credentials must allow `kms:GenerateDataKey` and `kms:Decrypt`,
plus `kms:CreateKey`, `kms:CreateAlias`, and `kms:DescribeKey` to exercise
`KeyManagementUtility.create_master_key`.

```bash
KMS_KEY_ID=arn:aws:kms:us-east-1:123456789012:key/abcd ./gradlew test-pg-encryption
KMS_KEY_ID=arn:aws:kms:us-east-1:123456789012:key/abcd ./gradlew test-mysql-encryption
```

### Debugging the integration tests

The `debug-*` tasks start the specs under the
[`rdbg`](https://github.com/ruby/debug) debugger inside the test container,
listening on port `5005`. Set `DEBUG_ENV` to choose how you attach.

#### VS Code (`DEBUG_ENV=VSCODE`, the default)

1. Install the [VSCode rdbg Ruby Debugger](https://marketplace.visualstudio.com/items?itemName=KoichiSasada.vscode-rdbg) extension.
2. Add an "Attach to Docker rdbg" configuration to `.vscode/launch.json`. The
   repository is mounted at `/app` inside the container, so map that path to your
   local clone:
   ```json
   {
     "version": "0.2.0",
     "configurations": [
       {
         "type": "rdbg",
         "name": "Attach to Docker rdbg",
         "request": "attach",
         "debugPort": "localhost:5005",
         "localfs": false,
         "localfsMap": "/app:<path-to-your-clone>"
       }
     ]
   }
   ```
3. Set breakpoints in your spec or lib files.
4. Run a debug task, for example `./gradlew debug-aurora`.
5. Wait for `Debug server listening on 0.0.0.0:5005` in the console.
6. In VS Code, open **Run and Debug**, select **Attach to Docker rdbg**, and start
   it. Execution pauses at your breakpoints.

#### Terminal (`DEBUG_ENV=TERMINAL`)

1. Run a debug task, for example `./gradlew debug-aurora`.
2. Wait for `Debug server listening on 0.0.0.0:5005` in the console.
3. From a separate terminal, attach:
   ```bash
   rdbg --attach localhost:5005
   ```
4. Set breakpoints from the debugger prompt:
   ```
   break spec/integration/container/failover_spec.rb:74
   continue
   ```

You can also add `debugger` statements directly in spec or lib files to pause
execution at a specific point.

#### Why RubyMine debugging is not supported

RubyMine's "Ruby Remote Debug" configuration uses the `ruby-debug-ide`/`debase`
protocol, which only supports Ruby 3.1 and earlier, so it cannot attach to this
project's Ruby 3.3+ test container. RubyMine does support the `debug` gem for
processes it starts itself, but it has no run configuration for attaching to an
external `rdbg` server running in a Docker container.
