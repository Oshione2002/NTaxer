(() => {
  const sidebar = document.querySelector('#tax-sidebar');
  if (!sidebar || sidebar.dataset.stickyFooterReady === 'true') return;

  const primary = sidebar.querySelector('.sidebar-primary');
  const appearance = sidebar.querySelector('.sidebar-theme-controls');
  const sources = ['coverage', 'law']
    .map(page => [page, primary?.querySelector(`:scope > a[data-nav="${page}"]`)])
    .filter(([, element]) => element);

  if (!primary || !appearance || sources.length !== 2) return;

  const scrollRegion = document.createElement('div');
  scrollRegion.className = 'sidebar-scroll-region';
  primary.before(scrollRegion);
  scrollRegion.append(primary);

  const pinnedNav = document.createElement('nav');
  pinnedNav.className = 'sidebar-pinned-references';
  pinnedNav.setAttribute('aria-label', 'Pinned reference navigation');

  const pinnedLinks = new Map();
  for (const [page, source] of sources) {
    const clone = source.cloneNode(true);
    clone.dataset.pinnedNav = page;
    clone.hidden = true;
    clone.removeAttribute('aria-current');
    pinnedLinks.set(page, clone);
    pinnedNav.append(clone);
  }

  appearance.before(pinnedNav);
  sidebar.classList.add('sidebar-sticky-footer-ready');
  sidebar.dataset.stickyFooterReady = 'true';

  let frame = 0;
  const scheduleSync = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      syncPinnedReferences();
    });
  };

  function syncPinnedReferences() {
    const sidebarRect = sidebar.getBoundingClientRect();
    const appearanceRect = appearance.getBoundingClientRect();
    const regionRect = scrollRegion.getBoundingClientRect();
    const regionHeight = scrollRegion.clientHeight;
    const scrollTop = scrollRegion.scrollTop;

    const appearanceOffset = Math.max(0, sidebarRect.bottom - appearanceRect.top);
    sidebar.style.setProperty('--sidebar-appearance-offset', `${appearanceOffset}px`);

    let rowHeight = 0;
    let anyPinned = false;

    for (const [page, source] of sources) {
      const sourceRect = source.getBoundingClientRect();
      rowHeight = Math.max(rowHeight, sourceRect.height);

      const contentBottom = sourceRect.bottom - regionRect.top + scrollTop;
      const activationScrollTop = contentBottom - regionHeight;
      const canPin = activationScrollTop > 0.5;
      const isPinned = canPin && scrollTop >= activationScrollTop - 0.5;
      const clone = pinnedLinks.get(page);

      clone.hidden = !isPinned;
      source.classList.toggle('sidebar-reference-source-pinned', isPinned);

      if (isPinned) {
        source.setAttribute('aria-hidden', 'true');
        source.setAttribute('tabindex', '-1');
      } else {
        source.removeAttribute('aria-hidden');
        source.removeAttribute('tabindex');
      }

      anyPinned ||= isPinned;
    }

    if (rowHeight > 0) {
      sidebar.style.setProperty('--sidebar-reference-row-height', `${rowHeight}px`);
    }
    pinnedNav.classList.toggle('has-pinned-links', anyPinned);
  }

  scrollRegion.addEventListener('scroll', scheduleSync, { passive: true });
  window.addEventListener('resize', scheduleSync, { passive: true });

  const resizeObserver = new ResizeObserver(scheduleSync);
  resizeObserver.observe(sidebar);
  resizeObserver.observe(primary);
  resizeObserver.observe(appearance);

  const mutationObserver = new MutationObserver(scheduleSync);
  mutationObserver.observe(primary, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['open', 'hidden', 'class']
  });

  scheduleSync();
})();
