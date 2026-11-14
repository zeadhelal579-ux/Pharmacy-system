// Connects workspaces to the ASP.NET API through the local proxy.
export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, token = '', body?: object, operationId?: string,
  method = body ? 'POST' : 'GET'): Promise<T> {
  const response = await fetch('/api' + path, {
    method,
    headers: {
      ...(token && { Authorization: 'Bearer ' + token }),
      ...(body && { 'Content-Type': 'application/json' }),
      ...(operationId && { 'Idempotency-Key': operationId }),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12000),
  })
  if (!response.ok) {
    const failure = await response.json().catch(() => null)
    throw new ApiError(response.status, failure?.message ?? failure?.title ?? 'تعذر تنفيذ الطلب (' + response.status + ')')
  }
  if (response.status === 204 || response.headers.get('content-length') === '0') return null as T
  return response.json() as Promise<T>
}
export type Product = { id: number; name: string; barcode?: string; sellPrice: number;
  buyPrice?: number; category?: string; unit?: string; minStock?: number; isDeleted?: boolean;
  packName?: string; packBarcode?: string; packSize?: number; packPrice?: number }
export type Batch = { id: number; quantity: number; reservedQuantity?: number; expiryDate: string; batchNumber?: string; isQuarantined?: boolean; product: Product }
export type Session = { userId: number; email: string; role: string; locationId: number }
export type Sale = { id: number; totalAmount: number; createdAt: string; discountAmount?: number; paymentMethod?: string; saleItems: {
  id: number; quantity: number; unitPrice: number; product: Product;
  lineNumber?: number | null; soldUnit?: string | null; unitsPerPack?: number | null; amount?: number | null
}[] }
export const money = new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' })
