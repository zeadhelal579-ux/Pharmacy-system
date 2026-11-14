// Connects the demo workspaces to the browser-side pharmacy simulator.
import { DemoError } from './demo/domain'
export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, token = '', body?: object, operationId?: string,
  method = body ? 'POST' : 'GET'): Promise<T> {
  const { dispatchDemo } = await import('./demo/dispatch')
  try {
    return dispatchDemo({ path, token, body, operationId, method }) as T
  } catch (error) {
    if (error instanceof DemoError) throw new ApiError(error.status, error.message)
    throw error
  }
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
