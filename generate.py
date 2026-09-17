#!/usr/bin/env python3
"""
Generator for the multi-wrapper Docusaurus site.

Reads:
  content/pages.yaml      — the page tree (id, path, title, category, wrappers, parent,
                            template, contextProfile)
  content/failover.yaml   — the rich failover registry (params, errors, wrapperOnly, plugin groups)
  content/scenarios.yaml  — the scenario builder tree (axes, questions, rules, add-ons)
  content/templates/*.j2  — one Jinja template per page 'template'
  content/partials/*      — shared prose includes

Context profiles
-----------------
Which extra template context a page needs is declared IN CONTENT via the page's
optional `contextProfile` field (see CONTEXT_PROFILES below) — not hardcoded here.
A content author adding a new page picks a profile in pages.yaml; they never edit
this file. Recognized profiles:
  base      — (default) wrapper metadata + registry-wide helpers only.
  failover  — base + full parameter/error/wrapperOnly failover context.
  scenarios — base + the scenario builder's mount info (`scn`). The tree itself
              is emitted as src/generated/scenarios-<wrapper>.json and consumed
              by the ConfigBuilder component, filtered to one wrapper.
  devguide  — base + per-wrapper dev-guide values (`dg`) and any appended
              wrapper-only section (`dg_only`).
If `contextProfile` is omitted, it is inferred for backward compatibility from
the template name (see infer_profile).

Writes (into site/):
  docs-<wrapper>/<path>.md          — one rendered page per (page, applicable wrapper)
  sidebars-<wrapper>.js             — sidebar tree for each wrapper (category -> pages)
  src/generated/manifest.json       — { pages: {id: {path, title, wrappers, parent}}, wrappers: [...] }

The manifest powers the custom WrapperSwitcher: given the current path + wrapper,
it finds the same page id in the target wrapper, or falls back to a
"not applicable" notice linking to the parent page.
"""

import json
import os
import shutil
import sys

try:
    import yaml
    from jinja2 import Environment, FileSystemLoader
    from jinja2.exceptions import TemplateError, UndefinedError
except ImportError:
    sys.exit("ERROR: missing deps. Run: pip install -r requirements.txt")

ROOT = os.path.dirname(os.path.abspath(__file__))
CONTENT = os.path.join(ROOT, "content")
SITE = os.path.join(ROOT, "site")
GENERATED = os.path.join(SITE, "src", "generated")


def load(name):
    path = os.path.join(CONTENT, name)
    if not os.path.exists(path):
        die(f"content file not found: content/{name}")
    try:
        with open(path) as f:
            return yaml.safe_load(f)
    except yaml.YAMLError as e:
        die(f"content/{name} is not valid YAML:\n  {e}")


def die(msg):
    """Abort with a friendly, actionable message (no Python traceback)."""
    sys.exit(f"ERROR: {msg}")


# ---------------------------------------------------------------------------
# Context profiles.
#
# A "profile" decides what EXTRA template context a page receives, on top of the
# base context every page gets. Pages select a profile via `contextProfile:` in
# pages.yaml, so adding a page type no longer requires editing this file — you
# add a template, reference an existing profile (or add one here once), and
# author the page in YAML.
#
# Each builder takes (page, wid, regs) and returns a dict merged into the ctx.
# `regs` is {"failover": <failover.yaml>, "devguide": <dev-guide.yaml>}.
# ---------------------------------------------------------------------------

def _profile_base(page, wid, regs):
    return {}


def _profile_failover(page, wid, regs):
    reg = regs["failover"]
    return {
        "params": reg["parameters"],
        "errors": reg["errors"],
        "wrapperOnly": reg.get("wrapperOnly", {}),
    }


