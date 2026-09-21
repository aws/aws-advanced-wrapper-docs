/**
 * Re-applies hash-anchor scrolling after async content (notably Mermaid SVGs)
 * has laid out.
 *
 * Problem: on a fresh load or a pasted URL with a #hash, the browser scrolls to
 * where the target sits in the initial, diagram-less layout. Mermaid then
 * renders asynchronously and injects tall SVGs above the target, pushing it far
 * down — so the reader is left at/near the top instead of at the heading.
 *
 * Fix: after each route update, if there is a hash, scroll to the target once
 * synchronously, then again after layout settles. A MutationObserver watches the
 * document for the late-arriving Mermaid SVGs and re-scrolls until the layout
 * stops changing (or a short time budget elapses), which covers slow renders.
 */

function scrollToHash() {
  if (typeof window === 'undefined' || !window.location.hash) return;

  const id = decodeURIComponent(window.location.hash.slice(1));
  if (!id) return;

  const scroll = () => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView();
    return Boolean(el);
  };

  // Immediate attempt (target may already exist in the diagram-less layout).
  scroll();

  // Re-scroll on the next frame, after the initial paint.
  requestAnimationFrame(() => setTimeout(scroll, 0));

  // Re-scroll once the full window load fires (images/fonts).
  window.addEventListener('load', scroll, { once: true });

  // Watch for late DOM mutations (Mermaid injects SVGs asynchronously) and
  // re-scroll each time the layout changes, for a bounded window.
  if (typeof MutationObserver === 'undefined') return;

  const deadline = Date.now() + 4000; // stop observing after 4s
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scroll();
      if (Date.now() > deadline) observer.disconnect();
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 4000);
}

export function onRouteDidUpdate({ location, previousLocation }) {
  // Run on initial load and whenever the hash (or path) changes.
  if (!previousLocation || location.hash) {
    scrollToHash();
  }
}
