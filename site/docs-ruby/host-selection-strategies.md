---
title: Host Selection Strategies
---

Several plugins have to pick one host out of several — the initial connection plugin when it
resolves a reader or custom cluster endpoint, and the failover plugins when they choose a
reader to reconnect to. Which host they pick is decided by a **host selection strategy**,
named by a connection property.

## Available strategies

`random` is the only strategy built into the AWS Advanced Ruby Driver Wrapper. It picks uniformly
at random from the hosts that match the requested role and are currently marked available.

| Strategy | Behaviour | Configuration |
|---|---|---|
| `random` | Selects at random from the available hosts matching the requested role. | none |

It is also the default, so leaving the strategy properties unset gives you random
selection.
:::

## Where it applies

| Property | Used by | Default |
|---|---|---|
| `initial_connection_host_selector_strategy` | [Initial Connection Strategy Plugin](using-plugins/initial-connection-strategy), when the endpoint resolves to more than one host | `random` |
| `failover_reader_host_selector_strategy` | [Enhanced Failover](enhanced-failover) and [Global Database Failover](using-plugins/gdb-failover), when reconnecting to a reader | `random` |

## Supplying your own strategy

Because there is only one built-in strategy, the wrapper exposes a registration hook so an
application can add its own. Register a selector once at boot, then name it in either
property above:

```ruby
class LeastLagHostSelector
  # @param hosts [Array<HostInfo>] candidate hosts
  # @param role  [Symbol, nil]     the requested role, or nil for no preference
  # @param props [Hash, nil]       connection properties
  # @return [HostInfo, nil]        the chosen host, or nil when none is eligible
  def select_host(hosts, role, props = nil)
    hosts
      .select { |h| (role.nil? || h.role == role) && h.availability == AwsAdvancedRubyDriverWrapper::Host::HostAvailability::AVAILABLE }
      .min_by { |h| your_lag_metric_for(h) }
  end
end

AwsAdvancedRubyDriverWrapper::Services::HostService.register_host_selector(
  'least_lag', LeastLagHostSelector.new
)
```

```yaml
# config/database.yml
production:
  adapter: aws_postgresql
  # ...
  failover_reader_host_selector_strategy: least_lag
```

Three constraints are worth knowing. A selector is shared by every connection in the process,
so `select_host` must be safe to call from multiple threads. Register the name in lowercase:
the wrapper lowercases the configured strategy name before looking it up. And a built-in name 
cannot be replaced — registering `random` raises `Cannot override default host selection 
strategy: 'random'`.

:::note
Filtering to available hosts is the selector's own responsibility. The built-in `random`
selector does this, and a custom one should too, or it may hand back a host the wrapper has
already marked unavailable.
:::
