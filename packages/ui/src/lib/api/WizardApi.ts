// @ts-ignore
import { WizardChatRequest, WizardChatResponse, WizardPromptKey } from '@expense-tracker/shared';
import ApiClient from './ApiClient';

export default class WizardApi extends ApiClient {
  constructor(baseURL: string) {
    super(baseURL);
  }

  // POST /api/users/:userId/wizard/chat — narrates the user's spending as the wizard persona.
  chat(userId: string, promptKey: WizardPromptKey): Promise<WizardChatResponse> {
    const body: WizardChatRequest = { promptKey };
    return this.post<WizardChatResponse>(`/users/${userId}/wizard/chat`, body);
  }
}
