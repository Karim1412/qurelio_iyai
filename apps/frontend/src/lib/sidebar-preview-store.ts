import { create } from 'zustand';

/**
 * Lightweight pub-sub for the "TV preview" banner.
 *
 * The Sidebar broadcasts the href of the tab currently being hovered.
 * Surfaces that want to react (e.g. the dashboard's preview banner)
 * subscribe and re-render only when this single string changes.
 */
type State = {
  hoveredHref: string | null;
  setHoveredHref: (href: string | null) => void;
};

export const useSidebarPreviewStore = create<State>((set) => ({
  hoveredHref: null,
  setHoveredHref: (href) => set({ hoveredHref: href }),
}));
