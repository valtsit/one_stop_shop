import { useEffect, useRef, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import {
  fetchAgent,
  fetchSettings,
  fetchModelsCatalog,
  createChatStream,
  uploadFile,
  fetchConversations,
  fetchConversation,
  createConversation,
  updateConversation,
  deleteConversation,
  type Agent,
  type AppSettings,
  type ModelInfo,
  type ChatMessage,
  type TokenUsage,
  type ModelOption,
  type ConversationSummary,
} from '../services/api';
import './ChatPage.css';

interface UploadedFile {
  filename: string;
  path: string;
}

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  usage?: TokenUsage;
}

export default function ChatPage() {
  const { toolId } = useParams<{ toolId: string }>();
  const location = useLocation();
  const state = location.state as {
    initialMessage?: string;
    model?: ModelOption;
  } | null;

  const [agent, setAgent] = useState<Agent | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [allModels, setAllModels] = useState<ModelOption[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelOption | null>(
    state?.model || null,
  );
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);

  // Conversation state
  const [convList, setConvList] = useState<ConversationSummary[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const msgIdRef = useRef(0);
  const abortRef = useRef<(() => void) | null>(null);
  const initialSentRef = useRef(false);
  const assistantMsgIdRef = useRef<number | null>(null);

  // Display data from agent
  const activeIcon = agent?.icon || '✦';
  const activeName = agent?.name || 'AI 助手';
  const activeDesc = agent?.description || '你好，有什么可以帮你的？';
  const activeSystemPrompt = agent?.system_prompt;
  const activeSuggestions = agent?.suggestions || [];

  // Load agent info, settings, model catalog, and conversations
  useEffect(() => {
    if (toolId) {
      fetchAgent(toolId).then(setAgent).catch(() => {});
      fetchConversations(toolId).then(setConvList).catch(() => {});
    }
    Promise.all([fetchSettings(), fetchModelsCatalog()])
      .then(([s, catalog]) => {
        setAppSettings(s);
        const enabledProviders = new Set(
          Object.entries(s.providers)
            .filter(([, p]) => p.enabled !== false)
            .map(([k]) => k),
        );
        const modelOpts: ModelOption[] = catalog
          .filter((m) => !m.builtin || enabledProviders.has(m.provider))
          .map((m: ModelInfo) => ({
            provider: m.provider,
            model: m.model,
            label: m.label,
          }));
        setAllModels(modelOpts);
        const found = modelOpts.find(
          (m) => m.provider === s.default_provider && m.model === s.default_model,
        );
        if (found && !state?.model) setSelectedModel(found);
        else if (!state?.model && modelOpts.length) setSelectedModel(modelOpts[0]);
      })
      .catch(() => {});
  }, [toolId]);

  // Handle initial message from homepage
  useEffect(() => {
    if (state?.initialMessage && !initialSentRef.current) {
      initialSentRef.current = true;
      const msg = state.initialMessage;
      window.history.replaceState({}, '');
      handleSendMessage(msg);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll
  useEffect(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
  }, [messages]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Persist messages to backend after streaming ends
  const saveConversation = async (msgs: Message[]) => {
    const chatMsgs: ChatMessage[] = msgs
      .filter((m) => m.content)
      .map((m) => ({ role: m.role, content: m.content }));
    if (chatMsgs.length === 0) return;

    try {
      if (currentConvId) {
        await updateConversation(currentConvId, {
          messages: chatMsgs,
          model: selectedModel?.model,
          provider: selectedModel?.provider,
        });
      } else {
        const conv = await createConversation({
          agent_id: toolId || 'general',
          model: selectedModel?.model || '',
          provider: selectedModel?.provider || '',
          messages: chatMsgs,
        });
        setCurrentConvId(conv.id);
        // Refresh conversation list
        if (toolId) fetchConversations(toolId).then(setConvList).catch(() => {});
      }
    } catch {
      // silently fail - don't block UI
    }
  };

  const handleSendMessage = (text?: string) => {
    const content = text || input.trim();
    if (!content || streaming || !selectedModel) return;

    let fullContent = content;
    if (files.length > 0) {
      const fileInfo = files.map((f) => `[附件: ${f.filename}]`).join(' ');
      fullContent = `${content}\n\n${fileInfo}`;
    }

    setError(null);
    setInput('');
    setFiles([]);

    const userMsg: Message = { id: ++msgIdRef.current, role: 'user', content: fullContent };
    const assistantId = ++msgIdRef.current;
    assistantMsgIdRef.current = assistantId;

    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '' }]);
    setStreaming(true);

    const chatMessages: ChatMessage[] = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: fullContent },
    ];

    let apiKey: string | undefined;
    let baseUrl: string | undefined;
    if (appSettings?.custom_models) {
      const custom = appSettings.custom_models.find(
        (m: { model: string; provider: string }) =>
          m.model === selectedModel.model && m.provider === selectedModel.provider,
      );
      if (custom?.api_key) apiKey = custom.api_key;
      if (custom?.base_url) baseUrl = custom.base_url;
    }
    if (!apiKey) {
      apiKey = appSettings?.providers[selectedModel.provider]?.api_key || undefined;
    }
    if (!baseUrl) {
      baseUrl = appSettings?.providers[selectedModel.provider]?.base_url || undefined;
    }

    const abort = createChatStream(
      chatMessages,
      selectedModel.model,
      selectedModel.provider,
      activeSystemPrompt,
      apiKey,
      baseUrl,
      (chunk) => {
        if (!chunk) return;
        const targetId = assistantMsgIdRef.current;
        if (targetId == null) return;
        setMessages((prev) => {
          const updated = [...prev];
          for (let i = updated.length - 1; i >= 0; i--) {
            if (updated[i].id === targetId) {
              updated[i] = { ...updated[i], content: updated[i].content + chunk };
              return updated;
            }
          }
          return prev;
        });
      },
      (usage) => {
        const targetId = assistantMsgIdRef.current;
        if (targetId == null) return;
        setMessages((prev) => {
          const updated = [...prev];
          for (let i = updated.length - 1; i >= 0; i--) {
            if (updated[i].id === targetId) {
              updated[i] = { ...updated[i], usage };
              return updated;
            }
          }
          return prev;
        });
      },
      () => {
        assistantMsgIdRef.current = null;
        setStreaming(false);
        // Save after stream completes - use functional update to get latest messages
        setMessages((prev) => {
          saveConversation(prev);
          return prev;
        });
      },
      (err) => {
        assistantMsgIdRef.current = null;
        setError(err);
        setStreaming(false);
      },
    );

    abortRef.current = abort;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;
    for (const file of Array.from(fileList)) {
      try {
        const result = await uploadFile(file);
        setFiles((prev) => [...prev, { filename: result.filename, path: result.path }]);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : `上传失败: ${file.name}`);
      }
    }
    e.target.value = '';
  };

  // Load a conversation from history
  const handleLoadConversation = async (convId: string) => {
    try {
      const conv = await fetchConversation(convId);
      setCurrentConvId(conv.id);
      const msgs: Message[] = conv.messages.map((m) => ({
        id: ++msgIdRef.current,
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
      setMessages(msgs);
      // Restore model if available
      if (conv.model && conv.provider) {
        const found = allModels.find(
          (m) => m.model === conv.model && m.provider === conv.provider,
        );
        if (found) setSelectedModel(found);
      }
    } catch {
      setError('加载对话失败');
    }
  };

  // Start a new chat
  const handleNewChat = () => {
    setCurrentConvId(null);
    setMessages([]);
    setError(null);
    msgIdRef.current = 0;
  };

  // Delete a conversation
  const handleDeleteConv = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定删除此对话？')) return;
    try {
      await deleteConversation(convId);
      setConvList((prev) => prev.filter((c) => c.id !== convId));
      if (currentConvId === convId) handleNewChat();
    } catch {
      setError('删除对话失败');
    }
  };

  return (
    <div className="content-area">
      <div className="chat-layout">
        {/* Conversation sidebar */}
        <div className={`conv-sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="conv-sidebar-header">
            <button className="conv-new-btn" type="button" onClick={handleNewChat}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              新对话
            </button>
          </div>
          <div className="conv-list">
            {convList.map((conv) => (
              <div
                key={conv.id}
                className={`conv-item ${currentConvId === conv.id ? 'active' : ''}`}
                onClick={() => handleLoadConversation(conv.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && handleLoadConversation(conv.id)}
              >
                <div className="conv-item-title">{conv.title || '新对话'}</div>
                <div className="conv-item-meta">{conv.message_count} 条消息</div>
                <button
                  className="conv-item-delete"
                  type="button"
                  onClick={(e) => handleDeleteConv(conv.id, e)}
                  title="删除对话"
                >
                  ×
                </button>
              </div>
            ))}
            {convList.length === 0 && (
              <div className="conv-empty">暂无对话记录</div>
            )}
          </div>
        </div>

        {/* Sidebar toggle */}
        <button
          className="conv-sidebar-toggle"
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          title={sidebarOpen ? '收起侧边栏' : '展开侧边栏'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {sidebarOpen ? (
              <path d="M15 18l-6-6 6-6" />
            ) : (
              <path d="M9 18l6-6-6-6" />
            )}
          </svg>
        </button>

        {/* Main chat area */}
        <div className="chat-page">
          <div className="chat-messages">
            {messages.length === 0 && !streaming && (
              <div className="chat-welcome">
                <div className="chat-welcome-icon">{activeIcon}</div>
                <div className="chat-welcome-title">{activeName}</div>
                <div className="chat-welcome-desc">
                  {agent?.welcome_message || activeDesc}
                </div>
                {activeSuggestions.length > 0 && (
                  <div className="chat-welcome-suggestions">
                    {activeSuggestions.map((s, i) => (
                      <button
                        key={i}
                        className="suggestion-chip"
                        type="button"
                        onClick={() => {
                          setInput(s);
                          textareaRef.current?.focus();
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={msg.id} className={`chat-message chat-message-${msg.role} ${!msg.content ? 'message-empty' : ''}`}>
                <div className={`message-avatar message-avatar-${msg.role}`}>
                  {msg.role === 'assistant' ? activeIcon : '你'}
                </div>
                <div>
                  <div className={`message-bubble message-bubble-${msg.role}`}>
                    {msg.role === 'assistant' ? (
                      msg.content ? (
                        <>
                          <MessageContent content={msg.content} />
                          {streaming && i === messages.length - 1 && (
                            <span className="typing-cursor" />
                          )}
                        </>
                      ) : (
                        <div className="thinking-dots">
                          <span /><span /><span />
                        </div>
                      )
                    ) : (
                      msg.content
                    )}
                  </div>
                  {msg.usage && (
                    <div className="message-usage">
                      <span>Tokens: {msg.usage.total_tokens}</span>
                      <span>
                        费用: ${msg.usage.estimated_cost.toFixed(6)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}

            <div ref={messagesEndRef} />
          </div>

          {error && (
            <div className="chat-error">
              <span>{error}</span>
              <button
                className="chat-error-retry"
                onClick={() => {
                  setError(null);
                  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
                  if (lastUser) {
                    setMessages((prev) => prev.filter((m) => m.content || m.role !== 'assistant').slice(0, -1));
                    handleSendMessage(lastUser.content);
                  }
                }}
              >
                重试
              </button>
            </div>
          )}

          <div className="chat-input-area">
            <div className="chat-input-card">
              <textarea
                ref={textareaRef}
                className="chat-textarea"
                placeholder="继续对话..."
                rows={1}
                maxLength={5000}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={streaming}
              />

              {files.length > 0 && (
                <div className="file-preview-area">
                  {files.map((f, i) => (
                    <div key={i} className="file-preview-item">
                      <span>{f.filename}</span>
                      <button
                        className="file-preview-remove"
                        onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="input-footer">
                <div className="input-left-actions">
                  <button
                    className="input-icon-btn"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="上传文件"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    hidden
                    multiple
                    accept="image/*,.pdf,.docx,.txt,.md,.xlsx,.csv"
                    onChange={handleFileUpload}
                  />
                </div>

                <div className="input-right-actions">
                  <div ref={dropdownRef} style={{ position: 'relative' }}>
                    <button
                      className="model-select-btn"
                      type="button"
                      onClick={() => setShowModelDropdown(!showModelDropdown)}
                    >
                      <span>{selectedModel?.label || '选择模型'}</span>
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M7 10l5 5 5-5z" />
                      </svg>
                    </button>
                    {showModelDropdown && (
                      <div className="model-dropdown">
                        {allModels.map((opt) => (
                          <button
                            key={`${opt.provider}-${opt.model}`}
                            className={`model-dropdown-item ${
                              selectedModel?.model === opt.model &&
                              selectedModel?.provider === opt.provider
                                ? 'active'
                                : ''
                            }`}
                            onClick={() => {
                              setSelectedModel(opt);
                              setShowModelDropdown(false);
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {streaming ? (
                    <button
                      className="send-btn"
                      type="button"
                      onClick={() => abortRef.current?.()}
                      style={{ background: 'var(--color-danger)' }}
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                        <rect x="6" y="6" width="12" height="12" rx="2" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      className="send-btn"
                      type="button"
                      disabled={!input.trim() || !selectedModel}
                      onClick={() => handleSendMessage()}
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Simple markdown-ish renderer for assistant messages */
function MessageContent({ content }: { content: string }) {
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          const match = part.match(/```(\w*)\n?([\s\S]*?)```/);
          if (match) {
            return (
              <pre key={i}>
                <code>{match[2]}</code>
              </pre>
            );
          }
        }

        const lines = part.split('\n');
        const blocks: { type: string; lines: string[] }[] = [];
        let current: { type: string; lines: string[] } | null = null;

        const flush = () => {
          if (current && current.lines.length > 0) blocks.push(current);
          current = null;
        };

        for (const line of lines) {
          let type = 'p';
          if (line.startsWith('# ')) type = 'h1';
          else if (line.startsWith('## ')) type = 'h2';
          else if (line.startsWith('### ')) type = 'h3';
          else if (line.startsWith('> ')) type = 'blockquote';
          else if (line.match(/^[-*] /)) type = 'ul';

          if (!current || current.type !== type) {
            flush();
            current = { type, lines: [] };
          }
          current.lines.push(line);
        }
        flush();

        return blocks.map((block, j) => {
          const key = `${i}-${j}`;
          if (block.type === 'h1') return <h1 key={key}>{block.lines.map(l => l.slice(2)).join('\n')}</h1>;
          if (block.type === 'h2') return <h2 key={key}>{block.lines.map(l => l.slice(3)).join('\n')}</h2>;
          if (block.type === 'h3') return <h3 key={key}>{block.lines.map(l => l.slice(4)).join('\n')}</h3>;
          if (block.type === 'blockquote') return <blockquote key={key}>{block.lines.map(l => l.slice(2)).join('\n')}</blockquote>;
          if (block.type === 'ul') {
            return (
              <ul key={key}>
                {block.lines.map((line, k) => (
                  <li key={k}>{line.slice(2)}</li>
                ))}
              </ul>
            );
          }
          return block.lines.map((line, k) => {
            if (line === '') return <br key={`${key}-${k}`} />;
            const rendered = line
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/`([^`]+)`/g, '<code>$1</code>')
              .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
              .replace(/\*(.+?)\*/g, '<em>$1</em>');
            return (
              <p
                key={`${key}-${k}`}
                dangerouslySetInnerHTML={{ __html: rendered }}
              />
            );
          });
        });
      })}
    </>
  );
}
