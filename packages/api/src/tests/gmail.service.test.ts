import type { UserOAuthCredential } from '../entities/UserOAuthCredential.entity';
import type { UserOAuthCredentialRepository } from '../repositories/user-oauth-credential.repository';
import type { UserOAuthCredentialService } from '../services/user-oauth-credential.service';
import type { ProcessedGmailMessageRepository } from '../repositories/processed-gmail-message.repository';
import type { VaultGmailWatchersRepository } from '../repositories/vault-gmail-watchers.repository';
import type { PendingGmailExpenseService } from '../services/pending-gmail-expense.service';
import type { VaultGmailWatcher } from '../entities/VaultGmailWatcher.entity';
import type { VaultsRepository } from '../repositories/vaults.repository';
import type { Vault } from '../entities/Vault.entity';
import type { PushService } from '../services/push.service';
import { GmailService, GMAIL_API_BASE, GmailMessage } from '../services/gmail.service';

jest.mock('../services', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

type CredentialsMock = jest.Mocked<Pick<UserOAuthCredentialRepository, 'findByUserId' | 'findByGoogleEmail' | 'save'>>;
type OAuthMock = jest.Mocked<Pick<UserOAuthCredentialService, 'authorizedGoogleFetch'>>;
type WatchersMock = jest.Mocked<Pick<VaultGmailWatchersRepository, 'findManyForUser'>>;
type VaultsMock = jest.Mocked<Pick<VaultsRepository, 'findOneForUser'>>;
type PushMock = jest.Mocked<Pick<PushService, 'notify'>>;

const buildCredential = (overrides: Partial<UserOAuthCredential> = {}): UserOAuthCredential =>
  ({
    id: 'cred-1',
    userId: 'user-1',
    gmailHistoryId: null,
    gmailWatchExpiry: null,
    ...overrides,
  }) as UserOAuthCredential;

const buildWatcher = (overrides: Partial<VaultGmailWatcher> = {}): VaultGmailWatcher =>
  ({ userId: 'user-1', vaultId: 'vault-1', gmailLabelId: 'L1', gmailLabelName: 'BANK', guidanceHint: null, ...overrides }) as VaultGmailWatcher;

const jsonResponse = (status: number, body: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

describe('GmailService', () => {
  let credentials: CredentialsMock;
  let oauth: OAuthMock;
  let watchers: WatchersMock;
  let vaults: VaultsMock;
  let push: PushMock;
  let service: GmailService;

  const makeService = (overrides: { processed?: ProcessedGmailMessageRepository; pending?: PendingGmailExpenseService } = {}): GmailService =>
    new GmailService(
      oauth as unknown as UserOAuthCredentialService,
      credentials as unknown as UserOAuthCredentialRepository,
      (overrides.processed ?? {}) as ProcessedGmailMessageRepository,
      watchers as unknown as VaultGmailWatchersRepository,
      (overrides.pending ?? {}) as PendingGmailExpenseService,
      vaults as unknown as VaultsRepository,
      push as unknown as PushService,
    );

  beforeEach(() => {
    process.env.GMAIL_PUBSUB_TOPIC = 'projects/app/topics/pp-gmail-incoming';
    credentials = {
      findByUserId: jest.fn(),
      findByGoogleEmail: jest.fn(),
      save: jest.fn((c) => Promise.resolve(c as UserOAuthCredential)),
    };
    oauth = { authorizedGoogleFetch: jest.fn() };
    watchers = { findManyForUser: jest.fn().mockResolvedValue([buildWatcher()]) };
    vaults = { findOneForUser: jest.fn().mockResolvedValue({ id: 'vault-9', name: 'MAIN STASH' } as Vault) };
    push = { notify: jest.fn().mockResolvedValue(undefined) };
    service = makeService();
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.GMAIL_PUBSUB_TOPIC;
  });

  describe('startWatch', () => {
    it('posts watch with the topic + derived label union and persists the returned historyId and expiry', async () => {
      const credential = buildCredential({ googleEmail: null });
      credentials.findByUserId.mockResolvedValue(credential);
      watchers.findManyForUser.mockResolvedValue([buildWatcher({ gmailLabelId: 'L1' }), buildWatcher({ vaultId: 'vault-2', gmailLabelId: 'L2' })]);
      const expiration = '1893456000000'; // epoch millis
      oauth.authorizedGoogleFetch.mockImplementation((_userId, url) =>
        Promise.resolve(url.endsWith('/profile') ? jsonResponse(200, { emailAddress: 'me@example.com' }) : jsonResponse(200, { historyId: '424242', expiration })),
      );

      const result = await service.startWatch('user-1');

      const watchCall = oauth.authorizedGoogleFetch.mock.calls.find(([, url]) => url.endsWith('/watch'));
      const body = JSON.parse((watchCall![2] as RequestInit).body as string);
      expect(body).toEqual({ topicName: 'projects/app/topics/pp-gmail-incoming', labelIds: ['L1', 'L2'], labelFilterBehavior: 'INCLUDE' });
      expect(credential.googleEmail).toBe('me@example.com');
      expect(credential.gmailHistoryId).toBe('424242');
      expect(credential.gmailWatchExpiry).toEqual(new Date(Number(expiration)));
      expect(result).toEqual({ historyId: '424242', expiry: new Date(Number(expiration)) });
    });

    it('deduplicates labels shared across vaults into the watch union', async () => {
      credentials.findByUserId.mockResolvedValue(buildCredential());
      watchers.findManyForUser.mockResolvedValue([buildWatcher({ gmailLabelId: 'L1' }), buildWatcher({ vaultId: 'vault-2', gmailLabelId: 'L1' })]);
      oauth.authorizedGoogleFetch.mockImplementation((_userId, url) =>
        Promise.resolve(url.endsWith('/profile') ? jsonResponse(200, { emailAddress: 'me@example.com' }) : jsonResponse(200, { historyId: '1', expiration: '1893456000000' })),
      );

      await service.startWatch('user-1');

      const watchCall = oauth.authorizedGoogleFetch.mock.calls.find(([, url]) => url.endsWith('/watch'));
      expect(JSON.parse((watchCall![2] as RequestInit).body as string).labelIds).toEqual(['L1']);
    });

    it('throws when the user has no watchers attached', async () => {
      credentials.findByUserId.mockResolvedValue(buildCredential());
      watchers.findManyForUser.mockResolvedValue([]);

      await expect(service.startWatch('user-1')).rejects.toThrow('Attach at least one Gmail label to a vault to watch');
      expect(oauth.authorizedGoogleFetch).not.toHaveBeenCalled();
    });

    it('throws when no credential row exists', async () => {
      credentials.findByUserId.mockResolvedValue(null);

      await expect(service.startWatch('user-1')).rejects.toThrow('Google OAuth client not configured');
    });

    it('throws when the Pub/Sub topic env is not configured', async () => {
      delete process.env.GMAIL_PUBSUB_TOPIC;
      credentials.findByUserId.mockResolvedValue(buildCredential());

      await expect(service.startWatch('user-1')).rejects.toThrow('Gmail Pub/Sub topic is not configured');
      expect(oauth.authorizedGoogleFetch).not.toHaveBeenCalled();
    });

    it('throws and does not persist when Gmail rejects the watch', async () => {
      credentials.findByUserId.mockResolvedValue(buildCredential());
      oauth.authorizedGoogleFetch.mockImplementation((_userId, url) =>
        Promise.resolve(url.endsWith('/profile') ? jsonResponse(200, { emailAddress: 'me@example.com' }) : jsonResponse(403, { error: 'forbidden' })),
      );

      await expect(service.startWatch('user-1')).rejects.toThrow('Gmail watch request failed: HTTP 403');
      expect(credentials.save).not.toHaveBeenCalled();
    });
  });

  describe('getWatchStatus', () => {
    it('reports watching with an ISO expiry and the derived label union when the watch is live', async () => {
      const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      credentials.findByUserId.mockResolvedValue(buildCredential({ gmailWatchExpiry: future }));
      watchers.findManyForUser.mockResolvedValue([buildWatcher({ gmailLabelId: 'L1' }), buildWatcher({ vaultId: 'vault-2', gmailLabelId: 'L2' })]);

      const status = await service.getWatchStatus('user-1');

      expect(status).toEqual({ watching: true, expiry: future.toISOString(), labelIds: ['L1', 'L2'] });
    });

    it('reports not watching with an empty label set when there is no expiry or watchers', async () => {
      credentials.findByUserId.mockResolvedValue(buildCredential({ gmailWatchExpiry: null }));
      watchers.findManyForUser.mockResolvedValue([]);

      expect(await service.getWatchStatus('user-1')).toEqual({ watching: false, expiry: null, labelIds: [] });
    });
  });

  describe('resyncWatch', () => {
    it('starts the watch when the label union is non-empty', async () => {
      credentials.findByUserId.mockResolvedValue(buildCredential());
      watchers.findManyForUser.mockResolvedValue([buildWatcher({ gmailLabelId: 'L1' })]);
      oauth.authorizedGoogleFetch.mockImplementation((_userId, url) =>
        Promise.resolve(url.endsWith('/profile') ? jsonResponse(200, { emailAddress: 'me@example.com' }) : jsonResponse(200, { historyId: '1', expiration: '1893456000000' })),
      );

      await service.resyncWatch('user-1');

      expect(oauth.authorizedGoogleFetch.mock.calls.some(([, url]) => url.endsWith('/watch'))).toBe(true);
    });

    it('stops a live watch when the label union becomes empty', async () => {
      const credential = buildCredential({ gmailWatchExpiry: new Date() });
      credentials.findByUserId.mockResolvedValue(credential);
      watchers.findManyForUser.mockResolvedValue([]);
      oauth.authorizedGoogleFetch.mockResolvedValue(jsonResponse(204, {}));

      await service.resyncWatch('user-1');

      expect(oauth.authorizedGoogleFetch).toHaveBeenCalledWith('user-1', `${GMAIL_API_BASE}/stop`, { method: 'POST' });
      expect(credential.gmailWatchExpiry).toBeNull();
    });

    it('does nothing when the union is empty and no watch is live', async () => {
      credentials.findByUserId.mockResolvedValue(buildCredential({ gmailWatchExpiry: null }));
      watchers.findManyForUser.mockResolvedValue([]);

      await service.resyncWatch('user-1');

      expect(oauth.authorizedGoogleFetch).not.toHaveBeenCalled();
    });
  });

  describe('stopWatch', () => {
    it('posts stop and clears the local watch expiry', async () => {
      const credential = buildCredential({ gmailWatchExpiry: new Date() });
      credentials.findByUserId.mockResolvedValue(credential);
      oauth.authorizedGoogleFetch.mockResolvedValue(jsonResponse(204, {}));

      await service.stopWatch('user-1');

      expect(oauth.authorizedGoogleFetch).toHaveBeenCalledWith('user-1', `${GMAIL_API_BASE}/stop`, { method: 'POST' });
      expect(credential.gmailWatchExpiry).toBeNull();
      expect(credentials.save).toHaveBeenCalledWith(credential);
    });

    it('treats a 404 (no active watch) as already stopped', async () => {
      const credential = buildCredential({ gmailWatchExpiry: new Date() });
      credentials.findByUserId.mockResolvedValue(credential);
      oauth.authorizedGoogleFetch.mockResolvedValue(jsonResponse(404, {}));

      await service.stopWatch('user-1');

      expect(credential.gmailWatchExpiry).toBeNull();
      expect(credentials.save).toHaveBeenCalledWith(credential);
    });

    it('no-ops when no credential row exists', async () => {
      credentials.findByUserId.mockResolvedValue(null);

      await service.stopWatch('user-1');

      expect(oauth.authorizedGoogleFetch).not.toHaveBeenCalled();
      expect(credentials.save).not.toHaveBeenCalled();
    });
  });

  describe('handlePushNotification', () => {
    const spyProcessHistory = (impl: () => Promise<void>) => jest.spyOn(service as unknown as { processHistory: () => Promise<void> }, 'processHistory').mockImplementation(impl);

    it('drops a notification for an unknown mailbox', async () => {
      credentials.findByGoogleEmail.mockResolvedValue(null);
      const process = spyProcessHistory(() => Promise.resolve());

      await service.handlePushNotification({ emailAddress: 'nobody@example.com', historyId: '100' });

      expect(credentials.findByGoogleEmail).toHaveBeenCalledWith('nobody@example.com');
      expect(process).not.toHaveBeenCalled();
      expect(credentials.save).not.toHaveBeenCalled();
    });

    it('skips when the incoming historyId is not newer than the stored one', async () => {
      credentials.findByGoogleEmail.mockResolvedValue(buildCredential({ googleEmail: 'me@example.com', gmailHistoryId: '200' }));
      const process = spyProcessHistory(() => Promise.resolve());

      await service.handlePushNotification({ emailAddress: 'me@example.com', historyId: '200' });

      expect(process).not.toHaveBeenCalled();
      expect(credentials.save).not.toHaveBeenCalled();
    });

    it('diffs and advances the stored historyId when the notification is newer', async () => {
      const credential = buildCredential({ googleEmail: 'me@example.com', gmailHistoryId: '200' });
      credentials.findByGoogleEmail.mockResolvedValue(credential);
      const process = spyProcessHistory(() => Promise.resolve());

      await service.handlePushNotification({ emailAddress: 'me@example.com', historyId: '250' });

      expect(process).toHaveBeenCalledWith(credential, '200');
      expect(credential.gmailHistoryId).toBe('250');
      expect(credentials.save).toHaveBeenCalledWith(credential);
    });

    it('swallows processing errors and does NOT advance the historyId', async () => {
      const credential = buildCredential({ googleEmail: 'me@example.com', gmailHistoryId: '200' });
      credentials.findByGoogleEmail.mockResolvedValue(credential);
      spyProcessHistory(() => Promise.reject(new Error('boom')));

      await expect(service.handlePushNotification({ emailAddress: 'me@example.com', historyId: '250' })).resolves.toBeUndefined();

      expect(credential.gmailHistoryId).toBe('200');
      expect(credentials.save).not.toHaveBeenCalled();
    });
  });

  describe('history diff (processHistory driven via a push)', () => {
    const spyHandleMessage = () => jest.spyOn(service as unknown as { handleMessage: (u: string, m: GmailMessage) => Promise<void> }, 'handleMessage').mockResolvedValue(undefined);

    const routeFetch = (routes: { match: RegExp; response: Response }[]): void => {
      oauth.authorizedGoogleFetch.mockImplementation((_userId, url) => {
        const found = routes.find((r) => r.match.test(url as string));
        if (!found) return Promise.reject(new Error(`unexpected url ${String(url)}`));
        return Promise.resolve(found.response);
      });
    };

    it('collects added message ids across history pages, fetches each in full, and dispatches them', async () => {
      const credential = buildCredential({ googleEmail: 'me@example.com', gmailHistoryId: '200' });
      credentials.findByGoogleEmail.mockResolvedValue(credential);
      const handle = spyHandleMessage();

      routeFetch([
        { match: /\/history\?/, response: jsonResponse(200, { history: [{ messagesAdded: [{ message: { id: 'm1' } }, { message: { id: 'm2' } }] }] }) },
        { match: /\/messages\/m1\?/, response: jsonResponse(200, { id: 'm1' }) },
        { match: /\/messages\/m2\?/, response: jsonResponse(200, { id: 'm2' }) },
      ]);

      await service.handlePushNotification({ emailAddress: 'me@example.com', historyId: '250' });

      expect(handle).toHaveBeenCalledTimes(2);
      expect(handle.mock.calls.map((c) => (c[1] as GmailMessage).id).sort()).toEqual(['m1', 'm2']);
      expect(credential.gmailHistoryId).toBe('250');
    });

    it('does nothing to diff when the user has no watchers (empty label union)', async () => {
      credentials.findByGoogleEmail.mockResolvedValue(buildCredential({ googleEmail: 'me@example.com', gmailHistoryId: '200' }));
      watchers.findManyForUser.mockResolvedValue([]);
      const handle = spyHandleMessage();

      await service.handlePushNotification({ emailAddress: 'me@example.com', historyId: '250' });

      expect(oauth.authorizedGoogleFetch).not.toHaveBeenCalled();
      expect(handle).not.toHaveBeenCalled();
    });

    it('falls back to a bounded messages.list when the stored historyId is too old (404)', async () => {
      const credential = buildCredential({ googleEmail: 'me@example.com', gmailHistoryId: '1' });
      credentials.findByGoogleEmail.mockResolvedValue(credential);
      const handle = spyHandleMessage();

      routeFetch([
        { match: /\/history\?/, response: jsonResponse(404, {}) },
        { match: /\/messages\?/, response: jsonResponse(200, { messages: [{ id: 'r1' }, { id: 'r2' }] }) },
        { match: /\/messages\/r1\?/, response: jsonResponse(200, { id: 'r1' }) },
        { match: /\/messages\/r2\?/, response: jsonResponse(200, { id: 'r2' }) },
      ]);

      await service.handlePushNotification({ emailAddress: 'me@example.com', historyId: '999' });

      expect(handle.mock.calls.map((c) => (c[1] as GmailMessage).id).sort()).toEqual(['r1', 'r2']);
      expect(credential.gmailHistoryId).toBe('999');
    });

    it('does nothing to diff on a freshly started watch (null baseline) but still advances the id', async () => {
      const credential = buildCredential({ googleEmail: 'me@example.com', gmailHistoryId: null });
      credentials.findByGoogleEmail.mockResolvedValue(credential);
      const handle = spyHandleMessage();

      await service.handlePushNotification({ emailAddress: 'me@example.com', historyId: '250' });

      expect(oauth.authorizedGoogleFetch).not.toHaveBeenCalled();
      expect(handle).not.toHaveBeenCalled();
      expect(credential.gmailHistoryId).toBe('250');
    });
  });

  describe('handleMessage — watcher match + pending enqueue + idempotency (via push)', () => {
    let processed: jest.Mocked<Pick<ProcessedGmailMessageRepository, 'exists' | 'record'>>;
    let pending: jest.Mocked<Pick<PendingGmailExpenseService, 'enqueue'>>;
    let svc: GmailService;

    const fetchedMessage: GmailMessage = {
      id: 'm1',
      labelIds: ['L1'],
      payload: {
        mimeType: 'text/plain',
        headers: [
          { name: 'From', value: 'alerts@bank.com' },
          { name: 'Subject', value: 'Debit Alert' },
        ],
        body: { data: Buffer.from('You spent BDT 1,500 at DARAZ').toString('base64url') },
      },
    };

    beforeEach(() => {
      processed = { exists: jest.fn(), record: jest.fn().mockResolvedValue(undefined) };
      pending = { enqueue: jest.fn().mockResolvedValue(undefined) };
      svc = makeService({
        processed: processed as unknown as ProcessedGmailMessageRepository,
        pending: pending as unknown as PendingGmailExpenseService,
      });

      credentials.findByGoogleEmail.mockResolvedValue(buildCredential({ googleEmail: 'me@example.com', gmailHistoryId: '200' }));
      watchers.findManyForUser.mockResolvedValue([buildWatcher({ vaultId: 'vault-9', gmailLabelId: 'L1', guidanceHint: 'always groceries' })]);
      oauth.authorizedGoogleFetch.mockImplementation((_userId, url) => {
        if (/\/history\?/.test(url as string)) return Promise.resolve(jsonResponse(200, { history: [{ messagesAdded: [{ message: { id: 'm1' } }] }] }));
        if (/\/messages\/m1\?/.test(url as string)) return Promise.resolve(jsonResponse(200, fetchedMessage));
        return Promise.reject(new Error(`unexpected url ${String(url)}`));
      });
    });

    it('enqueues exactly one pending expense pointer and notifies when a watcher matches', async () => {
      processed.exists.mockResolvedValue(false);

      await svc.handlePushNotification({ emailAddress: 'me@example.com', historyId: '250' });

      expect(pending.enqueue).toHaveBeenCalledTimes(1);
      expect(pending.enqueue).toHaveBeenCalledWith('user-1', {
        gmailMessageId: 'm1',
        vaultId: 'vault-9',
        subject: 'Debit Alert',
        guidanceHint: 'always groceries',
      });
      expect(processed.record).toHaveBeenCalledWith('user-1', 'm1');
      expect(vaults.findOneForUser).toHaveBeenCalledWith('user-1', 'vault-9');
      expect(push.notify).toHaveBeenCalledWith('user-1', { title: 'Pending expense to review', body: 'A new email in MAIN STASH is ready to review', url: '/transactions' });
    });

    it('enqueues a null subject when the message carries no Subject header', async () => {
      processed.exists.mockResolvedValue(false);
      const noSubject: GmailMessage = { ...fetchedMessage, payload: { ...fetchedMessage.payload, headers: [{ name: 'From', value: 'alerts@bank.com' }] } } as GmailMessage;
      oauth.authorizedGoogleFetch.mockImplementation((_userId, url) => {
        if (/\/history\?/.test(url as string)) return Promise.resolve(jsonResponse(200, { history: [{ messagesAdded: [{ message: { id: 'm1' } }] }] }));
        if (/\/messages\/m1\?/.test(url as string)) return Promise.resolve(jsonResponse(200, noSubject));
        return Promise.reject(new Error(`unexpected url ${String(url)}`));
      });

      await svc.handlePushNotification({ emailAddress: 'me@example.com', historyId: '250' });

      expect(pending.enqueue).toHaveBeenCalledWith('user-1', expect.objectContaining({ subject: null }));
    });

    it('routes a shared label to the watcher whose subject filter matches (specific beats catch-all)', async () => {
      processed.exists.mockResolvedValue(false);
      // Two vaults share label L1; the incoming subject "Debit Alert" contains the
      // specific watcher's filter, so it wins over the catch-all watcher.
      watchers.findManyForUser.mockResolvedValue([
        buildWatcher({ vaultId: 'vault-catchall', gmailLabelId: 'L1', subjectFilter: null }),
        buildWatcher({ vaultId: 'vault-debit', gmailLabelId: 'L1', subjectFilter: 'debit' }),
      ]);

      await svc.handlePushNotification({ emailAddress: 'me@example.com', historyId: '250' });

      expect(pending.enqueue).toHaveBeenCalledWith('user-1', expect.objectContaining({ vaultId: 'vault-debit' }));
    });

    it('falls back to the catch-all watcher when no subject filter matches', async () => {
      processed.exists.mockResolvedValue(false);
      watchers.findManyForUser.mockResolvedValue([
        buildWatcher({ vaultId: 'vault-salary', gmailLabelId: 'L1', subjectFilter: 'salary' }),
        buildWatcher({ vaultId: 'vault-catchall', gmailLabelId: 'L1', subjectFilter: null }),
      ]);

      await svc.handlePushNotification({ emailAddress: 'me@example.com', historyId: '250' });

      expect(pending.enqueue).toHaveBeenCalledWith('user-1', expect.objectContaining({ vaultId: 'vault-catchall' }));
    });

    it('records but does not enqueue when a subject filter is set but the subject does not match (no catch-all)', async () => {
      processed.exists.mockResolvedValue(false);
      watchers.findManyForUser.mockResolvedValue([buildWatcher({ vaultId: 'vault-salary', gmailLabelId: 'L1', subjectFilter: 'salary' })]);

      await svc.handlePushNotification({ emailAddress: 'me@example.com', historyId: '250' });

      expect(pending.enqueue).not.toHaveBeenCalled();
      expect(processed.record).toHaveBeenCalledWith('user-1', 'm1');
    });

    it('records but does not enqueue when no watcher label matches the message', async () => {
      processed.exists.mockResolvedValue(false);
      watchers.findManyForUser.mockResolvedValue([buildWatcher({ gmailLabelId: 'OTHER' })]);

      await svc.handlePushNotification({ emailAddress: 'me@example.com', historyId: '250' });

      expect(pending.enqueue).not.toHaveBeenCalled();
      expect(processed.record).toHaveBeenCalledWith('user-1', 'm1');
    });

    it('skips a message already in the ledger (replay) without enqueueing a pending expense', async () => {
      processed.exists.mockResolvedValue(true);

      await svc.handlePushNotification({ emailAddress: 'me@example.com', historyId: '250' });

      expect(pending.enqueue).not.toHaveBeenCalled();
      expect(processed.record).not.toHaveBeenCalled();
    });
  });
});
