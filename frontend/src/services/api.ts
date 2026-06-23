const API_BASE = '';

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;
  files?: { filename: string; originalName: string; path: string }[];
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost: number;
}

export type ModelOption = {
  provider: string;
  model: string;
  label: string;
};

// ---- Agents ----

export interface Agent {
  id: string;
  name: string;
  description: string;
  icon: string;
  icon_bg_color: string;
  icon_color: string;
  category: string;
  system_prompt: string;
  welcome_message: string;
  suggestions: string[];
  knowledge_files: string[];
  default_model: string;
  default_provider: string;
  department_id: string;
  skills: string[];
  knowledge_ids: string[];
  created_at: string;
  updated_at: string;
}

export async function fetchAgents(category?: string): Promise<Agent[]> {
  const url = category
    ? `${API_BASE}/api/agents/?category=${category}`
    : `${API_BASE}/api/agents/`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error('获取智能体列表失败');
  return res.json();
}

export async function fetchAgent(agentId: string): Promise<Agent> {
  const res = await fetch(`${API_BASE}/api/agents/${agentId}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('获取智能体详情失败');
  return res.json();
}

export async function createAgent(agent: Omit<Agent, 'id' | 'created_at' | 'updated_at'>): Promise<Agent> {
  const res = await fetch(`${API_BASE}/api/agents/`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(agent),
  });
  if (!res.ok) throw new Error('创建智能体失败');
  return res.json();
}

export async function updateAgent(id: string, agent: Omit<Agent, 'id' | 'created_at' | 'updated_at'>): Promise<Agent> {
  const res = await fetch(`${API_BASE}/api/agents/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(agent),
  });
  if (!res.ok) throw new Error('更新智能体失败');
  return res.json();
}

export async function deleteAgent(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/agents/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('删除智能体失败');
}

// ---- Skills ----

export interface SkillStructure {
  skill_md: boolean;
  references: string[];
  scripts: string[];
  assets: string[];
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  structure: SkillStructure;
}

export async function fetchSkills(): Promise<Skill[]> {
  const res = await fetch(`${API_BASE}/api/skills/`, { headers: authHeaders() });
  if (!res.ok) throw new Error('获取Skill列表失败');
  return res.json();
}

export async function fetchSkill(id: string): Promise<Skill> {
  const res = await fetch(`${API_BASE}/api/skills/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('获取Skill详情失败');
  return res.json();
}

export async function createSkill(data: { name: string; description: string }): Promise<Skill> {
  const res = await fetch(`${API_BASE}/api/skills/`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('创建Skill失败');
  return res.json();
}

export async function updateSkill(
  id: string,
  data: { name?: string; description?: string; skill_md?: string },
): Promise<Skill> {
  const res = await fetch(`${API_BASE}/api/skills/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('更新Skill失败');
  return res.json();
}

export async function deleteSkill(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/skills/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('删除Skill失败');
}

export async function fetchSkillFile(id: string, path: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/skills/${id}/files?path=${encodeURIComponent(path)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('获取Skill文件失败');
  const data = await res.json();
  return data.content || '';
}

export async function uploadSkillFile(id: string, subdir: string, file: File): Promise<{ status: string; path: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/api/skills/${id}/upload?subdir=${encodeURIComponent(subdir)}`, {
    method: 'POST',
    headers,
    body: formData,
  });
  if (!res.ok) throw new Error('上传Skill文件失败');
  return res.json();
}

export async function updateSkillFile(id: string, path: string, content: string): Promise<void> {
  const formData = new FormData();
  formData.append('content', content);
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/api/skills/${id}/files?path=${encodeURIComponent(path)}`, {
    method: 'POST',
    headers,
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '保存文件失败' }));
    throw new Error(typeof err.detail === 'string' ? err.detail : '保存文件失败');
  }
}

export async function deleteSkillFile(id: string, path: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/skills/${id}/files?path=${encodeURIComponent(path)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('删除Skill文件失败');
}

export async function fetchSkillsBatchContent(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const res = await fetch(`${API_BASE}/api/skills/batch-content`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ skill_ids: ids }),
  });
  if (!res.ok) throw new Error('批量获取Skill内容失败');
  const data = await res.json();
  return data.contents || {};
}

