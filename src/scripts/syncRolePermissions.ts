import { Role } from '../models/Role'
import { DEFAULT_ROLES, ROLE_PERMISSIONS } from '../constants/permissions'

/** Keep existing orgs' role permissions in sync with ROLE_PERMISSIONS (e.g. new marketing.*). */
export async function syncDefaultRolePermissions() {
  for (const roleName of DEFAULT_ROLES) {
    const permissions = ROLE_PERMISSIONS[roleName]
    if (!permissions) continue
    await Role.updateMany({ name: roleName }, { $set: { permissions } })
  }
}
