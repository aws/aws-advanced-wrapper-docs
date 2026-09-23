# Contributing Guidelines

Thank you for your interest in contributing to the AWS Advanced Wrapper documentation. We greatly value feedback and contributions from our community.

Please read through this document before submitting any issues or pull requests to ensure we have all the necessary information to effectively respond to your bug report or contribution.

## What lives in this repository

This repository contains **documentation only**. The source code for each wrapper lives in that wrapper's own repository — see the [Wrappers](README.md#wrappers) table in the README.

- **Report a bug in the docs** (a broken link, a wrong parameter name, a missing page, a rendering issue on the site) → open an issue here.
- **Report a bug in a specific wrapper** (a runtime error, a feature request, a question about the wrapper's own code) → open an issue on that wrapper's repository, not this one.
- **Report a security issue** → follow the process in [SECURITY.md](SECURITY.md). Please do **not** create a public GitHub issue for security concerns.

## Reporting Bugs/Feature Requests

We welcome you to use the GitHub issue tracker to report bugs in the documentation or suggest improvements.

When filing an issue, please check existing open and recently closed issues to make sure somebody else hasn't already reported it. Details like these are incredibly useful:

* The exact page URL on the docs site, or the file path in this repository.
* The wrapper the page is for (if the issue is specific to one).
* What the docs say, and what you expected them to say.
* A reproducible test case if the issue is with the generated site (e.g. a link that goes to the wrong place, a Mermaid diagram that fails to render).

## Contributing via Pull Requests

Contributions via pull requests are much appreciated. Before sending us a pull request, please ensure that:

1. You are working against the latest source on the *main* branch.
2. You check existing open, and recently merged, pull requests to make sure someone else hasn't addressed the problem already.
3. You open an issue to discuss any significant work — we would hate for your time to be wasted.

### The docs are generated

The site is a [Docusaurus](https://docusaurus.io/) build fed by a Python generator, and both the generator's input **and** its rendered output are committed to this repository.

Practically, that means most edits happen in `content/` and then get replayed into `site/` by the generator:

```
content/                       <- edit these
  pages.yaml                    page tree
  compatibility.yaml            plugin catalog + compatibility matrices
  failover.yaml                 failover parameters, error catalog
  scenarios.yaml                Set up by Scenario builder
  dev-guide.yaml                per-wrapper Development Guide values
  plugins.yaml                  per-plugin metadata
  templates/*.md.j2             one Jinja template per page kind
  partials/*.md.j2              shared prose includes

site/                          <- do not hand-edit under docs-<wrapper>/,
  docs-<wrapper>/               sidebars-<wrapper>.js, or src/generated/;
  sidebars-<wrapper>.js         they are re-written by `python generate.py`
  src/generated/                and any manual changes will be overwritten
```

Prerequisites: **Python 3.9+**, **Node.js 18+**, and one of `npm` / `yarn` / `pnpm`.

Before opening a pull request:

1. Run the generator so the rendered output matches the sources.

   ```bash
   python -m venv .venv
   source .venv/bin/activate         # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   python generate.py
   ```

2. Preview the site locally.

   ```bash
   cd site
   npm install
   npm run start                     # http://localhost:3000
   ```

3. Confirm the build passes.

   ```bash
   cd site
   npm run build
   npm run serve                     # optional — preview the built (production) site
   ```

   `npm run build` produces the static site that GitHub Pages serves; `npm run serve` renders that built output locally, which is worth checking when a change touches routing, the wrapper switcher, or anything that behaves differently under a production build than under the dev server.

4. Commit both your `content/` changes **and** the regenerated files under `site/docs-<wrapper>/`, `site/sidebars-<wrapper>.js`, and `site/src/generated/`. See the [README](README.md#editing-the-docs) for the full editing workflow.

### CI checks on your pull request

Every pull request that touches `content/`, `generate.py`, `requirements.txt`, or `site/` runs the [Verify Docs](.github/workflows/verify-docs.yml) workflow, which has two jobs:

- **Verify generated docs are fresh** — re-runs `python generate.py` on your PR and fails if the output under `site/docs-<wrapper>/`, `site/sidebars-<wrapper>.js`, or `site/src/generated/` differs from what you committed. If this job fails, run `python generate.py` locally, commit the resulting changes, and push again.
- **Build the Docusaurus site** — runs `npm ci && npm run build` under `site/`. Fails on broken Markdown, dead links, or bad Mermaid fences. Reproduce locally with the same commands.

### Adding a new wrapper

Onboarding a whole new wrapper into this site is a content change:

1. Register the wrapper under `wrappers:` in `content/pages.yaml`, including its `canonicalName` and any `forbiddenNames`.
2. Add the wrapper's values wherever registries are keyed by wrapper — `content/dev-guide.yaml`, `content/failover.yaml`, `content/plugins.yaml`, and the code-sample sections of `content/scenarios.yaml`.
3. Widen the `wrappers:` list on each page in `content/pages.yaml` that applies to the new wrapper.
4. Add a `@docusaurus/plugin-content-docs` instance for the new wrapper in `site/docusaurus.config.js`.
5. Move the wrapper's row in `README.md` from the "Documented in their own repositories" table into the "Documented on this site" table, and point its **Docs** link at `https://aws.github.io/aws-advanced-wrapper-docs/<wrapper>/overview`.
6. Run `python generate.py` and commit the resulting `docs-<wrapper>/`, `sidebars-<wrapper>.js`, and `src/generated/` files.

### Submitting your pull request

To send us a pull request, please:

1. Fork the repository.
2. Modify the source; please focus on the specific change you are contributing. If you also reformat all the content or the templates, it will be hard for us to focus on your change.
3. Ensure the generator runs cleanly and the site builds locally.
4. Commit to your fork using clear commit messages.
5. Send us a pull request, answering any default questions in the pull request interface.
6. Pay attention to any automated CI failures reported in the pull request, and stay involved in the conversation.

GitHub provides additional documentation on [forking a repository](https://help.github.com/articles/fork-a-repo/) and [creating a pull request](https://help.github.com/articles/creating-a-pull-request/).

## Finding contributions to work on

Looking at the existing issues is a great way to find something to contribute on. As this project uses the default GitHub issue labels (enhancement/bug/duplicate/help wanted/invalid/question/wontfix), looking at any 'help wanted' issues is a great place to start.

## Code of Conduct

This project has adopted the [Amazon Open Source Code of Conduct](https://aws.github.io/code-of-conduct). For more information see the [Code of Conduct FAQ](https://aws.github.io/code-of-conduct-faq) or contact opensource-codeofconduct@amazon.com with any additional questions or comments.

## Security issue notifications

If you discover a potential security issue in this project we ask that you notify AWS/Amazon Security via our [vulnerability reporting page](https://aws.amazon.com/security/vulnerability-reporting/). Please do **not** create a public GitHub issue.

## Licensing

See the [LICENSE](LICENSE) file for our project's licensing. We will ask you to confirm the licensing of your contribution.
