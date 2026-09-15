import React from 'react';
import Layout from '@theme/Layout';
import {useLocation} from '@docusaurus/router';
import useBaseUrl from '@docusaurus/useBaseUrl';
import manifest from '@site/src/generated/manifest.json';

/**
 * Fallback page shown when a reader switches to a wrapper that does not have the
 * page they were on. Reads ?wrapper=&page=&parent= from the query string and
 * renders a clear "not applicable" notice with a link to the parent page in the
 * target wrapper.
 */
export default function NotApplicable() {
  const location = useLocation();
  const baseUrl = useBaseUrl('/');
  const params =
    typeof window !== 'undefined'
      ? new URLSearchParams(location.search)
      : new URLSearchParams('');

  const wrapper = params.get('wrapper') || '';
  const pagePath = params.get('page') || '';
  const parentPath = params.get('parent') || 'overview';

  const wrapperMeta = manifest.wrappers.find((w) => w.id === wrapper);
  const wrapperLabel = wrapperMeta ? wrapperMeta.label : wrapper;

  const pageMeta = manifest.pages[pagePath];
  const pageTitle = pageMeta ? pageMeta.title : pagePath;

  const parentMeta = manifest.pages[parentPath];
  const parentSlug = parentMeta ? parentMeta.path : 'overview';
  const parentTitle = parentMeta ? parentMeta.title : 'Overview';
  const parentHref = `${baseUrl}${wrapper}/${parentSlug}`.replace('//', '/');

  return (
    <Layout title="Not applicable" description="Page not available for this wrapper">
      <main className="container margin-vert--xl">
        <div className="row">
          <div className="col col--8 col--offset-2">
            <h1>Not applicable to {wrapperLabel}</h1>
            <div className="admonition admonition-info alert alert--info">
              <div className="admonition-content">
                <p>
                  The page <strong>{pageTitle && `"${pageTitle}"`}</strong> does
                  not exist for the <strong>{wrapperLabel}</strong> wrapper — this
                  feature is not applicable to it.
                </p>
                <p>
                  For related information, see{' '}
                  <a href={parentHref}>
                    {parentTitle} ({wrapperLabel})
                  </a>
                  .
                </p>
              </div>
            </div>
            <p>
              Use the wrapper switcher in the top navigation bar to return to a
              wrapper where this page is available.
            </p>
          </div>
        </div>
      </main>
    </Layout>
  );
}
