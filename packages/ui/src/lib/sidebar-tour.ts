/**
 * The onboarding walkthrough needs to spotlight the navigation drawer, but on mobile that drawer's
 * open state lives inside `AppBar`. Rather than lifting it through every page, the tour asks for it
 * with a window event and `AppBar` listens. On desktop the sidebar is always rendered, so the tour
 * never fires these.
 */
export const SIDEBAR_TOUR_OPEN_EVENT = 'pocket-pixel:sidebar-tour-open';
export const SIDEBAR_TOUR_CLOSE_EVENT = 'pocket-pixel:sidebar-tour-close';

export const requestSidebarOpen = (): void => {
  window.dispatchEvent(new Event(SIDEBAR_TOUR_OPEN_EVENT));
};

export const requestSidebarClose = (): void => {
  window.dispatchEvent(new Event(SIDEBAR_TOUR_CLOSE_EVENT));
};
