'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, Me, ListingsResponse, ListingDTO, ReservationDTO, ProviderReservation, NotificationItem, ImpactResult, MyListing, AdminOrg, AdminUser, AdminListing, AdminMetrics } from '@/lib/client/api'

export function useMe() {
  return useQuery<Me | null>({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api<Me>('/auth/me')
      } catch {
        return null
      }
    },
    retry: false,
    staleTime: 10_000,
  })
}

export function useListings(filters: {
  q: string
  radiusKm: number
  category: string
  storage: string
  timeLeft: string
  sort: string
}, lat: number | null, lng: number | null) {
  const params = new URLSearchParams()
  params.set('radius_km', String(filters.radiusKm))
  if (lat !== null && lng !== null) {
    params.set('lat', String(lat))
    params.set('lng', String(lng))
  }
  if (filters.q) params.set('q', filters.q)
  if (filters.category) params.set('category', filters.category)
  if (filters.storage) params.set('storage', filters.storage)
  if (filters.timeLeft) params.set('time_left', filters.timeLeft)
  params.set('sort', filters.sort)
  params.set('limit', '50')
  return useQuery<ListingsResponse>({
    queryKey: ['listings', params.toString()],
    queryFn: () => api<ListingsResponse>(`/listings?${params.toString()}`),
    refetchInterval: 60_000,
  })
}

export function useListing(id: string | null) {
  return useQuery<{ listing: ListingDTO; exact: boolean; isOwner: boolean }>({
    queryKey: ['listing', id],
    queryFn: () => api(`/listings/${id}`),
    enabled: !!id,
  })
}

export function useMyListings(enabled: boolean) {
  return useQuery<{ items: MyListing[] }>({
    queryKey: ['my-listings'],
    queryFn: () => api('/me/listings'),
    enabled,
    refetchInterval: 60_000,
  })
}

export function useMyReservations(enabled: boolean) {
  return useQuery<{ items: ReservationDTO[] }>({
    queryKey: ['my-reservations'],
    queryFn: () => api('/me/reservations'),
    enabled,
    refetchInterval: 60_000,
  })
}

export function useProviderReservations(enabled: boolean) {
  return useQuery<{ items: ProviderReservation[] }>({
    queryKey: ['provider-reservations'],
    queryFn: () => api('/provider/reservations'),
    enabled,
    refetchInterval: 30_000,
  })
}

export function useNotifications(enabled: boolean) {
  return useQuery<{ items: NotificationItem[]; unread: number; total: number }>({
    queryKey: ['notifications'],
    queryFn: () => api('/notifications?limit=50'),
    enabled,
    refetchInterval: 30_000,
  })
}

export function useImpact(enabled: boolean) {
  return useQuery<ImpactResult>({
    queryKey: ['impact'],
    queryFn: () => api('/me/impact'),
    enabled,
  })
}

export function useAdminOrgs(status: string, enabled: boolean) {
  return useQuery<{ items: AdminOrg[] }>({
    queryKey: ['admin-orgs', status],
    queryFn: () => api(`/admin/organizations?status=${status}`),
    enabled,
  })
}

export function useAdminUsers(q: string, enabled: boolean) {
  return useQuery<{ items: AdminUser[] }>({
    queryKey: ['admin-users', q],
    queryFn: () => api(`/admin/users?q=${encodeURIComponent(q)}`),
    enabled,
  })
}

export function useAdminListings(status: string, enabled: boolean) {
  return useQuery<{ items: AdminListing[] }>({
    queryKey: ['admin-listings', status],
    queryFn: () => api(`/admin/listings?status=${status}`),
    enabled,
  })
}

export function useAdminMetrics(enabled: boolean) {
  return useQuery<AdminMetrics>({
    queryKey: ['admin-metrics'],
    queryFn: () => api('/admin/metrics'),
    enabled,
    refetchInterval: 60_000,
  })
}

export function useInvalidate() {
  const qc = useQueryClient()
  return (...keys: string[]) => {
    for (const key of keys) {
      qc.invalidateQueries({ queryKey: [key] })
    }
  }
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST', body: {} }),
    onSuccess: () => {
      qc.setQueryData(['me'], null)
      qc.removeQueries()
    },
  })
}
