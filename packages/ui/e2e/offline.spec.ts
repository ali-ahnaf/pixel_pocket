import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * End-to-end coverage for the two writes that work with no network: logging a
 * transaction and creating a due.
 *
 * The API is stubbed via `page.route` so no backend is needed. "Offline" is
 * simulated in two layers, because the app checks both: `context.setOffline`
 * flips `navigator.onLine` (and fires the online/offline events), while the
 * route handler aborts API calls the way a dead connection would.
 */

const USER_ID = 'user-1';

// `hasOnboarded` keeps the first-run walkthrough (a full-screen overlay) closed.
const PROFILE = { id: USER_ID, name: 'Hero', email: 'hero@guild.com', avatar: '', hasOnboarded: true };

interface CapturedWrite {
  url: string;
  body: Record<string, unknown>;
}

/** Stub every API call. While `offline.value` is true, calls abort as a transport failure. */
const stubApi = async (page: Page, offline: { value: boolean }, writes: CapturedWrite[]): Promise<void> => {
  await page.route('**/api/**', async (route: Route) => {
    const request = route.request();

    if (offline.value) {
      await route.abort('internetdisconnected');
      return;
    }

    if (request.method() === 'POST') {
      writes.push({ url: request.url(), body: (request.postDataJSON() ?? {}) as Record<string, unknown> });
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'server-1', userId: USER_ID, title: 'Saved', amount: 12, type: 'expense', notes: null, dueDate: null, createdAt: new Date().toISOString() }),
      });
      return;
    }

    const url = request.url();
    const listEndpoints = ['/transactions', '/vaults', '/tags', '/recurring', '/debts', '/pending-expenses'];
    const body = listEndpoints.some((endpoint) => url.includes(endpoint)) ? '[]' : JSON.stringify(PROFILE);
    await route.fulfill({ status: 200, contentType: 'application/json', body });
  });
};

/** Put a signed-in session in place without going through the sign-in form. */
const signIn = async (page: Page): Promise<void> => {
  await page.goto('/signin');
  await page.evaluate((profile) => {
    window.localStorage.setItem('auth_token', 'fake-jwt-token');
    window.localStorage.setItem('pocket_pixel_profile', JSON.stringify(profile));
  }, PROFILE);
};

const readOutbox = (page: Page): Promise<unknown[]> => page.evaluate(() => JSON.parse(window.localStorage.getItem('pp_outbox') ?? '[]'));

test.describe('Offline writes', () => {
  test('queues a transaction logged offline and replays it on reconnect', async ({ page, context }) => {
    const offline = { value: false };
    const writes: CapturedWrite[] = [];
    await stubApi(page, offline, writes);

    await signIn(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: /^log$/i }).or(page.locator('main'))).toBeVisible();

    offline.value = true;
    await context.setOffline(true);

    await expect(page.getByText(/offline — changes will sync later/i)).toBeVisible();

    await page.getByRole('button', { name: /log new resource/i }).click();
    await page.getByPlaceholder('0.00').fill('12');
    await page.getByRole('button', { name: /record/i }).click();

    // The modal closes as if the write had succeeded, and the entry is queued.
    await expect(page.getByRole('heading', { name: /log new resource/i })).toBeHidden();
    expect(await readOutbox(page)).toHaveLength(1);
    expect(writes).toHaveLength(0);

    offline.value = false;
    await context.setOffline(false);

    await expect.poll(() => writes.filter((write) => write.url.includes('/transactions')).length).toBe(1);
    await expect.poll(() => readOutbox(page)).toHaveLength(0);

    const replayed = writes.find((write) => write.url.includes('/transactions'));
    expect(replayed?.body.amount).toBe(12);
    // Idempotency key: a replay whose first attempt reached the server must not duplicate.
    expect(replayed?.body.clientRequestId).toEqual(expect.any(String));
  });

  test('queues a due created offline, renders it, and replays it on reconnect', async ({ page, context }) => {
    const offline = { value: false };
    const writes: CapturedWrite[] = [];
    await stubApi(page, offline, writes);

    await signIn(page);
    await page.goto('/debts');
    await expect(page.getByRole('heading', { name: /debts/i })).toBeVisible();

    offline.value = true;
    await context.setOffline(true);

    await page.getByRole('button', { name: /new/i }).click();
    await page.getByPlaceholder('e.g. Rent, Loan Repayment').fill('Concert tickets');
    await page.getByPlaceholder('0.00').fill('75');
    await page.getByRole('button', { name: /save due/i }).click();

    // A queued due renders like any other row, minus the server-only actions.
    await expect(page.getByText('Concert tickets')).toBeVisible();
    await expect(page.getByText(/queued/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /apply/i })).toHaveCount(0);
    expect(await readOutbox(page)).toHaveLength(1);

    offline.value = false;
    await context.setOffline(false);

    await expect.poll(() => writes.filter((write) => write.url.includes('/debts')).length).toBe(1);
    await expect.poll(() => readOutbox(page)).toHaveLength(0);

    const replayed = writes.find((write) => write.url.includes('/debts'));
    expect(replayed?.body).toMatchObject({ title: 'Concert tickets', amount: 75 });
    expect(replayed?.body.clientRequestId).toEqual(expect.any(String));
  });
});