export async function importSkillFolder(
  name: string,
  description: string,
  files: { file: File; path: string }[],
): Promise<Skill> {
  const formData = new FormData();
  formData.append('name', name);
  formData.append('description', description);
  files.forEach(({ file, path }) => {
    formData.append('files', file);
    formData.append('paths', path);
  });
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/api/skills/import-folder`, {
    method: 'POST',
    headers,
    body: formData,
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({ detail: '导入失败' }));
    let detail: string;
    if (typeof errData.detail === 'string') {
      detail = errData.detail;
    } else if (errData.detail) {
      detail = JSON.stringify(errData.detail);
    } else {
      detail = JSON.stringify(errData);
    }
    throw new Error(detail || '导入Skill文件夹失败');
  }
  return res.json();
}

// ---- Knowledge ----

export interface PendingCellInfo {
  row: number;
  col: number;
  text: string;
  submitted_by: string;
  submitted_by_name: string;
  created_at: string;
}

export interface Knowledge {
  id: string;
  title: string;
  content: string;
  tags: string[];
  format: string;
  columns: string[];
  rows: string[][];
  skip_review: boolean;
  pending_cells: PendingCellInfo[];
  created_at: string;
  updated_at: string;
}

export async function fetchKnowledges(): Promise<Knowledge[]> {
  const res = await fetch(`${API_BASE}/api/knowledge/`, { headers: authHeaders() });
  if (!res.ok) throw new Error('获取知识库列表失败');
  return res.json();
}

export async function fetchKnowledge(id: string): Promise<Knowledge> {
  const res = await fetch(`${API_BASE}/api/knowledge/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('获取知识库条目失败');
  return res.json();
}