def _profile_enhanced_failover(page, wid, regs):
    reg = regs["failover"]["enhanced"]
    return {
        "enhanced": reg,
        "params": reg["parameters"],
        "errors": reg.get("errors", regs["failover"]["errors"]),
        "wrapperOnly": reg.get("wrapperOnly", {}),
        # Snake-case list for the shared `{% for block in wrapper_only %}` render
        # loop (mirrors the plugins profile). Wrapper-specific appended prose.
        "wrapper_only": (reg.get("wrapperOnly", {}) or {}).get(wid, []),
        # Optional per-wrapper note about reconnection behavior when the wrapper
        # is used through a third-party provider (e.g. an ORM). Absent -> not rendered.
        "third_party_note": (reg.get("thirdPartyNote", {}) or {}).get(wid),
    }


def _scn_text(value, wid):
    """Resolve a registry string that may be per-wrapper.

    A bare string is shared by every wrapper; a mapping is keyed by wrapper id
    with an optional `default`. This is what lets one question row carry
    wrapper-specific clarification without duplicating the question.
    """
    if isinstance(value, dict):
        return value.get(wid, value.get("default"))
    return value


def _scn_applies(node, wid):
    """A node with no `wrappers` key applies everywhere."""
    allowed = node.get("wrappers")
    return wid in allowed if allowed else True


def _scn_node(node, wid, text_keys=("label", "title", "body", "hint", "blocked", "caption", "help", "description")):
    """Copy a registry node for one wrapper: drop `wrappers`, resolve per-wrapper
    text, and recurse into `options`."""
    out = {}
    for key, value in node.items():
        if key == "wrappers":
            continue
        if key == "options":
            out["options"] = [
                _scn_node(opt, wid) for opt in value if _scn_applies(opt, wid)
            ]
        elif key in text_keys:
            resolved = _scn_text(value, wid)
            if resolved is not None:
                out[key] = resolved
        else:
            out[key] = value
    return out


def build_scenarios_payload(reg, wid):
    """Reduce the scenario registry to exactly one wrapper's tree.

    The component receives only what applies to this wrapper, so a wrapper's
    page can never ship another wrapper's plugin codes or vocabulary.
    """
    payload = {
        "wrapper": wid,
        "meta": (reg.get("wrappers", {}) or {}).get(wid, {}),
        "links": reg.get("links", {}),
        "snippets": reg.get("snippets", {}),
        "outcomes": reg.get("outcomes", {}),
        "alwaysTraps": reg.get("alwaysTraps", []),
        "labels": reg.get("labels", {}),
        "pluginRationale": reg.get("pluginRationale", {}),
        "rules": [r for r in reg.get("rules", []) if _scn_applies(r, wid)],
    }
    for section in ("axes", "questions", "addons"):
        payload[section] = [
            _scn_node(node, wid) for node in reg.get(section, []) if _scn_applies(node, wid)
        ]
    return payload


def _profile_scenarios(page, wid, regs):
    """Context for the scenario builder page.

    The page body is thin: it imports the generated per-wrapper JSON and mounts
    the component. Everything else lives in the registry.
    """
    reg = regs["scenarios"]
    return {
        "scn": {
            "wrapper_id": wid,
            "data_module": f"@site/src/generated/scenarios-{wid}.json",
            "question_count": len(
                [q for q in reg.get("questions", []) if _scn_applies(q, wid)]
            ),
            "addon_count": len(
                [a for a in reg.get("addons", []) if _scn_applies(a, wid)]
            ),
        }
    }


def _profile_devguide(page, wid, regs):
    reg = regs["devguide"]
    # wrapperOnly is keyed by the page's last path segment (the template name).
    page_key = page["path"].rsplit("/", 1)[-1]
    return {
        "dg": reg["wrappers"].get(wid, {}),
        "dg_only": reg.get("wrapperOnly", {}).get(page_key, {}).get(wid),
    }


