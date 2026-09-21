---
title: Set up by Scenario
---

import ConfigBuilder from '@site/src/components/ConfigBuilder';
import scenarioData from '@site/src/generated/scenarios-ruby.json';

Answer 4 questions about your application and this page assembles
a working Ruby configuration, then lets you adjust it with add-ons. Every
question is about your own code — which endpoint to point at, which plugins to load, and
which properties to set are outputs, never questions.

Nothing here needs to be remembered. Change a toggle at any point and the configuration
below re-assembles; the link at the end restores everything you chose.

<ConfigBuilder data={scenarioData} />