export async function createKnowledge(data: { title: string; content: string; tags: string[]; format?: string; columns?: string[]; rows?: string[][]; skip_review?: boolean }): Promise<Knowledge> {
  const res = await fetch(`${API_BASE}/api/knowledge/`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('创建知识库条目失败');
  return res.json();
}

export async function updateKnowledge(id: string, data: { title: string; content: string; tags: string[]; format?: string; columns?: string[]; rows?: string[][]; skip_review?: boolean }): Promise<Knowledge> {
  const res = await fetch(`${API_BASE}/api/knowledge/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('更新知识库条目失败');
  return res.json();
}

export async function updateKnowledgeContent(id: string, data: { title?: string; content?: string; rows?: string[][] }): Promise<Knowledge> {
  const res = await fetch(`${API_BASE}/api/knowledge/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    let msg = '更新内容失败';
    try { const err = await res.json(); if (err.detail) msg = err.detail; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export async function deleteKnowledge(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/knowledge/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('删除知识库条目失败');
}

// ---- Knowledge Submissions ----

export interface KnowledgeSubmission {
  id: string;
  selected_text: string;
  title: string;
  tags: string[];
  action_type: string;
  target_kb_id: string | null;
  target_row: number;
  target_column: number;
  row_values: string[];
  status: string;
  submitted_by: string;
  submitted_by_name: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  created_at: string;
  updated_at: string;
}

export async function createSubmission(data: { selected_text: string; title?: string; tags?: string[]; action_type: string; target_kb_id?: string; target_row?: number; target_column?: number; row_values?: string[] }): Promise<KnowledgeSubmission> {
  const res = await fetch(`${API_BASE}/api/knowledge-submissions/`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '提交失败' }));
    throw new Error(err.detail || '提交失败');
  }
  return res.json();
}

export async function fetchSubmissions(status?: string): Promise<KnowledgeSubmission[]> {
  const url = status ? `${API_BASE}/api/knowledge-submissions/?status=${status}` : `${API_BASE}/api/knowledge-submissions/`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error('获取提交列表失败');
  return res.json();
}

export async function fetchPendingReviewCount(): Promise<number> {
  const res = await fetch(`${API_BASE}/api/knowledge-submissions/pending-count`, { headers: authHeaders() });
  if (!res.ok) throw new Error('获取待审核数量失败');
  const data = await res.json();
  return data.count;
}

export async function fetchMySubmissions(): Promise<KnowledgeSubmission[]> {
  const res = await fetch(`${API_BASE}/api/knowledge-submissions/my`, { headers: authHeaders() });
  if (!res.ok) throw new Error('获取我的提交失败');
  return res.json();
}

export async function approveSubmission(id: string): Promise<KnowledgeSubmission> {
  const res = await fetch(`${API_BASE}/api/knowledge-submissions/${id}/approve`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('审核通过失败');
  return res.json();
}

export async function rejectSubmission(id: string, reason: string): Promise<KnowledgeSubmission> {
  const res = await fetch(`${API_BASE}/api/knowledge-submissions/${id}/reject`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error('审核拒绝失败');
  return res.json();
}

export function uploadFile(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<{ filename: string; path: string; size: number }> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/api/upload/`);
    const token = localStorage.getItem('token');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      console.log('[uploadFile] onload status=', xhr.status, 'response=', xhr.responseText?.slice(0, 200));
      if (xhr.status >= 200 && xhr.status < 300) {
        const parsed = JSON.parse(xhr.responseText);
        console.log('[uploadFile] parsed:', parsed);
        resolve(parsed);
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.detail || '上传失败'));
        } catch {
          reject(new Error(`上传失败 (${xhr.status})`));
        }
      }
    };
    xhr.onerror = () => {
      console.error('[uploadFile] onerror - network failure');
      reject(new Error('网络连接失败'));
    };
    xhr.ontimeout = () => {
      console.error('[uploadFile] ontimeout');
      reject(new Error('上传超时'));
    };
    xhr.timeout = 120000;
    console.log('[uploadFile] sending file:', file.name, 'size:', file.size, 'type:', file.type);
    xhr.send(formData);
  });
}

// ---- Settings ----

export interface ProviderConfig {
  api_key: string;
  base_url: string;
  enabled: boolean;
}

export interface AppSettings {
  providers: Record<string, ProviderConfig>;
  default_provider: string;
  default_model: string;
  temperature: number;
  max_tokens: number;
  custom_models?: ModelInfo[];
  memory_dir?: string;
  recycle_bin_days?: number;
}

export interface ModelInfo {
  provider: string;
  model: string;
  label: string;
  max_tokens: number;
  builtin?: boolean;
  id?: string;
  base_url?: string;
  api_key?: string;
  headers?: Record<string, string>;
}

export async function fetchSettings(): Promise<AppSettings> {
  const res = await fetch(`${API_BASE}/api/settings`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('获取设置失败');
  return res.json();
}

export async function saveSettings(data: AppSettings): Promise<void> {
  const res = await fetch(`${API_BASE}/api/settings`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('保存设置失败');
}

export async function fetchModelsCatalog(): Promise<ModelInfo[]> {
  const res = await fetch(`${API_BASE}/api/settings/models`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('获取模型列表失败');
  return res.json();
}

export async function addCustomModel(model: Omit<ModelInfo, 'builtin' | 'id'>): Promise<ModelInfo> {
  const res = await fetch(`${API_BASE}/api/settings/models/custom`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(model),
  });
  if (!res.ok) throw new Error('添加模型失败');
  return res.json();
}

export async function updateCustomModel(id: string, model: Omit<ModelInfo, 'builtin' | 'id'>): Promise<ModelInfo> {
  const res = await fetch(`${API_BASE}/api/settings/models/custom/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(model),
  });
  if (!res.ok) throw new Error('更新模型失败');
  return res.json();
}

export async function deleteCustomModel(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/settings/models/custom/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('删除模型失败');
}

export async function testModelConnection(config: {
  provider: string;
  model: string;
  api_key: string;
  base_url?: string;
  headers?: Record<string, string>;
}): Promise<{ status: string; message: string; preview?: string }> {
  const res = await fetch(`${API_BASE}/api/settings/models/test`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(config),
  });
  return res.json();
}

// ---- Search ----

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export async function searchWeb(query: string, maxResults = 5): Promise<SearchResult[]> {
  const res = await fetch(`${API_BASE}/api/search/`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ query, max_results: maxResults }),
  });
  if (!res.ok) throw new Error('搜索失败');
  return res.json();
}

// ---- Chat ----

