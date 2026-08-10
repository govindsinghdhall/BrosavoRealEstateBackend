export const PERMISSIONS = {
  // ============================================================
  // LEADS
  // ============================================================

  LEADS_READ: 'leads.read',
  LEADS_CREATE: 'leads.create',
  LEADS_UPDATE: 'leads.update',
  LEADS_DELETE: 'leads.delete',

  // ============================================================
  // CONTACTS
  // ============================================================

  CONTACTS_READ: 'contacts.read',
  CONTACTS_CREATE: 'contacts.create',
  CONTACTS_UPDATE: 'contacts.update',
  CONTACTS_DELETE: 'contacts.delete',

  // ============================================================
  // PROPERTIES
  // ============================================================

  PROPERTIES_READ: 'properties.read',
  PROPERTIES_CREATE: 'properties.create',
  PROPERTIES_UPDATE: 'properties.update',
  PROPERTIES_DELETE: 'properties.delete',

  // ============================================================
  // SITE VISITS
  // ============================================================

  SITE_VISITS_READ: 'site_visits.read',
  SITE_VISITS_CREATE: 'site_visits.create',
  SITE_VISITS_UPDATE: 'site_visits.update',
  SITE_VISITS_DELETE: 'site_visits.delete',

  // ============================================================
  // BOOKINGS
  // ============================================================

  BOOKINGS_READ: 'bookings.read',
  BOOKINGS_CREATE: 'bookings.create',
  BOOKINGS_UPDATE: 'bookings.update',
  BOOKINGS_DELETE: 'bookings.delete',

  // ============================================================
  // USERS
  // ============================================================

  USERS_READ: 'users.read',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_DELETE: 'users.delete',

  // ============================================================
  // REPORTS
  // ============================================================

  REPORTS_READ: 'reports.read',

  // ============================================================
  // ORGANIZATION
  // ============================================================

  ORGANIZATION_READ: 'organization.read',
  ORGANIZATION_UPDATE: 'organization.update',

  // ============================================================
  // MARKETING
  // ============================================================

  MARKETING_READ: 'marketing.read',
  MARKETING_MANAGE: 'marketing.manage',
  MARKETING_REPLY: 'marketing.reply',

  // ============================================================
  // WHATSAPP
  // ============================================================

  WHATSAPP_READ: 'whatsapp.read',
  WHATSAPP_SEND: 'whatsapp.send',
  WHATSAPP_MANAGE: 'whatsapp.manage',
  WHATSAPP_CAMPAIGN: 'whatsapp.campaign',
} as const

// ============================================================
// TYPES
// ============================================================

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

// ============================================================
// ALL PERMISSIONS
// ============================================================

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS)

// ============================================================
// ROLE PERMISSIONS
// ============================================================

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  // ==========================================================
  // ADMIN
  // ==========================================================

  admin: [...ALL_PERMISSIONS],

  // ==========================================================
  // MANAGER
  // ==========================================================

  manager: [
    PERMISSIONS.LEADS_READ,
    PERMISSIONS.LEADS_CREATE,
    PERMISSIONS.LEADS_UPDATE,
    PERMISSIONS.LEADS_DELETE,

    PERMISSIONS.CONTACTS_READ,
    PERMISSIONS.CONTACTS_CREATE,
    PERMISSIONS.CONTACTS_UPDATE,
    PERMISSIONS.CONTACTS_DELETE,

    PERMISSIONS.PROPERTIES_READ,
    PERMISSIONS.PROPERTIES_CREATE,
    PERMISSIONS.PROPERTIES_UPDATE,

    PERMISSIONS.SITE_VISITS_READ,
    PERMISSIONS.SITE_VISITS_CREATE,
    PERMISSIONS.SITE_VISITS_UPDATE,

    PERMISSIONS.BOOKINGS_READ,
    PERMISSIONS.BOOKINGS_CREATE,
    PERMISSIONS.BOOKINGS_UPDATE,

    PERMISSIONS.USERS_READ,

    PERMISSIONS.REPORTS_READ,

    PERMISSIONS.ORGANIZATION_READ,

    PERMISSIONS.MARKETING_READ,
    PERMISSIONS.MARKETING_REPLY,

    PERMISSIONS.WHATSAPP_READ,
    PERMISSIONS.WHATSAPP_SEND,
    PERMISSIONS.WHATSAPP_MANAGE,
    PERMISSIONS.WHATSAPP_CAMPAIGN,
  ],

  // ==========================================================
  // AGENT
  // ==========================================================

  agent: [
    PERMISSIONS.LEADS_READ,
    PERMISSIONS.LEADS_CREATE,
    PERMISSIONS.LEADS_UPDATE,

    PERMISSIONS.CONTACTS_READ,
    PERMISSIONS.CONTACTS_CREATE,
    PERMISSIONS.CONTACTS_UPDATE,

    PERMISSIONS.PROPERTIES_READ,

    PERMISSIONS.SITE_VISITS_READ,
    PERMISSIONS.SITE_VISITS_CREATE,
    PERMISSIONS.SITE_VISITS_UPDATE,

    PERMISSIONS.BOOKINGS_READ,
    PERMISSIONS.BOOKINGS_CREATE,

    PERMISSIONS.ORGANIZATION_READ,

    PERMISSIONS.MARKETING_READ,

    PERMISSIONS.WHATSAPP_READ,
    PERMISSIONS.WHATSAPP_SEND,
  ],

  // ==========================================================
  // VIEWER
  // ==========================================================

  viewer: [
    PERMISSIONS.LEADS_READ,
    PERMISSIONS.CONTACTS_READ,
    PERMISSIONS.PROPERTIES_READ,
    PERMISSIONS.SITE_VISITS_READ,
    PERMISSIONS.BOOKINGS_READ,
    PERMISSIONS.REPORTS_READ,
    PERMISSIONS.ORGANIZATION_READ,
    PERMISSIONS.MARKETING_READ,
    PERMISSIONS.WHATSAPP_READ,
  ],
}

// ============================================================
// DEFAULT ROLES
// ============================================================

export const DEFAULT_ROLES = [
  'admin',
  'manager',
  'agent',
  'viewer',
] as const
