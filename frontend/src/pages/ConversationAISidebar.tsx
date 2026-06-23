import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { marked } from 'marked';
import {
  fetchModelsCatalog, fetchSettings, createSkillFromConversations, createChatStream,
  fetchSkillCreatorContext, fetchAdminConversation,
  type ModelInfo, type ChatMessage,
} from '../services/api';
import { useToast } from '../hooks/useToast';
import './ConversationAISidebar.css';

function parseMd(text: string): string {
  if (!text) return '';
  try {
    return marked.parse(text, { async: false, breaks: true }) as string;
  } catch {
    return text.replace(/</g, '&lt;').replace(/\n/g, '<br>');
  }
}

const SIDEBAR_KEY = 'conv_sidebar_open';

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
}

interface Props {
  conversationIds: string[];
  userFilter?: string;
  agentFilter?: string;
  onSkillCreated?: (skillId: string) => void;
}

export default function ConversationAISidebar({ conversationIds, userFilter, agentFilter, onSkillCreated }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [open, setOpen] = useState(() => {
    try {
      const stored = sessionStorage.getItem(SIDEBAR_KEY);
      return stored === null ? true : stored === '1';
    } catch { return true; }
  });
  const [allModels, setAllModels] = useState<ModelInfo[]>([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [skillCreatorContext, setSkillCreatorContext] = useState('');
  const msgEndRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      try { sessionStorage.setItem(SIDEBAR_KEY, next ? '1' : '0'); } catch { /* */ }
      return next;
    });
  }, []);

  useEffect(() => {
    Promise.all([fetchModelsCatalog(), fetchSettings()])
      .then(([catalog, settings]) => {
        // 自定义模型
        const customModels = catalog.filter((m) => !m.builtin);
        // 如果没有自定义模型，使用设置中的默认模型作为备选
        let available = customModels;
        if (available.length === 0 && settings.default_model && settings.default_provider) {
          available = [{
            id: '__default__',
            label: `${settings.default_provider}/${settings.default_model}`,
            provider: settings.default_provider,
            model: settings.default_model,
            max_tokens: settings.max_tokens ?? 4096,
            builtin: true,
          }];
        }
        setAllModels(available);
        if (available.length > 0 && !selectedModelId) {
          setSelectedModelId(available[0].id || '');
        }
      })
      .catch(() => {});
    fetchSkillCreatorContext()
      .then((r) => setSkillCreatorContext(r.content))
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  const getModelConfig = () => {
    const m = allModels.find((cm) => cm.id === selectedModelId);
    if (!m) return { model: '', provider: '', api_key: '', base_url: '' };
    // 默认模型不传 api_key 和 base_url，由后端从设置中解析
    if (m.id === '__default__') return { model: m.model, provider: m.provider, api_key: '', base_url: '' };
    return { model: m.model, provider: m.provider, api_key: m.api_key || '', base_url: m.base_url || '' };
  };

  const buildSystemPrompt = () => {
    const count = conversationIds.length;
    const parts: string[] = [];

    // Include skill creator context (truncated to ~2000 chars)
    if (skillCreatorContext) {
      parts.push(skillCreatorContext.slice(0, 2000));
      parts.push('');
    }

    parts.push(
      '你是一名对话分析与 Skill 设计助手。',
      '',
      '你可以帮助管理员：',
      '1. 分析聊天记录中的高频问题、用户痛点',
      '2. 生成完整的 SKILL.md 指令文件（含 YAML frontmatter）',
      '3. 回答关于对话内容的任何问题',
      '',
      '当用户要求"生成 Skill"时，输出完整的 SKILL.md 内容（用 ```markdown 代码块包裹），最后提示用户确认。',
      '当用户说"确认创建"时，调用创建功能。',
      '',
      '请使用中文回答，保持简洁。',
    );
    if (count > 0) {
      parts.push(`\n当前选中了 ${count} 条对话记录。`);
    } else {
      parts.push('\n当前未选择任何对话记录，请提示用户先在左侧勾选对话。');
    }
    if (userFilter) parts.push(`筛选用户：${userFilter}`);
    if (agentFilter) parts.push(`筛选智能体：${agentFilter}`);
    return parts.join('\n');
  };

  const sendToAI = async (userMessage: string) => {
    if (!selectedModelId) {
      setMessages((prev) => [...prev, { role: 'assistant', content: '请先选择一个模型', error: true }]);
      return;
    }
    if (!userMessage.trim()) return;

    const q = userMessage.trim();
    setInput('');
    setStreaming(true);
    setMessages((prev) => [...prev, { role: 'user', content: q }, { role: 'assistant', content: '' }]);

    const config = getModelConfig();
    if (!config.model || !config.provider) {
      setMessages((prev) => [...prev, { role: 'assistant', content: '模型配置无效，请重新选择模型', error: true }]);
      setStreaming(false);
      return;
    }

    // 获取选中对话的实际内容，注入到系统提示词中
    let convContentSection = '';
    if (conversationIds.length > 0) {
      try {
        const convDetails = await Promise.all(
          conversationIds.slice(0, 10).map((id) => fetchAdminConversation(id).catch(() => null))
        );
        const validConvs = convDetails.filter(Boolean);
        if (validConvs.length > 0) {
          const parts = validConvs.map((conv, idx) => {
            const msgs = (conv!.messages || []).map(
              (m: ChatMessage) => `[${m.role === 'user' ? '用户' : 'AI'}] ${m.content}`
            ).join('\n');
            return `--- 对话 ${idx + 1}（${conv!.title || '无标题'}）---\n${msgs}`;
          });
          convContentSection = '\n\n以下是选中的对话记录内容：\n\n' + parts.join('\n\n');
        }
      } catch { /* ignore fetch errors */ }
    }

    const systemPrompt = buildSystemPrompt() + convContentSection;
    const apiMessages: ChatMessage[] = [{ role: 'user', content: q }];

    let fullText = '';
    createChatStream(
      apiMessages,
      config.model,
      config.provider,
      systemPrompt,
      config.api_key,
      config.base_url,
      undefined, undefined, undefined, undefined,
      (chunk) => {
        fullText += chunk;
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === 'assistant' && !last.error) {
            last.content = fullText;
          }
          return [...next];
        });
      },
      () => {},
      () => { setStreaming(false); },
      (err) => {
        // Remove the user message's pending assistant response if no content was received
        setMessages((prev) => {
          if (!fullText) {
            // No content received - remove the user message too since it was never processed
            const withoutLast2 = prev.slice(0, -2);
            return [...withoutLast2, { role: 'assistant' as const, content: `请求失败：${err}`, error: true }];
          }
          return [...prev, { role: 'assistant' as const, content: err, error: true }];
        });
        setStreaming(false);
      },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendToAI(input);
    }
  };

  const handleQuickAction = (action: string) => {
    sendToAI(action);
  };

  const handleCreateSkillFromChat = async (skillMd: string) => {
    if (selectedConvIds.length === 0) {
      toast('请先选择至少一条对话', 'error');
      return;
    }
    if (!selectedModelId) {
      toast('请先选择一个模型', 'error');
      return;
    }
    // Extract skill name from first line
    const firstLine = skillMd.split('\n')[0] || '';
    const skillName = firstLine.startsWith('# ') ? firstLine.slice(2).trim() : '';
    setStreaming(true);
    try {
      const config = getModelConfig();
      const result = await createSkillFromConversations({
        conversation_ids: selectedConvIds,
        name: skillName,
        ...config,
      });
      toast(`Skill「${result.name}」创建成功`, 'success');
      onSkillCreated?.(result.skill_id);
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `✅ 已成功创建 Skill「${result.name}」\n\n预览：\n${result.skill_md_preview}`,
      }]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '创建 Skill 失败';
      toast(msg, 'error');
      setMessages((prev) => [...prev, { role: 'assistant', content: msg, error: true }]);
    } finally {
      setStreaming(false);
    }
  };

  // Find if AI's last message contains a skill code block
  const findSkillMdInMessages = (): string | null => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'assistant' && !msg.error) {
        const match = msg.content.match(/```markdown\s*\n([\s\S]*?)```/);
        if (match) return match[1].trim();
      }
    }
    return null;
  };

  const skillMdFound = findSkillMdInMessages();
  const selectedConvIds = Array.from(conversationIds);

  return (
    <>
      {/* Toggle button - always visible */}
      <button
        className={`ai-sidebar-toggle ${open ? 'open' : ''}`}
        onClick={toggle}
        title={open ? '收起 AI 助手' : '展开 AI 助手'}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
        </svg>
        {!open && <span className="ai-sidebar-toggle-label">AI</span>}
      </button>

      {/* Sidebar panel */}
      {open && (
        <div className="ai-sidebar">
          <div className="ai-sidebar-header">
            <h3>AI 助手</h3>
            <button className="ai-sidebar-close" onClick={toggle} title="收起">&times;</button>
          </div>
          <div className="ai-sidebar-body">
            {/* Model selector */}
            <div className="ai-sidebar-section">
              <label className="ai-sidebar-label">模型</label>
              {allModels.length > 0 ? (
                <select
                  className="ai-sidebar-select"
                  value={selectedModelId}
                  onChange={(e) => setSelectedModelId(e.target.value)}
                >
                  {allModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              ) : (
                <span className="ai-sidebar-hint">
                  请先在<span style={{ color: 'var(--brand)', cursor: 'pointer' }} onClick={() => navigate('/settings')}>模型设置</span>中添加
                </span>
              )}
            </div>

            {/* Quick actions */}
            <div className="ai-sidebar-section">
              <label className="ai-sidebar-label">快捷操作</label>
              <div className="ai-sidebar-actions">
                <button
                  className="ai-sidebar-action-btn"
                  onClick={() => handleQuickAction('请分析这些对话记录，找出高频问题和用户痛点')}
                  disabled={!selectedModelId || conversationIds.length === 0 || streaming}
                >
                  📊 分析对话
                </button>
                <button
                  className="ai-sidebar-action-btn"
                  onClick={() => handleQuickAction('请根据这些对话记录，设计一个完整的 Skill（技能）指令文件')}
                  disabled={!selectedModelId || conversationIds.length === 0 || streaming}
                >
                  ⚡ 生成 Skill
                </button>
                <button
                  className="ai-sidebar-action-btn"
                  onClick={() => handleQuickAction('请总结这些对话的核心主题和模式')}
                  disabled={!selectedModelId || conversationIds.length === 0 || streaming}
                >
                  📝 总结主题
                </button>
                <button
                  className="ai-sidebar-action-btn"
                  onClick={() => handleQuickAction('请评估这些对话的质量，给出改进建议')}
                  disabled={!selectedModelId || conversationIds.length === 0 || streaming}
                >
                  💡 评估建议
                </button>
              </div>
            </div>

            {/* Chat area */}
            <div className="ai-sidebar-section ai-sidebar-chat">
              <div className="ai-sidebar-label-row">
                <label className="ai-sidebar-label" style={{ marginBottom: 0 }}>对话</label>
                {messages.length > 0 && (
                  <button className="ai-chat-clear" onClick={() => setMessages([])}>清空</button>
                )}
              </div>
              <div className="ai-chat-messages">
                {messages.length === 0 && !streaming && (
                  <div className="ai-chat-placeholder">
                    {conversationIds.length > 0
                      ? '选择对话后，点击快捷操作或直接提问'
                      : '请先在左侧勾选对话记录'}
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className={`ai-chat-msg ai-chat-msg-${msg.role}`}>
                    {msg.role === 'user' ? (
                      <div className="ai-chat-bubble-user">{msg.content}</div>
                    ) : (
                      <div className={`ai-chat-bubble-ai ${msg.error ? 'ai-chat-bubble-error' : ''}`}>
                        {msg.error ? (
                          <span>{msg.content}</span>
                        ) : (
                          <div className="ai-chat-answer-text" dangerouslySetInnerHTML={{ __html: parseMd(msg.content) }} />
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {streaming && (
                  <div className="ai-chat-msg ai-chat-msg-assistant">
                    <div className="ai-chat-bubble-ai ai-chat-thinking-bubble">
                      <div className="ai-spinner" style={{ width: 14, height: 14 }} />
                      AI 正在思考...
                    </div>
                  </div>
                )}
                <div ref={msgEndRef} />
              </div>

              {/* Create skill button (appears when skill code block is found) */}
              {skillMdFound && !streaming && (
                <div className="ai-create-skill-banner">
                  <button
                    className="ai-create-skill-btn"
                    onClick={() => handleCreateSkillFromChat(skillMdFound!)}
                    disabled={streaming}
                  >
                    ⚡ 创建此 Skill
                  </button>
                </div>
              )}

              <div className="ai-chat-input-row">
                <textarea
                  className="ai-chat-input"
                  placeholder={
                    conversationIds.length > 0
                      ? '输入问题，Enter 发送...'
                      : '请先选择对话，再提问'
                  }
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  disabled={conversationIds.length === 0 || streaming}
                />
                <button
                  className="ai-chat-send"
                  onClick={() => sendToAI(input)}
                  disabled={!input.trim() || streaming || conversationIds.length === 0}
                >
                  {streaming ? (
                    <div className="ai-spinner" style={{ width: 16, height: 16 }} />
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
