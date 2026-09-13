import { api } from './api';
import { toConversation, summarise, type CallRow, type Conversation, type AgentPerformance } from './collections';

/**
 * Loading conversations.
 *
 * The one place that talks to the calls API, so screens deal in `Conversation`
 * rather than in the server's row shape. Replaces `loadTodayBoard`, which
 * returned a fixed sample board describing an ops pipeline that does not exist
 * without dialling.
 */

export interface ConversationFilter {
  outcome?: string[];
  language?: string;
  needsHuman?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ConversationPage {
  rows: Conversation[];
  total: number;
  pages: number;
}

export async function loadConversations(filter: ConversationFilter = {}): Promise<ConversationPage> {
  const data = await api.getCallHistory(filter);
  const rows: Conversation[] = (data.calls || []).map((row: CallRow) => toConversation(row));
  return {
    rows,
    total: data.pagination?.total ?? rows.length,
    pages: data.pagination?.pages ?? 1,
  };
}

/**
 * What Today reports.
 *
 * Deliberately computed from recent calls rather than from a dedicated endpoint:
 * `/auth/dashboard` exists and has always returned zero, because it filters
 * `source: { $ne: 'web' }` while every call this product creates is `'web'`.
 */
export async function loadAgentPerformance(): Promise<{
  performance: AgentPerformance;
  recent: Conversation[];
}> {
  const { rows } = await loadConversations({ limit: 100 });
  return { performance: summarise(rows), recent: rows };
}