export function createChatStream(
  messages: ChatMessage[],
  model: string,
  provider: string,
  systemPrompt?: string,
  apiKey?: string,
  baseUrl?: string,
  customHeaders?: Record<string, string>,
  searchResults?: SearchResult[],
  knowledgeIds?: string[],
  selectedKbIds?: string[],
  onChunk: (text: string) => void = () => {},
  onUsage: (usage: TokenUsage) => void = () => {},
  onDone: () => void = () => {},
  onError: (error: string) => void = () => {},
  onThinking: (text: string) => void = () => {},
): () => void {
  const controller = new AbortController();
  let doneCalled = false;

  const safeDone = () => {
    if (!doneCalled) {
      doneCalled = true;
      onDone();
    }
  };

  const safeError = (msg: string) => {
    if (!doneCalled) {
      doneCalled = true;
      onError(msg);
    }
  };

  // Safety timeout: 300s with no data = abort (longer for vision requests)
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const resetTimeout = () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      controller.abort();
      safeError('响应超时，请重试');
    }, 300000);
  };
  resetTimeout();

  (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/chat/completions`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          messages,
          model,
          provider,
          system_prompt: systemPrompt,
          api_key: apiKey || undefined,
          base_url: baseUrl || undefined,
          headers: customHeaders || undefined,
          search_results: searchResults || undefined,
          knowledge_ids: knowledgeIds || undefined,
          selected_kb_ids: selectedKbIds || undefined,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: '请求失败' }));
        safeError(err.detail || `请求失败 (${res.status})`);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        safeError('无法读取响应流');
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let finished = false;

      const processLine = (line: string) => {
        if (!line.startsWith('data: ')) return;
        const data = line.slice(6);
        if (data === '[DONE]') {
          finished = true;
          return;
        }
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content' && parsed.content) {
            resetTimeout();
            onChunk(parsed.content);
          } else if (parsed.type === 'thinking' && parsed.content) {
            resetTimeout();
            onThinking(parsed.content);
          } else if (parsed.type === 'usage' && parsed.usage) {
            onUsage(parsed.usage);
          } else if (parsed.type === 'error') {
            safeError(parsed.content || '请求失败');
            finished = true;
          }
        } catch {
          // skip invalid JSON
        }
      };

      while (!finished) {
        const { done, value } = await reader.read();
        if (done) {
          buffer += decoder.decode();
          for (const line of buffer.split('\n')) {
            if (line.trim()) processLine(line);
          }
          break;
        }

        resetTimeout();
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          processLine(line);
          if (finished) break;
        }
      }

      safeDone();
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        safeDone();
        return;
      }
      if (err instanceof TypeError && err.message === 'Failed to fetch') {
        safeError('网络连接失败，请检查后端服务是否启动');
      } else {
        safeError(err instanceof Error ? err.message : '未知错误');
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  })();

  return () => controller.abort();
}

// ---- Conversations ----

export interface ConversationSummary {
  id: string;
  agent_id: string;
  title: string;
  model: string;
  provider: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  agent_id: string;
  title: string;
  model: string;
  provider: string;
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
}

export async function fetchConversations(agentId?: string): Promise<ConversationSummary[]> {
  const url = agentId
    ? `${API_BASE}/api/conversations/?agent_id=${agentId}`
    : `${API_BASE}/api/conversations/`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error('获取对话列表失败');
  return res.json();
}

export async function fetchConversation(id: string): Promise<Conversation> {
  const res = await fetch(`${API_BASE}/api/conversations/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('获取对话详情失败');
  return res.json();
}

