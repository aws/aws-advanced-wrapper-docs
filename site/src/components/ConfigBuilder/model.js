/**
 * Pure model for the scenario builder: gating, patch merging, outcome matching
 * and URL state. No React and no DOM, so it can be exercised directly by tests.
 *
 * Merge order is fixed and meaningful:
 *   questions (registry order) -> derivation rules -> add-ons (registry order)
 * Later patches win on conflicting keys, which is why a deployment rule can
 * override a question and an add-on can override both.
 */

/* ---------------------------------------------------------------- *
 * Gating
 * ---------------------------------------------------------------- */

/** Every key in `cond` must include the current value for that key. */
export function condMet(cond, state) {
  if (!cond) return true;
  return Object.entries(cond).every(([key, allowed]) => allowed.includes(state[key]));
}

/** The deployment (database type) now comes from the explicit `db_type`
 * add-on rather than hostname detection. Unset means `unspecified`, which
 * matches no rule and emits no dialect. */
export function deploymentOf(state) {
  return (state.addons && state.addons.db_type) || 'unspecified';
}

/** The deployment that actually applies: the db_type selection, but only when
 * it is still valid under the current answers (choosing "survives region loss"
 * blocks every non-global type, so a stale cluster pick must not keep driving
 * dialect and gating). Falls back to `unspecified`. */
export function effectiveDeployment(data, state, active) {
  const dbAddon = (data.addons || []).find((a) => a.id === 'db_type');
  const selected = deploymentOf(state);
  const option = dbAddon && (dbAddon.options || []).find((o) => o.id === selected);
  if (option && !blockReason(option, { ...state, ...active }, data)) return selected;
  return 'unspecified';
}

/** Why an option cannot be chosen, or null when it can. */
export function blockReason(option, state, data) {
  if (!condMet(option.requires, state)) {
    return option.blocked || data.labels.unavailableWith;
  }
  // blockedIf is the inverse of requires: a list of { when, reason } rules. The
  // option is disabled when the current state matches the `when` of any rule
  // (each key matches if the state value is in the listed values). `reason` is
  // a labels key when one exists, otherwise literal text. First match wins, so
  // more specific rules (e.g. instance-loss) should precede broader ones.
  for (const rule of option.blockedIf || []) {
    const hit = Object.entries(rule.when || {}).some(([key, values]) =>
      values.includes(state[key]),
    );
    if (hit) {
      const reason = rule.reason || 'unavailableWith';
      return (data.labels && data.labels[reason]) || reason;
    }
  }
  return null;
}

/* ---------------------------------------------------------------- *
 * Patch merging
 * ---------------------------------------------------------------- */

export function emptyConfig() {
  return {
    plugins: [],
    dropPlugins: [],
    params: {},
    pool: {},
    roles: [],
    connections: null,
    endpoint: null,
    snippets: [],
    assumes: [],
    notes: [],
    traps: [],
    links: [],
  };
}

/** Apply one patch. `from` is the human label of whatever caused it. */
export function applyPatch(config, emit, from, data) {
  if (!emit) return;

  (emit.plugins || []).forEach((code) => {
    if (!config.plugins.some((p) => p.code === code)) config.plugins.push({ code, from });
  });
  (emit.dropPlugins || []).forEach((code) => config.dropPlugins.push(code));

  Object.entries(emit.params || {}).forEach(([key, value]) => {
    config.params[key] = { value, from };
  });
  Object.entries(emit.pool || {}).forEach(([key, value]) => {
    config.pool[key] = { value, from };
  });

  (emit.roles || []).forEach((role) => {
    if (!config.roles.includes(role)) config.roles.push(role);
  });
  if (emit.connections) config.connections = emit.connections;
  if (emit.endpoint) config.endpoint = emit.endpoint;

  (emit.snippets || []).forEach((id) => {
    const snippet = data.snippets[id];
    if (snippet && !config.snippets.some((s) => s.kind === snippet.kind)) config.snippets.push(snippet);
  });

  ['assumes', 'notes', 'traps'].forEach((bucket) => {
    (emit[bucket] || []).forEach((text) => {
      if (!config[bucket].some((entry) => entry.text === text)) config[bucket].push({ text, from });
    });
  });
  (emit.links || []).forEach((id) => {
    if (data.links[id] && !config.links.includes(id)) config.links.push(id);
  });
}

/**
 * Split stored answers into the ones that currently hold and the ones a toggle
 * invalidated. Invalid answers stay in state so switching back restores them,
 * but they are excluded from the configuration and reported to the reader.
 */
