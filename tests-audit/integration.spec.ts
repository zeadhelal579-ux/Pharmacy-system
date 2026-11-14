// Exercises the React checkout and API invariants against disposable SQL Server data.
import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const origin = 'http://127.0.0.1:5173'
const email = process.env.Bootstrap__AdminEmail!
const password = process.env.Bootstrap__AdminPassword!

const browser = process.env.PharmacyAuditBrowser ?? 'msedge'
test.use({
  browserName: browser === 'firefox' || browser === 'webkit' ? browser : 'chromium',
  channel: browser === 'msedge' || browser === 'chrome' ? browser : undefined,
  viewport: { width: Number(process.env.PharmacyAuditWidth ?? 1280), height: 900 },
})

test('manager screens stay within the viewport', async ({ page }) => {
  await page.goto(origin)
  await page.getByLabel('البريد الإلكتروني').fill(email)
  await page.getByLabel('كلمة المرور').fill(password)
  await page.getByRole('button', { name: 'دخول', exact: true }).click()
  const navigation = page.getByRole('navigation', { name: 'مساحات العمل' })
  await expect(navigation.getByRole('link', { name: 'سجل التدقيق' })).toBeVisible()
  const routes = await navigation.getByRole('link').all()
  const paths = await Promise.all(routes.map(link => link.getAttribute('href')))
  for (const path of paths) {
    await navigation.locator('a[href="' + path + '"]').click()
    await expect(page).toHaveURL(origin + path)
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible()
    const dimensions = await page.evaluate(() => ({
      rendered: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth,
    }))
    expect(dimensions.rendered, String(path)).toBeLessThanOrEqual(dimensions.viewport)
    const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect.soft(accessibility.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })), String(path)).toEqual([])
  }
})

test('dashboard handles a bounded burst of authenticated reads', async ({ request }, info) => {
  const login = await request.post(origin + '/api/auth/login', { data: { email, password } })
  expect(login.ok()).toBeTruthy()
  const headers = { Authorization: 'Bearer ' + (await login.json()).token }
  const timings: number[] = []
  for (let wave = 0; wave < 3; wave++) {
    await Promise.all(Array.from({ length: 10 }, async () => {
      const start = performance.now()
      const response = await request.get(origin + '/api/dashboard', { headers })
      timings.push(performance.now() - start)
      expect(response.status()).toBe(200)
    }))
  }
  timings.sort((left, right) => left - right)
  await info.attach('local-load', {
    body: JSON.stringify({ requests: timings.length, concurrent: 10, p95Ms: Math.round(timings[28]), maxMs: Math.round(timings[29]) }),
    contentType: 'application/json',
  })
})

test('English language and left to right direction persist after reload', async ({ page }) => {
  await page.goto(origin)
  await page.getByRole('button', { name: 'English' }).click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await page.getByRole('link', { name: 'Point of sale' }).click()
  await expect(page.getByLabel('Search by name or scan a barcode')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open shift' })).toBeVisible()
  await page.getByRole('button', { name: 'العربية' }).click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByRole('heading', { name: 'نقطة البيع' })).toBeVisible()
})

test('discount above limit requires a separate approver and is consumed once', async ({ request, page }) => {
  const root = origin + '/api'
  const actor = async (account: string) => {
    const login = await request.post(root + '/auth/login', { data: { email: account, password } })
    expect(login.ok()).toBeTruthy()
    return { Authorization: 'Bearer ' + (await login.json()).token }
  }
  const admin = await actor(email)
  const post = (path: string, headers: Record<string, string>, data: object) => request.post(root + path, { headers, data })
  const location = (await (await request.get(root + '/auth/session', { headers: admin })).json()).locationId
  const cashierEmail = 'discount-cashier@example.test'
  expect((await post('/users', admin, { name: 'Discount cashier', email: cashierEmail, passwordHash: password, roleId: 3, locationId: location })).status()).toBe(201)
  const product = await post('/products', admin, { name: 'Discount fixture', sellPrice: 50 })
  expect(product.status()).toBe(201)
  const { id: productId } = await product.json()
  expect((await post('/inventory/batch', admin, { productId, locationId: location, quantity: 10, expiryDate: '2030-01-01' })).ok()).toBeTruthy()
  const cashier = await actor(cashierEmail)
  const shift = await post('/shifts', cashier, { openingCash: 0 })
  expect(shift.ok()).toBeTruthy()
  const { id: shiftId } = await shift.json()
  const items = [{ productId, quantity: 1 }]
  const reason = 'Approved price adjustment'
  const sale = { items, shiftId, paymentMethod: 'Cash', discountAmount: 10, discountReason: reason }
  expect((await post('/sales', cashier, sale)).status()).toBe(409)
  const pending = await post('/discounts', cashier, { shiftId, items, amount: 10, reason })
  expect(pending.status()).toBe(201)
  const { id } = await pending.json()
  expect((await post('/discounts/' + id + '/decision', cashier, { approved: true })).status()).toBe(403)
  await page.goto(origin)
  await page.getByLabel('البريد الإلكتروني').fill(email)
  await page.getByLabel('كلمة المرور').fill(password)
  await page.getByRole('button', { name: 'دخول', exact: true }).click()
  await page.getByRole('link', { name: 'اعتماد الخصومات' }).click()
  await page.getByRole('button', { name: 'اعتماد الخصم', exact: true }).click()
  await expect(page.getByText('معتمد', { exact: true })).toBeVisible()
  expect((await post('/sales', cashier, { ...sale, items: [{ productId, quantity: 2 }], discountApprovalId: id })).status()).toBe(409)
  const paid = await post('/sales', cashier, { ...sale, discountApprovalId: id })
  expect(paid.ok()).toBeTruthy()
  expect(await paid.json()).toMatchObject({ totalAmount: 40 })
  expect((await post('/sales', cashier, { ...sale, discountApprovalId: id })).status()).toBe(409)
})