export async function createConversation(data: {
  agent_id: string;
  title?: string;
  model?: string;
  provider?: string;
  messages?: ChatMessage[];
}): Promise<Conversation> {
  const res = await fetch(`${API_BASE}/api/conversations/`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('创建对话失败');
  return res.json();
}

export async function updateConversation(id: string, data: {
  title?: string;
  messages?: ChatMessage[];
  model?: string;
  provider?: string;
}): Promise<Conversation> {
  const res = await fetch(`${API_BASE}/api/conversations/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('更新对话失败');
  return res.json();
}

export async function deleteConversation(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/conversations/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('删除对话失败');
}

// ---- Admin Conversations ----

export interface AdminConversationSummary {
  id: string;
  user_id: string;
  user_display_name: string;
  agent_id: string;
  agent_name: string;
  title: string;
  model: string;
  provider: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface TopTopic {
  topic: string;
  frequency: string;
  example_queries: string[];
}

export interface SuggestedNewSkill {
  name: string;
  description: string;
  rationale: string;
}

export interface ExistingSkillIssue {
  skill_name: string;
  issue: string;
  suggestion: string;
}

export interface ConversationAnalyzeResponse {
  summary: string;
  top_topics: TopTopic[];
  suggested_new_skills: SuggestedNewSkill[];
  existing_skill_issues: ExistingSkillIssue[];
  overall_direction: string;
}

export interface ConversationCreateSkillResponse {
  skill_id: string;
  name: string;
  skill_md_preview: string;
}

export async function createSkillFromConversations(data: {
  conversation_ids: string[];
  name?: string;
  description?: string;
  model?: string;
  provider?: string;
  api_key?: string;
  base_url?: string;
}): Promise<ConversationCreateSkillResponse> {
  const res = await fetch(`${API_BASE}/api/admin/conversations/create-skill`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '创建 Skill 失败' }));
    throw new Error(err.detail || '创建 Skill 失败');
  }
  return res.json();
}

export async function fetchSkillCreatorContext(): Promise<{ content: string }> {
  const res = await fetch(`${API_BASE}/api/admin/conversations/skill-creator-context`, { headers: authHeaders() });
  if (!res.ok) throw new Error('获取 Skill Creator 上下文失败');
  return res.json();
}

export async function fetchAdminConversations(params?: { user_id?: string; agent_id?: string; keyword?: string }): Promise<AdminConversationSummary[]> {
  const search = new URLSearchParams();
  if (params?.user_id) search.set('user_id', params.user_id);
  if (params?.agent_id) search.set('agent_id', params.agent_id);
  if (params?.keyword) search.set('keyword', params.keyword);
  const qs = search.toString();
  const url = `${API_BASE}/api/admin/conversations/${qs ? '?' + qs : ''}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error('获取对话列表失败');
  return res.json();
}

export async function fetchAdminConversation(id: string): Promise<Conversation & { user_display_name: string }> {
  const res = await fetch(`${API_BASE}/api/admin/conversations/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('获取对话详情失败');
  return res.json();
}

export async function deleteAdminConversation(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/admin/conversations/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('删除对话失败');
}

export async function fetchAdminConversationUsers(): Promise<{ id: string; display_name: string }[]> {
  const res = await fetch(`${API_BASE}/api/admin/conversations/users/list`, { headers: authHeaders() });
  if (!res.ok) throw new Error('获取用户列表失败');
  return res.json();
}

export async function fetchAdminConversationAgents(): Promise<{ id: string; name: string }[]> {
  const res = await fetch(`${API_BASE}/api/admin/conversations/agents/list`, { headers: authHeaders() });
  if (!res.ok) throw new Error('获取智能体列表失败');
  return res.json();
}

export async function analyzeConversations(data: {
  scope: string;
  target_id?: string;
  model?: string;
  provider?: string;
  api_key?: string;
  base_url?: string;
}): Promise<ConversationAnalyzeResponse> {
  const res = await fetch(`${API_BASE}/api/admin/conversations/analyze`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '分析失败' }));
    throw new Error(err.detail || '分析失败');
  }
  return res.json();
}

export async function analyzeSelectedConversations(data: {
  conversation_ids: string[];
  model?: string;
  provider?: string;
  api_key?: string;
  base_url?: string;
}): Promise<ConversationAnalyzeResponse> {
  const res = await fetch(`${API_BASE}/api/admin/conversations/analyze-selected`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '分析失败' }));
    throw new Error(err.detail || '分析失败');
  }
  return res.json();
}

// ---- Auth ----

export interface User {
  id: string;
  username: string;
  display_name: string;
  email: string;
  phone: string;
  role_id: string;
  department_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function fetchCurrentUser(): Promise<User> {
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('获取用户信息失败');
  return res.json();
}

// ---- Departments ----

export interface Department {
  id: string;
  name: string;
  description: string;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DepartmentTree extends Department {
  children: DepartmentTree[];
}

export async function fetchDepartments(tree = false): Promise<Department[] | DepartmentTree[]> {
  const url = tree ? `${API_BASE}/api/departments/?tree=true` : `${API_BASE}/api/departments/`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error('获取部门列表失败');
  return res.json();
}

export async function fetchDepartment(id: string): Promise<Department> {
  const res = await fetch(`${API_BASE}/api/departments/${id}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('获取部门详情失败');
  return res.json();
}

export async function createDepartment(data: Omit<Department, 'id' | 'created_at' | 'updated_at'>): Promise<Department> {
  const res = await fetch(`${API_BASE}/api/departments/`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('创建部门失败');
  return res.json();
}

export async function updateDepartment(id: string, data: Omit<Department, 'id' | 'created_at' | 'updated_at'>): Promise<Department> {
  const res = await fetch(`${API_BASE}/api/departments/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('更新部门失败');
  return res.json();
}

export async function deleteDepartment(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/departments/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('删除部门失败');
}

// ---- Roles ----

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  created_at: string;
  updated_at: string;
}

export async function fetchRoles(): Promise<Role[]> {
  const res = await fetch(`${API_BASE}/api/roles/`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('获取角色列表失败');
  return res.json();
}

export async function fetchRole(id: string): Promise<Role> {
  const res = await fetch(`${API_BASE}/api/roles/${id}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('获取角色详情失败');
  return res.json();
}

export async function createRole(data: Omit<Role, 'id' | 'created_at' | 'updated_at'>): Promise<Role> {
  const res = await fetch(`${API_BASE}/api/roles/`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '创建角色失败' }));
    throw new Error(err.detail || '创建角色失败');
  }
  return res.json();
}

export async function updateRole(id: string, data: Omit<Role, 'id' | 'created_at' | 'updated_at'>): Promise<Role> {
  const res = await fetch(`${API_BASE}/api/roles/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '更新角色失败' }));
    throw new Error(err.detail || '更新角色失败');
  }
  return res.json();
}

export async function deleteRole(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/roles/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '删除角色失败' }));
    throw new Error(err.detail || '删除角色失败');
  }
}

// ---- Users ----

export async function fetchUsers(): Promise<User[]> {
  const res = await fetch(`${API_BASE}/api/users/`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('获取用户列表失败');
  return res.json();
}

export async function fetchUser(id: string): Promise<User> {
  const res = await fetch(`${API_BASE}/api/users/${id}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('获取用户详情失败');
  return res.json();
}

export async function createUser(data: { username: string; password: string; display_name?: string; email?: string; phone?: string; role_id?: string; department_id?: string; is_active?: boolean }): Promise<User> {
  const res = await fetch(`${API_BASE}/api/users/`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '创建用户失败' }));
    throw new Error(err.detail || '创建用户失败');
  }
  return res.json();
}

