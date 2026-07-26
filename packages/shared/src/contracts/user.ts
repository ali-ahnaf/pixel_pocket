export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  disableAiPrompt?: boolean;
  /** True once the user has finished (or skipped) the onboarding walkthrough. */
  hasOnboarded?: boolean;
}

export interface CreateUserInput {
  name: string;
  email: string;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  avatar?: string;
  disableAiPrompt?: boolean;
  hasOnboarded?: boolean;
}
