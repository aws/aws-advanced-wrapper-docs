import React from 'react';
import {useLocation, useHistory} from '@docusaurus/router';
import useBaseUrl from '@docusaurus/useBaseUrl';
import manifest from '@site/src/generated/manifest.json';

/**
 * Path-preserving wrapper switcher (navbar item).
 *
 * The site has a per-wrapper doc tree at /<wrapper> (e.g. /ruby). This
 * control lets the reader switch wrapper while staying on the SAME page:
 *
 *   on /<wrapper>/using-plugins/failover + pick another wrapper
 *      -> /<other>/using-plugins/failover
 *
 * If the current page does NOT exist for the target wrapper (per the manifest),
 * it routes to a fallback page (/not-applicable) carrying the page id + target
 * wrapper, which renders a "not applicable" notice with a link to the parent.
 *
 * The chosen wrapper is remembered in localStorage so links from the landing
 * page and future visits default to it.
 */

const WRAPPERS = manifest.wrappers; // [{id,label,fullLabel}]
const STORAGE_KEY = 'preferredWrapper';

function currentWrapperAndPath(pathname, baseUrl) {
  // Strip baseUrl, then leading slash.
  let p = pathname;
  if (baseUrl !== '/' && p.startsWith(baseUrl)) {
    p = p.slice(baseUrl.length);
  }
  p = p.replace(/^\//, '').replace(/\/$/, '');
  const segments = p.split('/');
  const wrapperId = segments[0]; // e.g. ruby | '' (landing)
  const subPath = segments.slice(1).join('/'); // e.g. using-plugins/failover
  return {wrapperId, subPath};
}

export default function WrapperSwitcher() {
  const location = useLocation();
  const history = useHistory();
  const baseUrl = useBaseUrl('/');

  const {wrapperId, subPath} = currentWrapperAndPath(location.pathname, baseUrl);
  const isWrapperContext = WRAPPERS.some((w) => w.id === wrapperId);
  const activeId = isWrapperContext ? wrapperId : null;

  const go = (targetWrapper) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, targetWrapper);
    } catch (e) {
      /* ignore */
    }

    // Not currently in a wrapper context (e.g. landing page): go to that
    // wrapper's overview.
    if (!isWrapperContext || !subPath) {
      history.push(`${baseUrl}${targetWrapper}/overview`.replace('//', '/'));
      return;
    }

    // Resolve the URL sub-path to a manifest key. Docusaurus serves a doc whose
    // id is "<dir>/<dir>" (same name as its folder) at the folder root
    // "/<dir>/", so the URL sub-path can be just "<dir>". Fall back to the
    // "<dir>/<dir>" index key when the direct lookup misses.
    let key = subPath;
    let meta = manifest.pages[key] || null;
    if (!meta && subPath && !subPath.includes('/')) {
      const indexKey = `${subPath}/${subPath}`;
      if (manifest.pages[indexKey]) {
        key = indexKey;
        meta = manifest.pages[indexKey];
      }
    }

    if (meta && meta.wrappers.includes(targetWrapper)) {
      // Same page exists for the target wrapper — preserve the URL sub-path.
      history.push(`${baseUrl}${targetWrapper}/${subPath}`.replace('//', '/'));
    } else {
      // Missing page for the target wrapper — go to the fallback notice.
      const parentPath = meta && meta.parentPath ? meta.parentPath : 'overview';
      const params = new URLSearchParams({
        wrapper: targetWrapper,
        page: key,
        parent: parentPath,
      });
      history.push(`${baseUrl}not-applicable?${params.toString()}`.replace('//', '/'));
    }
  };

  return (
    <div className="wrapperSwitcher" role="tablist" aria-label="Select wrapper">
      {WRAPPERS.map((w) => (
        <button
          key={w.id}
          type="button"
          role="tab"
          aria-selected={activeId === w.id}
          className={
            'wrapperSwitcher__tab' +
            (activeId === w.id ? ' wrapperSwitcher__tab--active' : '')
          }
          onClick={() => go(w.id)}
          title={`View the ${w.label} docs`}
        >
          {w.label}
        </button>
      ))}
    </div>
  );
}
