---
title: Telemetry
---
Telemetry is the ability to gather data and insights on the execution of an
application, so you can inspect what happened and decide what to act on. When
telemetry is enabled, the wrapper records data about its own execution — both
at a global level and per plugin — so you can see how the wrapper as a whole,
and each plugin within it, is performing against your expectations.

Telemetry oversees every plugin you have enabled and the wrapper itself; it is
**not a plugin**. You do not list it alongside the other plugins — you turn it
on with a connection property, described below.


:::info Available since
Version 1.1.0
:::

## Traces and metrics

The AWS Advanced Ruby Driver Wrapper provides telemetry in two forms: **traces** and **metrics**.

### Traces

A **trace** gives an overview of what happens in one section of an
application's execution. A trace is a hierarchical sequence of spans, each
carrying basic information about that section — how long it took, and whether
it succeeded or failed.

The wrapper records a span for work it does and nests spans to show how that
work breaks down. Because spans are hierarchical, a span the wrapper records
can either nest inside a trace your application already has open or stand on
its own as a top-level trace — see
[top-level and nested traces](#top-level-and-nested-traces).


### Metrics

**Metrics** are numeric values measured over the execution of an application.
They show how many times something happened (for example, a failover, or a
token fetch) and, for things that happen repeatedly, how often each outcome
occurred. Metrics come in two kinds: a **counter**, which only ever increases,
and a **gauge**, which reports a current value each time metrics are collected.

The metrics the wrapper records are listed in
[list of metrics](#list-of-metrics). Each one is submitted only while the
plugin that owns it is enabled.


## Where the data goes

The wrapper records telemetry through the [OpenTelemetry](https://opentelemetry.io/)
API only; it does not export anything on its own. Your application installs an
OpenTelemetry SDK — the tracer and meter providers plus the exporters — and the
wrapper's traces and metrics then go wherever that SDK sends them. Until the
SDK is installed, the API quietly discards what the wrapper records, so nothing
is exported and there is no error.

A common target is the [AWS Distro for OpenTelemetry (ADOT) Collector](https://aws-otel.github.io/docs/getting-started/collector),
which receives telemetry over OTLP and forwards traces to
[AWS X-Ray](https://aws.amazon.com/xray/) and metrics to
[Amazon CloudWatch](https://aws.amazon.com/cloudwatch/). To view the data in
the AWS console you need an IAM principal with permissions for
[X-Ray](https://docs.aws.amazon.com/xray/latest/devguide/security-iam.html) and
[CloudWatch](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/auth-and-access-control-cw.html).

:::warning
The collector is a separate application, not part of the wrapper. Without a
collector (or another OTLP backend) the wrapper still records telemetry, but
there is nowhere for it to be sent and visualized.
:::


## Enabling telemetry

Telemetry is off until you enable it. Set `enable_telemetry` to `true` and
choose a backend for each signal you want exported; a backend left at `none`
records nothing for that signal. These are ordinary connection properties, so
they go wherever your other wrapper properties go.


```yaml
# config/database.yml
production:
  adapter: aws_postgresql
  host: my-cluster.cluster-xyz.us-east-1.rds.amazonaws.com
  database: mydb
  username: <username>
  password: <password>
  enable_telemetry: true
  telemetry_traces_backend: otlp
  telemetry_metrics_backend: otlp
```

Using the driver directly, the same properties are keyword arguments:

```ruby
conn = AwsAdvancedRubyDriverWrapper::WrapperPgConnection.new(
  host: 'my-cluster.cluster-xyz.us-east-1.rds.amazonaws.com',
  dbname: 'mydb',
  user: '<username>',
  password: '<password>',
  enable_telemetry: true,
  telemetry_traces_backend: 'otlp',
  telemetry_metrics_backend: 'otlp'
)
```


### Install the OpenTelemetry gems

The OpenTelemetry gems are optional dependencies of the wrapper, so add the
ones you need to your Gemfile. Traces and metrics are separate: add the
metrics gems only if you export metrics.

```ruby
# Gemfile
gem 'opentelemetry-sdk'                    # the SDK your application installs
gem 'opentelemetry-exporter-otlp'          # exports traces over OTLP
gem 'opentelemetry-metrics-sdk'            # metrics SDK (separate from the traces SDK)
gem 'opentelemetry-exporter-otlp-metrics'  # exports metrics over OTLP
```

The wrapper itself requires only the OpenTelemetry API (`opentelemetry-api`
for traces and `opentelemetry-metrics-api` for metrics); the SDK gems above
pull those in. If a selected backend's gem is missing when telemetry is
enabled, the wrapper raises on the first connection.


### Set up the OpenTelemetry SDK

The AWS Advanced Ruby Driver Wrapper records telemetry through the OpenTelemetry API; your
application owns the SDK that exports it. Both traces and metrics are exported over
OTLP (the supported backends are `otlp`, `none` for traces and
`otlp`, `none` for metrics). The wrapper registers its tracer and meter
under the instrumentation scope `aws-advanced-ruby-driver-wrapper`.

Install the SDK once, before opening connections. It owns the exporters and
their endpoints; the wrapper only feeds spans and metrics into the API.

```ruby
require 'opentelemetry/sdk'
require 'opentelemetry/exporter/otlp'           # traces
require 'opentelemetry-metrics-sdk'             # metrics
require 'opentelemetry/exporter/otlp_metrics'   # metrics

# Traces: an OTLP span exporter pointed at your collector.
OpenTelemetry::SDK.configure do |c|
  c.service_name = 'my-app'
  c.add_span_processor(
    OpenTelemetry::SDK::Trace::Export::BatchSpanProcessor.new(
      OpenTelemetry::Exporter::OTLP::Exporter.new(
        endpoint: ENV.fetch('OTEL_EXPORTER_OTLP_TRACES_ENDPOINT') # e.g. http://localhost:4318/v1/traces
      )
    )
  )
end

# Metrics: register an OTLP metrics reader on the meter provider.
OpenTelemetry.meter_provider.add_metric_reader(
  OpenTelemetry::SDK::Metrics::Export::PeriodicMetricReader.new(
    exporter: OpenTelemetry::Exporter::OTLP::Metrics::MetricsExporter.new(
      endpoint: ENV.fetch('OTEL_EXPORTER_OTLP_METRICS_ENDPOINT') # e.g. http://localhost:4318/v1/metrics
    )
  )
)
```


## Configuration parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `enable_telemetry` | Boolean | No | `false` | Enables telemetry and observability of the wrapper. While `false`, no telemetry is recorded, whatever the backend properties say. |
| `telemetry_traces_backend` | String | No | none | Where recorded traces are exported. `otlp` exports to your OpenTelemetry SDK (and on to a collector); `none` records traces but exports them nowhere.<br/><br/>Example: `otlp` |
| `telemetry_metrics_backend` | String | No | none | Where recorded metrics are exported. `otlp` exports to your OpenTelemetry SDK (and on to a collector); `none` records metrics but exports them nowhere.<br/><br/>Example: `otlp` |
| `telemetry_submit_top_level` | Boolean | No | `false` | Submit each wrapper-call trace as a top-level trace rather than nesting it under a trace already in progress. See [top-level and nested traces](#top-level-and-nested-traces). |
| `telemetry_failover_additional_top_trace` | Boolean | No | `false` | Also submit the trace of each failover as a top-level trace of its own. Only a failover that was already being traced is submitted this way. |

## Top-level and nested traces

Traces are hierarchical, so when the wrapper is called from code that already
has a trace open, there is a choice: should the wrapper's traces nest inside
that open trace, or stand on their own as top-level traces?

A **top-level** trace has no parent and appears directly in the list of
submitted traces. A **nested** trace is linked under a parent — for example,
the individual plugin spans of one wrapper call are nested under that call's
span. By default the wrapper nests its traces under whatever trace is already
open, and records nothing when no trace is open. The properties below let you
change that.


Two properties control how the wrapper's traces relate to a trace your
application already has open:

- **`telemetry_submit_top_level`** — by default (`false`) the wrapper nests
  each wrapper-call trace under the trace already in progress, and records
  nothing when no trace is open. Set it to `true` to submit every wrapper
  call as a top-level trace of its own instead.
- **`telemetry_failover_additional_top_trace`** — a failover is normally
  recorded as a span within the wrapper call that triggered it. Set this to
  `true` to *also* submit each failover as a separate top-level trace, so it
  can be found on its own. Only a failover that was already being traced is
  submitted this way.


## List of metrics

The wrapper submits a set of metrics while it runs. They are predefined, and
each gives insight into what a plugin is doing while it is enabled. A metric is
either a **counter** or a **gauge**. Metrics are only submitted by the plugins
that are enabled, so a plugin you do not use contributes nothing.


### Enhanced Failover — `failover`

See [Enhanced Failover](./enhanced-failover).

| Metric name | Type | Description |
|-------------|------|-------------|
| `writer_failover.triggered.count` | Counter | Number of times writer failover was triggered. |
| `writer_failover.completed.success.count` | Counter | Number of times writer failover completed and succeeded. |
| `writer_failover.completed.failed.count` | Counter | Number of times writer failover completed and failed. |
| `reader_failover.triggered.count` | Counter | Number of times reader failover was triggered. |
| `reader_failover.completed.success.count` | Counter | Number of times reader failover completed and succeeded. |
| `reader_failover.completed.failed.count` | Counter | Number of times reader failover completed and failed. |

### Custom Endpoint — `custom_endpoint`

See [Custom Endpoint](./using-plugins/custom-endpoint).

| Metric name | Type | Description |
|-------------|------|-------------|
| `custom_endpoint.info_changed.count` | Counter | Number of times a monitor detected changed custom endpoint information. |
| `custom_endpoint.wait_for_info.count` | Counter | Number of times a connection attempt waited for custom endpoint information to be fetched. |

### AWS Secrets Manager — `secrets_manager`

See [AWS Secrets Manager](./using-plugins/aws-secrets-manager).

| Metric name | Type | Description |
|-------------|------|-------------|
| `secrets_manager.fetch_credentials.count` | Counter | Number of times credentials were fetched from AWS Secrets Manager. |

### IAM Authentication — `iam`

See [IAM Authentication](./using-plugins/iam-authentication).

| Metric name | Type | Description |
|-------------|------|-------------|
| `iam.fetch_token.count` | Counter | Number of times a token was fetched from IAM. |
| `iam.token_cache.size` | Gauge | Number of tokens held in the shared token cache. |

### Federated Authentication — `federated_auth`

See [Federated Authentication](./using-plugins/federated-auth).

| Metric name | Type | Description |
|-------------|------|-------------|
| `federated.fetch_token.count` | Counter | Number of tokens generated after a SAML assertion exchange. |
| `federated.token_cache.size` | Gauge | Number of tokens held in the shared token cache. |

### Okta Authentication — `okta`

See [Okta Authentication](./using-plugins/okta-auth).

| Metric name | Type | Description |
|-------------|------|-------------|
| `okta.fetch_token.count` | Counter | Number of tokens generated after a SAML assertion exchange. |
| `okta.token_cache.size` | Gauge | Number of tokens held in the shared token cache. |

The `iam`, `federated_auth`, and `okta` plugins share one token cache, so
their three `*.token_cache.size` gauges all report the same value.

