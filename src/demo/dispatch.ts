// Serves the copied interface's API contract entirely inside the browser.
import type { Product, Session } from '../api'
import { audit, find, locationView, managers, permit, requireDemo, DemoError } from './domain'
import { inventoryRoutes } from './inventory'
import { reportRoutes } from './reports'
import { salesRoutes } from './sales'
import { purchaseRoutes, transferRoutes } from './supply'
import { locations, profiles, roles } from './roles'
import type { DemoData, Staff } from './seed'
import { getSession, loadData, saveData } from './store'

export function dispatchDemo(request: { path: string; token: string; method: string; body?: object; operationId?: string }) {
  const { path, token, method, body, operationId } = request
  const data = loadData()
  const account = profiles.find(item => item.role === token)
  const actor = account && getSession(account, data)
  requireDemo(actor, 'اختار حسابًا تجريبيًا صالحًا.', 401)

  const url = new URL(path, 'https://pharmacy.example')
  const route = url.pathname
  const handlers = [
    () => directoryRoutes(data, actor, route, method, body),
    () => salesRoutes(data, actor, route, method, body, operationId),
    () => inventoryRoutes(data, actor, url, method, body),
    () => transferRoutes(data, actor, route, method, body),
    () => purchaseRoutes(data, actor, route, method, body),
    () => reportRoutes(data, actor, url, method, body),
  ]
  for (const handle of handlers) {
    const response = handle()
    if (response === undefined) continue
    if (method !== 'GET' && route !== '/opening-stock/preview') saveData(data)
    return response
  }
  throw new DemoError(404, 'العملية غير متاحة في الديمو.')
}

function directoryRoutes(data: DemoData, actor: Session, route: string, method: string, body?: object) {
  if (route === '/locations' && method === 'GET') return locations
  if (route === '/products' && method === 'GET') return data.products.filter(item => !item.isDeleted)
  if (route.startsWith('/products')) {
    permit(actor, managers)
    return catalog(data, actor, route, method, body)
  }
  if (!route.startsWith('/users')) return undefined
  permit(actor, ['SuperAdmin'])
  if (route === '/users/roles' && method === 'GET') return roles
  if (route === '/users' && method === 'GET') return data.users.filter(item => !item.disabled)
  return staff(data, actor, route, method, body)
}

function catalog(data: DemoData, actor: Session, route: string, method: string, body?: object) {
  const existing = route === '/products' ? undefined : find(data.products, Number(route.split('/').at(-1)))
  if (method === 'DELETE' && existing) {
    existing.isDeleted = true
    audit(data, actor, { entity: 'Product', recordId: existing.id, action: 'Archived' })
    return { id: existing.id }
  }
  requireDemo(method === 'POST' || method === 'PUT', 'عملية الكتالوج غير متاحة.', 404)
  const details = body as Omit<Product, 'id' | 'isDeleted'>
  const codes = [details.barcode, details.packBarcode].filter(Boolean)
  requireDemo(details.name.trim() && details.sellPrice >= 0 && new Set(codes).size === codes.length &&
    !data.products.some(product => product.id !== existing?.id && codes.some(code =>
      code === product.barcode || code === product.packBarcode)), 'راجع الاسم والسعر وتكرار الباركود.')
  const product = existing ?? { ...details, id: data.nextId++ }
  if (existing) Object.assign(existing, details)
  else data.products.push(product)
  audit(data, actor, { entity: 'Product', recordId: product.id, action: existing ? 'Updated' : 'Created' })
  return { id: product.id }
}

function staff(data: DemoData, actor: Session, route: string, method: string, body?: object) {
  const existing = route === '/users' ? undefined : find(data.users, Number(route.split('/').at(-1)))
  if (method === 'DELETE' && existing) {
    requireDemo(actor.userId !== existing.id, 'الحساب الحالي لا يمكن تعطيله.')
    existing.disabled = true
    audit(data, actor, { entity: 'User', recordId: existing.id, action: 'Archived', locationId: existing.locationId })
    return { id: existing.id }
  }
  requireDemo(method === 'POST' || method === 'PUT', 'عملية الحساب غير متاحة.', 404)
  const { name, email, roleId, locationId } = body as Staff
  requireDemo(name.trim() && email.trim() && !data.users.some(item =>
    item.id !== existing?.id && item.email.toLowerCase() === email.toLowerCase()), 'راجع الاسم والبريد الإلكتروني.')
  find(roles, roleId)
  locationView(locationId)
  requireDemo(actor.userId !== existing?.id || (existing.roleId === roleId && existing.locationId === locationId),
    'الدور والموقع للحساب الحالي ثابتان أثناء الجلسة.')
  const user = existing ?? { id: data.nextId++, name, email, roleId, locationId }
  if (existing) Object.assign(existing, { name, email, roleId, locationId })
  else data.users.push(user)
  audit(data, actor, { entity: 'User', recordId: user.id, action: existing ? 'Updated' : 'Created', locationId })
  return { id: user.id }
}
