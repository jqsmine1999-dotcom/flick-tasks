import { expect, test, type Locator, type Page } from '@playwright/test'

const uid = () => `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

async function login(page: Page, name = uid()) {
  await page.goto(`/auth/dev?name=${name}`)
  await expect(page.getByTestId('avatar')).toBeVisible()
  return name
}

async function add(page: Page, text: string) {
  const composer = page.getByTestId('composer')
  await composer.fill(text)
  await composer.press('Enter')
  await expect(page.getByTestId('task').filter({ hasText: text })).toBeVisible()
}

/** Real pointer drag with intermediate moves, like a finger flick. */
async function flick(page: Page, card: Locator, dir: 'left' | 'right') {
  const box = (await card.locator('.card').boundingBox())!
  const y = box.y + box.height / 2
  const startX = box.x + box.width / 2
  const endX = startX + (dir === 'right' ? 1 : -1) * 170
  await page.mouse.move(startX, y)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(startX + ((endX - startX) * i) / 8, y + i * 0.3)
  await page.mouse.up()
}

const count = (page: Page, s: string) => page.getByTestId(`count-${s}`)

test('full-screen skeleton shows while loading, and the composer is usable during it', async ({ page }) => {
  await page.route('**/api/me', async (route) => {
    await new Promise((r) => setTimeout(r, 1500))
    await route.continue()
  })
  await page.goto('/')
  await expect(page.getByTestId('skeleton')).toBeVisible()
  await expect(page.getByTestId('skeleton-card').first()).toBeVisible()
  await expect(page.getByTestId('composer')).toBeFocused()
  await page.keyboard.type('loading中のメモ')
  await expect(page.getByTestId('skeleton')).toBeHidden({ timeout: 5000 })
  await expect(page.getByTestId('composer')).toHaveValue('loading中のメモ')
})

test('composer is focused the moment the app opens and Enter adds a task', async ({ page }) => {
  await login(page)
  await expect(page.getByTestId('composer')).toBeFocused()
  await page.keyboard.type('牛乳を買う')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('task')).toHaveText(/牛乳を買う/)
  await expect(page.getByTestId('composer')).toHaveValue('')
  await expect(page.getByTestId('composer')).toBeFocused()
  await expect(count(page, 'todo')).toHaveText('1')
})

test('unsent draft survives a reload', async ({ page }) => {
  await login(page)
  await page.getByTestId('composer').fill('書きかけ')
  await page.reload()
  await expect(page.getByTestId('composer')).toHaveValue('書きかけ')
})

test('flick right moves todo → doing → done', async ({ page }) => {
  await login(page)
  await add(page, 'フリックするタスク')
  await flick(page, page.getByTestId('task').first(), 'right')
  await expect(count(page, 'todo')).toHaveText('0')
  await expect(count(page, 'doing')).toHaveText('1')
  await expect(page.getByTestId('empty')).toBeVisible()

  await page.getByTestId('tab-doing').click()
  const card = page.getByTestId('list-doing').getByTestId('task')
  await expect(card).toHaveAttribute('data-status', 'doing')
  await flick(page, card, 'right')
  await expect(count(page, 'done')).toHaveText('1')

  await page.getByTestId('tab-done').click()
  await expect(page.getByTestId('list-done').getByTestId('task')).toHaveText(/フリックするタスク/)
})

test('flick left moves back, and deletes from todo with undo', async ({ page }) => {
  await login(page)
  await add(page, '戻すタスク')
  await flick(page, page.getByTestId('task').first(), 'right')
  await page.getByTestId('tab-doing').click()
  await flick(page, page.getByTestId('list-doing').getByTestId('task'), 'left')
  await expect(count(page, 'todo')).toHaveText('1')
  await expect(count(page, 'doing')).toHaveText('0')

  await page.getByTestId('tab-todo').click()
  await flick(page, page.getByTestId('list-todo').getByTestId('task'), 'left')
  await expect(count(page, 'todo')).toHaveText('0')
  await expect(page.getByTestId('toast')).toContainText('削除しました')
  await page.getByTestId('toast-action').click()
  await expect(page.getByTestId('task')).toHaveText(/戻すタスク/)
  await expect(count(page, 'todo')).toHaveText('1')
})

test('undo after a status flick returns the task', async ({ page }) => {
  await login(page)
  await add(page, 'やっぱり戻す')
  await flick(page, page.getByTestId('task').first(), 'right')
  await expect(count(page, 'doing')).toHaveText('1')
  await page.getByTestId('toast-action').click()
  await expect(count(page, 'doing')).toHaveText('0')
  await expect(page.getByTestId('task')).toHaveText(/やっぱり戻す/)
})

test('a small drag snaps back without changing status', async ({ page }) => {
  await login(page)
  await add(page, '少しだけ動かす')
  const card = page.getByTestId('task').first()
  const box = (await card.locator('.card').boundingBox())!
  await page.mouse.move(box.x + 100, box.y + 20)
  await page.mouse.down()
  await page.mouse.move(box.x + 120, box.y + 20, { steps: 4 })
  await page.mouse.move(box.x + 140, box.y + 20, { steps: 4 })
  await page.waitForTimeout(150)
  await page.mouse.up()
  await expect(count(page, 'todo')).toHaveText('1')
  await expect(card.locator('.card')).toHaveCSS('transform', /none|matrix\(1, 0, 0, 1, 0, 0\)/, { timeout: 3000 })
})

test('tap opens the sheet: edit title, change status, delete', async ({ page }) => {
  await login(page)
  await add(page, '編集前')
  await page.getByTestId('task').first().locator('.card').click()
  await expect(page.getByTestId('sheet')).toBeVisible()
  await page.getByTestId('edit-title').fill('編集後')
  await page.getByTestId('edit-title').press('Enter')
  await expect(page.getByTestId('sheet')).toBeHidden()
  await expect(page.getByTestId('task')).toHaveText(/編集後/)

  await page.getByTestId('task').first().locator('.card').click()
  await page.getByTestId('set-done').click()
  await expect(count(page, 'done')).toHaveText('1')

  await page.getByTestId('tab-done').click()
  await page.getByTestId('list-done').getByTestId('task').locator('.card').click()
  await page.getByTestId('delete').click()
  await expect(count(page, 'done')).toHaveText('0')
})

test('tasks sync to the server and come back on a fresh device', async ({ page, browser }) => {
  const name = await login(page)
  await add(page, '同期テスト')
  await flick(page, page.getByTestId('task').first(), 'right')
  await expect
    .poll(async () => (await page.request.get('/api/tasks').then((r) => r.json())).tasks.map((t: { status: string }) => t.status))
    .toEqual(['doing'])

  const other = await browser.newContext()
  const p2 = await other.newPage()
  await login(p2, name)
  await expect(p2.getByTestId('count-doing')).toHaveText('1')
  await other.close()
})

test('AI split turns a memo into several tasks', async ({ page }) => {
  await login(page)
  await page.getByTestId('composer').fill('資料を作る\n田中さんにメール\n会議室を予約')
  await page.getByTestId('ai').click()
  await expect(page.getByTestId('task')).toHaveCount(3)
  await expect(page.getByTestId('task').first()).toHaveText(/資料を作る/)
  await expect(count(page, 'todo')).toHaveText('3')
  await expect(page.getByTestId('composer')).toHaveValue('')
})

test('guest: memo works before login, AI asks for Google login, tasks upload after login', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('login')).toBeVisible()
  await expect(page.getByTestId('login')).toHaveAttribute('href', '/auth/google')
  await add(page, 'ログイン前のメモ')
  await page.getByTestId('composer').fill('AIを使いたい')
  await page.getByTestId('ai').click()
  await expect(page.getByTestId('login-google')).toBeVisible()
  await expect(page.getByTestId('login-google')).toHaveAttribute('href', '/auth/google')
  await page.getByTestId('scrim').click()

  await login(page)
  await expect(page.getByTestId('task').filter({ hasText: 'ログイン前のメモ' })).toBeVisible()
  await expect
    .poll(async () => (await page.request.get('/api/tasks').then((r) => r.json())).tasks.length)
    .toBe(1)
})

test('logout clears local data', async ({ page }) => {
  await login(page)
  await add(page, '消えるはず')
  await page.getByTestId('avatar').click()
  await page.getByTestId('logout').click()
  await expect(page.getByTestId('login')).toBeVisible()
  await expect(page.getByTestId('task')).toHaveCount(0)
  expect((await page.request.get('/api/me').then((r) => r.json())).user).toBeNull()
})

test('Google login redirects with PKCE and state', async ({ page }) => {
  const res = await page.request.get('/auth/google', { maxRedirects: 0 })
  expect(res.status()).toBe(302)
  const url = new URL(res.headers()['location'])
  expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
  expect(url.searchParams.get('scope')).toBe('openid email profile')
  expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  expect(url.searchParams.get('state')).toBeTruthy()
  expect(url.searchParams.get('redirect_uri')).toMatch(/\/auth\/callback$/)
  // A callback with a forged state is rejected.
  const bad = await page.request.get('/auth/callback?code=x&state=forged', { maxRedirects: 0 })
  expect(bad.headers()['location']).toBe('/?login=failed')
})

test('API: auth required, cross-origin writes refused, other users cannot overwrite', async ({ page, browser }) => {
  expect((await page.request.get('/api/tasks')).status()).toBe(401)
  await login(page)
  const id = crypto.randomUUID()
  const body = { title: 'mine', status: 'todo', createdAt: 1, updatedAt: 1 }
  expect((await page.request.put(`/api/tasks/${id}`, { data: body })).ok()).toBe(true)
  const evil = await page.request.put(`/api/tasks/${id}`, { data: body, headers: { origin: 'https://evil.example' } })
  expect(evil.status()).toBe(403)

  const other = await browser.newContext()
  const p2 = await other.newPage()
  await login(p2)
  await p2.request.put(`/api/tasks/${id}`, { data: { ...body, title: 'hijacked', updatedAt: 99 } })
  const mine = (await page.request.get('/api/tasks').then((r) => r.json())).tasks
  expect(mine.find((t: { id: string }) => t.id === id).title).toBe('mine')
  expect((await p2.request.get('/api/tasks').then((r) => r.json())).tasks).toHaveLength(0)
  await other.close()
})

test('mobile layout: no horizontal scroll, no catch copy, glass surfaces', async ({ page }) => {
  await login(page)
  await add(page, 'レイアウト確認')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  const backdrop = await page.locator('.composer').evaluate((el) => {
    const cs = getComputedStyle(el)
    return cs.backdropFilter || cs.getPropertyValue('-webkit-backdrop-filter')
  })
  expect(backdrop).toContain('blur')
  expect(await page.locator('h1, h2, p').count()).toBe(0)
})

test('keyboard: arrow keys flick a focused card', async ({ page }) => {
  await login(page)
  await add(page, 'キーボード')
  await page.getByTestId('task').first().locator('.card').focus()
  await page.keyboard.press('ArrowRight')
  await expect(count(page, 'doing')).toHaveText('1')
})

test('homepage, privacy policy and terms pages are public and linked', async ({ page }) => {
  for (const [path, heading] of [['/about', 'Flick'], ['/privacy', 'プライバシーポリシー'], ['/terms', '利用規約']]) {
    await page.goto(path)
    await expect(page.locator('h1')).toHaveText(heading)
    await expect(page.locator('nav a[href="/privacy"]')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  }
  await page.goto('/about')
  await expect(page.getByText('Google アカウントの利用について')).toBeVisible()
})

test('account deletion removes the user and all tasks (two-step confirm)', async ({ page, browser }) => {
  const name = await login(page)
  await add(page, '消すアカウントのタスク')
  await expect.poll(async () => (await page.request.get('/api/tasks').then((r) => r.json())).tasks.length).toBe(1)
  await page.getByTestId('avatar').click()
  await page.getByTestId('delete-account').click()
  await expect(page.getByTestId('delete-account')).toHaveText('すべてのデータを削除する')
  await expect(page.getByTestId('avatar')).toBeVisible()
  await page.getByTestId('delete-account').click()
  await expect(page.getByTestId('login')).toBeVisible()
  await expect(page.getByTestId('task')).toHaveCount(0)
  expect((await page.request.get('/api/tasks')).status()).toBe(401)

  // Logging in again with the same Google identity starts from an empty account.
  const other = await browser.newContext()
  const p2 = await other.newPage()
  await login(p2, name)
  await expect(p2.getByTestId('count-todo')).toHaveText('0')
  await other.close()
})