test('branch reorder rule changes transfer to purchase without changing another location', async ({ page, request }) => {
  const login = await request.post(origin + '/api/auth/login', { data: { email, password } })
  expect(login.ok()).toBeTruthy()
  const headers = { Authorization: 'Bearer ' + (await login.json()).token }
  const base = origin + '/api'
  const location = (await (await request.get(base + '/auth/session', { headers })).json()).locationId
  const locations = await (await request.get(base + '/locations', { headers })).json()
  const supplier = locations.find((item: { id: number }) => item.id !== location).id
  const post = (path: string, data: object) => request.post(base + path, { headers, data })
  const product = await post('/products', { name: 'صنف إعادة الطلب', sellPrice: 10, minStock: 1 })
  expect(product.status()).toBe(201)
  const { id } = await product.json()
  expect((await post('/inventory/batch', { productId: id, locationId: supplier, quantity: 20, expiryDate: '2030-01-01' })).ok()).toBeTruthy()
  const read = async () => (await (await request.get(base + '/reports/replenishment/' + location, { headers })).json())
    .find((item: { productId: number }) => item.productId === id)
  expect(await read()).toMatchObject({ minimum: 1, suggestedQuantity: 2, suggestion: 'Transfer' })
  await page.goto(origin)
  await page.getByLabel('البريد الإلكتروني').fill(email)
  await page.getByLabel('كلمة المرور').fill(password)
  await page.getByRole('button', { name: 'دخول', exact: true }).click()
  await page.getByRole('link', { name: 'إعادة الطلب', exact: true }).click()
  await page.getByRole('button', { name: 'تعديل حد صنف إعادة الطلب' }).click()
  await page.getByLabel('حد إعادة الطلب للصنف صنف إعادة الطلب').fill('30')
  await page.getByRole('button', { name: 'حفظ الحد' }).click()
  await expect(page.getByText('اقتراح شراء 31', { exact: true })).toBeVisible()
  expect(await read()).toMatchObject({ minimum: 30, suggestedQuantity: 31, suggestion: 'Purchase' })
  const source = await (await request.get(base + '/reports/replenishment/' + supplier, { headers })).json()
  expect(source.find((item: { productId: number }) => item.productId === id)).toMatchObject({ minimum: 1, available: 20 })
})

test('POS sells packs and base units from the same stock and preserves invoice pricing', async ({ page, request }) => {
  const login = await request.post(origin + '/api/auth/login', { data: { email, password } })
  expect(login.ok()).toBeTruthy()
  const headers = { Authorization: 'Bearer ' + (await login.json()).token }
  const base = origin + '/api'
  const location = await (await request.get(base + '/auth/session', { headers })).json()
  const product = await request.post(base + '/products', { headers, data: {
    name: 'صنف العبوة', barcode: 'UNIT-BASE', unit: 'شريط', sellPrice: 10,
    packName: 'علبة', packBarcode: 'UNIT-PACK', packSize: 3, packPrice: 25,
  } })
  expect(product.status()).toBe(201)
  const { id } = await product.json()
  for (const [quantity, expiryDate] of [[2, '2030-01-01'], [5, '2030-02-01']]) {
    expect((await request.post(base + '/inventory/batch', {
      headers, data: { productId: id, locationId: location.locationId, quantity, expiryDate },
    })).ok()).toBeTruthy()
  }
  await page.goto(origin)
  await page.getByLabel('البريد الإلكتروني').fill(email)
  await page.getByLabel('كلمة المرور').fill(password)
  await page.getByRole('button', { name: 'دخول', exact: true }).click()
  await page.getByRole('link', { name: 'نقطة البيع', exact: true }).click()
  await page.getByLabel('رصيد الافتتاح').fill('0')
  await page.getByRole('button', { name: 'فتح الشيفت' }).click()
  const scan = page.getByLabel('ابحث بالاسم أو امسح الباركود')
  for (const barcode of ['UNIT-PACK', 'UNIT-BASE']) {
    await scan.fill(barcode)
    await expect(page.getByRole('button', { name: /صنف العبوة/ })).toBeVisible()
    await scan.press('Enter')
  }
  await page.getByRole('button', { name: 'تسجيل البيع' }).click()
  await expect(page.getByRole('cell', { name: 'علبة', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'شريط', exact: true })).toBeVisible()
  const saleId = new URL(page.url()).pathname.split('/').at(-1)
  const invoice = await (await request.get(base + '/sales/' + saleId, { headers })).json()
  expect(invoice.totalAmount).toBe(35)
  const pack = invoice.saleItems.filter((item: { unitsPerPack: number }) => item.unitsPerPack === 3)
  expect(pack.map((item: { quantity: number }) => item.quantity).sort()).toEqual([1, 2])
  expect(pack.reduce((sum: number, item: { amount: number }) => sum + item.amount, 0)).toBe(25)
  const stock = await (await request.get(base + '/inventory/stock/' + id + '/' + location.locationId, { headers })).json()
  expect(stock.stock).toBe(3)
  const shift = await (await request.get(base + '/shifts/current', { headers })).json()
  expect((await request.post(base + '/shifts/' + shift.id + '/close', { headers, data: { actualCash: 35 } })).ok()).toBeTruthy()
})

test('card refund is reported separately and leaves expected cash unchanged', async ({ request }) => {
  const login = await request.post(origin + '/api/auth/login', { data: { email, password } })
  expect(login.ok()).toBeTruthy()
  const headers = { Authorization: 'Bearer ' + (await login.json()).token }
  const root = origin + '/api'
  const post = (path: string, data: object) => request.post(root + path, { headers, data })
  const session = await (await request.get(root + '/auth/session', { headers })).json()
  const product = await post('/products', { name: 'Card refund fixture', sellPrice: 21 })
  expect(product.status()).toBe(201)
  const { id: productId } = await product.json()
  expect((await post('/inventory/batch', { productId, locationId: session.locationId,
    quantity: 2, expiryDate: '2030-01-01' })).ok()).toBeTruthy()
  const shift = await post('/shifts', { openingCash: 40 })
  expect(shift.ok()).toBeTruthy()
  const { id: shiftId } = await shift.json()
  const sale = await post('/sales', { shiftId, paymentMethod: 'Card', items: [{ productId, quantity: 1 }] })
  expect(sale.ok()).toBeTruthy()
  const { saleId } = await sale.json()
  const invoice = await (await request.get(root + '/sales/' + saleId, { headers })).json()
  const payload = { shiftId, operationId: crypto.randomUUID(), saleItemId: invoice.saleItems[0].id,
    quantity: 1, reason: 'Confirmed on payment terminal' }
  const path = '/sales/' + saleId + '/returns'
  const returned = await post(path, payload)
  expect(returned.ok()).toBeTruthy()
  expect(await returned.json()).toMatchObject({ kind: 'CardRefund', amount: -21 })
  expect((await post(path, payload)).ok()).toBeTruthy()
  expect((await post(path, { ...payload, operationId: crypto.randomUUID() })).status()).toBe(409)
  const closed = await post('/shifts/' + shiftId + '/close', { actualCash: 40 })
  expect(closed.ok()).toBeTruthy()
  expect(await closed.json()).toMatchObject({ expectedCash: 40, actualCash: 40 })
  const day = invoice.createdAt.slice(0, 10)
  const report = await request.get(root + '/reports/reconciliation?from=' + day + '&through=' + day, { headers })
  expect(report.ok()).toBeTruthy()
  expect((await report.json()).cash).toContainEqual(expect.objectContaining({ kind: 'CardRefund', amount: -21 }))
})

