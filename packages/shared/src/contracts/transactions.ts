import { TagDto } from './tags';

export type TransactionType = 'expense' | 'income' | 'transfer';

export interface ListTransactionsQuery {
  month?: number;
  year?: number;
  period?: 'all';
}

export interface CreateTransactionInput {
  amount: number;
  type?: TransactionType;
  tagIds?: string[];
  title?: string | null;
  vaultId?: string | null;
  date?: string;
}

export interface CreateTransferInput extends CreateTransactionInput {
  targetVaultId: string;
}

export interface UpdateTransactionInput {
  amount?: number;
  type?: TransactionType;
  tagIds?: string[];
  title?: string | null;
  vaultId?: string | null;
  date?: string;
}

export interface TransactionDto {
  id: string;
  userId: string;
  title: string | null;
  amount: number;
  type: TransactionType;
  date: string;
  vaultId: string | null;
  vault: { id: string; name: string; icon: string | null } | null;
  tags: TagDto[];
  /**
   * @deprecated The backing `expenses.isCommitted` column was dropped: Gmail
   * expenses now go through the `pending_gmail_expenses` review queue and are
   * applied directly, so no transaction is ever uncommitted. Always `true`.
   * Retained only so the UI keeps compiling; remove with the UI cleanup.
   */
  isCommitted: boolean;
  createdAt: string;
  updatedAt: string;
}
