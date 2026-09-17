/**
 * Emitters: turn the merged configuration object into copy-pasteable files.
 *
 * The configuration object is wrapper-neutral and carries provenance, so every
 * line can say which answer put it there. Emitters own SYNTAX only; every
 * property name and value comes from content/scenarios.yaml.
 *
 * A line is { text, why } where `why` is the label of the answer responsible.
 * Annotations render as ordinary comments, so annotated output stays valid YAML
 * and valid Ruby and remains copy-pasteable either way.
 */

const PLACEHOLDER_HOST = {
  cluster: 'my-cluster.cluster-abc123.us-east-1.rds.amazonaws.com',
  reader: 'my-cluster.cluster-ro-abc123.us-east-1.rds.amazonaws.com',
  global: 'my-global-db.global-abc123.global.rds.amazonaws.com',
};

/** The writer/reader host placeholder for a deployment. A global database uses
 * its own global endpoint; everything else uses the cluster/reader endpoints. */
function hostFor(deployment, reader) {
  if (deployment === 'global' && !reader) return PLACEHOLDER_HOST.global;
  return reader ? PLACEHOLDER_HOST.reader : PLACEHOLDER_HOST.cluster;
}

/** Which credentials the emitted config should carry, given the active plugins.
 * IAM auth injects a token in place of the password, so the password line is
 * dropped. Secrets Manager supplies both the username and the password from the
 * stored secret, so both lines are dropped. */
function credentialsFor(config) {
  const codes = (config.plugins || []).map((p) => p.code);
  if (codes.includes('secrets_manager')) return { username: false, password: false, why: 'secrets_manager supplies the username and password' };
  if (codes.includes('iam')) return { username: true, password: false, why: 'iam injects a token in place of the password' };
  return { username: true, password: true, why: null };
}

/** Longest key in a set of lines, so inline comments line up. */
function pad(lines) {
  const width = lines.reduce((n, l) => (l.why ? Math.max(n, l.text.length) : n), 0);
  return Math.min(width, 46);
}

/** Render lines to text, appending `# why` comments when annotating. */
export function renderLines(lines, annotate) {
  const width = pad(lines);
  return lines
    .map(({ text, why }) => {
      if (!annotate || !why) return text;
      const gap = ' '.repeat(Math.max(1, width - text.length + 1));
      return `${text}${gap}# ${why}`;
    })
    .join('\n');
}

function yamlValue(value) {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const s = String(value);
  // A string that looks like a number must stay a string: several wrapper
  // properties (bgd_id, cluster_id) are declared as String.
  if (/^-?\d+(\.\d+)?$/.test(s)) return `"${s}"`;
  // Quote anything else a YAML reader could misread: placeholders, comma lists.
  return /^[A-Za-z0-9_./-]+$/.test(s) ? s : `"${s}"`;
}

function rubyValue(value) {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return `'${String(value).replace(/'/g, "\\'")}'`;
}

/** Wrapper properties, ordered so the plugin list reads first. */
function orderedParams(config) {
  const keys = Object.keys(config.params);
  const first = ['wrapper_plugins', 'wrapper_dialect'];
  return [
    ...first.filter((k) => keys.includes(k)),
    ...keys.filter((k) => !first.includes(k)).sort(),
  ];
}

/** The plugin list is itself a property, derived from the plugin set. Always
 * emitted, even when empty: an explicit `wrapper_plugins: ''` states that the
 * wrapper runs with no plugins (for example behind an RDS Proxy, which does its
 * own failover), rather than leaving the reader to guess the default. */
function withPluginList(config) {
  const params = { ...config.params };
  params.wrapper_plugins = {
    value: config.plugins.map((p) => p.code).join(','),
    from: config.plugins.length ? 'from your answers' : 'no plugins needed for this configuration',
  };
  return { ...config, params };
}

/* ------------------------------------------------------------------ *
 * Active Record
 * ------------------------------------------------------------------ */

function poolLines(config, arVersion) {
  const out = [];
  const pool = { ...config.pool };

  // 8.1 renamed the size key. Emit the spelling this version accepts.
  if (arVersion === '7.2') {
    if (pool.max_connections) {
      pool.pool = { ...pool.max_connections, from: `${pool.max_connections.from} (7.2 spelling)` };
      delete pool.max_connections;
    }
    // These keys do not exist before 8.1; the registry already blocks the
    // options that set them, so this is belt and braces.
    delete pool.max_age;
    delete pool.keepalive;
    delete pool.min_connections;
  }
  Object.keys(pool)
    .sort()
    .forEach((key) => out.push({ text: `  ${key}: ${yamlValue(pool[key].value)}`, why: pool[key].from }));
  return out;
}

function connectionBlock(config, ctx, { role, indent }) {
  const pre = ' '.repeat(indent);
  const { meta, engine, arVersion } = ctx;
  const isReader = role === 'reading';
  const host = hostFor(ctx.deployment, isReader || config.endpoint === 'reader');
  const lines = [];

  lines.push({ text: `${pre}adapter: ${meta.adapter[engine]}`, why: 'the wrapper\'s adapter' });
  lines.push({ text: `${pre}host: ${host}`, why: isReader ? 'spreads reads across replicas' : null });
  lines.push({ text: `${pre}database: mydb` });
  const creds = credentialsFor(config);
  if (creds.username) lines.push({ text: `${pre}username: <username>` });
  if (creds.password) lines.push({ text: `${pre}password: <password>`, why: creds.why });
  if (isReader) lines.push({ text: `${pre}replica: true`, why: 'marks this as read-only so Rails runs no migrations against it' });

  const cfg = withPluginList(config);
  orderedParams(cfg).forEach((key) => {
    // A reader-only entry should not carry a writer-pinning failover mode.
    if (isReader && key === 'failover_mode') {
      lines.push({ text: `${pre}failover_mode: strict-reader`, why: 'readers only' });
      return;
    }
    lines.push({ text: `${pre}${key}: ${yamlValue(cfg.params[key].value)}`, why: cfg.params[key].from });
  });

  poolLines(config, arVersion).forEach((l) =>
    lines.push({ text: `${pre}${l.text.trimStart()}`, why: l.why }),
  );
  return lines;
}