test('batch quarantine blocks sales and release is audited', async ({ page, request }) => {
  const login = await request.post(origin + '/api/auth/login', { data: { email, password } })
  expect(login.ok()).toBeTruthy()
  const headers = { Authorization: 'Bearer ' + (await login.json()).token }
  const session = await (await request.get(origin + '/api/auth/session', { headers })).json()
  const product = await request.post(origin + '/api/products', { headers, data: { name: 'Quarantine fixture', sellPrice: 20 } })
  expect(product.status()).toBe(201)
  const { id: productId } = await product.json()
  const batch = await request.post(origin + '/api/inventory/batch', {
    headers, data: { productId, locationId: session.locationId, quantity: 3, expiryDate: '2030-01-01', batchNumber: 'AUDIT-HOLD' },
  })
  expect(batch.ok()).toBeTruthy()
  const { id } = await batch.json()
  const stock = async () => (await (await request.get(origin + '/api/inventory/stock/' + productId + '/' + session.locationId, { headers })).json()).stock
  await page.goto(origin)
  await page.getByLabel('البريد الإلكتروني').fill(email)
  await page.getByLabel('كلمة المرور').fill(password)
  await page.getByRole('button', { name: 'دخول', exact: true }).click()
  await page.getByRole('link', { name: 'المخزون', exact: true }).click()
  await page.getByRole('button', { name: 'حالة الدفعة AUDIT-HOLD' }).click()
  await page.getByLabel('سبب تغيير الحالة').fill('Awaiting inspection')
  await page.getByRole('button', { name: 'عزل الدفعة', exact: true }).click()
  const heldRow = page.getByRole('row').filter({ hasText: 'AUDIT-HOLD' })
  await expect(heldRow.getByRole('cell', { name: 'معزولة', exact: true })).toBeVisible()
  expect(await stock()).toBe(0)
  expect((await request.post(origin + '/api/sales', { headers, data: { items: [{ productId, quantity: 1 }] } })).status()).toBe(409)
  await page.getByRole('button', { name: 'حالة الدفعة AUDIT-HOLD' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Awaiting inspection' })).toBeVisible()
  await page.getByLabel('سبب تغيير الحالة').fill('Inspection completed')
  await page.getByRole('button', { name: 'فك عزل الدفعة', exact: true }).click()
  await expect(heldRow.getByRole('cell', { name: 'في المخزون', exact: true })).toBeVisible()
  expect(await stock()).toBe(3)
  const history = await (await request.get(origin + '/api/inventory/batches/' + id + '/status', { headers })).json()
  expect(history.map((change: { quarantined: boolean }) => change.quarantined)).toEqual([false, true])
  await page.getByRole('link', { name: 'سجل التدقيق', exact: true }).click()
  await expect(page.getByRole('row').filter({ hasText: 'Inspection completed' })).toContainText('حالة دفعة')
  const audit = await request.get(origin + '/api/reports/audit?locationId=' + session.locationId, { headers })
  expect(audit.ok()).toBeTruthy()
  expect(await audit.json()).toContainEqual(expect.objectContaining({
    entity: 'BatchStatusChange', reason: 'Awaiting inspection', locationId: session.locationId, userId: session.userId,
  }))
  const post = (path: string, data: object) => request.post(origin + '/api' + path, { headers, data })
  const sold = await post('/sales', { items: [{ productId, quantity: 1 }] })
  expect(sold.ok()).toBeTruthy()
  const { saleId } = await sold.json()
  const recall = await post('/inventory/lots/recalls', { productId, lot: 'AUDIT-HOLD', reason: 'Fixture recall' })
  expect(recall.ok()).toBeTruthy()
  const { id: recallId } = await recall.json()
  const added = await post('/inventory/batch', {
    productId, locationId: session.locationId, quantity: 5, expiryDate: '2030-01-01', batchNumber: 'AUDIT-HOLD',
  })
  expect(added.ok()).toBeTruthy()
  const { id: newBatchId } = await added.json()
  expect(await stock()).toBe(0)
  expect((await post('/sales', { items: [{ productId, quantity: 1 }] })).status()).toBe(409)
  expect((await post('/inventory/batches/' + newBatchId + '/status', { isQuarantined: false, reason: 'Review' })).status()).toBe(409)
  const trace = await (await request.get(origin + '/api/inventory/lots/trace?productId=' + productId + '&lot=AUDIT-HOLD', { headers })).json()
  expect(trace.sales).toContainEqual(expect.objectContaining({ saleId }))
  expect(trace.recall.id).toBe(recallId)
  expect((await post('/inventory/lots/recalls/' + recallId + '/close', { reason: 'Review finished' })).ok()).toBeTruthy()
  expect(await stock()).toBe(0)
  const expired = await request.post(origin + '/api/opening-stock/apply', { headers, data: {
    locationId: session.locationId,
    rows: [{ name: 'Expired fixture', barcode: 'AUDIT-EXPIRED', batchNumber: 'EXPIRED-1',
      expiryDate: '2020-01-01', quantity: 1, sellPrice: 12 }],
  } })
  expect(expired.ok()).toBeTruthy()
  const batches = await (await request.get(origin + '/api/inventory/location/' + session.locationId, { headers })).json()
  const expiredBatch = batches.find((item: { batchNumber: string }) => item.batchNumber === 'EXPIRED-1')
  expect(expiredBatch.isQuarantined).toBeTruthy()
  expect((await request.post(origin + '/api/inventory/batches/' + expiredBatch.id + '/status', {
    headers, data: { isQuarantined: false, reason: 'Attempt to release expired fixture' },
  })).status()).toBe(409)
})

test('opening stock previews exceptions and imports a file only once', async ({ page, request }) => {
  const login = await request.post(origin + '/api/auth/login', { data: { email, password } })
  expect(login.ok()).toBeTruthy()
  const headers = { Authorization: 'Bearer ' + (await login.json()).token }
  const session = await (await request.get(origin + '/api/auth/session', { headers })).json()
  const header = 'name\tbarcode\tbatchNumber\texpiryDate\tquantity\tsellPrice\n'
  const row = 'صنف افتتاحي\t000IMPORT\tSTART-01\t2030-03-01\t6\t25'
  await page.goto(origin)
  await page.getByLabel('البريد الإلكتروني').fill(email)
  await page.getByLabel('كلمة المرور').fill(password)
  await page.getByRole('button', { name: 'دخول', exact: true }).click()
  await page.getByRole('link', { name: 'استيراد الأرصدة' }).click()
  const upload = (contents: string) => page.getByLabel('ملف الأرصدة').setInputFiles({
    name: 'opening.tsv', mimeType: 'text/tab-separated-values', buffer: Buffer.from(contents, 'utf8'),
  })
  const preview = page.getByRole('button', { name: 'معاينة الاستيراد' })
  const apply = page.getByRole('button', { name: 'اعتماد الاستيراد' })
  await upload(header + row + '\n' + row + '\nصنف تاني\tX\tLOT\t\t1\t25')
  await preview.click()
  await expect(page.getByRole('list', { name: 'استثناءات الاستيراد' }).getByRole('listitem')).toHaveCount(2)
  await expect(apply).toBeDisabled()
  await upload(header + row)
  await preview.click()
  await expect(apply).toBeEnabled()
  expect((await request.get(origin + '/api/products/barcode/000IMPORT', { headers })).status()).toBe(404)
  await apply.click()
  await expect(page.getByText('تم اعتماد الاستيراد')).toBeVisible()
  const product = await (await request.get(origin + '/api/products/barcode/000IMPORT', { headers })).json()
  await upload(header + row)
  await preview.click()
  await expect(page.getByText('الملف مسجل بالفعل')).toBeVisible()
  const stock = await (await request.get(origin + '/api/inventory/stock/' + product.id + '/' + session.locationId, { headers })).json()
  expect(stock.stock).toBe(6)
})

test('admin manages a staff account and moving the account revokes its old branch session', async ({ page, request }) => {
  const staffEmail = 'ui-staff@example.test'
  const signIn = (account: string) => request.post(origin + '/api/auth/login', { data: { email: account, password } })
  await page.goto(origin)
  await page.getByLabel('البريد الإلكتروني').fill(email)
  await page.getByLabel('كلمة المرور').fill(password)
  await page.getByRole('button', { name: 'دخول', exact: true }).click()
  await page.getByRole('link', { name: 'المستخدمون' }).click()
  await page.getByRole('button', { name: 'إضافة مستخدم' }).click()
  await page.getByLabel('اسم المستخدم').fill('موظف اختبار الإدارة')
  await page.getByLabel('بريد المستخدم').fill(staffEmail)
  await page.getByLabel('كلمة المرور المؤقتة').fill(password)
  await page.getByRole('combobox', { name: 'الدور', exact: true }).selectOption({ label: 'كاشير' })
  const location = page.getByRole('combobox', { name: 'فرع المستخدم' })
  await location.selectOption({ label: 'فرع العرض' })
  const oldLocation = await location.inputValue()
  await page.getByRole('button', { name: 'حفظ الحساب' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'تم إنشاء الحساب' })).toBeVisible()
  const oldLogin = await signIn(staffEmail)
  expect(oldLogin.ok()).toBeTruthy()
  const oldHeaders = { Authorization: 'Bearer ' + (await oldLogin.json()).token }
  const branchStock = '/api/inventory/location/'
  expect((await request.get(origin + branchStock + oldLocation, { headers: oldHeaders })).status()).toBe(200)
  await page.getByRole('button', { name: 'تعديل موظف اختبار الإدارة' }).click()
  await location.selectOption({ label: 'المخزن الرئيسي' })
  const newLocation = await location.inputValue()
  await page.getByRole('button', { name: 'حفظ الحساب' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'تم تعديل الحساب' })).toBeVisible()
  expect((await request.get(origin + branchStock + oldLocation, { headers: oldHeaders })).status()).toBe(401)
  const newLogin = await signIn(staffEmail)
  expect(newLogin.ok()).toBeTruthy()
  const newHeaders = { Authorization: 'Bearer ' + (await newLogin.json()).token }
  expect((await request.get(origin + branchStock + newLocation, { headers: newHeaders })).status()).toBe(200)
  expect((await request.get(origin + branchStock + oldLocation, { headers: newHeaders })).status()).toBe(403)
  await page.getByRole('button', { name: 'تعطيل موظف اختبار الإدارة' }).click()
  await page.getByRole('button', { name: 'تأكيد التعطيل' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'تم تعطيل الحساب' })).toBeVisible()
  expect((await signIn(staffEmail)).status()).toBe(401)
})

