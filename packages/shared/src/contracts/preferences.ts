export interface UserPreferenceDto {
  showIncome: boolean;
  showExpense: boolean;
  pushEnabled: boolean;
  aiTransactionEntryEnabled: boolean;
}

export interface UpdateUserPreferenceInput {
  showIncome?: boolean;
  showExpense?: boolean;
  pushEnabled?: boolean;
  aiTransactionEntryEnabled?: boolean;
}
