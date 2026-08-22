/* Not-yet-ready section switches: sections whose content isn't ready
   stay dark — the nav keeps the entry labeled SOON and the page renders
   an "on its way" placeholder (SoonPanel), with the rail falling back
   to community. When a section is ready: flip it to false and delete
   the page's UPCOMING branch. The blog/learn merge produced explore
   (one article shelf for letters x tutorials). */
export const UPCOMING = {
  /* explore has shipped: the four-dimension shelf (kind/series/tags/
     archive); empty content is an honest empty state. */
  explore: false,
  demoNight: true,
} as const;

/* Sections not planned for the near term: nav/search entries stay
   hidden entirely (a SOON badge is still ongoing exposure); the URLs
   keep the UPCOMING placeholder above. To relaunch, flip the entry to
   false and restore the nav entry. */
export const NAV_HIDDEN = {
  demoNight: true,
} as const;
