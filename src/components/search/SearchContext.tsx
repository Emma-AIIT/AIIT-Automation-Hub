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
