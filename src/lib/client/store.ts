'use client'

import { create } from 'zustand'

export type View =
  | 'landing'
  | 'login'
  | 'register'
  | 'reset'
  | 'reset-confirm'
  | 'browse'
  | 'listing'
  | 'provider'
  | 'listing-form'
  | 'verify'
  | 'reservations'
  | 'impact'
  | 'admin'
  | 'notifications'
  | 'privacy'
  | 'terms'
  | 'food-safety'

export type BrowseFilters = {
  q: string
  radiusKm: number
  category: string
  storage: string
  timeLeft: string
  sort: 'nearest' | 'ending_soon' | 'best_match'
}

type AppState = {
  view: View
  params: Record<string, string>
  filters: BrowseFilters
  navigate: (view: View, params?: Record<string, string>) => void
  setFilters: (patch: Partial<BrowseFilters>) => void
  resetFilters: () => void
}

const DEFAULT_FILTERS: BrowseFilters = {
  q: '',
  radiusKm: 5,
  category: '',
  storage: '',
  timeLeft: '',
  sort: 'best_match',
}

export const useAppStore = create<AppState>((set) => ({
  view: 'landing',
  params: {},
  filters: DEFAULT_FILTERS,
  navigate: (view, params = {}) => {
    set({ view, params })
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  },
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),
}))