export async function updateUser(id: string, data: { display_name?: string; email?: string; phone?: string; role_id?: string; department_id?: string; is_active?: boolean }): Promise<User> {
  const res = await fetch(`${API_BASE}/api/users/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '更新用户失败' }));
    throw new Error(err.detail || '更新用户失败');
  }
  return res.json();
}

export async function deleteUser(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/users/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '删除用户失败' }));
    throw new Error(err.detail || '删除用户失败');
  }
}

export async function resetUserPassword(id: string, new_password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/users/${id}/reset-password`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ new_password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '重置密码失败' }));
    throw new Error(err.detail || '重置密码失败');
  }
}

// ---- Profile ----

export interface ProfileData extends User {
  role_name: string;
  department_name: string;
}

export async function fetchProfile(): Promise<ProfileData> {
  const res = await fetch(`${API_BASE}/api/auth/profile`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('获取个人信息失败');
  return res.json();
}

export async function updateProfile(data: { display_name?: string; email?: string; phone?: string }): Promise<User> {
  const res = await fetch(`${API_BASE}/api/auth/profile`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('更新个人信息失败');
  return res.json();
}

export async function changePassword(old_password: string, new_password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/auth/change-password`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ old_password, new_password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '修改密码失败' }));
    throw new Error(err.detail || '修改密码失败');
  }
}

// ---- Recycle Bin ----

export interface RecycleBinItem {
  id: string;
  entity_type: string;
  entity_id: string;
  entity_data: Record<string, unknown>;
  entity_name: string;
  deleted_by: string;
  deleted_at: string;
  expires_at: string;
}

export async function fetchRecycleBin(entityType?: string): Promise<RecycleBinItem[]> {
  const url = entityType
    ? `${API_BASE}/api/recycle-bin/?entity_type=${entityType}`
    : `${API_BASE}/api/recycle-bin/`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error('获取回收站列表失败');
  return res.json();
}

export async function restoreRecycleBinItem(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/recycle-bin/${id}/restore`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '恢复失败' }));
    throw new Error(err.detail || '恢复失败');
  }
}