test('admin searches, creates, edits and archives a product in React', async ({ page }) => {
  await page.goto(origin)
  await page.getByLabel('البريد الإلكتروني').fill(email)
  await page.getByLabel('كلمة المرور').fill(password)
  await page.getByRole('button', { name: 'دخول', exact: true }).click()
  await page.getByRole('link', { name: 'الأصناف', exact: true }).click()
  await page.getByRole('button', { name: 'إضافة صنف' }).click()
  await page.getByLabel('اسم الصنف').fill('صنف إدارة الكتالوج')
  await page.getByLabel('الباركود').fill('AUDIT-CATALOG')
  await page.getByLabel('سعر البيع').fill('25')
  await page.getByRole('button', { name: 'حفظ الصنف' }).click()
  await page.getByLabel('بحث الأصناف').fill('AUDIT-CATALOG')
  await page.getByRole('button', { name: 'تعديل صنف إدارة الكتالوج' }).click()
  await page.getByLabel('اسم الصنف').fill('صنف محدث')
  await page.getByRole('button', { name: 'حفظ الصنف' }).click()
  await page.getByRole('button', { name: 'أرشفة صنف محدث' }).click()
  await page.getByRole('button', { name: 'تأكيد الأرشفة' }).click()
  await expect(page.getByText('لا توجد أصناف مطابقة.')).toBeVisible()
})