function emitActiveRecord(config, ctx) {
  const files = [];
  const roles = config.roles.length ? config.roles : ['writing'];
  const multi = roles.length > 1;
  const lines = [{ text: 'production:' }];

  if (multi) {
    lines.push({ text: '  primary:', why: 'the writing role' });
    connectionBlock(config, ctx, { role: 'writing', indent: 4 }).forEach((l) => lines.push(l));
    lines.push({ text: '  primary_replica:', why: 'the reading role' });
    connectionBlock(config, ctx, { role: 'reading', indent: 4 }).forEach((l) => lines.push(l));
  } else {
    connectionBlock(config, ctx, { role: roles[0], indent: 2 }).forEach((l) => lines.push(l));
  }

  files.push({
    name: 'config/database.yml',
    language: 'yaml',
    lines,
    caption: multi
      ? 'Three-tier configuration: one entry per role, both pointing at the same database.'
      : null,
  });

  if (multi) {
    files.push({
      name: 'app/models/application_record.rb',
      language: 'ruby',
      lines: [
        { text: 'class ApplicationRecord < ActiveRecord::Base' },
        { text: '  primary_abstract_class' },
        { text: '' },
        { text: '  connects_to database: { writing: :primary, reading: :primary_replica }', why: 'binds the entries to roles' },
        { text: 'end' },
      ],
      caption: 'Connect once on an abstract class and inherit from it, rather than connecting per model.',
    });
  }

  (config.snippets || []).forEach((snippet) => {
    if (snippet.kind === 'ar_connected_to') {
      files.push({
        name: snippet.title,
        language: 'ruby',
        lines: [
          { text: 'ApplicationRecord.connected_to(role: :reading) do' },
          { text: '  # every query in here uses the reading role' },
          { text: '  Report.where(created_on: Date.today).to_a' },
          { text: 'end' },
        ],
        caption: snippet.caption,
      });
    }
    if (snippet.kind === 'ar_database_selector') {
      files.push({
        name: snippet.title,
        language: 'ruby',
        lines: [
          { text: 'Rails.application.configure do' },
          { text: '  config.active_record.database_selector = { delay: 2.seconds }', why: 'how long after a write reads stay on the primary' },
          { text: '  config.active_record.database_resolver = ActiveRecord::Middleware::DatabaseSelector::Resolver' },
          { text: '  config.active_record.database_resolver_context =' },
          { text: '    ActiveRecord::Middleware::DatabaseSelector::Resolver::Session' },
          { text: 'end' },
        ],
        caption: snippet.caption,
      });
    }
  });

  return files;
}

/* ------------------------------------------------------------------ *
 * The gem directly
 * ------------------------------------------------------------------ */

function directArgs(config, ctx, { reader }) {
  const { meta, engine } = ctx;
  const host = hostFor(ctx.deployment, reader || config.endpoint === 'reader');
  const lines = [];
  const isPg = engine === 'pg';

  lines.push({ text: `  host: ${rubyValue(host)}`, why: reader ? 'the reader endpoint' : null });
  lines.push({ text: `  ${isPg ? 'dbname' : 'database'}: 'mydb'` });
  const creds = credentialsFor(config);
  if (creds.username) lines.push({ text: `  ${isPg ? 'user' : 'username'}: '<username>'` });
  if (creds.password) lines.push({ text: "  password: '<password>'", why: creds.why });

  const cfg = withPluginList(config);
  orderedParams(cfg).forEach((key) => {
    if (reader && key === 'failover_mode') {
      lines.push({ text: "  failover_mode: 'strict-reader'", why: 'readers only' });
      return;
    }
    lines.push({ text: `  ${key}: ${rubyValue(cfg.params[key].value)}`, why: cfg.params[key].from });
  });
  return lines;
}

function emitDirect(config, ctx) {
  const { meta, engine } = ctx;
  const two = config.connections === 'writer_reader';
  const lines = [{ text: `require '${meta.requirePath[engine]}'` }, { text: '' }];

  const build = (varName, reader) => {
    lines.push({ text: `${varName} = ${meta.directClass[engine]}.new(` });
    directArgs(config, ctx, { reader }).forEach((l, i, all) =>
      lines.push({ text: l.text + (i === all.length - 1 ? '' : ','), why: l.why }),
    );
    lines.push({ text: ')' });
  };

  if (two) {
    build('writer', false);
    lines.push({ text: '' });
    build('reader', true);
  } else {
    build('conn', false);
  }

  return [
    {
      name: two ? 'Opening both connections' : 'Opening the connection',
      language: 'ruby',
      lines,
      caption: `${meta.directClass[engine]} stands in for ${meta.standsIn[engine]}, so the rest of your code is unchanged.${
        two ? ' Your code decides which of the two any given query uses.' : ''
      }`,
    },
  ];
}

/* ------------------------------------------------------------------ */

export function emitFiles(config, ctx) {
  return ctx.integration === 'active_record' ? emitActiveRecord(config, ctx) : emitDirect(config, ctx);
}
