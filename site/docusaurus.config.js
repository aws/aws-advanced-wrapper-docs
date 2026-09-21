// @ts-check
const { themes: prismThemes } = require('prism-react-renderer');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'AWS Advanced Wrapper Docs',
  tagline: 'One set of docs. Pick your wrapper.',
  favicon: undefined,

  url: 'https://aws.github.io',
  baseUrl: '/aws-advanced-wrapper-docs/',

  // GitHub Pages deployment config (project site: https://aws.github.io/aws-advanced-wrapper-docs/).
  organizationName: 'aws',
  projectName: 'aws-advanced-wrapper-docs',
  trailingSlash: false,

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  // Enable Mermaid diagrams in Markdown (```mermaid fenced blocks).
  markdown: { mermaid: true },
  themes: ['@docusaurus/theme-mermaid'],

  // Re-applies #hash scrolling after Mermaid SVGs render (fresh loads / pasted URLs).
  clientModules: [require.resolve('./src/clientModules/hashScroll.js')],

  i18n: { defaultLocale: 'en', locales: ['en'] },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        // Docs are provided by the explicit per-wrapper plugin instances below.
        docs: false,
        blog: false,
        theme: { customCss: require.resolve('./src/css/custom.css') },
      }),
    ],
  ],

  // One content-docs instance per wrapper. Each has its own routeBasePath and
  // sidebar, so switching wrappers swaps the entire doc tree + left nav. Adding
  // a wrapper later means adding another instance here (and its docs-<id>/ +
  // sidebars-<id>.js, which the generator writes).
  plugins: [
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'ruby',
        path: 'docs-ruby',
        routeBasePath: 'ruby',
        sidebarPath: require.resolve('./sidebars-ruby.js'),
      },
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: 'AWS Advanced Wrapper Docs',
        items: [
          // Custom wrapper switcher (path-preserving) is injected on the right.
          { type: 'custom-wrapperSwitcher', position: 'right' },
        ],
      },
      footer: {
        style: 'dark',
        copyright:
          'AWS Advanced Wrapper Docs — one set of docs, rendered per wrapper. Pick your wrapper.',
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
        additionalLanguages: ['ruby'],
      },
    }),
};

module.exports = config;
