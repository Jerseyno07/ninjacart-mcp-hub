// Add/remove a person's access here. Email must be lowercase, exact match.
// `projects` scopes which project's tools they can call; role names mirror
// packtrack-pro's own role model so they carry the same meaning.
export const ROLES = {
  'aranyanandi@ninjacart.com': { role: 'ADMIN', projects: ['packtrack'] },
  'umeshjampani@ninjacart.com': { role: 'ADMIN', projects: ['packtrack'] },
  'sayanbhowmik@ninjacart.com': { role: 'ADMIN', projects: ['packtrack'] },
  'vishalb@ninjacart.com': { role: 'ADMIN', projects: ['packtrack'] },
  // 'someone@ninjacart.com': { role: 'PM_STORE_EXEC', projects: ['packtrack'] },
};

export function getRole(email) {
  return ROLES[email.toLowerCase()];
}
