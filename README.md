# AWS Advanced Wrapper Docs

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

A single documentation site for the **AWS Advanced Wrapper** family.

The AWS Advanced Wrappers are companion drivers, in several languages and database connectivity standards, that sit on top of a user's existing driver of choice and add AWS-specific functionality — fast failover for Aurora and RDS clusters, [IAM authentication](https://aws.amazon.com/iam/), [AWS Secrets Manager](https://aws.amazon.com/secrets-manager/) credential fetching, Blue/Green deployment support, and so on — without asking the application to change its driver.

Every wrapper in the family ships with the same conceptual model: a similar set of feature plugins, similar connection parameters, and similar compatibility guarantees against the AWS services it supports. This repo is where the shared documentation lives.

> [!NOTE]
> This repo contains **only the docs**. The wrapper source code lives in each wrapper's own repository — see [Wrappers](#wrappers) below.

## Read the docs

The published site is here:

> **https://aws.github.io/aws-advanced-wrapper-docs/**

The site is a [Docusaurus](https://docusaurus.io/) build that renders one documentation tree per wrapper. A **wrapper switcher** in the navbar swaps the entire tree in place: pick your wrapper once and every page — plugin guide, compatibility matrix, scenario builder, development guide — is rewritten in that wrapper's language, with its parameter names, code samples, and usage instructions. If a page does not exist for the wrapper you switched to, the site shows a "not applicable" notice and links back to the nearest parent page.

### How the docs are organized

Each wrapper's documentation is grouped into the same sections:

| Section                  | What's in it                                                                                                                                                                            |
|--------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Overview**             | What the wrapper is and how to install it.                                                                                                                                              |
| **Set up by Scenario**   | An interactive builder — answer a few questions about your application and get a working configuration.                                                                                 |
| **Using Plugins**        | One page per feature plugin (Failover, IAM Authentication, AWS Secrets Manager, Blue/Green, KMS Encryption, and so on), describing what the plugin does and every parameter it accepts. |
| **Shared Configuration** | Cross-cutting settings — TLS/SSL, AWS credentials resolution, host selection strategies — that more than one plugin relies on.                                                          |
| **Compatibility**        | Which plugins work with which database engines, which endpoint types, and which other plugins.                                                                                          |
| **Development Guide**    | Internals for contributors to the wrapper itself — architecture, pipelines, loadable plugins, and integration tests.                                                                    |

The **Overview** page for each wrapper is the recommended entry point.

## Wrappers

The wrapper family currently comprises the drivers below. This section is the one to edit when a new wrapper is added, or when a wrapper joins this docs site.

### Documented on this site

| Wrapper                          | Docs                                                                                   | Source                                                                                          |
|----------------------------------|----------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------|
| AWS Advanced Ruby Driver Wrapper | [Read on the docs site](https://aws.github.io/aws-advanced-wrapper-docs/ruby/overview) | [aws/aws-advanced-ruby-driver-wrapper](https://github.com/aws/aws-advanced-ruby-driver-wrapper) |

### Documented in their own repositories

Wrappers that aren't on this site and keep their documentation in the `docs/` directory of their own repository.

| Wrapper                          | Repository                                                       |
|----------------------------------|------------------------------------------------------------------|
| AWS Advanced JDBC Wrapper (Java) | https://github.com/aws/aws-advanced-jdbc-wrapper                 |
| AWS Advanced Python Wrapper      | https://github.com/aws/aws-advanced-python-wrapper               |
| AWS Advanced NodeJS Wrapper      | https://github.com/aws/aws-advanced-nodejs-wrapper               |
| AWS Advanced Go Wrapper          | https://github.com/aws/aws-advanced-go-wrapper                   |
| AWS Advanced .NET Wrapper        | https://github.com/aws/aws-advanced-dotnet-data-provider-wrapper |
| AWS Advanced ODBC Wrapper        | https://github.com/aws/aws-advanced-odbc-wrapper                 |

## Getting help

- **Bugs in the docs** (a broken link, a wrong parameter name, a missing page) — open an issue on this repository.
- **Bugs in a specific wrapper** (a crash, a runtime problem, a feature request for the wrapper itself) — open an issue on that wrapper's repository. See [Wrappers](#wrappers).
- **Security issues** — see [SECURITY.md](SECURITY.md). Please do not open a public GitHub issue for security concerns.
- **Contributing** — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

This project is licensed under the [Apache License 2.0](LICENSE). See the [NOTICE](NOTICE) file for attribution.
