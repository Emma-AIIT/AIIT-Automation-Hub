/**
 * SearchContext - React context that exposes an openSearch() function to any component
 * in the tree. Used by the sidebar search trigger and other UI elements to programmatically
 * open the SearchPalette without prop-drilling.
 */
"use client";

import { createContext, useContext } from "react";

interface SearchContextValue {
  openSearch: () => void;
}

export const SearchContext = createContext<SearchContextValue>({
  openSearch: () => undefined,
});

export function useSearch() {
  return useContext(SearchContext);
}