export async function deleteRecycleBinItem(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/recycle-bin/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('永久删除失败');
}

export async function clearRecycleBin(entityType?: string): Promise<void> {
  const url = entityType
    ? `${API_BASE}/api/recycle-bin/?entity_type=${entityType}`
    : `${API_BASE}/api/recycle-bin/`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('清空回收站失败');
}

// ---- Wiki Spaces ----

export interface WikiSpace {
  id: string;
  name: string;
  description: string;
  icon: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export async function fetchWikiSpaces(): Promise<WikiSpace[]> {
  const res = await fetch(`${API_BASE}/api/wiki/spaces`, { headers: authHeaders() });
  if (!res.ok) throw new Error('获取知识空间列表失败');
  return res.json();
}

export async function fetchWikiSpace(id: string): Promise<WikiSpace> {
  const res = await fetch(`${API_BASE}/api/wiki/spaces/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('获取知识空间详情失败');
  return res.json();
}

export async function createWikiSpace(data: { name: string; description?: string; icon?: string }): Promise<WikiSpace> {
  const res = await fetch(`${API_BASE}/api/wiki/spaces`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '创建知识空间失败' }));
    throw new Error(err.detail || '创建知识空间失败');
  }
  return res.json();
}

export async function updateWikiSpace(id: string, data: { name: string; description?: string; icon?: string }): Promise<WikiSpace> {
  const res = await fetch(`${API_BASE}/api/wiki/spaces/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('更新知识空间失败');
  return res.json();
}

export async function deleteWikiSpace(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/wiki/spaces/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('删除知识空间失败');
}

// ---- Wiki Pages ----

export interface WikiPage {
  id: string;
  space_id: string;
  title: string;
  slug: string;
  content: string;
  page_type: string;
  tags: string[];
  source_ids: string[];
  word_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface WikiPageBrief {
  id: string;
  space_id: string;
  title: string;
  slug: string;
  page_type: string;
  tags: string[];
  word_count: number;
  created_at: string;
  updated_at: string;
}

export async function fetchWikiPages(spaceId: string): Promise<WikiPageBrief[]> {
  const res = await fetch(`${API_BASE}/api/wiki/spaces/${spaceId}/pages`, { headers: authHeaders() });
  if (!res.ok) throw new Error('获取页面列表失败');
  return res.json();
}

export async function fetchWikiPage(pageId: string): Promise<WikiPage> {
  const res = await fetch(`${API_BASE}/api/wiki/pages/${pageId}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('获取页面详情失败');
  return res.json();
}

export async function createWikiPage(data: { space_id: string; title: string; content?: string; page_type?: string; tags?: string[]; source_ids?: string[] }): Promise<WikiPage> {
  const res = await fetch(`${API_BASE}/api/wiki/pages`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '创建页面失败' }));
    throw new Error(err.detail || '创建页面失败');
  }
  return res.json();
}

export async function updateWikiPage(pageId: string, data: { space_id: string; title: string; content?: string; page_type?: string; tags?: string[]; source_ids?: string[] }): Promise<WikiPage> {
  const res = await fetch(`${API_BASE}/api/wiki/pages/${pageId}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('更新页面失败');
  return res.json();
}

export async function deleteWikiPage(pageId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/wiki/pages/${pageId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('删除页面失败');
}

// ---- Wiki Sources ----

export interface WikiSource {
  id: string;
  space_id: string;
  title: string;
  content: string;
  source_type: string;
  file_path: string;
  source_metadata: Record<string, unknown>;
  created_by: string;
  created_at: string;
}

export async function fetchWikiSources(spaceId: string): Promise<WikiSource[]> {
  const res = await fetch(`${API_BASE}/api/wiki/spaces/${spaceId}/sources`, { headers: authHeaders() });
  if (!res.ok) throw new Error('获取资料列表失败');
  return res.json();
}

export async function createWikiSource(data: { space_id: string; title: string; content?: string; source_type?: string; file_path?: string; source_metadata?: Record<string, unknown> }): Promise<WikiSource> {
  const res = await fetch(`${API_BASE}/api/wiki/sources`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '添加资料失败' }));
    throw new Error(err.detail || '添加资料失败');
  }
  return res.json();
}

export async function uploadWikiSource(spaceId: string, file: File, onProgress?: (pct: number) => void): Promise<WikiSource> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('space_id', spaceId);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/api/wiki/sources/upload`);
    const token = localStorage.getItem('token');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        try { reject(new Error(JSON.parse(xhr.responseText).detail || '上传失败')); }
        catch { reject(new Error(`上传失败 (${xhr.status})`)); }
      }
    };
    xhr.onerror = () => reject(new Error('网络连接失败'));
    xhr.timeout = 120000;
    xhr.send(formData);
  });
}

export async function deleteWikiSource(sourceId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/wiki/sources/${sourceId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('删除资料失败');
}

export async function downloadWikiSource(sourceId: string, filename: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/wiki/sources/${sourceId}/download`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('下载失败');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- Wiki References ----

export interface WikiPageReference {
  id: string;
  from_page_id: string;
  to_page_id: string;
  context: string;
  created_at: string;
}

export async function fetchWikiPageReferences(pageId: string): Promise<WikiPageReference[]> {
  const res = await fetch(`${API_BASE}/api/wiki/pages/${pageId}/references`, { headers: authHeaders() });
  if (!res.ok) throw new Error('获取交叉引用失败');
  return res.json();
}

// ---- Wiki Log ----

export interface WikiLogEntry {
  id: string;
  space_id: string;
  action: string;
  summary: string;
  detail: string;
  page_ids: string[];
  performed_by: string;
  created_at: string;
}

export async function fetchWikiLogs(spaceId: string): Promise<WikiLogEntry[]> {
  const res = await fetch(`${API_BASE}/api/wiki/spaces/${spaceId}/logs`, { headers: authHeaders() });
  if (!res.ok) throw new Error('获取操作日志失败');
  return res.json();
}

// ---- Wiki AI ----

export interface WikiIngestResult {
  pages: { id: string; title: string; page_type: string }[];
  references_created: number;
  summary: string;
}

export interface WikiQueryResult {
  answer: string;
  citations: { page_id: string; title: string; excerpt: string }[];
}

export interface WikiLintResult {
  issues: { type: string; page_ids: string[]; description: string; severity: string }[];
  summary: string;
}

export interface WikiModelConfig {
  model: string;
  provider: string;
  api_key: string;
  base_url: string;
}

export async function wikiIngest(data: { space_id: string; source_id?: string; content?: string; title?: string } & Partial<WikiModelConfig>): Promise<WikiIngestResult> {
  const res = await fetch(`${API_BASE}/api/wiki/ingest`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'AI 导入失败' }));
    throw new Error(err.detail || 'AI 导入失败');
  }
  return res.json();
}

export async function wikiQuery(data: { space_id: string; question: string } & Partial<WikiModelConfig>): Promise<WikiQueryResult> {
  const res = await fetch(`${API_BASE}/api/wiki/query`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'AI 问答失败' }));
    throw new Error(err.detail || 'AI 问答失败');
  }
  return res.json();
}

export async function wikiLint(data: { space_id: string } & Partial<WikiModelConfig>): Promise<WikiLintResult> {
  const res = await fetch(`${API_BASE}/api/wiki/lint`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'AI 检查失败' }));
    throw new Error(err.detail || 'AI 检查失败');
  }
  return res.json();
}