def _profile_plugins(page, wid, regs):
    """Resolve one shared plugin page down to a single wrapper.

    The plugin entry is keyed by the page path's last segment (e.g.
    `iam-authentication`). Parameters are filtered to those available for this
    wrapper (a parameter is available unless its `availability` map says
    otherwise, and it must declare a `spellings` entry for the wrapper). The
    resolved entry is exposed to the template as `plugin`, with `params`,
    `wrapper_only`, and `type_names` broken out for convenience.
    """
    reg = regs["plugins"]
    page_key = page["path"].rsplit("/", 1)[-1]
    entry = (reg.get("plugins", {}) or {}).get(page_key)
    if entry is None:
        die(
            f'pages.yaml page "{page["id"]}": no plugin registry entry for '
            f'"{page_key}" in content/plugins.yaml (plugins: {page_key}:).'
        )

    def available(param):
        avail = param.get("availability")
        if avail is not None and not avail.get(wid, False):
            return False
        return wid in (param.get("spellings") or {})

    params = [p for p in entry.get("parameters", []) if available(p)]

    # Flatten per-wrapper scalar/collection fields so the template can read them
    # directly without indexing by wrapper id.
    def by_wrapper(field, default=None):
        value = entry.get(field)
        if isinstance(value, dict) and set(value) <= set(regs["plugins"].get("wrappers", {})):
            return value.get(wid, default)
        return value if value is not None else default

    plugin = {
        "key": page_key,
        "code": (entry.get("code") or {}).get(wid),
        "availableSince": (entry.get("availableSince") or {}).get(wid),
        "pluginGroup": entry.get("pluginGroup"),
        "intro": entry.get("intro"),
        "note": entry.get("note"),
        "hostRequirement": entry.get("hostRequirement"),
        "secretData": entry.get("secretData"),
        "globalDatabases": entry.get("globalDatabases"),
        "supported": entry.get("supported"),
        "enableSnippet": (entry.get("enableSnippet") or {}).get(wid),
        "monitoringPrefix": (entry.get("monitoringPrefix") or {}).get(wid),
        "monitoringSnippet": (entry.get("monitoringSnippet") or {}).get(wid),
        "configExamples": (entry.get("configExamples") or {}).get(wid, []),
        "parameters": params,
    }
    wrapper_only = (entry.get("wrapperOnly", {}) or {}).get(wid, [])
    prereq_count = (entry.get("prereqCount", {}) or {}).get(wid, 0)
    return {
        "plugin": plugin,
        "params": params,
        "type_names": reg.get("typeNames", {}),
        "prerequisites": wrapper_only[:prereq_count],
        "wrapper_only": wrapper_only[prereq_count:],
    }


CONTEXT_PROFILES = {
    "base": _profile_base,
    "failover": _profile_failover,
    "enhanced-failover": _profile_enhanced_failover,
    "devguide": _profile_devguide,
    "plugins": _profile_plugins,
    "scenarios": _profile_scenarios,
}

# Templates that imply a profile when a page omits `contextProfile`. Kept only
# for backward compatibility; new pages should set `contextProfile` explicitly.
_TEMPLATE_PROFILE_DEFAULTS = {
    "failover": "failover",
    "architecture": "devguide",
    "service-container": "devguide",
    "pipelines": "devguide",
    "loadable-plugins": "devguide",
    "development-guide": "devguide",
    "integration-tests": "devguide",
}


def infer_profile(page):
    """Resolve a page's context profile: explicit `contextProfile` wins, else
    infer from the template name, else 'base'."""
    if page.get("contextProfile"):
        return page["contextProfile"]
    return _TEMPLATE_PROFILE_DEFAULTS.get(page["template"], "base")