test('browser checkout uses FEFO, persists receipt, and updates available stock', async ({ page, request }) => {
  const login = await request.post(origin + '/api/auth/login', { data: { email, password } })
  expect(login.ok()).toBeTruthy()
  const headers = { Authorization: 'Bearer ' + (await login.json()).token }
  const session = await (await request.get(origin + '/api/auth/session', { headers })).json()
  const today = new Date()
  const reportDay = [today.getFullYear(), today.getMonth() + 1, today.getDate()]
    .map(part => String(part).padStart(2, '0')).join('-')
  const query = new URLSearchParams({ from: reportDay, through: reportDay, locationId: String(session.locationId) })
  const reportUrl = origin + '/api/reports/reconciliation?' + query
  const saleQuantity = (report: { stock: { kind: string; quantity: number }[] }) =>
    report.stock.find(item => item.kind === 'Sale')?.quantity ?? 0
  const before = await request.get(reportUrl, { headers })
  expect(before.ok()).toBeTruthy()
  const priorReport = await before.json()
  const saleCash = (report: { sales: { paymentMethod: string; amount: number }[] }) =>
    report.sales.find(item => item.paymentMethod === 'Cash')?.amount ?? 0
  const priorQuantity = saleQuantity(priorReport)
  const product = await request.post(origin + '/api/products', {
    headers, data: { name: 'صنف اختبار الدفعات', barcode: 'AUDIT-FEFO', sellPrice: 12, buyPrice: 8 },
  })
  expect(product.status()).toBe(201)
  const { id } = await product.json()
  for (const [number, quantity, expiryDate] of [['FEFO-A', 3, '2030-01-01'], ['FEFO-B', 8, '2030-02-01']]) {
    const result = await request.post(origin + '/api/inventory/batch', {
      headers, data: { productId: id, locationId: session.locationId, batchNumber: number, quantity, expiryDate },
    })
    expect(result.ok()).toBeTruthy()
  }

  await page.goto(origin)
  await page.getByLabel('البريد الإلكتروني').fill(email)
  await page.getByLabel('كلمة المرور').fill(password)
  await page.getByRole('button', { name: 'دخول', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'لوحة التشغيل' })).toBeVisible()
  await page.getByRole('link', { name: 'نقطة البيع' }).click()
  await page.getByLabel('رصيد الافتتاح').fill('100')
  await page.getByRole('button', { name: 'فتح الشيفت' }).click()
  await expect(page.getByRole('heading', { name: /شيفت مفتوح/ })).toBeVisible()
  const barcode = page.getByLabel('ابحث بالاسم أو امسح الباركود')
  await barcode.fill('AUDIT-FEFO')
  await expect(page.getByRole('button', { name: /صنف اختبار الدفعات/ })).toBeEnabled()
  await barcode.press('Enter')
  await page.getByRole('spinbutton', { name: 'صنف اختبار الدفعات' }).fill('7')
  let committedSaleId: number | undefined
  await page.route('**/api/sales', async route => {
    const response = await route.fetch()
    if (response.ok()) committedSaleId = (await response.json()).saleId
    await route.abort()
  }, { times: 1 })
  await page.getByRole('button', { name: 'تسجيل البيع' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  expect(committedSaleId).toBeDefined()
  await page.reload()
  await page.getByLabel('البريد الإلكتروني').fill(email)
  await page.getByLabel('كلمة المرور').fill(password)
  await page.getByRole('button', { name: 'دخول', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'عملية بيع معلّقة' })).toBeVisible()
  await page.getByRole('button', { name: 'استرجاع عملية البيع' }).click()
  await expect(page).toHaveURL(new RegExp('/receipts/' + committedSaleId + '$'))
  await expect(page.getByRole('button', { name: 'طباعة الإيصال' })).toBeVisible()
  const receipt = await (await request.get(origin + '/api/sales/' + new URL(page.url()).pathname.split('/').at(-1), { headers })).json()
  expect(receipt.totalAmount).toBe(84)
  expect(receipt.saleItems.map((item: { quantity: number }) => item.quantity).sort()).toEqual([3, 4])
  const stock = await (await request.get(origin + '/api/inventory/stock/' + id + '/' + session.locationId, { headers })).json()
  expect(stock.stock).toBe(4)
  await page.getByRole('link', { name: 'الفواتير' }).click()
  await page.getByRole('link', { name: String(receipt.id), exact: true }).click()
  await expect(page.getByRole('heading', { name: 'فاتورة ' + receipt.id })).toBeVisible()
  await page.getByLabel('كمية المرتجع').fill('1')
  await page.getByLabel('سبب المرتجع').fill('اختبار مرتجع نقدي')
  await page.getByRole('button', { name: 'تسجيل المرتجع النقدي' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'تم تسجيل رد نقدي' })).toBeVisible()
  const remaining = await (await request.get(origin + '/api/inventory/stock/' + id + '/' + session.locationId, { headers })).json()
  expect(remaining.stock).toBe(4)
  const batches = await (await request.get(origin + '/api/inventory/location/' + session.locationId, { headers })).json()
  expect(batches).toContainEqual(expect.objectContaining({ productId: id, isQuarantined: true, quantity: 1 }))
  await page.getByRole('link', { name: 'نقطة البيع' }).click()
  await page.getByLabel('المبلغ', { exact: true }).fill('20')
  await page.getByLabel('سبب حركة الخزنة').fill('عهدة إضافية')
  await page.getByRole('button', { name: 'تسجيل حركة الخزنة' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'تم تسجيل حركة الخزنة' })).toBeVisible()
  await page.getByLabel('نوع الحركة').selectOption('Withdrawal')
  await page.getByLabel('المبلغ', { exact: true }).fill('5')
  await page.getByLabel('سبب حركة الخزنة').fill('سحب نقدية')
  await page.getByRole('button', { name: 'تسجيل حركة الخزنة' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'تم تسجيل حركة الخزنة' })).toBeVisible()
  await page.getByLabel('النقد الفعلي').fill('187')
  await page.getByRole('button', { name: 'إقفال الشيفت' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'المتوقع' })).toBeVisible()
  const day = receipt.createdAt.slice(0, 10)
  expect(day).toBe(reportDay)
  const reconciliation = await request.get(reportUrl, { headers })
  expect(reconciliation.ok()).toBeTruthy()
  const totals = await reconciliation.json()
  expect(saleCash(totals) - saleCash(priorReport)).toBe(84)
  for (const [kind, amount] of [['CashRefund', -12], ['Deposit', 20], ['Withdrawal', -5]]) {
    expect(totals.cash).toContainEqual(expect.objectContaining({ kind, amount }))
  }
  expect(totals.shifts).toContainEqual(expect.objectContaining({ actualCash: 187, expectedCash: 187, difference: 0 }))
  expect(saleQuantity(totals) - priorQuantity).toBe(7)
  await page.getByRole('link', { name: 'المطابقة', exact: true }).click()
  await page.getByLabel('من تاريخ').fill(day)
  await page.getByLabel('إلى تاريخ').fill(day)
  await page.getByRole('button', { name: 'عرض المطابقة' }).click()
  await expect(page.getByRole('heading', { name: 'مبيعات بطاقات' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'طباعة المطابقة' })).toBeEnabled()
})

test('anonymous API requests are denied and Arabic login has no axe violations', async ({ page, request }) => {
  expect((await request.get(origin + '/health/ready')).status()).toBe(200)
  expect((await request.get(origin + '/api/users')).status()).toBe(401)
  expect((await request.post(origin + '/api/users', { data: {} })).status()).toBe(401)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(origin)
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible()
  expect(await page.locator('html').getAttribute('dir')).toBe('rtl')
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(result.violations).toEqual([])
})

