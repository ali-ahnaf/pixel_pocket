import type { PendingGmailExpense } from '../entities/PendingGmailExpense.entity';
import type { Vault } from '../entities/Vault.entity';
import type { PendingGmailExpenseRepository, PendingGmailExpenseFields } from '../repositories/pending-gmail-expense.repository';
import type { UserOAuthCredentialService } from '../services/user-oauth-credential.service';
import { AppError } from '../errors/app-error';
import { GMAIL_API_BASE, GmailMessage } from '../services/gmail.service';
import { PendingGmailExpenseService } from '../services/pending-gmail-expense.service';

jest.mock('../services', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

type PendingRepositoryMock = jest.Mocked<Pick<PendingGmailExpenseRepository, 'findManyForUser' | 'findByIdForUser' | 'insertIfNotExists' | 'softDelete'>>;
type OAuthMock = jest.Mocked<Pick<UserOAuthCredentialService, 'authorizedGoogleFetch'>>;

const buildVault = (overrides: Partial<Vault> = {}): Vault =>
  ({
    id: 'vault-1',
    name: 'MAIN STASH',
    ...overrides,
  }) as Vault;

const buildRow = (overrides: Partial<PendingGmailExpense> = {}): PendingGmailExpense =>
  ({
    id: 'pending-1',
    userId: 'user-1',
    gmailMessageId: 'gmail-msg-1',
    vaultId: 'vault-1',
    subject: 'Debit Alert',
    guidanceHint: 'always groceries',
    vault: buildVault(),
    ...overrides,
  }) as PendingGmailExpense;

const jsonResponse = (status: number, body: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

const buildGmailMessage = (overrides: Partial<GmailMessage> = {}): GmailMessage =>
  ({
    id: 'gmail-msg-1',
    labelIds: ['L1'],
    payload: {
      mimeType: 'text/plain',
      headers: [
        { name: 'From', value: 'alerts@bank.com' },
        { name: 'Subject', value: 'Debit Alert' },
        { name: 'Date', value: '2026-07-12T00:00:00.000Z' },
      ],
      body: { data: Buffer.from('You spent BDT 1,500 at DARAZ').toString('base64url') },
    },
    ...overrides,
  }) as GmailMessage;

describe('PendingGmailExpenseService', () => {
  let pending: PendingRepositoryMock;
  let oauth: OAuthMock;
  let service: PendingGmailExpenseService;

  beforeEach(() => {
    pending = {
      findManyForUser: jest.fn(),
      findByIdForUser: jest.fn(),
      insertIfNotExists: jest.fn(),
      softDelete: jest.fn(),
    };
    oauth = { authorizedGoogleFetch: jest.fn() };

    service = new PendingGmailExpenseService(pending as unknown as PendingGmailExpenseRepository, oauth as unknown as UserOAuthCredentialService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('list', () => {
    it('maps pending rows to PendingGmailExpenseDto, taking vaultName from the loaded vault relation and the stored subject', async () => {
      const rows = [buildRow({ vault: buildVault({ name: 'GROCERIES' }) })];
      pending.findManyForUser.mockResolvedValue(rows);

      const result = await service.list('user-1');

      expect(pending.findManyForUser).toHaveBeenCalledWith('user-1');
      expect(result).toEqual([
        {
          id: 'pending-1',
          gmailMessageId: 'gmail-msg-1',
          vaultId: 'vault-1',
          vaultName: 'GROCERIES',
          subject: 'Debit Alert',
          guidanceHint: 'always groceries',
        },
      ]);
    });

    it('maps a row stored before subjects were captured to a null subject', async () => {
      pending.findManyForUser.mockResolvedValue([buildRow({ subject: null })]);

      const result = await service.list('user-1');

      expect(result[0].subject).toBeNull();
    });

    it('falls back to "Unknown vault" when the vault relation is missing', async () => {
      pending.findManyForUser.mockResolvedValue([buildRow({ vault: undefined })]);

      const result = await service.list('user-1');

      expect(result[0].vaultName).toBe('Unknown vault');
    });

    it('returns an empty array when the user has no pending rows', async () => {
      pending.findManyForUser.mockResolvedValue([]);

      const result = await service.list('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('getEmail', () => {
    it('re-fetches the message from Gmail via the OAuth dependency and returns a PendingExpenseEmailDto, persisting nothing', async () => {
      const row = buildRow();
      pending.findByIdForUser.mockResolvedValue(row);
      oauth.authorizedGoogleFetch.mockResolvedValue(jsonResponse(200, buildGmailMessage()));

      const result = await service.getEmail('user-1', 'pending-1');

      expect(pending.findByIdForUser).toHaveBeenCalledWith('user-1', 'pending-1');
      expect(oauth.authorizedGoogleFetch).toHaveBeenCalledWith('user-1', `${GMAIL_API_BASE}/messages/gmail-msg-1?format=full`);
      expect(result).toEqual({
        from: 'alerts@bank.com',
        subject: 'Debit Alert',
        bodyText: 'You spent BDT 1,500 at DARAZ',
        emailDate: '2026-07-12T00:00:00.000Z',
      });

      // Critical: this method must never write anything — it only re-fetches and returns.
      expect(pending.insertIfNotExists).not.toHaveBeenCalled();
      expect(pending.softDelete).not.toHaveBeenCalled();
    });

    it('falls back to the current time when the message has no date header or internalDate', async () => {
      const row = buildRow();
      pending.findByIdForUser.mockResolvedValue(row);
      oauth.authorizedGoogleFetch.mockResolvedValue(
        jsonResponse(
          200,
          buildGmailMessage({
            payload: {
              mimeType: 'text/plain',
              headers: [
                { name: 'From', value: 'alerts@bank.com' },
                { name: 'Subject', value: 'Debit Alert' },
              ],
              body: { data: Buffer.from('body').toString('base64url') },
            },
          }),
        ),
      );

      const result = await service.getEmail('user-1', 'pending-1');

      expect(() => new Date(result.emailDate)).not.toThrow();
      expect(Number.isNaN(new Date(result.emailDate).getTime())).toBe(false);

      expect(pending.insertIfNotExists).not.toHaveBeenCalled();
      expect(pending.softDelete).not.toHaveBeenCalled();
    });

    it('throws a 404 AppError when the pending row does not exist or is not owned by the user', async () => {
      pending.findByIdForUser.mockResolvedValue(null);

      await expect(service.getEmail('user-1', 'missing-id')).rejects.toMatchObject({
        constructor: AppError,
        statusCode: 404,
        message: 'Pending expense not found',
      });

      expect(oauth.authorizedGoogleFetch).not.toHaveBeenCalled();
      expect(pending.insertIfNotExists).not.toHaveBeenCalled();
      expect(pending.softDelete).not.toHaveBeenCalled();
    });

    it('throws a 502 AppError when the Gmail re-fetch fails', async () => {
      pending.findByIdForUser.mockResolvedValue(buildRow());
      oauth.authorizedGoogleFetch.mockResolvedValue(jsonResponse(403, { error: 'forbidden' }));

      await expect(service.getEmail('user-1', 'pending-1')).rejects.toMatchObject({
        constructor: AppError,
        statusCode: 502,
        message: 'Gmail messages.get failed: HTTP 403',
      });

      expect(pending.insertIfNotExists).not.toHaveBeenCalled();
      expect(pending.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('enqueue', () => {
    const fields: PendingGmailExpenseFields = {
      gmailMessageId: 'gmail-msg-1',
      vaultId: 'vault-1',
      subject: 'Debit Alert',
      guidanceHint: 'always groceries',
    };

    it('inserts the pointer via the repository on first enqueue', async () => {
      pending.insertIfNotExists.mockResolvedValue(buildRow());

      await service.enqueue('user-1', fields);

      expect(pending.insertIfNotExists).toHaveBeenCalledWith('user-1', fields);
      expect(pending.insertIfNotExists).toHaveBeenCalledTimes(1);
    });

    it('is idempotent: replaying the same (userId, gmailMessageId) results in only one row ever created', async () => {
      // The repository owns idempotency (`insertIfNotExists` checks for an existing
      // row, including soft-deleted ones, before inserting) — it reports back `null`
      // when a row already exists, and the service must simply no-op in that case.
      pending.insertIfNotExists.mockResolvedValueOnce(buildRow()).mockResolvedValueOnce(null);

      await service.enqueue('user-1', fields);
      await service.enqueue('user-1', fields);

      expect(pending.insertIfNotExists).toHaveBeenCalledTimes(2);
      expect(pending.insertIfNotExists).toHaveBeenNthCalledWith(1, 'user-1', fields);
      expect(pending.insertIfNotExists).toHaveBeenNthCalledWith(2, 'user-1', fields);
    });

    it('does not throw when the repository reports the row already exists', async () => {
      pending.insertIfNotExists.mockResolvedValue(null);

      await expect(service.enqueue('user-1', fields)).resolves.toBeUndefined();
    });
  });

  describe('resolve', () => {
    it('soft-deletes the pending row scoped to the given userId', async () => {
      pending.findByIdForUser.mockResolvedValue(buildRow());
      pending.softDelete.mockResolvedValue(undefined);

      await service.resolve('user-1', 'pending-1');

      expect(pending.findByIdForUser).toHaveBeenCalledWith('user-1', 'pending-1');
      expect(pending.softDelete).toHaveBeenCalledWith('user-1', 'pending-1');
      expect(pending.softDelete).toHaveBeenCalledTimes(1);
    });

    it('does not scope the soft-delete to a different user than the one requesting it', async () => {
      pending.findByIdForUser.mockResolvedValue(buildRow({ userId: 'user-1' }));
      pending.softDelete.mockResolvedValue(undefined);

      await service.resolve('user-1', 'pending-1');

      expect(pending.softDelete).not.toHaveBeenCalledWith('some-other-user', 'pending-1');
    });

    it('throws a 404 AppError when the pending row does not exist or is not owned by the user', async () => {
      pending.findByIdForUser.mockResolvedValue(null);

      await expect(service.resolve('user-1', 'missing-id')).rejects.toMatchObject({
        constructor: AppError,
        statusCode: 404,
        message: 'Pending expense not found',
      });

      expect(pending.softDelete).not.toHaveBeenCalled();
    });
  });
});