def validate(pages_doc, regs):
    """Fail fast with friendly, specific messages instead of opaque Jinja/KeyErrors.

    Collects ALL problems and reports them together so a writer can fix them in
    one pass rather than one-error-at-a-time.
    """
    errors = []

    if not isinstance(pages_doc, dict):
        die("content/pages.yaml must be a mapping with `wrappers:` and `pages:` keys.")
    wrappers = pages_doc.get("wrappers")
    pages = pages_doc.get("pages")
    if not wrappers:
        errors.append("pages.yaml: missing or empty `wrappers:` mapping.")
    if not pages:
        errors.append("pages.yaml: missing or empty `pages:` list.")
    if errors:
        _report(errors)

    wrapper_ids = set(wrappers)
    ids = {}
    paths = {}
    required_fields = ("id", "path", "title", "template", "wrappers")

    for i, page in enumerate(pages):
        where = f"pages.yaml page #{i + 1}"
        pid = page.get("id")
        if pid:
            where = f'pages.yaml page "{pid}"'

        for field in required_fields:
            if field not in page or page[field] in (None, ""):
                errors.append(f'{where}: missing required field "{field}".')

        if pid:
            if pid in ids:
                errors.append(f'{where}: duplicate id "{pid}" (also on {ids[pid]}).')
            ids[pid] = where
        ppath = page.get("path")
        if ppath:
            if ppath in paths:
                errors.append(f'{where}: duplicate path "{ppath}" (also on {paths[ppath]}).')
            paths[ppath] = where

        # Template file must exist.
        tmpl = page.get("template")
        if tmpl:
            tmpl_path = os.path.join(CONTENT, "templates", f"{tmpl}.md.j2")
            if not os.path.exists(tmpl_path):
                errors.append(
                    f'{where}: template "{tmpl}" not found '
                    f'(expected content/templates/{tmpl}.md.j2).'
                )

        # contextProfile, if given, must be known.
        profile = page.get("contextProfile")
        if profile and profile not in CONTEXT_PROFILES:
            known = ", ".join(sorted(CONTEXT_PROFILES))
            errors.append(
                f'{where}: unknown contextProfile "{profile}". Known profiles: {known}.'
            )

        # Every listed wrapper must be a declared wrapper.
        for wid in page.get("wrappers") or []:
            if wid not in wrapper_ids:
                errors.append(
                    f'{where}: references unknown wrapper "{wid}". '
                    f'Declared wrappers: {", ".join(sorted(wrapper_ids))}.'
                )

    # Parent ids must resolve (second pass — needs the full id set).
    for i, page in enumerate(pages):
        parent = page.get("parent")
        if parent and parent not in ids:
            where = f'pages.yaml page "{page.get("id", i + 1)}"'
            errors.append(f'{where}: parent "{parent}" does not match any page id.')

    if errors:
        _report(errors)


def _report(errors):
    lines = "\n".join(f"  - {e}" for e in errors)
    die(f"content validation failed ({len(errors)} problem(s)):\n{lines}")


