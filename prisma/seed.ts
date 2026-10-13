 
/**
 * FreshRelay seed script — run with `bun prisma/seed.ts`.
 *
 * Creates the full demo dataset for Hyderabad, India:
 *   1 admin, 3 approved providers, 1 pending provider,
 *   3 approved recipients, 1 pending recipient,
 *   20 listings (active / expiring-soon / reserved-out / paused / draft /
 *   cancelled / expired mix) and ~30 reservations (historical collected for
 *   impact charts, upcoming with codes, cancelled, expired, locked).
 *
 * All passwords are clearly fake and for LOCAL DEMO ONLY.
 */
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/lib/password'
import { pickupCodeHash } from '../src/lib/tokens'

const db = new PrismaClient()

const DEMO_PASSWORD = 'Demo1234!'
const ADMIN_PASSWORD = 'Admin123!'

const H = (n: number) => n * 3_600_000
const M = (n: number) => n * 60_000
const D = (n: number) => n * 86_400_000

function hoursFromNow(h: number): Date {
  return new Date(Date.now() + h * 3_600_000)
}

function monthsAgo(months: number, day = 10, hour = 11): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, day, hour, 0, 0))
}

async function main() {
  console.log('Seeding FreshRelay demo data (Hyderabad, India)…')

  // ---- wipe (FK-safe order) -------------------------------------------------
  await db.job.deleteMany()
  await db.notification.deleteMany()
  await db.reservation.deleteMany()
  await db.listing.deleteMany()
  await db.organization.deleteMany()
  await db.session.deleteMany()
  await db.passwordResetToken.deleteMany()
  await db.auditLog.deleteMany()
  await db.user.deleteMany()

  // ---- users + organizations ------------------------------------------------
  const mkUser = (
    email: string,
    name: string,
    role: string,
    org?: { type: string; name: string; address: string; lat: number; lng: number; status: string; note?: string }
  ) =>
    db.user.create({
      data: {
        email,
        passwordHash: hashPassword(role === 'ADMIN' ? ADMIN_PASSWORD : DEMO_PASSWORD),
        name,
        role,
        status: 'ACTIVE',
        notifyNearby: role === 'RECIPIENT',
        organizations: org
          ? {
              create: {
                type: org.type,
                name: org.name,
                address: org.address,
                lat: org.lat,
                lng: org.lng,
                verificationStatus: org.status,
                verificationNote: org.note ?? null,
              },
            }
          : { create: { type: 'CHARITY', name: 'Platform Admin Office', address: 'HQ, Hyderabad', lat: 17.385, lng: 78.4867, verificationStatus: 'APPROVED' } },
      },
      include: { organizations: true },
    })

  const admin = await mkUser('admin@freshrelay.test', 'Aarav Admin', 'ADMIN')
  void admin

  const bakery = await mkUser('lakshmi@freshrelay.test', 'Meera Lakshmi', 'PROVIDER', {
    type: 'BAKERY', name: "Lakshmi's Bake House", address: 'Shop 4, Lakdikapul Main Road, Hyderabad', lat: 17.3962, lng: 78.4747, status: 'APPROVED',
  })
  const grocery = await mkUser('greenbasket@freshrelay.test', 'Ravi Kumar', 'PROVIDER', {
    type: 'GROCERY', name: 'Green Basket Supermarket', address: 'Plot 22, Public Gardens Road, Nampally, Hyderabad', lat: 17.3753, lng: 78.5052, status: 'APPROVED',
  })
  const caterer = await mkUser('nizam@freshrelay.test', 'Nizam Ahmed', 'PROVIDER', {
    type: 'CATERER', name: "Nizam's Catering Co.", address: '5-9-31, Musheerabad Main Road, Hyderabad', lat: 17.4165, lng: 78.4989, status: 'APPROVED',
  })
  const pendingProvider = await mkUser('charminar@freshrelay.test', 'Saida Begum', 'PROVIDER', {
    type: 'RESTAURANT', name: 'Charminar Sweets House', address: 'Near Charminar, Old City, Hyderabad', lat: 17.3616, lng: 78.4747, status: 'PENDING',
  })

  const foodbank = await mkUser('anna@freshrelay.test', 'Anna Sebastian', 'RECIPIENT', {
    type: 'FOOD_BANK', name: 'Anna Food Bank Hyderabad', address: '2-4-606, Nampally, Hyderabad', lat: 17.385, lng: 78.4867, status: 'APPROVED',
  })
  const shelter = await mkUser('hope@freshrelay.test', 'Fatima Khan', 'RECIPIENT', {
    type: 'SHELTER', name: 'Hope Shelter Trust', address: 'Street 8, Somajiguda, Hyderabad', lat: 17.4271, lng: 78.4719, status: 'APPROVED',
  })
  const kitchen = await mkUser('seva@freshrelay.test', 'Suresh Rao', 'RECIPIENT', {
    type: 'COMMUNITY_KITCHEN', name: 'Seva Community Kitchen', address: 'Shop 7, Malakpet Market Road, Hyderabad', lat: 17.3718, lng: 78.5178, status: 'APPROVED',
  })
  const pendingRecipient = await mkUser('bright@freshrelay.test', 'Divya Menon', 'RECIPIENT', {
    type: 'CHARITY', name: 'Bright Futures Charity', address: 'Ameerpet, Hyderabad', lat: 17.4374, lng: 78.4487, status: 'PENDING',
  })

  const bankOrg = foodbank.organizations[0]
  const shelterOrg = shelter.organizations[0]
  const kitchenOrg = kitchen.organizations[0]

  // ---- listings --------------------------------------------------------------
  type ListingSeed = {
    orgId: string; title: string; description: string; category: string; quantityTotal: number; unit: string;
    allergens: string[]; storageType: string; pickupAddress: string; lat: number; lng: number;
    start: Date; end: Date; expires?: Date; status: string; instructions?: string;
  }

  const bakeryAddr = bakery.organizations[0]
  const groceryAddr = grocery.organizations[0]
  const catererAddr = caterer.organizations[0]

  const listings: ListingSeed[] = [
    // — expiring soon (window closes within the hour) —
    { orgId: bakery.organizations[0].id, title: 'Fresh sourdough loaves (30)', description: 'Unsold sourdough from today’s bake. Crusty outside, soft inside. Great for sandwiches or croutons.', category: 'BAKED_GOODS', quantityTotal: 30, unit: 'loaf', allergens: ['GLUTEN'], storageType: 'AMBIENT', pickupAddress: bakeryAddr.address, lat: bakeryAddr.lat, lng: bakeryAddr.lng, start: hoursFromNow(-3), end: hoursFromNow(0.75), status: 'ACTIVE', instructions: 'Ring the bell at the side door — ask for Meera.' },
    { orgId: grocery.organizations[0].id, title: 'Mixed vegetable crates', description: 'Grade-B but perfectly edible tomatoes, carrots and beans. Sort and rescue as you need.', category: 'PRODUCE', quantityTotal: 18, unit: 'kg', allergens: [], storageType: 'AMBIENT', pickupAddress: groceryAddr.address, lat: groceryAddr.lat, lng: groceryAddr.lng, start: hoursFromNow(-5), end: hoursFromNow(0.9), status: 'ACTIVE', instructions: 'Loading bay at the rear, ask for Ravi. Public Gardens Road side.' },
    { orgId: caterer.organizations[0].id, title: 'Hot veg biryani trays', description: 'Surplus from a corporate lunch. Kept hot in insulated trays. Vegetarian.', category: 'PREPARED_MEALS', quantityTotal: 12, unit: 'tray', allergens: [], storageType: 'HOT', pickupAddress: catererAddr.address, lat: catererAddr.lat, lng: catererAddr.lng, start: hoursFromNow(-2), end: hoursFromNow(1.2), status: 'ACTIVE', instructions: 'Kitchen entrance at the rear gate; bring insulated bags.' },
    // — active with comfortable windows —
    { orgId: bakery.organizations[0].id, title: 'Egg-less sponge cakes', description: 'Whole unsold sponge cakes, plain. Perfect base for desserts.', category: 'BAKED_GOODS', quantityTotal: 14, unit: 'item', allergens: ['GLUTEN', 'MILK'], storageType: 'AMBIENT', pickupAddress: bakeryAddr.address, lat: bakeryAddr.lat, lng: bakeryAddr.lng, start: hoursFromNow(-1), end: hoursFromNow(5), status: 'ACTIVE' },
    { orgId: grocery.organizations[0].id, title: 'Yogurt cups (chilled)', description: 'Near best-before plain yogurt cups, 400 g each. Continuously refrigerated.', category: 'DAIRY', quantityTotal: 40, unit: 'item', allergens: ['MILK'], storageType: 'CHILLED', pickupAddress: groceryAddr.address, lat: groceryAddr.lat, lng: groceryAddr.lng, start: hoursFromNow(-1), end: hoursFromNow(8), status: 'ACTIVE', instructions: 'Cold room — bring cool boxes.' },
    { orgId: grocery.organizations[0].id, title: 'Packaged biscuits & snacks', description: 'Assorted sealed packets with minor packaging dents. Long best-before dates.', category: 'PACKAGED_GROCERY', quantityTotal: 25, unit: 'box', allergens: ['GLUTEN', 'PEANUTS', 'MILK', 'SOY'], storageType: 'AMBIENT', pickupAddress: groceryAddr.address, lat: groceryAddr.lat, lng: groceryAddr.lng, start: hoursFromNow(0.5), end: hoursFromNow(26), status: 'ACTIVE' },
    { orgId: caterer.organizations[0].id, title: 'Fruit salad tubs', description: 'Fresh-cut fruit salad in sealed tubs, kept chilled since prep.', category: 'PRODUCE', quantityTotal: 20, unit: 'kg', allergens: [], storageType: 'CHILLED', pickupAddress: catererAddr.address, lat: catererAddr.lat, lng: catererAddr.lng, start: hoursFromNow(1), end: hoursFromNow(7), status: 'ACTIVE' },
    { orgId: bakery.organizations[0].id, title: 'Butter croissants (60)', description: 'Flaky butter croissants from the morning batch.', category: 'BAKED_GOODS', quantityTotal: 60, unit: 'item', allergens: ['GLUTEN', 'MILK', 'EGGS'], storageType: 'AMBIENT', pickupAddress: bakeryAddr.address, lat: bakeryAddr.lat, lng: bakeryAddr.lng, start: hoursFromNow(-0.5), end: hoursFromNow(6.5), status: 'ACTIVE' },
    { orgId: grocery.organizations[0].id, title: 'Orange juice bottles', description: 'Chilled fresh-pressed orange juice, 1 L bottles, best-before tomorrow.', category: 'BEVERAGES', quantityTotal: 16, unit: 'litre', allergens: [], storageType: 'CHILLED', pickupAddress: groceryAddr.address, lat: groceryAddr.lat, lng: groceryAddr.lng, start: hoursFromNow(2), end: hoursFromNow(30), status: 'ACTIVE' },
    { orgId: caterer.organizations[0].id, title: 'Dal & rice meal boxes', description: 'Sealed meal boxes with dal, rice and sabzi from a wedding rehearsal.', category: 'PREPARED_MEALS', quantityTotal: 35, unit: 'meal', allergens: [], storageType: 'HOT', pickupAddress: catererAddr.address, lat: catererAddr.lat, lng: catererAddr.lng, start: hoursFromNow(3), end: hoursFromNow(9), status: 'ACTIVE', instructions: 'Gate 2, look for the FreshRelay crate.' },
    { orgId: bakery.organizations[0].id, title: 'Multigrain bread (tomorrow morning)', description: 'Bake planned for tonight — collect fresh loaves tomorrow at dawn.', category: 'BAKED_GOODS', quantityTotal: 24, unit: 'loaf', allergens: ['GLUTEN', 'SESAME'], storageType: 'AMBIENT', pickupAddress: bakeryAddr.address, lat: bakeryAddr.lat, lng: bakeryAddr.lng, start: hoursFromNow(14), end: hoursFromNow(20), status: 'ACTIVE' },
    { orgId: grocery.organizations[0].id, title: 'Bananas (ripe, perfect for shakes)', description: 'Ripe bananas — ideal for milkshakes, banana bread or immediate serving.', category: 'PRODUCE', quantityTotal: 22, unit: 'kg', allergens: [], storageType: 'AMBIENT', pickupAddress: groceryAddr.address, lat: groceryAddr.lat, lng: groceryAddr.lng, start: hoursFromNow(4), end: hoursFromNow(28), status: 'ACTIVE' },
    // — reserved out —
    { orgId: bakery.organizations[0].id, title: 'Cinnamon rolls tray (all reserved)', description: 'Fully reserved — showing how RESERVED_OUT listings look. Cancelling a reservation reopens stock.', category: 'BAKED_GOODS', quantityTotal: 10, unit: 'tray', allergens: ['GLUTEN', 'MILK', 'EGGS'], storageType: 'AMBIENT', pickupAddress: bakeryAddr.address, lat: bakeryAddr.lat, lng: bakeryAddr.lng, start: hoursFromNow(-2), end: hoursFromNow(4), status: 'RESERVED_OUT' },
    // — paused —
    { orgId: grocery.organizations[0].id, title: 'Cheese wheels (paused)', description: 'Paused while we verify best-before labels. Will resume shortly.', category: 'DAIRY', quantityTotal: 8, unit: 'kg', allergens: ['MILK'], storageType: 'CHILLED', pickupAddress: groceryAddr.address, lat: groceryAddr.lat, lng: groceryAddr.lng, start: hoursFromNow(-1), end: hoursFromNow(12), status: 'PAUSED' },
    // — draft (pending provider owns it — cannot publish) —
    { orgId: pendingProvider.organizations[0].id, title: 'Double-ka-meetha trays (draft)', description: 'Draft listing — organisation awaiting approval, so this cannot be published yet.', category: 'PREPARED_MEALS', quantityTotal: 6, unit: 'tray', allergens: ['MILK', 'TREE_NUTS', 'GLUTEN'], storageType: 'CHILLED', pickupAddress: pendingProvider.organizations[0].address, lat: pendingProvider.organizations[0].lat, lng: pendingProvider.organizations[0].lng, start: hoursFromNow(2), end: hoursFromNow(10), status: 'DRAFT' },
    // — cancelled —
    { orgId: caterer.organizations[0].id, title: 'Kebab platters (cancelled)', description: 'Event was postponed; listing cancelled.', category: 'PREPARED_MEALS', quantityTotal: 15, unit: 'portion', allergens: [], storageType: 'CHILLED', pickupAddress: catererAddr.address, lat: catererAddr.lat, lng: catererAddr.lng, start: hoursFromNow(-6), end: hoursFromNow(6), status: 'CANCELLED' },
    // — expired —
    { orgId: grocery.organizations[0].id, title: 'Yesterday’s bread shelf (expired)', description: 'Window closed — kept for history. Expired listings never appear in search.', category: 'BAKED_GOODS', quantityTotal: 18, unit: 'loaf', allergens: ['GLUTEN'], storageType: 'AMBIENT', pickupAddress: groceryAddr.address, lat: groceryAddr.lat, lng: groceryAddr.lng, start: hoursFromNow(-30), end: hoursFromNow(-6), status: 'EXPIRED' },
    { orgId: bakery.organizations[0].id, title: 'Evening patties (expired)', description: 'Expired listing from yesterday.', category: 'PREPARED_MEALS', quantityTotal: 12, unit: 'item', allergens: ['GLUTEN'], storageType: 'CHILLED', pickupAddress: bakeryAddr.address, lat: bakeryAddr.lat, lng: bakeryAddr.lng, start: hoursFromNow(-26), end: hoursFromNow(-2), status: 'EXPIRED' },
    // — household provider variety —
    { orgId: grocery.organizations[0].id, title: 'Milk packets (2-day window)', description: 'Surplus toned-milk packets, chilled, best-before in 2 days.', category: 'DAIRY', quantityTotal: 30, unit: 'litre', allergens: ['MILK'], storageType: 'CHILLED', pickupAddress: groceryAddr.address, lat: groceryAddr.lat, lng: groceryAddr.lng, start: hoursFromNow(-0.2), end: hoursFromNow(40), status: 'ACTIVE' },
    { orgId: caterer.organizations[0].id, title: 'Samosa party pack (weekend)', description: 'Weekend bulk order fell through — 200 fresh samosas up for rescue.', category: 'PREPARED_MEALS', quantityTotal: 200, unit: 'item', allergens: ['GLUTEN'], storageType: 'HOT', pickupAddress: catererAddr.address, lat: catererAddr.lat, lng: catererAddr.lng, start: hoursFromNow(6), end: hoursFromNow(14), status: 'ACTIVE' },
  ]

  const created: Record<string, string> = {}
  for (const l of listings) {
    const row = await db.listing.create({
      data: {
        orgId: l.orgId,
        title: l.title,
        description: l.description,
        category: l.category,
        quantityTotal: l.quantityTotal,
        quantityRemaining: l.quantityTotal,
        unit: l.unit,
        allergensJson: JSON.stringify(l.allergens),
        storageType: l.storageType,
        pickupAddress: l.pickupAddress,
        lat: l.lat,
        lng: l.lng,
        windowStart: l.start,
        windowEnd: l.end,
        expiresAt: l.expires ?? l.end,
        pickupInstructions: l.instructions ?? null,
        status: l.status,
      },
    })
    created[l.title] = row.id
  }

  // ---- reservations -----------------------------------------------------------
  // Historical COLLECTED reservations across the last 6 months for impact charts.
  const history = [
    { listing: 'Egg-less sponge cakes', org: bankOrg, month: 6, qty: 8 },
    { listing: 'Fresh sourdough loaves (30)', org: shelterOrg, month: 6, qty: 12 },
    { listing: 'Mixed vegetable crates', org: kitchenOrg, month: 6, qty: 10 },
    { listing: 'Yogurt cups (chilled)', org: bankOrg, month: 5, qty: 24 },
    { listing: 'Butter croissants (60)', org: shelterOrg, month: 5, qty: 30 },
    { listing: 'Fruit salad tubs', org: kitchenOrg, month: 5, qty: 9 },
    { listing: 'Dal & rice meal boxes', org: bankOrg, month: 4, qty: 25 },
    { listing: 'Packaged biscuits & snacks', org: shelterOrg, month: 4, qty: 12 },
    { listing: 'Multigrain bread (tomorrow morning)', org: kitchenOrg, month: 4, qty: 14 },
    { listing: 'Orange juice bottles', org: bankOrg, month: 3, qty: 10 },
    { listing: 'Fresh sourdough loaves (30)', org: kitchenOrg, month: 3, qty: 16 },
    { listing: 'Mixed vegetable crates', org: shelterOrg, month: 3, qty: 14 },
    { listing: 'Egg-less sponge cakes', org: shelterOrg, month: 2, qty: 10 },
    { listing: 'Yogurt cups (chilled)', org: kitchenOrg, month: 2, qty: 30 },
    { listing: 'Butter croissants (60)', org: bankOrg, month: 2, qty: 40 },
    { listing: 'Dal & rice meal boxes', org: kitchenOrg, month: 1, qty: 35 },
    { listing: 'Fruit salad tubs', org: shelterOrg, month: 1, qty: 11 },
    { listing: 'Packaged biscuits & snacks', org: bankOrg, month: 1, qty: 16 },
    { listing: 'Orange juice bottles', org: shelterOrg, month: 0, qty: 12 },
    { listing: 'Fresh sourdough loaves (30)', org: bankOrg, month: 0, qty: 18 },
    { listing: 'Mixed vegetable crates', org: kitchenOrg, month: 0, qty: 8 },
    { listing: 'Egg-less sponge cakes', org: kitchenOrg, month: 0, qty: 6 },
  ]

  for (const h of history) {
    const listingRow = await db.listing.findUnique({ where: { id: created[h.listing] } })
    if (!listingRow) continue
    const collectedAt = monthsAgo(h.month, 8 + (h.qty % 12), 12 + (h.qty % 6))
    await db.reservation.create({
      data: {
        listingId: listingRow.id,
        recipientOrgId: h.org.id,
        quantity: h.qty,
        pickupStart: new Date(collectedAt.getTime() + H(1)),
        pickupEnd: new Date(collectedAt.getTime() + H(3)),
        status: 'COLLECTED',
        collectedAt,
        codeHash: pickupCodeHash('000000'),
      },
    })
  }

  // Upcoming CONFIRMED reservations with known demo codes.
  const upcoming = [
    { listing: 'Fresh sourdough loaves (30)', org: shelterOrg, code: '246810', qty: 10 },
    { listing: 'Yogurt cups (chilled)', org: bankOrg, code: '135790', qty: 12 },
    { listing: 'Fruit salad tubs', org: kitchenOrg, code: '902104', qty: 5 },
  ]
  for (const u of upcoming) {
    const listingRow = await db.listing.findUnique({ where: { id: created[u.listing] } })
    if (!listingRow) continue
    await db.listing.update({
      where: { id: listingRow.id },
      data: { quantityRemaining: { decrement: u.qty } },
    })
    const pickupStart = new Date(Date.now() - M(15)) // slot already open so demo codes verify immediately
    const pickupEnd = new Date(Math.min(Date.now() + H(2), listingRow.windowEnd.getTime()))
    const reservation = await db.reservation.create({
      data: {
        listingId: listingRow.id,
        recipientOrgId: u.org.id,
        quantity: u.qty,
        pickupStart,
        pickupEnd,
        status: 'CONFIRMED',
        codeHash: pickupCodeHash(u.code),
      },
    })
    await db.notification.create({
      data: {
        userId: u.org.ownerUserId,
        type: 'RESERVATION_CONFIRMED',
        payloadJson: JSON.stringify({
          reservationId: reservation.id,
          listingId: listingRow.id,
          listingTitle: listingRow.title,
          code: u.code,
          pickupStart: pickupStart.toISOString(),
          pickupEnd: pickupEnd.toISOString(),
        }),
      },
    })
    const providerOwner = await db.listing.findUnique({ where: { id: listingRow.id }, select: { org: { select: { ownerUserId: true } } } })
    if (providerOwner) {
      await db.notification.create({
        data: {
          userId: providerOwner.org.ownerUserId,
          type: 'RESERVATION_CREATED',
          payloadJson: JSON.stringify({
            reservationId: reservation.id,
            listingId: listingRow.id,
            listingTitle: listingRow.title,
            recipientOrgName: u.org.name,
            quantityLabel: `${u.qty} ${listingRow.unit}`,
          }),
        },
      })
    }
  }

  // Fully-reserve the RESERVED_OUT demo listing.
  const cinnamon = await db.listing.findUnique({ where: { id: created['Cinnamon rolls tray (all reserved)'] } })
  if (cinnamon) {
    const cinnamonRes = await db.reservation.create({
      data: {
        listingId: cinnamon.id,
        recipientOrgId: bankOrg.id,
        quantity: 10,
        pickupStart: new Date(Date.now() + M(45)),
        pickupEnd: new Date(Date.now() + M(45 + 90)),
        status: 'CONFIRMED',
        codeHash: pickupCodeHash('555000'),
      },
    })
    // The plaintext code travels via the confirmation notification (only the
    // hash is stored on the reservation), so seed that notification too.
    await db.notification.create({
      data: {
        userId: bankOrg.ownerUserId,
        type: 'RESERVATION_CONFIRMED',
        payloadJson: JSON.stringify({
          reservationId: cinnamonRes.id,
          listingId: cinnamon.id,
          listingTitle: cinnamon.title,
          code: '555000',
          pickupStart: new Date(Date.now() + M(45)).toISOString(),
          pickupEnd: new Date(Date.now() + M(45 + 90)).toISOString(),
        }),
      },
    })
  }

  // A LOCKED reservation (5 failed attempts) for demo purposes.
  const patties = await db.listing.findUnique({ where: { id: created['Evening patties (expired)'] } })
  if (patties) {
    await db.reservation.create({
      data: {
        listingId: patties.id,
        recipientOrgId: shelterOrg.id,
        quantity: 4,
        pickupStart: hoursFromNow(-4),
        pickupEnd: hoursFromNow(-2.5),
        status: 'LOCKED',
        failedAttempts: 5,
        codeHash: pickupCodeHash('777777'),
      },
    })
  }

  // A cancelled reservation (stock restored).
  const biscuits = await db.listing.findUnique({ where: { id: created['Packaged biscuits & snacks'] } })
  if (biscuits) {
    await db.reservation.create({
      data: {
        listingId: biscuits.id,
        recipientOrgId: shelterOrg.id,
        quantity: 3,
        pickupStart: hoursFromNow(1),
        pickupEnd: hoursFromNow(3),
        status: 'CANCELLED',
        cancelReason: 'Vehicle unavailable — sorry!',
        codeHash: pickupCodeHash('314159'),
      },
    })
  }

  // Notifications: welcome/expiring-soon samples so bell has content.
  await db.notification.create({
    data: { userId: bakery.organizations[0].ownerUserId, type: 'LISTING_EXPIRING_SOON', payloadJson: JSON.stringify({ listingId: created['Fresh sourdough loaves (30)'], title: 'Fresh sourdough loaves (30)' }) },
  })
  await db.notification.create({
    data: { userId: foodbank.id, type: 'NEW_NEARBY_LISTING', payloadJson: JSON.stringify({ listingId: created['Fresh sourdough loaves (30)'], title: 'Fresh sourdough loaves (30)', distanceKm: 3.2 }) },
  })
  await db.notification.create({
    data: { userId: pendingProvider.id, type: 'ACCOUNT_STATUS', payloadJson: JSON.stringify({ status: 'PENDING_REVIEW' }) },
  })

  await db.auditLog.create({
    data: { actorUserId: admin.id, action: 'SEED_PERFORMED', entity: 'System', metadataJson: '{}' },
  })

  // ---- print credentials -------------------------------------------------------
  console.log(`
✅ Seed complete — Hyderabad, India demo dataset.

DEMO ACCOUNTS (local demo only — clearly fake passwords):
  ROLE        EMAIL                       PASSWORD      ORG                          STATUS
  ADMIN       admin@freshrelay.test       Admin123!     Platform Admin Office        APPROVED
  PROVIDER    lakshmi@freshrelay.test     Demo1234!     Lakshmi's Bake House         APPROVED
  PROVIDER    greenbasket@freshrelay.test Demo1234!     Green Basket Supermarket     APPROVED
  PROVIDER    nizam@freshrelay.test       Demo1234!     Nizam's Catering Co.         APPROVED
  PROVIDER    charminar@freshrelay.test   Demo1234!     Charminar Sweets House       PENDING (cannot publish)
  RECIPIENT   anna@freshrelay.test        Demo1234!     Anna Food Bank Hyderabad     APPROVED
  RECIPIENT   hope@freshrelay.test        Demo1234!     Hope Shelter Trust           APPROVED
  RECIPIENT   seva@freshrelay.test        Demo1234!     Seva Community Kitchen       APPROVED
  RECIPIENT   bright@freshrelay.test      Demo1234!     Bright Futures Charity       PENDING (cannot reserve)

DEMO PICKUP CODES (upcoming reservations, visible in recipient dashboard):
  Hope Shelter Trust  → 246810  (Fresh sourdough loaves)
  Anna Food Bank      → 135790  (Yogurt cups)
  Seva Community Kitchen → 902104 (Fruit salad tubs)
`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
