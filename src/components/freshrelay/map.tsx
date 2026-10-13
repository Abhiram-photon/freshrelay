'use client'

import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import { cn } from '@/lib/utils'

export type MapListing = {
  id: string
  title: string
  lat: number
  lng: number
  category: string
  distanceKm?: number | null
  urgent?: boolean
}

/**
 * Vanilla Leaflet map (OpenStreetMap tiles), imported dynamically so it never
 * runs during SSR. Shows approximate listing markers + a viewer radius circle.
 */
export function FreshMap({
  listings,
  center,
  radiusKm,
  onSelect,
  className,
}: {
  listings: MapListing[]
  center: { lat: number; lng: number }
  radiusKm: number
  onSelect?: (id: string) => void
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
   
  const mapRef = useRef<any>(null)
   
  const layerRef = useRef<any>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // init map once
  useEffect(() => {
    let cancelled = false
    async function init() {
      const L = (await import('leaflet')).default
      if (cancelled || !containerRef.current || mapRef.current) return
      const map = L.map(containerRef.current, {
        center: [center.lat, center.lng],
        zoom: 13,
        scrollWheelZoom: false,
      })
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map)
      const layer = L.layerGroup().addTo(map)
      mapRef.current = map
      layerRef.current = layer
      renderMarkers()
    }
    void init()
    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        layerRef.current = null
      }
    }
     
  }, [])

  // update markers / radius when data changes
  useEffect(() => {
    renderMarkers()
     
  }, [listings, center.lat, center.lng, radiusKm])

   
  async function renderMarkers() {
    const L = (await import('leaflet')).default
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()

    L.circle([center.lat, center.lng], {
      radius: radiusKm * 1000,
      color: '#059669',
      fillColor: '#10b981',
      fillOpacity: 0.06,
      weight: 1.5,
    }).addTo(layer)

     
    const markerIcon = (urgent: boolean) =>
      L.divIcon({
        className: '',
        html: `<span style="display:grid;place-items:center;width:32px;height:32px;border-radius:9999px;background:${urgent ? '#dc2626' : '#059669'};color:white;font-size:16px;box-shadow:0 2px 6px rgba(0,0,0,.25);border:2px solid white;">📍</span>`,
        iconSize: [32, 32],
        iconAnchor: [16, 30],
        popupAnchor: [0, -28],
      })

    for (const l of listings) {
      const m = L.marker([l.lat, l.lng], { icon: markerIcon(!!l.urgent) }).addTo(layer)
      m.bindPopup(
        `<strong>${escapeHtml(l.title)}</strong>${l.distanceKm != null ? `<br/>≈ ${l.distanceKm} km away` : ''}${onSelectRef.current ? `<br/><button data-fr-listing="${l.id}" style="margin-top:6px;background:#059669;color:#fff;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px;">View &amp; reserve</button>` : ''}`
      )
    }

    // popup click → select
    map.off('popupopen')
    map.on('popupopen', (e: { popup: { getContent: () => HTMLElement } }) => {
      const node = e.popup.getContent()
      const btn = node.querySelector('[data-fr-listing]')
      btn?.addEventListener('click', () => {
        const id = btn.getAttribute('data-fr-listing')
        if (id && onSelectRef.current) onSelectRef.current(id)
      })
    })

    if (listings.length > 0) {
      const bounds = L.latLngBounds(listings.map((l) => [l.lat, l.lng] as [number, number]))
      bounds.extend([center.lat, center.lng])
      map.fitBounds(bounds.pad(0.25), { maxZoom: 14 })
    } else {
      map.setView([center.lat, center.lng], 13)
    }
  }

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Map of nearby surplus food listings"
      className={cn('h-full w-full z-0', className)}
    />
  )
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
}