def main():
    pages_doc = load("pages.yaml")
    failover_reg = load("failover.yaml")
    devguide_reg = load("dev-guide.yaml")
    plugins_reg = load("plugins.yaml")
    scenarios_reg = load("scenarios.yaml")
    regs = {
        "failover": failover_reg,
        "devguide": devguide_reg,
        "plugins": plugins_reg,
        "scenarios": scenarios_reg,
    }

    # Fail fast with friendly messages before rendering anything.
    validate(pages_doc, regs)

    wrappers = pages_doc["wrappers"]
    pages = pages_doc["pages"]

    env = Environment(
        loader=FileSystemLoader(CONTENT),
        keep_trailing_newline=True,
        trim_blocks=True,
        lstrip_blocks=True,
    )

    # Clean previous generated output.
    for wid in wrappers:
        d = os.path.join(SITE, f"docs-{wid}")
        if os.path.exists(d):
            shutil.rmtree(d)
    os.makedirs(GENERATED, exist_ok=True)

    manifest = {"wrappers": [], "pages": {}}
    for wid, wmeta in wrappers.items():
        manifest["wrappers"].append({"id": wid, "label": wmeta["label"], "fullLabel": wmeta["fullLabel"]})

    # Sidebar accumulation: per wrapper, ordered list of {category, id, path, title}
    sidebar_items = {wid: [] for wid in wrappers}

    # Map page id -> path so we can resolve `parent` (an id) to a path.
    id_to_path = {p["id"]: p["path"] for p in pages}

    # Collected by check_product_names as pages render; reported together.
    name_errors = []

    for page in pages:
        pid = page["id"]
        page_path = page["path"]
        parent_id = page.get("parent")
        # Manifest is keyed by PATH (which equals the Docusaurus doc id).
        manifest["pages"][page_path] = {
            "path": page_path,
            "title": page["title"],
            "wrappers": page["wrappers"],
            "parentPath": id_to_path.get(parent_id) if parent_id else None,
            "category": page.get("category"),
        }

        for wid in page["wrappers"]:
            # Merge failover registry fields into the wrapper meta so templates
            # that need connectSnippet / pluginListParam / etc. have them.
            reg_wrapper = failover_reg["wrappers"].get(wid, {})
            merged_wrapper = {**wmeta_for(wrappers, wid), **reg_wrapper}

            # Base context every page gets.
            ctx = {
                "nav": build_nav(wid, pages, pages_doc.get("sectionBlurbs", {}) or {}),
                "doc_id": page_path,
                "page_title": page["title"],
                "wrapper_id": wid,
                "wrapper": merged_wrapper,
                # Registry-wide helpers every template may use.
                "type_names": failover_reg.get("typeNames", {}),
                "page": failover_reg.get("page", {}),
                "plugin_group_labels": failover_reg.get("pluginGroupLabels", {}),
            }

            # Profile-specific context, selected declaratively via the page's
            # `contextProfile` (see CONTEXT_PROFILES). No per-template branching.
            profile = infer_profile(page)
            ctx.update(CONTEXT_PROFILES[profile](page, wid, regs))

            template = env.get_template(f"templates/{page['template']}.md.j2")
            try:
                rendered = template.render(**ctx)
            except (UndefinedError, TemplateError) as e:
                die(
                    f'failed to render "{page["id"]}" ({page["template"]}.md.j2) '
                    f'for wrapper "{wid}":\n  {e}\n'
                    f'  Hint: a value expected by this template is missing for "{wid}". '
                    f'Check that wrapper\'s entry in the relevant registry '
                    f'(failover.yaml / dev-guide.yaml).'
                )

            check_product_names(wid, wrappers[wid], page["path"], rendered, name_errors)

            out_path = os.path.join(SITE, f"docs-{wid}", page["path"] + ".md")
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            with open(out_path, "w") as f:
                f.write(rendered)

            sidebar_items[wid].append(
                {
                    "category": page.get("category"),
                    "id": page_path,
                    "path": page_path,
                    "title": page["title"],
                }
            )
            print(f"  \u2713 docs-{wid}/{page['path']}.md")

    if name_errors:
        _report(name_errors)

    # Write the scenario-builder payload for each wrapper that has a page using
    # the `scenarios` profile. Emitted per wrapper so the browser bundle for one
    # wrapper never contains another wrapper's options.
    scenario_wrappers = sorted(
        {
            wid
            for page in pages
            if infer_profile(page) == "scenarios"
            for wid in page["wrappers"]
        }
    )
    for wid in scenario_wrappers:
        payload = build_scenarios_payload(scenarios_reg, wid)
        out = os.path.join(GENERATED, f"scenarios-{wid}.json")
        with open(out, "w") as f:
            json.dump(payload, f, indent=2)
        print(f"  \u2713 site/src/generated/scenarios-{wid}.json")

    # Write manifest.
    with open(os.path.join(GENERATED, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"  \u2713 site/src/generated/manifest.json")

    # Write per-wrapper sidebars.
    for wid in wrappers:
        write_sidebar(wid, sidebar_items[wid])
        print(f"  \u2713 site/sidebars-{wid}.js")


def wmeta_for(wrappers, wid):
    m = dict(wrappers[wid])
    m["id"] = wid
    return m


def doc_url(path):
    """The URL Docusaurus serves a doc at, which is not always its doc id.

    Docusaurus treats `folder/folder.md`, `folder/index.md` and `folder/README.md`
    as that folder's index page, so those docs are served at the folder URL. The
    sidebar and manifest key off the doc id, but a link in page text must use
    this.
    """
    parts = path.split("/")
    if len(parts) >= 2 and parts[-1] in (parts[-2], "index", "README"):
        return "/".join(parts[:-1])
    return path


def build_nav(wid, pages, blurbs):
    """The Overview page's "What's here" list, derived from the page tree.

    Mirrors sidebar order: top-level pages first, then categories in first-seen
    order. Deriving it means a new section or category cannot be forgotten here
    the way a hand-written list goes stale.
    """
    entries = []
    seen_categories = []
    for page in pages:
        if wid not in page["wrappers"]:
            continue
        category = page.get("category")
        if category is None:
            # The Overview never lists itself.
            if page["id"] == "overview":
                continue
            entries.append(
                {
                    "title": page["title"],
                    "path": doc_url(page["path"]),
                    "blurb": blurbs.get(page["id"], ""),
                }
            )
        elif category not in seen_categories:
            seen_categories.append(category)
            # A category links to its first page for this wrapper.
            entries.append(
                {
                    "title": category,
                    "path": doc_url(page["path"]),
                    "blurb": blurbs.get(category, ""),
                }
            )
    return entries


def check_product_names(wid, wmeta, page_path, rendered, errors):
    """Fail the build if rendered output uses a forbidden product-name variation.

    The wrapper name must always come from a registry field, never be assembled
    from the language label — that is exactly how "AWS Advanced Ruby Wrapper"
    once reached the Overview page. Declared per wrapper in pages.yaml via
    `canonicalName` and `forbiddenNames`.
    """
    for bad in wmeta.get("forbiddenNames") or []:
        if bad in rendered:
            line_no = next(
                (i + 1 for i, line in enumerate(rendered.splitlines()) if bad in line),
                0,
            )
            errors.append(
                f'docs-{wid}/{page_path}.md line {line_no}: found "{bad}", '
                f'which is not the product name. Use "{wmeta.get("canonicalName")}" '
                f"— take it from a registry field (for example wrapper.wrapperName) "
                f"rather than building it from wrapper.label."
            )


def write_sidebar(wid, items):
    """Emit a Docusaurus sidebar: top-level docs (no category) first, then
    categories in first-seen order, each with its docs (by docId)."""
    top = [it for it in items if not it["category"]]
    cats = {}
    cat_order = []
    for it in items:
        if it["category"]:
            if it["category"] not in cats:
                cats[it["category"]] = []
                cat_order.append(it["category"])
            cats[it["category"]].append(it)

    entries = []
    for it in top:
        entries.append(json.dumps(it["id"]))
    for cat in cat_order:
        doc_ids = ",\n        ".join(json.dumps(it["id"]) for it in cats[cat])
        entries.append(
            "{\n"
            f"      type: 'category',\n"
            f"      label: {json.dumps(cat)},\n"
            f"      collapsed: false,\n"
            f"      items: [\n        {doc_ids}\n      ],\n"
            "    }"
        )
    body = ",\n    ".join(entries)
    content = (
        "// AUTO-GENERATED by generate.py — do not edit by hand.\n"
        "// @ts-check\n"
        "/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */\n"
        "const sidebars = {\n"
        f"  {wid}Sidebar: [\n    {body}\n  ],\n"
        "};\n"
        "module.exports = sidebars;\n"
    )
    with open(os.path.join(SITE, f"sidebars-{wid}.js"), "w") as f:
        f.write(content)


if __name__ == "__main__":
    main()