test('concurrent checkout of the last unit commits one sale at the catalog price', async ({ request }) => {
  const login = await request.post(origin + '/api/auth/login', { data: { email, password } })
  expect(login.ok()).toBeTruthy()
  const headers = { Authorization: 'Bearer ' + (await login.json()).token }
  const session = await (await request.get(origin + '/api/auth/session', { headers })).json()
  const product = await request.post(origin + '/api/products', {
    headers, data: { name: 'Last unit fixture', barcode: 'AUDIT-LAST', sellPrice: 20, buyPrice: 10 },
  })
  expect(product.status()).toBe(201)
  const { id } = await product.json()
  const added = await request.post(origin + '/api/inventory/batch', {
    headers, data: { productId: id, locationId: session.locationId, quantity: 1, expiryDate: '2030-01-01' },
  })
  expect(added.ok()).toBeTruthy()
  const submit = () => request.post(origin + '/api/sales', {
    headers, data: { items: [{ productId: id, quantity: 1 }] },
  })
  const responses = await Promise.all([submit(), submit()])
  expect(responses.map(response => response.status()).sort()).toEqual([200, 409])
  const committed = responses.find(response => response.ok())!
  expect((await committed.json()).totalAmount).toBe(20)
  const stock = await (await request.get(origin + '/api/inventory/stock/' + id + '/' + session.locationId, { headers })).json()
  expect(stock.stock).toBe(0)
})

test('cashier can read their stock and cannot read another location or manage users', async ({ request }) => {
  const login = await request.post(origin + '/api/auth/login', { data: { email, password } })
  expect(login.ok()).toBeTruthy()
  const admin = { Authorization: 'Bearer ' + (await login.json()).token }
  const session = await (await request.get(origin + '/api/auth/session', { headers: admin })).json()
  const locations = await (await request.get(origin + '/api/locations', { headers: admin })).json()
  const other = locations.find((location: { id: number }) => location.id !== session.locationId)
  const cashier = { email: 'audit-cashier@example.test', password }
  const created = await request.post(origin + '/api/users', {
    headers: admin, data: { name: 'Cashier fixture', email: cashier.email, passwordHash: cashier.password, roleId: 3, locationId: session.locationId },
  })
  expect(created.status()).toBe(201)
  expect(await created.json()).not.toHaveProperty('passwordHash')
  const cashierLogin = await request.post(origin + '/api/auth/login', { data: cashier })
  expect(cashierLogin.ok()).toBeTruthy()
  const headers = { Authorization: 'Bearer ' + (await cashierLogin.json()).token }
  expect((await request.get(origin + '/api/inventory/location/' + session.locationId, { headers })).status()).toBe(200)
  expect((await request.get(origin + '/api/inventory/location/' + other.id, { headers })).status()).toBe(403)
  expect((await request.get(origin + '/api/users', { headers })).status()).toBe(403)
})

test('retrying a recorded sale returns the original invoice without another stock deduction', async ({ request }) => {
  const login = await request.post(origin + '/api/auth/login', { data: { email, password } })
  expect(login.ok()).toBeTruthy()
  const headers = { Authorization: 'Bearer ' + (await login.json()).token }
  const session = await (await request.get(origin + '/api/auth/session', { headers })).json()
  const product = await request.post(origin + '/api/products', {
    headers, data: { name: 'Retry fixture', barcode: 'AUDIT-RETRY', sellPrice: 20, buyPrice: 10 },
  })
  expect(product.status()).toBe(201)
  const { id } = await product.json()
  const added = await request.post(origin + '/api/inventory/batch', {
    headers, data: { productId: id, locationId: session.locationId, quantity: 2, expiryDate: '2030-01-01' },
  })
  expect(added.ok()).toBeTruthy()
  const retryHeaders = { ...headers, 'Idempotency-Key': '9488e27d-bad1-4e85-894c-2248582b1e59' }
  const submit = (quantity: number) => request.post(origin + '/api/sales', {
    headers: retryHeaders, data: { items: [{ productId: id, quantity }] },
  })
  const first = await submit(1)
  const replay = await submit(1)
  expect(first.ok()).toBeTruthy()
  expect(replay.ok()).toBeTruthy()
  expect((await first.json()).saleId).toBe((await replay.json()).saleId)
  expect((await submit(2)).status()).toBe(409)
  const stock = await (await request.get(origin + '/api/inventory/stock/' + id + '/' + session.locationId, { headers })).json()
  expect(stock.stock).toBe(1)
})

test('shortage refresh resolves the branch alert after usable stock arrives', async ({ request }) => {
  const login = await request.post(origin + '/api/auth/login', { data: { email, password } })
  expect(login.ok()).toBeTruthy()
  const headers = { Authorization: 'Bearer ' + (await login.json()).token }
  const session = await (await request.get(origin + '/api/auth/session', { headers })).json()
  const product = await request.post(origin + '/api/products', {
    headers, data: { name: 'Shortage fixture', barcode: 'AUDIT-SHORT', sellPrice: 20, minStock: 3 },
  })
  expect(product.status()).toBe(201)
  const { id } = await product.json()
  const refresh = () => request.post(origin + '/api/reports/check-shortages', { headers })
  const read = async () => (await request.get(origin + '/api/reports/shortages', { headers })).json()
  expect((await refresh()).ok()).toBeTruthy()
  const alert = { productId: id, locationId: session.locationId, currentQuantity: 0 }
  expect(await read()).toContainEqual(expect.objectContaining(alert))
  expect((await request.post(origin + '/api/inventory/batch', {
    headers, data: { productId: id, locationId: session.locationId, quantity: 4, expiryDate: '2030-01-01' },
  })).ok()).toBeTruthy()
  expect((await refresh()).ok()).toBeTruthy()
  expect(await read()).not.toContainEqual(expect.objectContaining({ productId: id, locationId: session.locationId }))
})

