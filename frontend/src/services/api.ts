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

export async function uploadFile(file: File): Promise<{ filename: string; path: string; size: number }> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/api/upload/`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '上传失败' }));
    throw new Error(err.detail || '上传失败');
  }
  return res.json();
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
}

export async function fetchSettings(): Promise<AppSettings> {
  const res = await fetch(`${API_BASE}/api/settings`);
  if (!res.ok) throw new Error('获取设置失败');
  return res.json();
}

export async function saveSettings(data: AppSettings): Promise<void> {
  const res = await fetch(`${API_BASE}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('保存设置失败');
}

export async function fetchModelsCatalog(): Promise<ModelInfo[]> {
  const res = await fetch(`${API_BASE}/api/settings/models`);
  if (!res.ok) throw new Error('获取模型列表失败');
  return res.json();
}

export async function addCustomModel(model: Omit<ModelInfo, 'builtin' | 'id'>): Promise<ModelInfo> {
  const res = await fetch(`${API_BASE}/api/settings/models/custom`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(model),
  });
  if (!res.ok) throw new Error('添加模型失败');
  return res.json();
}

export async function updateCustomModel(id: string, model: Omit<ModelInfo, 'builtin' | 'id'>): Promise<ModelInfo> {
  const res = await fetch(`${API_BASE}/api/settings/models/custom/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(model),
  });
  if (!res.ok) throw new Error('更新模型失败');
  return res.json();
}

export async function deleteCustomModel(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/settings/models/custom/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('删除模型失败');
}

export async function testModelConnection(config: {
  provider: string;
  model: string;
  api_key: string;
  base_url?: string;
}): Promise<{ status: string; message: string; preview?: string }> {
  const res = await fetch(`${API_BASE}/api/settings/models/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
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
  onChunk: (text: string) => void = () => {},
  onUsage: (usage: TokenUsage) => void = () => {},
  onDone: () => void = () => {},
  onError: (error: string) => void = () => {},
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

  // Safety timeout: 120s with no data = abort
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const resetTimeout = () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      controller.abort();
      safeError('响应超时，请重试');
    }, 120000);
  };
  resetTimeout();

  (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          model,
          provider,
          system_prompt: systemPrompt,
          api_key: apiKey || undefined,
          base_url: baseUrl || undefined,
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
      if (err instanceof DOMException && err.name === 'AbortError') return;
      safeError(err instanceof Error ? err.message : '未知错误');
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
  title: string;
  model: string;
  provider: string;
  message_count: number;
  created_at: string;
  updated_at: string;
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
