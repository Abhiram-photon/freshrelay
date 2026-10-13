import { z } from 'zod'
import {
  ALLERGENS,
  CATEGORIES,
  PROVIDER_ORG_TYPES,
  RECIPIENT_ORG_TYPES,
  STORAGE_TYPES,
  UNITS,
} from './units'

export const ROLES = ['PROVIDER', 'RECIPIENT'] as const
export type Role = (typeof ROLES)[number]

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const registerSchema = z
  .object({
    role: z.enum(ROLES),
    email: z.email().max(200),
    password: z.string().min(8, 'Password must be at least 8 characters').max(200),
    name: z.string().min(2, 'Name is required').max(100),
    phone: z.string().max(30).optional().or(z.literal('')),
    organization: z.object({
      type: z.enum([...PROVIDER_ORG_TYPES, ...RECIPIENT_ORG_TYPES]),
      name: z.string().min(2, 'Organization name is required').max(120),
      address: z.string().min(4, 'Address is required').max(300),
      lat: z.number().min(-90, 'Invalid latitude').max(90, 'Invalid latitude'),
      lng: z.number().min(-180, 'Invalid longitude').max(180, 'Invalid longitude'),
    }),
  })
  .refine(
    (v) =>
      v.role === 'PROVIDER'
        ? (PROVIDER_ORG_TYPES as readonly string[]).includes(v.organization.type)
        : (RECIPIENT_ORG_TYPES as readonly string[]).includes(v.organization.type),
    { message: 'Organization type does not match the selected role', path: ['organization', 'type'] }
  )

export const loginSchema = z.object({
  email: z.email().max(200),
  password: z.string().min(1).max(200),
})

export const passwordResetRequestSchema = z.object({
  email: z.email().max(200),
})

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(10).max(200),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
})

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------

export const listingCreateSchema = z
  .object({
    title: z.string().min(3, 'Title must be at least 3 characters').max(120),
    description: z.string().min(1, 'Description is required').max(2000),
    category: z.enum(CATEGORIES),
    quantityTotal: z.number().positive('Quantity must be positive').max(100_000),
    unit: z.enum(UNITS),
    allergens: z.array(z.enum(ALLERGENS)).default([]),
    storageType: z.enum(STORAGE_TYPES),
    pickupAddress: z.string().min(4, 'Pickup address is required').max(300),
    lat: z.number().min(-90, 'Invalid latitude').max(90, 'Invalid latitude'),
    lng: z.number().min(-180, 'Invalid longitude').max(180, 'Invalid longitude'),
    windowStart: z.iso.datetime({ offset: true, message: 'Invalid collection window start' }),
    windowEnd: z.iso.datetime({ offset: true, message: 'Invalid collection window end' }),
    expiresAt: z.iso.datetime({ offset: true }).optional(),
    pickupInstructions: z.string().max(500).optional().or(z.literal('')),
    photoUrl: z.string().max(500).optional().or(z.literal('')),
    publish: z.boolean().default(false),
  })
  .refine((v) => new Date(v.windowEnd).getTime() > new Date(v.windowStart).getTime(), {
    message: 'Collection window end must be after start',
    path: ['windowEnd'],
  })

export const listingPatchSchema = z.object({
  title: z.string().min(3).max(120).optional(),
  description: z.string().min(1).max(2000).optional(),
  category: z.enum(CATEGORIES).optional(),
  quantityTotal: z.number().positive().max(100_000).optional(),
  unit: z.enum(UNITS).optional(),
  allergens: z.array(z.enum(ALLERGENS)).optional(),
  storageType: z.enum(STORAGE_TYPES).optional(),
  pickupAddress: z.string().min(4).max(300).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  windowStart: z.iso.datetime({ offset: true }).optional(),
  windowEnd: z.iso.datetime({ offset: true }).optional(),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
  pickupInstructions: z.string().max(500).optional().or(z.literal('')),
  photoUrl: z.string().max(500).optional().or(z.literal('')),
  publish: z.boolean().optional(),
  version: z.number().int().optional(),
})

// ---------------------------------------------------------------------------
// Reservations
// ---------------------------------------------------------------------------

export const reservationCreateSchema = z.object({
  quantity: z.number().positive('Quantity must be at least 1').max(100_000),
  pickupStart: z.iso.datetime({ offset: true, message: 'Invalid pickup slot start' }),
  pickupEnd: z.iso.datetime({ offset: true, message: 'Invalid pickup slot end' }),
})

export const verifyCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Code must be exactly 6 digits'),
})

export const cancelReservationSchema = z.object({
  reason: z.string().max(300).optional().or(z.literal('')),
})

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const orgVerificationSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().max(500).optional().or(z.literal('')),
})

export const userStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
})

export const moderationSchema = z.object({
  action: z.enum(['HIDE', 'RESTORE']),
})

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export const accountUpdateSchema = z.object({
  notifyNearby: z.boolean().optional(),
  phone: z.string().max(30).optional().or(z.literal('')),
})

// ---------------------------------------------------------------------------
// Types shared with the client
// ---------------------------------------------------------------------------

export type RegisterInput = z.infer<typeof registerSchema>
export type ListingCreateInput = z.infer<typeof listingCreateSchema>
export type ReservationCreateInput = z.infer<typeof reservationCreateSchema>