test('purchasing receives a partial order into stock and safely replays a receipt', async ({ page, request }) => {
  const login = await request.post(origin + '/api/auth/login', { data: { email, password } })
  expect(login.ok()).toBeTruthy()
  const headers = { Authorization: 'Bearer ' + (await login.json()).token }
  const session = await (await request.get(origin + '/api/auth/session', { headers })).json()
  const product = await request.post(origin + '/api/products', {
    headers, data: { name: 'صنف اختبار المشتريات', barcode: 'AUDIT-PURCHASE', sellPrice: 20, buyPrice: 10 },
  })
  expect(product.status()).toBe(201)
  const { id: productId } = await product.json()

  await page.goto(origin)
  await page.getByLabel('البريد الإلكتروني').fill(email)
  await page.getByLabel('كلمة المرور').fill(password)
  await page.getByRole('button', { name: 'دخول', exact: true }).click()
  await page.getByRole('link', { name: 'المشتريات' }).click()
  await page.getByLabel('اسم المورد').fill('مورد الاختبار')
  await page.getByRole('button', { name: 'حفظ المورد' }).click()
  await page.getByRole('combobox', { name: 'المورد', exact: true }).selectOption({ label: 'مورد الاختبار' })
  await page.getByRole('combobox', { name: 'الصنف', exact: true }).selectOption(String(productId))
  await page.getByLabel('الكمية', { exact: true }).fill('100')
  await page.getByLabel('تكلفة الوحدة المتفق عليها').fill('10')
  await page.getByRole('button', { name: 'إنشاء أمر الشراء' }).click()
  await expect(page.getByRole('button', { name: 'استلام دفعة' })).toBeDisabled()
  const pending = (await (await request.get(origin + '/api/purchase-orders', { headers })).json())[0]
  expect((await request.post(origin + '/api/purchase-orders/' + pending.id + '/receipts', { headers, data: {
    operationId: crypto.randomUUID(), lineId: pending.lines[0].id, quantity: 1, unitCost: 10,
    batchNumber: 'PENDING', expiryDate: '2030-01-01', invoiceNumber: 'PENDING',
  } })).status()).toBe(409)
  await page.getByRole('button', { name: 'اعتماد أمر الشراء' }).click()
  await page.getByRole('button', { name: 'استلام دفعة' }).click()
  await page.getByLabel('الكمية المستلمة').fill('60')
  await page.getByLabel('التكلفة الفعلية للوحدة').fill('11')
  await page.getByLabel('رقم الدفعة').fill('PUR-A')
  await page.getByLabel('تاريخ انتهاء الدفعة').fill('2030-01-01')
  await page.getByLabel('رقم فاتورة المورد').fill('SUP-001')
  await page.getByRole('button', { name: 'تسجيل الاستلام' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'المتبقي 40' })).toBeVisible()
  const orders = await (await request.get(origin + '/api/purchase-orders', { headers })).json()
  const order = orders.find((item: { supplierName: string }) => item.supplierName === 'مورد الاختبار')
  expect(order.lines[0].received).toBe(60)
  const payload = { operationId: crypto.randomUUID(), lineId: order.lines[0].id, quantity: 40,
    unitCost: 10, batchNumber: 'PUR-B', expiryDate: '2030-02-01', invoiceNumber: 'SUP-002' }
  const submit = (data: object) => request.post(origin + '/api/purchase-orders/' + order.id + '/receipts', { headers, data })
  expect((await submit({ ...payload, quantity: 41 })).status()).toBe(409)
  const first = await submit(payload)
  const replay = await submit(payload)
  expect(first.ok()).toBeTruthy()
  expect(await replay.json()).toEqual(await first.json())
  const stock = await (await request.get(origin + '/api/inventory/stock/' + productId + '/' + session.locationId, { headers })).json()
  expect(stock.stock).toBe(100)
  await page.getByRole('button', { name: 'دفعات الاستلام والمرتجعات' }).click()
  const receiptRow = page.locator('div').filter({ has: page.getByText(/دفعة PUR-B · فاتورة SUP-002/) })
    .filter({ has: page.getByRole('button', { name: 'تسجيل مرتجع المورد' }) }).last()
  await receiptRow.getByLabel('كمية مرتجع المورد').fill('3')
  await receiptRow.getByLabel('سبب مرتجع المورد').fill('مرتجع اختبار')
  await receiptRow.getByRole('button', { name: 'تسجيل مرتجع المورد' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'تم تسجيل مرتجع المورد' })).toBeVisible()
  const original = await first.json()
  const returnPayload = { operationId: crypto.randomUUID(), quantity: 2, reason: 'Repeatable supplier return' }
  const record = (data: object) => request.post(origin + '/api/purchase-receipts/' + original.id + '/returns', { headers, data })
  expect((await record({ ...returnPayload, quantity: 38 })).status()).toBe(409)
  const savedReturn = await record(returnPayload)
  expect(savedReturn.ok()).toBeTruthy()
  expect(await (await record(returnPayload)).json()).toEqual(await savedReturn.json())
  const net = await (await request.get(origin + '/api/inventory/stock/' + productId + '/' + session.locationId, { headers })).json()
  expect(net.stock).toBe(95)
})

