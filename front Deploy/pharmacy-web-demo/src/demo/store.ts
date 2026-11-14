// Persists demo records and the selected account on this browser.
import { createDemoData } from './seed'
import type { DemoData } from './seed'
import { profiles, roles } from './roles'
import type { Profile } from './roles'

const dataKey = 'pharmacy.demo.data.v1'
const accountKey = 'pharmacy.demo.account.v1'
let memory: DemoData | undefined
let selected: string | null = null

export function loadData() {
  try {
    const saved = localStorage.getItem(dataKey)
    if (saved) return JSON.parse(saved) as DemoData
  } catch {
    return structuredClone(memory ??= createDemoData())
  }
  return structuredClone(memory ??= createDemoData())
}

export function saveData(data: DemoData) {
  memory = structuredClone(data)
  try {
    localStorage.setItem(dataKey, JSON.stringify(data))
  } catch {
    // The current tab can still present the demo when browser storage is unavailable.
  }
}

export function currentProfile() {
  try {
    selected = sessionStorage.getItem(accountKey) ?? selected
  } catch {
    // Keep the account in memory when private browsing blocks storage.
  }
  return profiles.find(profile => profile.role === selected)
}

export function selectProfile(profile?: Profile) {
  selected = profile?.role ?? null
  try {
    if (profile) sessionStorage.setItem(accountKey, profile.role)
    else sessionStorage.removeItem(accountKey)
  } catch {
    // The selection remains available until this page closes.
  }
}

export function resetDemo() {
  saveData(createDemoData())
  selectProfile()
  for (const profile of profiles) {
    try {
      const actorPrefix = String(profile.userId) + '.'
      for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith('pharmacy.checkout.' + actorPrefix) || key.startsWith('pharmacy.demo.cart.' + actorPrefix)) {
          sessionStorage.removeItem(key)
        }
      }
    } catch {
      break
    }
  }
}

export function getSession(profile: Profile, data = loadData()) {
  const staff = data.users.find(item => item.id === profile.userId)
  if (!staff || staff.disabled) return undefined
  const role = roles.find(item => item.id === staff.roleId)?.name
  return role ? { userId: staff.id, email: staff.email, role, locationId: staff.locationId } : undefined
}
