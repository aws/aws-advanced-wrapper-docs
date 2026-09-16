---
title: Architecture
---

# Architecture

The diagram below shows what the AWS Advanced Ruby Driver Wrapper contains, which pieces are created per connection versus shared globally, and how a call flows from the user application down to the database.

```mermaid
flowchart TB
  app["User Application"]

  subgraph entry["Entry points"]
    direction LR
    ep1["WrapperPgConnection / WrapperMysql2Client"]
    ep2["aws_postgresql / aws_mysql2 (ActiveRecord)"]
  end

  subgraph conn["Wrapper Connection — one per connection"]
    direction TB
    pm["Plugin Manager"]
    plugins["Loaded plugins<br/>(subscribed to Ruby method calls)"]
    terminus["Default Plugin<br/>(pipeline terminus)"]
    subgraph perconn["Per-connection services"]
      direction LR
      pc1["Connection Service"]
      subgraph pc2["Host Service"]
        hlp["Host List Provider"]
      end
      pc3["Dialect Service"]
      pc4["Session State Service"]
    end
  end

  subgraph shared["Shared / global services (reused across connections)"]
    direction LR
      g5["Storage Service"]
      subgraph g6["Monitor Service"]
        mon["Background monitors<br/>(e.g. topology, blue/green)"]
      end
      g7["Event Publisher"]
  end

  db[("Database / Aurora cluster")]

  app --> entry
  ep1 --> pm
  ep2 --> pm
  pm --> plugins
  plugins --> perconn

  %% Two kinds of code open a connection to the database:
  %% (1) the terminus plugin opens the connection your application uses,
  plugins --> terminus
  terminus -->|"opens the application connection"| db
  %% (2) background monitors each use their OWN separate connection.
  mon -->|"separate connection(s): topology / blue-green status"| db
```

The AWS Advanced Ruby Driver Wrapper contains 5 main components:

1. The connection entry points (`WrapperPgConnection`, `WrapperMysql2Client`, and the `aws_postgresql` / `aws_mysql2` ActiveRecord adapters)
2. The [plugin manager](./service-container#plugin-manager) (one of the services in the container)
3. The [loadable and extensible plugins](./loadable-plugins)
4. The [service container](./service-container) of discrete services
5. The host list providers

The connection entry points ensure all Ruby method calls are routed through the plugin manager.

The plugin manager handles all the loaded or registered plugins and sends the Ruby method call to be executed by all plugins [**subscribed**](./loadable-plugins#subscribed-methods) to that method.

During execution, plugins may utilize the [service container](./service-container) to help their execution by retrieving or updating:

- the current connection
- the hosts information
- topology of the database

:::note

- Each wrapper connection has its own instances of:
  - plugin manager
  - service container
  - loaded plugin classes
- Multiple wrapper connections opened to the same database server will have separate sets of instances mentioned above.
- The shared storage, monitor, and event-publisher services (and the host list provider) are reused across connections to the same database.

:::