test('source and destination complete a transfer from React', async ({ page, request }) => {
  const login = async (account: string) => {
    const response = await request.post(origin + '/api/auth/login', { data: { email: account, password } })
    expect(response.ok()).toBeTruthy()
    return { Authorization: 'Bearer ' + (await response.json()).token }
  }
  const admin = await login(email)
  const session = await (await request.get(origin + '/api/auth/session', { headers: admin })).json()
  const locations = await (await request.get(origin + '/api/locations', { headers: admin })).json()
  const destination = locations.find((location: { id: number }) => location.id !== session.locationId).id
  const post = (path: string, headers: Record<string, string>, data: object = {}) =>
    request.post(origin + '/api' + path, { headers, data })
  for (const [address, locationId] of [['source-transfer@example.test', session.locationId], ['destination-transfer@example.test', destination]]) {
    expect((await post('/users', admin, { name: address, email: address, passwordHash: password, roleId: 2, locationId })).status()).toBe(201)
  }
  const source = await login('source-transfer@example.test')
  const receiver = await login('destination-transfer@example.test')
  const created = await post('/products', admin, { name: 'Transfer fixture', barcode: 'AUDIT-TRANSFER', sellPrice: 12 })
  expect(created.status()).toBe(201)
  const { id: productId } = await created.json()
  expect((await post('/inventory/batch', admin, { productId, locationId: session.locationId,
    batchNumber: 'SHIP-A', quantity: 20, expiryDate: '2030-01-01' })).ok()).toBeTruthy()
  const signIn = async (account: string) => {
    await page.getByLabel('البريد الإلكتروني').fill(account)
    await page.getByLabel('كلمة المرور').fill(password)
    await page.getByRole('button', { name: 'دخول', exact: true }).click()
    await page.getByRole('link', { name: 'التحويلات' }).click()
  }
  const switchTo = async (account: string) => {
    await page.getByRole('button', { name: 'خروج', exact: true }).click()
    await signIn(account)
  }
  await page.goto(origin)
  await signIn('destination-transfer@example.test')
  await page.getByRole('combobox', { name: 'المصدر', exact: true }).selectOption(String(session.locationId))
  await page.getByRole('combobox', { name: 'الوجهة', exact: true }).selectOption(String(destination))
  await page.getByRole('combobox', { name: 'صنف التحويل' }).selectOption(String(productId))
  await page.getByLabel('كمية التحويل').fill('20')
  await page.getByRole('button', { name: 'إرسال طلب التحويل' }).click()
  await expect(page.getByRole('heading', { name: /Transfer fixture.*بانتظار الموافقة/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'اعتماد', exact: true })).toHaveCount(0)
  const transfers = await (await request.get(origin + '/api/transfers', { headers: source })).json()
  const { id } = transfers.find((item: { productId: number }) => item.productId === productId)
  const stock = async (location: number) => (await (await request.get(
    origin + '/api/inventory/stock/' + productId + '/' + location, { headers: admin })).json()).stock
  expect((await post('/transfers/approve/' + id, receiver)).status()).toBe(409)
  await switchTo('source-transfer@example.test')
  await page.getByRole('button', { name: 'اعتماد', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Transfer fixture.*جاهز للشحن/ })).toBeVisible()
  expect(await stock(session.locationId)).toBe(0)
  const physical = await (await request.get(origin + '/api/inventory/location/' + session.locationId, { headers: source })).json()
  expect(physical).toContainEqual(expect.objectContaining({ productId, quantity: 20, reservedQuantity: 20 }))
  expect((await post('/sales', source, { items: [{ productId, quantity: 1 }] })).status()).toBe(409)
  await page.getByRole('button', { name: 'شحن التحويل' }).click()
  await expect(page.getByRole('heading', { name: /Transfer fixture.*قيد النقل/ })).toBeVisible()
  await page.getByRole('button', { name: 'دفعات الشحنة' }).click()
  await expect(page.getByText(/دفعة SHIP-A/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'تسجيل استلام التحويل' })).toHaveCount(0)
  expect(await stock(session.locationId)).toBe(0)
  expect(await stock(destination)).toBe(0)
  const replenishment = async () => (await (await request.get(
    origin + '/api/reports/replenishment/' + destination, { headers: receiver })).json())
    .find((item: { productId: number }) => item.productId === productId)
  expect(await replenishment()).toMatchObject({ available: 0, inTransit: 20, suggestedQuantity: 0 })
  const shipment = async () => (await (await request.get(origin + '/api/transfers/' + id + '/shipment', { headers: receiver })).json())[0]
  const line = await shipment()
  const payload = { operationId: crypto.randomUUID(), movementId: line.id, accepted: 18, damaged: 1, note: 'Damaged packaging' }
  expect((await post('/transfers/' + id + '/receive', source, payload)).status()).toBe(409)
  expect((await post('/transfers/' + id + '/receive', receiver, payload)).ok()).toBeTruthy()
  expect((await post('/transfers/' + id + '/receive', receiver, payload)).ok()).toBeTruthy()
  expect(await shipment()).toMatchObject({ remaining: 1, accepted: 18, damaged: 1 })
  expect(await replenishment()).toMatchObject({ available: 18, inTransit: 1 })
  expect(await stock(destination)).toBe(18)
  await switchTo('destination-transfer@example.test')
  await expect(page.getByRole('heading', { name: /Transfer fixture.*استلام جزئي/ })).toBeVisible()
  await page.getByRole('button', { name: 'دفعات الشحنة' }).click()
  await page.getByLabel('عجز نهائي').fill('1')
  await page.getByLabel('ملاحظة الاستلام').fill('عجز بعد المطابقة')
  await page.getByRole('button', { name: 'تسجيل استلام التحويل' }).click()
  await expect(page.getByRole('heading', { name: /Transfer fixture.*تم الاستلام/ })).toBeVisible()
  expect(await shipment()).toMatchObject({ remaining: 0, accepted: 18, damaged: 1, missing: 1 })
  expect(await stock(destination)).toBe(18)
  const traceUrl = origin + '/api/inventory/lots/trace?productId=' + productId + '&lot=SHIP-A'
  const trace = await (await request.get(traceUrl, { headers: admin })).json()
  expect(trace.transfers).toContainEqual(expect.objectContaining({ transferId: id, shipped: 20, accounted: 20 }))
  expect(trace.stock.map((batch: { locationId: number }) => batch.locationId)).toContain(destination)
  const receiverTrace = await (await request.get(traceUrl, { headers: receiver })).json()
  expect(receiverTrace.stock.every((batch: { locationId: number }) => batch.locationId === destination)).toBeTruthy()
  await page.getByRole('link', { name: 'تتبّع الدفعات' }).click()
  await page.getByRole('combobox', { name: 'صنف الدفعة' }).selectOption(String(productId))
  await page.getByLabel('رقم الدفعة المطلوب').fill('SHIP-A')
  await page.getByRole('button', { name: 'تتبّع الدفعة', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'التحويلات المتأثرة' })).toBeVisible()
  await page.getByLabel('سبب عزل الدفعة').fill('مراجعة شحنة تجريبية')
  await page.getByRole('button', { name: 'عزل الدفعة في المواقع المتاحة' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'تم عزل سجلات الدفعة: 1' })).toBeVisible()
  expect(await stock(destination)).toBe(0)
})

test('approved stock count preserves a sale after the count and cannot apply twice', async ({ page, request }) => {
  const login = await request.post(origin + '/api/auth/login', { data: { email, password } })
  expect(login.ok()).toBeTruthy()
  const headers = { Authorization: 'Bearer ' + (await login.json()).token }
  const session = await (await request.get(origin + '/api/auth/session', { headers })).json()
  const post = (path: string, data: object) => request.post(origin + '/api' + path, { headers, data })
  const product = await post('/products', { name: 'صنف اختبار الجرد', barcode: 'AUDIT-COUNT', sellPrice: 12 })
  expect(product.status()).toBe(201)
  const { id: productId } = await product.json()
  const batch = await post('/inventory/batch', { productId, locationId: session.locationId,
    batchNumber: 'COUNT-A', quantity: 10, expiryDate: '2030-01-01' })
  expect(batch.ok()).toBeTruthy()
  const { id: batchId } = await batch.json()
  expect((await post('/stock-counts', { batchId, expectedQuantity: 9, counted: 8, reason: 'Stale baseline' })).status()).toBe(409)

  await page.goto(origin)
  await page.getByLabel('البريد الإلكتروني').fill(email)
  await page.getByLabel('كلمة المرور').fill(password)
  await page.getByRole('button', { name: 'دخول', exact: true }).click()
  await page.getByRole('link', { name: 'الجرد', exact: true }).click()
  await page.getByRole('combobox', { name: 'دفعة الجرد' }).selectOption(String(batchId))
  await page.getByLabel('الكمية الفعلية').fill('8')
  await page.getByLabel('سبب الجرد').fill('جرد دوري')
  await page.getByRole('button', { name: 'تسجيل العد' }).click()
  await expect(page.getByText('بانتظار الاعتماد')).toBeVisible()
  expect((await post('/sales', { items: [{ productId, quantity: 3 }] })).ok()).toBeTruthy()
  await page.getByRole('button', { name: 'اعتماد التسوية' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'تم اعتماد التسوية' })).toBeVisible()
  const counts = await (await request.get(origin + '/api/stock-counts', { headers })).json()
  const count = counts.find((item: { batchId: number }) => item.batchId === batchId)
  expect(count.approvedAt).toBeTruthy()
  expect((await post('/stock-counts/' + count.id + '/approve', {})).ok()).toBeTruthy()
  const stock = await (await request.get(origin + '/api/inventory/stock/' + productId + '/' + session.locationId, { headers })).json()
  expect(stock.stock).toBe(5)
})
