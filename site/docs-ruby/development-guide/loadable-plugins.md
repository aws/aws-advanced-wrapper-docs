---
title: Loadable Plugins
---

# Plugins As Loadable Modules

Plugins are loadable and extensible modules that add extra logic around Ruby method calls.

Plugins let users:

- monitor connections
- handle exceptions during executions
- log execution details, such as SQL statements executed
- cache execution results
- measure execution time
- and more

The AWS Advanced Ruby Driver Wrapper has several built-in plugins; you can see and navigate through them under **Using Plugins** in the left sidebar.

## Available Services

Plugins are invoked by the plugin manager through the pipelines for the methods they subscribe to, and utilize the [service container](./service-container) to establish connections and retrieve host information.

### Creating a Custom Plugin

A plugin is a plain object constructed with `(service_container, props)`. It
defines a `subscribed_methods` set and implements any of `connect`,
`internal_connect`, and `execute`. Reach shared capabilities through the
service container — for example `service_container.host_service.hosts`,
`service_container.dialect_service.db_dialect`, or
`service_container.connection_service.current_connection`.

```ruby
class MyPlugin
  SUBSCRIBED = Set['*'].freeze

  def initialize(service_container, props)
    @service_container = service_container
    @props = props
  end

  def subscribed_methods = SUBSCRIBED

  def execute(ruby_method, next_plugin, *args, **kwargs, &block)
    # ... run code before/after ...
    next_plugin.call
  end
end
```

### Register the Custom Plugin

Register the plugin code, factory class, and (optionally) a weight, then
include the code in the `wrapper_plugins` connection parameter:

```ruby
AwsAdvancedRubyDriverWrapper::Services::PluginManager.register_plugin(
  "my_plugin", MyPluginFactory, weight: 1000)
```

### Subscribed Methods

Each plugin defines a `subscribed_methods` attribute — a `Set` of method-name strings (or `Set['*']` for all methods). All plugins must define `subscribed_methods`.

When executing a Ruby method, the plugin manager only invokes a plugin whose `subscribed_methods` includes that method (or `'*'`). For example, the `FailoverPlugin` subscribes to `connect` plus the driver dialect's network-bound methods, so it is not triggered by non-network calls.

Plugins can also subscribe to the following pipelines:

| Pipeline                                                        | Method Name / Subscription Key |
|-----------------------------------------------------------------|:------------------------------:|
| [Connect pipeline](./pipelines#connect-pipeline)                | connect                        |
| [Internal connect pipeline](./pipelines#internal-connect-pipeline) | internal_connect            |
| [Execute pipeline](./pipelines#execute-pipeline)                | execute                        |

### Tips on Creating a Custom Plugin

A custom plugin can subscribe to all methods being executed, which means it may be active in every workflow. We recommend that you be aware of the performance impact of subscribing and performing demanding tasks for every method.

## What is Not Allowed in Plugins

When creating custom plugins, it is important to **avoid** the following bad practices in your plugin implementation:

1. Keeping local copies of shared information:
   - information like current connection, or the host list provider are shared across all plugins
   - shared information may be updated by any plugin at any time and should be retrieved via the [service container](./service-container) when required
2. Using driver-specific properties or objects:
   - the AWS Advanced Ruby Driver Wrapper may be used with multiple drivers, therefore plugins must ensure implementation is not restricted to a specific driver
3. Making direct connections:
   - the plugin should always call the pipeline lambdas
4. Running long tasks synchronously:
   - the Ruby method calls are executed by all subscribed plugins synchronously; if one plugin runs a long task during the execution it blocks the execution for the other plugins