export function resolveAnswers(data, state) {
  const active = {};
  const stale = [];
  // Gate question answers with the raw db_type selection exposed as
  // `deployment`, so a continuity answer that the chosen database type makes
  // invalid (e.g. "survives instance loss" on a community database) is treated
  // as stale — excluded from the configuration, not just greyed in the UI.
  const deployment = deploymentOf(state);
  for (const question of data.questions) {
    if (!condMet(question.showIf, { ...state, ...active, deployment })) continue;
    const chosen = state.answers[question.id];
    if (!chosen) continue;
    const option = question.options.find((o) => o.id === chosen);
    if (!option) continue;
    const reason = blockReason(option, { ...state, ...active, deployment }, data);
    if (reason) {
      stale.push({ questionId: question.id, label: option.label, reason });
      continue;
    }
    active[question.id] = chosen;
  }
  return { active, stale };
}

export function buildConfig(data, state, active) {
  const config = emptyConfig();
  // The rules key on `deployment`; it comes from the db_type add-on, but only
  // when that selection is still valid under the current answers.
  const deployment = effectiveDeployment(data, state, active);
  const axisState = { ...state, ...active, deployment };

  for (const question of data.questions) {
    const chosen = active[question.id];
    if (!chosen) continue;
    const option = question.options.find((o) => o.id === chosen);
    applyPatch(config, option.emit, option.short || option.label, data);
  }

  for (const rule of data.rules) {
    if (condMet(rule.when, axisState)) applyPatch(config, rule.emit, 'your deployment', data);
  }

  for (const addon of data.addons) {
    if (blockReason(addon, axisState, data)) continue;

    if (addon.toggle) {
      if (state.addons[addon.id]) applyPatch(config, addon.emit, addon.short || addon.title, data);
      continue;
    }
    const selected = state.addons[addon.id];
    (addon.options || []).forEach((option) => {
      const on = addon.exclusive ? selected === option.id : Boolean(selected?.[option.id]);
      if (!on) return;
      if (blockReason(option, axisState, data)) return;
      applyPatch(config, option.emit, option.short || `${addon.title}: ${option.label}`, data);
    });
  }

  config.plugins = config.plugins.filter((p) => !config.dropPlugins.includes(p.code));
  return config;
}

/** Most specific matching outcome wins; `fallback` when nothing matches. */
export function pickOutcome(data, active) {
  let best = null;
  let bestScore = -1;
  for (const candidate of data.outcomes.cases || []) {
    if (!condMet(candidate.when, active)) continue;
    const score = Object.keys(candidate.when).length;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best || data.outcomes.fallback;
}

export function allAnswered(data, state, active) {
  return data.questions
    .filter((q) => condMet(q.showIf, { ...state, ...active }))
    .every((q) => active[q.id]);
}

/* ---------------------------------------------------------------- *
 * URL state
 * ---------------------------------------------------------------- */

export function axisDefault(data, id) {
  const axis = data.axes.find((a) => a.id === id);
  return axis ? axis.default || axis.options[0].id : null;
}

export function encodeState(state) {
  const parts = [];
  if (state.engine) parts.push(`e=${state.engine}`);
  if (state.arVersion) parts.push(`v=${state.arVersion}`);
  const answers = Object.entries(state.answers).map(([k, v]) => `${k}:${v}`);
  if (answers.length) parts.push(`q=${answers.join(',')}`);
  const addons = Object.entries(state.addons)
    .map(([k, v]) => {
      if (v === true) return k;
      if (typeof v === 'string') return `${k}:${v}`;
      const on = Object.entries(v || {})
        .filter(([, x]) => x)
        .map(([x]) => x);
      return on.length ? `${k}:${on.join('|')}` : null;
    })
    .filter(Boolean);
  if (addons.length) parts.push(`a=${addons.join(',')}`);
  return parts.join('&');
}

export function decodeState(search, data) {
  const params = new URLSearchParams(search);
  const state = {
    engine: params.get('e') || axisDefault(data, 'engine'),
    arVersion: params.get('v') || axisDefault(data, 'arVersion'),
    answers: {},
    addons: {},
  };
  (params.get('q') || '')
    .split(',')
    .filter(Boolean)
    .forEach((pair) => {
      const [k, v] = pair.split(':');
      if (k && v) state.answers[k] = v;
    });
  // Decode by the add-on's declared kind: a single-item multi-select and an
  // exclusive choice encode identically, so the registry disambiguates.
  const kinds = Object.fromEntries(
    data.addons.map((addon) => [addon.id, addon.toggle ? 'toggle' : addon.exclusive ? 'exclusive' : 'multi']),
  );
  (params.get('a') || '')
    .split(',')
    .filter(Boolean)
    .forEach((entry) => {
      const [k, v] = entry.split(':');
      if (!k) return;
      const kind = kinds[k];
      if (kind === 'toggle' || !v) {
        state.addons[k] = true;
      } else if (kind === 'exclusive') {
        state.addons[k] = v;
      } else {
        state.addons[k] = Object.fromEntries(v.split('|').map((x) => [x, true]));
      }
    });
  data.addons.forEach((addon) => {
    if (addon.default && state.addons[addon.id] === undefined) state.addons[addon.id] = addon.default;
  });
  return state;
}
