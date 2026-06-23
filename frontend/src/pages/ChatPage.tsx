import { Fragment, memo, useCallback, useEffect, useRef, useState } from 'react';
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
  fetchSkillsBatchContent,
  searchWeb,
  fetchKnowledges,
  fetchKnowledge,
  createSubmission,
  type Agent,
  type AppSettings,
  type ModelInfo,
  type ChatMessage,
  type TokenUsage,
  type ModelOption,
  type ConversationSummary,
  type SearchResult,
  type Knowledge,
} from '../services/api';
import { useToast } from '../hooks/useToast';
import './ChatPage.css';

interface UploadedFile {
  filename: string; // server UUID filename for backend
  originalName: string; // original filename for display
  path: string;
}

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  usage?: TokenUsage;
  files?: { filename: string; originalName: string; path: string }[];
}

export default function ChatPage() {
  const { confirm } = useToast();
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
  const [uploading, setUploading] = useState<{ name: string; progress: number }[]>([]);

  // Conversation state
  const [convList, setConvList] = useState<ConversationSummary[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [convSearch, setConvSearch] = useState('');
  const [loadedSkills, setLoadedSkills] = useState<string[]>([]);
  const [searchEnabled, setSearchEnabled] = useState(false);
  // Text selection for knowledge base
  const [selectionText, setSelectionText] = useState('');
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitMode, setSubmitMode] = useState<'create' | 'append'>('create');
  const [submitTitle, setSubmitTitle] = useState('');
  const [submitTags, setSubmitTags] = useState<string[]>([]);
  const [submitTagInput, setSubmitTagInput] = useState('');
  const [targetKbId, setTargetKbId] = useState('');
  const [editCellValue, setEditCellValue] = useState('');
  const [rowValues, setRowValues] = useState<string[]>([]);
  const [allKnowledges, setAllKnowledges] = useState<Knowledge[]>([]);
  const [selectedKbDetail, setSelectedKbDetail] = useState<Knowledge | null>(null);
  const [submitToast, setSubmitToast] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [insertPosition, setInsertPosition] = useState<number>(-1);
  const [targetColumnIdx, setTargetColumnIdx] = useState<number>(0);
  const [appendAction, setAppendAction] = useState<'none' | 'insert_row' | 'fill_cell'>('none');
  const [fillCellRow, setFillCellRow] = useState<number>(-1);
  const [fillCellCol, setFillCellCol] = useState<number>(-1);
  const [fillCellText, setFillCellText] = useState<string>('');

  // @ mention knowledge base
  const [atMenuOpen, setAtMenuOpen] = useState(false);
  const [atFilter, setAtFilter] = useState('');
  const [selectedKbIds, setSelectedKbIds] = useState<string[]>([]);

  // Task list checkbox state: { [messageId]: boolean[] }
  const [taskStates, setTaskStates] = useState<Record<number, boolean[]>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const msgIdRef = useRef(0);
  const abortRef = useRef<(() => void) | null>(null);
  const initialSentRef = useRef(false);
  const assistantMsgIdRef = useRef<number | null>(null);
  const inputCardRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const handleSendMessageRef = useRef<(text?: string, overrideKbIds?: string[]) => void>(() => {});

  // Display data from agent
  const activeIcon = agent?.icon || '✦';
  const activeName = agent?.name || 'AI 助手';
  const activeDesc = agent?.description || '你好，有什么可以帮你的？';
  const activeSystemPrompt = agent?.system_prompt;

  // 复制文本到剪贴板
  const copyToClipboard = async (text: string, button?: HTMLButtonElement) => {
    try {
      await navigator.clipboard.writeText(text);
      if (button) {
        const original = button.innerHTML;
        button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        setTimeout(() => {
          button.innerHTML = original;
        }, 2000);
      }
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      if (button) {
        const original = button.innerHTML;
        button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        setTimeout(() => {
          button.innerHTML = original;
        }, 2000);
      }
    }
  };
  const fullSystemPrompt = [activeSystemPrompt, ...loadedSkills].filter(Boolean).join('\n\n') || undefined;
  const activeSuggestions = agent?.suggestions || [];

  // Filtered knowledges for @ menu
  const filteredKnowledges = allKnowledges.filter((kb) => {
    const q = atFilter.toLowerCase();
    const match = !q || kb.title.toLowerCase().includes(q) || kb.tags.some((t) => t.toLowerCase().includes(q));
    const alreadyAgent = (agent?.knowledge_ids || []).includes(kb.id);
    const alreadySelected = selectedKbIds.includes(kb.id);
    return match && !alreadyAgent && !alreadySelected;
  });

  // Filtered and grouped conversations
  const filteredConvList = convList.filter((conv) => {
    if (!convSearch) return true;
    const q = convSearch.toLowerCase();
    return (conv.title || '新对话').toLowerCase().includes(q);
  });

  // Group conversations by date
  const groupedConvs = filteredConvList.reduce<Record<string, ConversationSummary[]>>((groups, conv) => {
    const date = new Date(conv.updated_at);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    let label: string;
    if (diffDays === 0) {
      label = '今天';
    } else if (diffDays === 1) {
      label = '昨天';
    } else if (diffDays < 7) {
      label = '最近 7 天';
    } else if (diffDays < 30) {
      label = '最近 30 天';
    } else {
      label = '更早';
    }

    if (!groups[label]) groups[label] = [];
    groups[label].push(conv);
    return groups;
  }, {});

  // Format relative time
  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins} 分钟前`;
    if (diffHours < 24) return `${diffHours} 小时前`;
    if (diffDays < 7) return `${diffDays} 天前`;
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  // Load agent info, settings, model catalog, and conversations
  useEffect(() => {
    if (toolId) {
      fetchAgent(toolId)
        .then((a) => {
          setAgent(a);
          // Load skills associated with this agent (batch request)
          if (a.skills && a.skills.length > 0) {
            fetchSkillsBatchContent(a.skills)
              .then((contents) => {
                // Preserve order, skip missing skills gracefully
                const ordered = a.skills.map((id) => contents[id]).filter(Boolean);
                setLoadedSkills(ordered);
              })
              .catch(() => {
                // Batch failed — try loading individually so one failure doesn't kill all
                Promise.allSettled(
                  a.skills.map((id) => fetchSkillsBatchContent([id]).then((c) => c[id]).catch(() => null))
                ).then((results) => {
                  setLoadedSkills(results.map((r) => r.status === 'fulfilled' ? r.value : null).filter(Boolean) as string[]);
                });
              });
          } else {
            setLoadedSkills([]);
          }
        })
        .catch(() => {});
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

  // Apply agent's default model when agent loads (overrides global settings default)
  useEffect(() => {
    if (agent && allModels.length > 0 && !state?.model) {
      const found = allModels.find(
        (m) => m.provider === agent.default_provider && m.model === agent.default_model,
      );
      if (found) setSelectedModel(found);
    }
  }, [agent, allModels, state?.model]);

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

  // Track whether user is near bottom of chat
  const handleScroll = () => {
    const el = document.querySelector('.chat-messages');
    if (!el) return;
    const threshold = 120;
    autoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  };

  useEffect(() => {
    const el = document.querySelector('.chat-messages');
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  // 自动调整 textarea 高度
  const autoResizeTextarea = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  };

  // input 变化时自动调整 textarea 高度（处理程序化设置 input 的场景）
  useEffect(() => {
    requestAnimationFrame(autoResizeTextarea);
  }, [input]);

  // Auto-scroll only when user is at bottom
  useEffect(() => {
    if (autoScrollRef.current) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      });
    }
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

  // Close @ menu on outside click (outside the input card area)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (inputCardRef.current && !inputCardRef.current.contains(e.target as Node)) {
        setAtMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Text selection handler for knowledge base submission
  useEffect(() => {
    const handleMouseUp = () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (!text || !sel || sel.rangeCount === 0) {
        setSelectionRect(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const container = range.commonAncestorContainer;
      const bubble = (container instanceof HTMLElement ? container : container.parentElement)?.closest('.message-bubble-assistant');
      if (!bubble) {
        setSelectionRect(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setSelectionText(text);
      setSelectionRect(rect);
    };

    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Load all knowledges for the submit modal
  useEffect(() => {
    fetchKnowledges().then(setAllKnowledges).catch(() => {});
  }, []);

  // Cancel any in-flight stream on unmount (e.g. when switching agents)
  useEffect(() => {
    return () => {
      abortRef.current?.();
    };
  }, []);

  // Persist messages to backend after streaming ends
  const saveConversation = async (msgs: Message[]) => {
    const chatMsgs: ChatMessage[] = msgs
      .filter((m) => m.content)
      .map((m) => ({ role: m.role, content: m.content, thinking: m.thinking, files: m.files }));
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

  // Toggle task checkbox（使用 useCallback 避免 MessageContent 不必要的重渲染）
  const handleTaskToggle = useCallback((messageId: number, taskIndex: number, isRadio: boolean = false) => {
    setTaskStates((prev) => {
      const msgTasks = prev[messageId] || [];
      const newTasks = [...msgTasks];

      if (isRadio) {
        // 单选模式：先清除所有选项，再设置当前选项
        for (let i = 0; i < newTasks.length; i++) {
          newTasks[i] = false;
        }
        newTasks[taskIndex] = true;
      } else {
        // 多选模式：切换当前选项
        newTasks[taskIndex] = !newTasks[taskIndex];
      }

      return { ...prev, [messageId]: newTasks };
    });
  }, []);

  // Confirm task list and send result as message
  const handleTaskConfirm = useCallback((messageId: number, tasks: { text: string; checked: boolean }[]) => {
    const checkedTasks = tasks.filter((t) => t.checked);

    // 判断是否为确认性语句的确认（只有一个 "确认" 任务）
    const isSimpleConfirm = tasks.length === 1 && tasks[0].text === '确认' && tasks[0].checked;

    let result: string;
    if (isSimpleConfirm) {
      result = '确认，符合实际，请继续';
    } else {
      result = '任务确认结果：\n';
      if (checkedTasks.length > 0) {
        result += '\n✅ 已完成：\n' + checkedTasks.map((t) => `  - ${t.text}`).join('\n');
      }
      const uncheckedTasks = tasks.filter((t) => !t.checked);
      if (uncheckedTasks.length > 0) {
        result += '\n⬜ 未完成：\n' + uncheckedTasks.map((t) => `  - ${t.text}`).join('\n');
      }
    }

    handleSendMessageRef.current(result);
    // Clear task state for this message
    setTaskStates((prev) => {
      const next = { ...prev };
      delete next[messageId];
      return next;
    });
  }, []);

  const handleSendMessage = async (text?: string, overrideKbIds?: string[]) => {
    const content = text || input.trim();
    if (!content || streaming || !selectedModel) return;

    // Capture per-message @-selected KB IDs before clearing
    const msgKbIds = overrideKbIds ?? [...selectedKbIds];

    // Validate selected KB entries exist and have content
    if (msgKbIds.length > 0) {
      const missing = msgKbIds.filter((id) => !allKnowledges.find((k) => k.id === id));
      if (missing.length > 0) {
        setError(`选中的知识库条目不存在或已删除，请重新选择`);
        return;
      }
    }

    console.log('[SEND] files at send time:', files);
    let fullContent = content;
    if (files.length > 0) {
      const fileInfo = files.map((f) => `[附件: ${f.filename}]`).join(' ');
      fullContent = `${content}\n\n${fileInfo}`;
      console.log('[SEND] fullContent with attachments:', fullContent);
    }
    if (msgKbIds.length > 0) {
      fullContent = `${fullContent}\n[知识库:${msgKbIds.join(',')}]`;
    }

    setError(null);
    setInput('');
    setFiles([]);
    // 重置 textarea 高度
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    });
    setSelectedKbIds([]);
    setAtMenuOpen(false);

    const userMsg: Message = {
      id: ++msgIdRef.current,
      role: 'user',
      content: fullContent,
      files: files.length > 0 ? [...files] : undefined,
    };
    const assistantId = ++msgIdRef.current;
    assistantMsgIdRef.current = assistantId;

    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '' }]);
    setStreaming(true);
    autoScrollRef.current = true;

    // Search if enabled
    let searchResults: SearchResult[] | undefined;
    if (searchEnabled) {
      try {
        searchResults = await searchWeb(content);
        if (!searchResults || searchResults.length === 0) {
          setError('未搜索到相关结果，将直接回答');
        }
      } catch (err: unknown) {
        setError(`搜索失败: ${err instanceof Error ? err.message : '网络错误'}，将直接回答`);
      }
    }

    const chatMessages: ChatMessage[] = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: fullContent },
    ];

    let apiKey: string | undefined;
    let baseUrl: string | undefined;
    let customHeaders: Record<string, string> | undefined;
    if (appSettings?.custom_models) {
      const custom = appSettings.custom_models.find(
        (m: { model: string; provider: string }) =>
          m.model === selectedModel.model && m.provider === selectedModel.provider,
      );
      if (custom?.api_key) apiKey = custom.api_key;
      if (custom?.base_url) baseUrl = custom.base_url;
      if (custom?.headers) customHeaders = custom.headers;
    }
    if (!apiKey) {
      apiKey = appSettings?.providers[selectedModel.provider]?.api_key || undefined;
    }
    if (!baseUrl) {
      baseUrl = appSettings?.providers[selectedModel.provider]?.base_url || undefined;
    }

    // Agent-level KB IDs (always attached, RAG-filtered) and @-selected IDs (directly injected)
    const agentKbIds = agent?.knowledge_ids || [];
    console.log('[SEND] msgKbIds:', msgKbIds, 'agentKbIds:', agentKbIds);
    console.log('[SEND] selectedKbIds state:', selectedKbIds, 'allKnowledges count:', allKnowledges.length);
    if (msgKbIds.length > 0) {
      const found = msgKbIds.map(id => allKnowledges.find(k => k.id === id)).filter(Boolean);
      console.log('[SEND] KB entries found in allKnowledges:', found.map(k => ({ id: k!.id, title: k!.title, contentLen: k!.content?.length || 0 })));
    }
    console.log('[SEND] fullSystemPrompt preview:', fullSystemPrompt?.slice(0, 200));

    const abort = createChatStream(
      chatMessages,
      selectedModel.model,
      selectedModel.provider,
      fullSystemPrompt,
      apiKey,
      baseUrl,
      customHeaders,
      searchResults,
      agentKbIds.length > 0 ? agentKbIds : undefined,
      msgKbIds.length > 0 ? msgKbIds : undefined,
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
          // 移除空内容的 assistant 消息（暂停场景）
          const cleaned = prev.filter(
            (m) => !(m.role === 'assistant' && !m.content),
          );
          saveConversation(cleaned);
          return cleaned;
        });
      },
      (err) => {
        assistantMsgIdRef.current = null;
        setError(err);
        setStreaming(false);
      },
      (thinking) => {
        if (!thinking) return;
        const targetId = assistantMsgIdRef.current;
        if (targetId == null) return;
        setMessages((prev) => {
          const updated = [...prev];
          for (let i = updated.length - 1; i >= 0; i--) {
            if (updated[i].id === targetId) {
              updated[i] = { ...updated[i], thinking: (updated[i].thinking || '') + thinking };
              return updated;
            }
          }
          return prev;
        });
      },
    );

    abortRef.current = abort;
  };

  // 更新 ref 以便 useCallback 中能访问最新的 handleSendMessage
  handleSendMessageRef.current = handleSendMessage;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setAtMenuOpen(false);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
      e.preventDefault();
      handleSendMessage();
      return;
    }
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const val = ta.value;
      const newVal = val.slice(0, start) + '\n' + val.slice(end);
      // 直接修改 DOM 值，再触发 React 的 input 事件同步状态
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value',
      )!.set!;
      nativeInputValueSetter.call(ta, newVal);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.selectionStart = ta.selectionEnd = start + 1;
    }
  };

  const handleInputWithAt = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    // 下一帧调整高度，确保 DOM 已更新
    requestAnimationFrame(autoResizeTextarea);
    const cursor = e.target.selectionStart;
    const beforeCursor = val.slice(0, cursor);
    const lastAt = beforeCursor.lastIndexOf('@');
    if (lastAt >= 0 && !beforeCursor.slice(lastAt + 1).includes(' ')) {
      setAtMenuOpen(true);
      setAtFilter(beforeCursor.slice(lastAt + 1));
    } else {
      setAtMenuOpen(false);
    }
  };

  const handleAtSelect = (kb: { id: string; title: string }) => {
    setSelectedKbIds((prev) => {
      const next = prev.includes(kb.id) ? prev : [...prev, kb.id];
      console.log('[AT-SELECT] selected kb:', kb.id, kb.title, 'all selected:', next);
      return next;
    });
    const cursor = textareaRef.current?.selectionStart || input.length;
    const beforeCursor = input.slice(0, cursor);
    const lastAt = beforeCursor.lastIndexOf('@');
    if (lastAt >= 0) {
      const afterCursor = input.slice(cursor);
      setInput(input.slice(0, lastAt) + afterCursor);
    }
    setAtMenuOpen(false);
    setAtFilter('');
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;
    for (const file of Array.from(fileList)) {
      setUploading((prev) => [...prev, { name: file.name, progress: 0 }]);
      try {
        const result = await uploadFile(file, (percent) => {
          setUploading((prev) =>
            prev.map((u) => (u.name === file.name ? { ...u, progress: percent } : u)),
          );
        });
        console.log('[UPLOAD] response:', result);
        const serverFilename = result.path.split('/').pop() || result.filename;
        console.log('[UPLOAD] serverFilename:', serverFilename, 'originalName:', result.filename, 'path:', result.path);
        setFiles((prev) => {
          const updated = [...prev, { filename: serverFilename, originalName: result.filename, path: result.path }];
          console.log('[UPLOAD] files state after update:', updated);
          return updated;
        });
      } catch (err: unknown) {
        console.error('[UPLOAD] error:', err);
        setError(err instanceof Error ? err.message : `上传失败: ${file.name}`);
      } finally {
        setUploading((prev) => prev.filter((u) => u.name !== file.name));
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
        thinking: m.thinking,
        files: m.files,
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
    setSelectedKbIds([]);
    setAtMenuOpen(false);
    msgIdRef.current = 0;
  };

  // Delete a conversation
  const handleDeleteConv = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!(await confirm('确定删除此对话？'))) return;
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

          {convList.length > 0 && (
            <div className="conv-sidebar-search">
              <input
                className="conv-sidebar-search-input"
                type="text"
                placeholder="搜索对话..."
                value={convSearch}
                onChange={(e) => setConvSearch(e.target.value)}
              />
            </div>
          )}

          <div className="conv-list">
            {Object.entries(groupedConvs).map(([label, convs]) => (
              <div key={label} className="conv-date-group">
                <div className="conv-date-label">{label}</div>
                {convs.map((conv) => (
                  <div
                    key={conv.id}
                    className={`conv-item ${currentConvId === conv.id ? 'active' : ''}`}
                    onClick={() => handleLoadConversation(conv.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && handleLoadConversation(conv.id)}
                  >
                    <div className="conv-item-title">{conv.title || '新对话'}</div>
                    <div className="conv-item-footer">
                      <span className="conv-item-time">{formatRelativeTime(conv.updated_at)}</span>
                      <span className="conv-item-count">{conv.message_count} 条</span>
                    </div>
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
              </div>
            ))}
            {filteredConvList.length === 0 && (
              <div className="conv-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                {convSearch ? '没有找到匹配的对话' : '暂无对话记录'}
              </div>
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
                <div className="message-content-wrapper">
                  <div className={`message-bubble message-bubble-${msg.role}`}>
                    {msg.role === 'assistant' ? (
                      msg.content ? (
                        <>
                          {msg.thinking && (
                            <details className="message-thinking">
                              <summary>思考过程</summary>
                              <div className="message-thinking-content">{msg.thinking}</div>
                            </details>
                          )}
                          <MessageContent
                            content={msg.content}
                            messageId={msg.id}
                            taskState={taskStates[msg.id]}
                            onTaskToggle={handleTaskToggle}
                            onTaskConfirm={handleTaskConfirm}
                          />
                          {streaming && i === messages.length - 1 && (
                            <span className="typing-cursor" />
                          )}
                        </>
                      ) : streaming && i === messages.length - 1 ? (
                        msg.thinking ? (
                          <details className="message-thinking" open>
                            <summary>思考中...</summary>
                            <div className="message-thinking-content">{msg.thinking}</div>
                          </details>
                        ) : (
                          <div className="thinking-dots">
                            <span /><span /><span />
                          </div>
                        )
                      ) : null
                    ) : (
                      <>
                        {msg.files && msg.files.length > 0 && (
                          <div className="msg-files">
                            {msg.files.map((f, fi) => {
                              const ext = (f.originalName || f.filename).split('.').pop()?.toLowerCase() || '';
                              const isImage = ['jpg','jpeg','png','gif','webp','bmp'].includes(ext);
                              const displayName = f.originalName || f.filename;
                              return isImage ? (
                                <div key={fi} className="msg-file-img">
                                  <img src={f.path} alt={displayName} />
                                </div>
                              ) : (
                                <div key={fi} className="msg-file-doc">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                                  </svg>
                                  <span>{displayName}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {(() => {
                          const kbMatch = msg.content.match(/\[知识库:([^\]]+)\]/);
                          const kbIds = kbMatch ? kbMatch[1].split(',') : [];
                          const displayContent = msg.content.replace(/\n?\[知识库:[^\]]+\]/g, '').replace(/\n?\[附件:[^\]]+\]/g, '').trim();
                          return (
                            <>
                              {displayContent}
                              {kbIds.length > 0 && (
                                <div className="msg-kb-refs">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
                                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                                  </svg>
                                  {kbIds.map((id) => {
                                    const kb = allKnowledges.find((k) => k.id === id);
                                    return kb ? <span key={id} className="msg-kb-tag">{kb.title}</span> : null;
                                  })}
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </>
                    )}
                  </div>
                  {msg.role === 'assistant' && msg.content && (
                    <div className="message-actions">
                      <button
                        type="button"
                        className="message-action-btn"
                        title="复制回复"
                        onClick={(e) => copyToClipboard(msg.content, e.currentTarget)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                      </button>
                    </div>
                  )}
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
                    const kbMatch = lastUser.content.match(/\[知识库:([^\]]+)\]/);
                    const kbIds = kbMatch ? kbMatch[1].split(',') : [];
                    const cleanContent = lastUser.content.replace(/\n?\[知识库:[^\]]+\]/g, '').trim();
                    handleSendMessage(cleanContent, kbIds);
                  }
                }}
              >
                重试
              </button>
            </div>
          )}

          {/* Text selection floating toolbar */}
          {selectionRect && (
            <div
              className="selection-toolbar"
              style={{
                position: 'fixed',
                top: Math.max(selectionRect.top - 44, 8),
                left: selectionRect.left + selectionRect.width / 2 - 50,
              }}
            >
              <button
                type="button"
                className="selection-toolbar-btn"
                onClick={() => {
                  setShowSubmitModal(true);
                  setSubmitMode('create');
                  setSubmitTitle('');
                  setSubmitTags([]);
                  setSubmitTagInput('');
                  setTargetKbId('');
                  setSelectedKbDetail(null);
                  setEditCellValue('');
                  setRowValues([]);
                  setInsertPosition(-1);
                  setTargetColumnIdx(0);
                  setAppendAction('none');
                  setFillCellRow(-1);
                  setFillCellCol(-1);
                  setFillCellText(selectionText);
                  setSelectionRect(null);
                  fetchKnowledges().then(setAllKnowledges).catch(() => {});
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>
                加入知识库
              </button>
            </div>
          )}

          {/* Submit to knowledge base modal */}
          {showSubmitModal && (
            <div className="submit-modal-overlay" onClick={() => setShowSubmitModal(false)}>
              <div className="submit-modal" onClick={(e) => e.stopPropagation()}>
                <div className="submit-modal-header">
                  <h3>加入知识库</h3>
                  <button type="button" className="submit-modal-close" onClick={() => setShowSubmitModal(false)}>×</button>
                </div>

                <div className="submit-modal-selected-text">
                  <div className="submit-modal-label">选中文本</div>
                  <div className="submit-modal-text-preview">{selectionText}</div>
                </div>

                <div className="submit-modal-tabs">
                  <button
                    type="button"
                    className={`submit-modal-tab ${submitMode === 'create' ? 'active' : ''}`}
                    onClick={() => setSubmitMode('create')}
                  >新建条目</button>
                  <button
                    type="button"
                    className={`submit-modal-tab ${submitMode === 'append' ? 'active' : ''}`}
                    onClick={() => { setSubmitMode('append'); setEditCellValue(selectionText); setRowValues([selectionText]); setInsertPosition(-1); setTargetColumnIdx(0); setAppendAction('none'); setFillCellRow(-1); setFillCellCol(-1); setFillCellText(selectionText); }}
                  >追加到已有条目</button>
                </div>

                {submitMode === 'create' ? (
                  <div className="submit-modal-fields">
                    <div className="submit-modal-field">
                      <label>标题 *</label>
                      <input
                        type="text"
                        value={submitTitle}
                        onChange={(e) => setSubmitTitle(e.target.value)}
                        placeholder="知识库条目标题"
                        maxLength={100}
                      />
                    </div>
                    <div className="submit-modal-field">
                      <label>标签</label>
                      <div className="submit-modal-tags-row">
                        {submitTags.map((tag, ti) => (
                          <span key={ti} className="submit-modal-tag">
                            {tag}
                            <button type="button" onClick={() => setSubmitTags((prev) => prev.filter((_, j) => j !== ti))}>×</button>
                          </span>
                        ))}
                        <input
                          type="text"
                          className="submit-modal-tag-input"
                          placeholder="回车添加标签"
                          value={submitTagInput}
                          onChange={(e) => setSubmitTagInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const tag = submitTagInput.trim();
                              if (tag && !submitTags.includes(tag)) {
                                setSubmitTags((prev) => [...prev, tag]);
                              }
                              setSubmitTagInput('');
                            }
                          }}
                          maxLength={20}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="submit-modal-fields">
                    <div className="submit-modal-field">
                      <label>选择知识库条目</label>
                      <select
                        value={targetKbId}
                        onChange={async (e) => {
                          const kbId = e.target.value;
                          setTargetKbId(kbId);
                          setSelectedKbDetail(null);
                          setAppendAction('none');
                          setFillCellRow(-1);
                          setFillCellCol(-1);
                          setFillCellText(selectionText);
                          if (kbId) {
                            try {
                              const detail = await fetchKnowledge(kbId);
                              console.log('[DEBUG] fetchKnowledge result:', detail);
                              console.log('[DEBUG] pending_cells:', detail.pending_cells);
                              setSelectedKbDetail(detail);
                            } catch {
                              setSelectedKbDetail(null);
                            }
                          }
                        }}
                      >
                        <option value="">请选择...</option>
                        {allKnowledges.map((kb) => (
                          <option key={kb.id} value={kb.id}>{kb.title}</option>
                        ))}
                      </select>
                    </div>
                    {(() => {
                      const selKb = selectedKbDetail || allKnowledges.find(kb => kb.id === targetKbId);
                      if (!selKb || selKb.format !== 'table') return null;
                      const cols = selKb.columns || [];
                      const rows = selKb.rows || [];
                      const pendingCells = selKb.pending_cells || [];
                      console.log('[DEBUG] Table render - pendingCells:', pendingCells, 'rows:', rows.length, 'cols:', cols.length);

                      const getCellInfo = (ri: number, ci: number) => {
                        const pending = pendingCells.find((p: { row: number; col: number }) => Number(p.row) === ri && Number(p.col) === ci);
                        if (pending) return { status: 'pending' as const, pending };
                        if (rows[ri]?.[ci]) return { status: 'filled' as const, text: rows[ri][ci] };
                        return { status: 'empty' as const };
                      };

                      return (
                        <>
                          <div className="submit-modal-field">
                            <label>已有内容（点击 [+] 插入新行，点击 [填] 填入空单元格）</label>
                            <div className="submit-modal-table-wrap">
                              <table className="submit-modal-table kb-interactive-table">
                                <thead>
                                  <tr>
                                    <th className="kb-insert-col"></th>
                                    {cols.map((col, ci) => <th key={ci}>{col || `列${ci + 1}`}</th>)}
                                  </tr>
                                </thead>
                                <tbody>
                                  {/* Insert before first row */}
                                  <tr className="kb-insert-row">
                                    <td className="kb-insert-cell">
                                      <button
                                        type="button"
                                        className={`kb-insert-btn ${appendAction === 'insert_row' && insertPosition === 0 ? 'active' : ''}`}
                                        onClick={() => {
                                          setAppendAction('insert_row');
                                          setInsertPosition(0);
                                          setFillCellRow(-1);
                                          setFillCellCol(-1);
                                          const init = cols.map((_: string, i: number) => i === 0 ? selectionText : '');
                                          setRowValues(init);
                                        }}
                                        title="在第1行前插入"
                                      >+</button>
                                    </td>
                                    <td colSpan={cols.length} className="kb-insert-label">在第1行前插入新行</td>
                                  </tr>
                                  {rows.map((_row: string[], ri: number) => (
                                    <Fragment key={`row-group-${ri}`}>
                                      <tr className="kb-data-row">
                                        <td className="kb-insert-cell">
                                          <button
                                            type="button"
                                            className={`kb-insert-btn ${appendAction === 'insert_row' && insertPosition === ri + 1 ? 'active' : ''}`}
                                            onClick={() => {
                                              setAppendAction('insert_row');
                                              setInsertPosition(ri + 1);
                                              setFillCellRow(-1);
                                              setFillCellCol(-1);
                                              const init = cols.map((_: string, i: number) => i === 0 ? selectionText : '');
                                              setRowValues(init);
                                            }}
                                            title={`在第${ri + 1}行后插入`}
                                          >+</button>
                                        </td>
                                        {cols.map((_: string, ci: number) => {
                                          const info = getCellInfo(ri, ci);
                                          if (info.status === 'filled') {
                                            return <td key={ci} className="kb-cell-filled" title="已有内容">{info.text}</td>;
                                          }
                                          if (info.status === 'pending') {
                                            return (
                                              <td key={ci} className="kb-cell-pending" title={`${info.pending.submitted_by_name} 提交，审核中`}>
                                                <span className="kb-pending-badge">审核中</span>
                                              </td>
                                            );
                                          }
                                          return (
                                            <td key={ci} className="kb-cell-empty">
                                              <button
                                                type="button"
                                                className={`kb-fill-btn ${appendAction === 'fill_cell' && fillCellRow === ri && fillCellCol === ci ? 'active' : ''}`}
                                                onClick={() => {
                                                  setAppendAction('fill_cell');
                                                  setFillCellRow(ri);
                                                  setFillCellCol(ci);
                                                  setFillCellText(selectionText);
                                                  setInsertPosition(-1);
                                                }}
                                              >填</button>
                                            </td>
                                          );
                                        })}
                                      </tr>
                                      {/* Insert after this row - shown for all but last */}
                                      {ri === rows.length - 1 && (
                                        <tr key={`insert-end`} className="kb-insert-row">
                                          <td className="kb-insert-cell">
                                            <button
                                              type="button"
                                              className={`kb-insert-btn ${appendAction === 'insert_row' && insertPosition === rows.length ? 'active' : ''}`}
                                              onClick={() => {
                                                setAppendAction('insert_row');
                                                setInsertPosition(rows.length);
                                                setFillCellRow(-1);
                                                setFillCellCol(-1);
                                                const init = cols.map((_: string, i: number) => i === 0 ? selectionText : '');
                                                setRowValues(init);
                                              }}
                                              title="追加到末尾"
                                            >+</button>
                                          </td>
                                          <td colSpan={cols.length} className="kb-insert-label">追加到末尾</td>
                                        </tr>
                                      )}
                                    </Fragment>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {/* Insert row confirmation */}
                          {appendAction === 'insert_row' && (
                            <div className="submit-modal-action-confirm">
                              <div className="submit-modal-field">
                                <label>
                                  当前操作：{insertPosition === 0 ? '在第1行前' : insertPosition === rows.length ? '追加到末尾' : `在第${insertPosition}行后`}插入新行
                                </label>
                                <div className="submit-modal-row-editor">
                                  {cols.map((col: string, ci: number) => (
                                    <div key={ci} className="submit-modal-row-cell">
                                      <span className="submit-modal-row-cell-label">{col || `列${ci + 1}`}</span>
                                      <input
                                        type="text"
                                        className="submit-modal-row-cell-input"
                                        value={rowValues[ci] || ''}
                                        onChange={(e) => {
                                          const next = [...rowValues];
                                          next[ci] = e.target.value;
                                          setRowValues(next);
                                        }}
                                        placeholder={`${col || `列${ci + 1}`}`}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="submit-modal-field">
                                <label>目标列（选中文本默认放入）</label>
                                <div className="submit-modal-target-col">
                                  {cols.map((col: string, ci: number) => (
                                    <button
                                      key={ci}
                                      type="button"
                                      className={`target-col-btn ${targetColumnIdx === ci ? 'active' : ''}`}
                                      onClick={() => {
                                        setTargetColumnIdx(ci);
                                        const next = cols.map((_: string, i: number) => i === ci ? selectionText : '');
                                        setRowValues(next);
                                      }}
                                    >{col || `列${ci + 1}`}</button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Fill cell confirmation */}
                          {appendAction === 'fill_cell' && fillCellRow >= 0 && fillCellCol >= 0 && (
                            <div className="submit-modal-action-confirm">
                              <div className="submit-modal-field">
                                <label>当前操作：填入 第{fillCellRow + 1}行 "{cols[fillCellCol] || `列${fillCellCol + 1}`}" 列</label>
                                <textarea
                                  className="submit-modal-fill-textarea"
                                  value={fillCellText}
                                  onChange={(e) => setFillCellText(e.target.value)}
                                  rows={3}
                                  placeholder="输入要填入的内容..."
                                />
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}

                <div className="submit-modal-actions">
                  <button
                    type="button"
                    className="submit-modal-cancel"
                    onClick={() => setShowSubmitModal(false)}
                  >取消</button>
                  <button
                    type="button"
                    className="submit-modal-submit"
                    disabled={submitting || (submitMode === 'create' && !submitTitle.trim()) || (submitMode === 'append' && (!targetKbId || appendAction === 'none')) || (submitMode === 'append' && appendAction === 'fill_cell' && (fillCellRow < 0 || fillCellCol < 0))}
                    onClick={async () => {
                      setSubmitting(true);
                      try {
                        // Use selectedKbDetail first (has latest format/pending_cells) then fall back to allKnowledges
                        const selKb = selectedKbDetail || (targetKbId ? allKnowledges.find(k => k.id === targetKbId) : null);
                        const isTable = submitMode === 'append' && selKb?.format === 'table';
                        const isCellFill = isTable && appendAction === 'fill_cell';
                        const payload: Parameters<typeof createSubmission>[0] = {
                          selected_text: isCellFill ? fillCellText : (submitMode === 'append' ? (isTable ? (rowValues[0] || '') : editCellValue) : selectionText),
                          title: submitMode === 'create' ? submitTitle.trim() : '',
                          tags: submitMode === 'create' ? submitTags : [],
                          action_type: submitMode,
                          target_kb_id: submitMode === 'append' ? targetKbId : undefined,
                        };
                        if (isTable) {
                          if (isCellFill) {
                            payload.target_row = fillCellRow;
                            payload.target_column = fillCellCol;
                            payload.row_values = [];
                          } else {
                            payload.target_row = insertPosition;
                            payload.target_column = targetColumnIdx;
                            payload.row_values = rowValues;
                          }
                        }
                        const res = await createSubmission(payload);
                        // Refresh KB detail before closing so pending_cells is fresh on reopen
                        if (targetKbId && submitMode === 'append') {
                          try {
                            const fresh = await fetchKnowledge(targetKbId);
                            setSelectedKbDetail(fresh);
                          } catch {}
                        }
                        setShowSubmitModal(false);
                        setSelectionText('');
                        // Refresh knowledge list so allKnowledges stays up to date
                        fetchKnowledges().then(setAllKnowledges).catch(() => {});
                        if (res.status === 'approved') {
                          setSubmitToast('已加入知识库');
                        } else {
                          setSubmitToast('已提交审核，等待管理员通过');
                        }
                        setTimeout(() => setSubmitToast(''), 3000);
                      } catch (err: unknown) {
                        setSubmitToast(err instanceof Error ? err.message : '提交失败');
                        setTimeout(() => setSubmitToast(''), 3000);
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                  >{submitting ? '提交中...' : '提交'}</button>
                </div>
              </div>
            </div>
          )}

          {/* Toast notification */}
          {submitToast && (
            <div className="submit-toast">{submitToast}</div>
          )}

          <div className="chat-input-area">
            <div className="chat-input-card" ref={inputCardRef}>
              <textarea
                ref={textareaRef}
                className="chat-textarea"
                placeholder="继续对话... 输入 @ 引用知识库 | Ctrl+Enter 换行"
                rows={1}
                maxLength={5000}
                value={input}
                onChange={handleInputWithAt}
                onKeyDown={handleKeyDown}
                disabled={streaming}
              />

              {files.length > 0 && (
                <div className="file-preview-area">
                  {files.map((f, i) => {
                    const ext = (f.originalName || f.filename).split('.').pop()?.toLowerCase() || '';
                    const isImage = ['jpg','jpeg','png','gif','webp','bmp'].includes(ext);
                    return (
                      <div key={i} className="file-preview-item">
                        {isImage && <img className="file-preview-thumb" src={f.path} alt={f.originalName} />}
                        <span>{f.originalName || f.filename}</span>
                        <button
                          className="file-preview-remove"
                          onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {uploading.length > 0 && (
                <div className="file-preview-area">
                  {uploading.map((u) => (
                    <div key={u.name} className="upload-progress-item">
                      <span className="upload-progress-name">{u.name}</span>
                      <div className="upload-progress-bar">
                        <div className="upload-progress-fill" style={{ width: `${u.progress}%` }} />
                      </div>
                      <span className="upload-progress-pct">{u.progress}%</span>
                    </div>
                  ))}
                </div>
              )}

              {selectedKbIds.length > 0 && (
                <div className="kb-chips-area">
                  <span className="kb-chips-label">引用知识库</span>
                  {selectedKbIds.map((id) => {
                    const kb = allKnowledges.find((k) => k.id === id);
                    if (!kb) return null;
                    return (
                      <span key={id} className="kb-chip">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12 }}>
                          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                        </svg>
                        {kb.title}
                        <button
                          className="kb-chip-remove"
                          onClick={() => setSelectedKbIds((prev) => prev.filter((k) => k !== id))}
                        >×</button>
                      </span>
                    );
                  })}
                </div>
              )}

              {atMenuOpen && filteredKnowledges.length > 0 && (
                <div className="at-menu">
                  <div className="at-menu-header">引用知识库</div>
                  <div className="at-menu-list">
                    {filteredKnowledges.slice(0, 10).map((kb) => (
                      <button
                        key={kb.id}
                        className="at-menu-item"
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleAtSelect(kb);
                        }}
                      >
                        <span className="at-menu-item-title">{kb.title}</span>
                        {kb.tags.length > 0 && (
                          <span className="at-menu-item-tags">
                            {kb.tags.slice(0, 3).join(', ')}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="input-footer">
                <div className="input-left-actions">
                  <button
                    className={`input-icon-btn ${searchEnabled ? 'active' : ''}`}
                    type="button"
                    onClick={() => setSearchEnabled(!searchEnabled)}
                    title={searchEnabled ? '关闭联网搜索' : '开启联网搜索'}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <circle cx="11" cy="11" r="8" />
                      <path d="M21 21l-4.35-4.35" />
                    </svg>
                  </button>
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
const MessageContent = memo(function MessageContent({
  content,
  messageId,
  taskState,
  onTaskToggle,
  onTaskConfirm,
}: {
  content: string;
  messageId?: number;
  taskState?: boolean[];
  onTaskToggle?: (messageId: number, taskIndex: number, isRadio?: boolean) => void;
  onTaskConfirm?: (messageId: number, tasks: { text: string; checked: boolean }[]) => void;
}) {
  // 复制文本到剪贴板
  const copyToClipboard = async (text: string, button?: HTMLButtonElement) => {
    try {
      await navigator.clipboard.writeText(text);
      if (button) {
        const original = button.textContent;
        button.textContent = '已复制';
        button.disabled = true;
        setTimeout(() => {
          button.textContent = original;
          button.disabled = false;
        }, 2000);
      }
    } catch {
      // 降级方案
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      if (button) {
        const original = button.textContent;
        button.textContent = '已复制';
        button.disabled = true;
        setTimeout(() => {
          button.textContent = original;
          button.disabled = false;
        }, 2000);
      }
    }
  };
  // 检测是否为 JSON 格式的选择题
  const parseJsonQuestions = (text: string) => {
    try {
      // 尝试从文本中提取 JSON 数组
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].question && parsed[0].options) {
          return parsed;
        }
      }
    } catch {}
    return null;
  };

  // 检测是否为确认性语句
  const isConfirmPrompt = (text: string) => {
    const confirmPatterns = [
      /请确认/,
      /确认后/,
      /是否符合/,
      /如有需要补充/,
      /确认后进入/,
      /是否.*正确/,
      /是否.*准确/,
      /是否.*同意/,
      /请.*确认/,
      /确认.*后/,
      /是否.*实际/,
      /是否.*符合/,
      /补充.*调整/,
      /调整.*细节/,
    ];
    return confirmPatterns.some((pattern) => pattern.test(text));
  };

  // 检测是否在代码块中的 JSON
  const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  const contentToParse = codeBlockMatch ? codeBlockMatch[1] : content;
  const jsonQuestions = parseJsonQuestions(contentToParse);
  const showConfirmButton = !jsonQuestions && isConfirmPrompt(content);

  // 如果是 JSON 格式，渲染为可交互的选择题
  if (jsonQuestions) {
    // 处理 JSON 选择题的单选自动确认
    const handleJsonRadioChange = (qi: number, oi: number) => {
      if (messageId == null || !onTaskToggle || !onTaskConfirm) return;
      const taskKey = qi * 100 + oi;
      onTaskToggle(messageId, taskKey);
      // 单选模式下，选择后自动发送结果
      if (!jsonQuestions[qi].multiSelect) {
        setTimeout(() => {
          const tasks = [{ text: `${jsonQuestions[qi].question} - ${jsonQuestions[qi].options[oi].label}`, checked: true }];
          onTaskConfirm(messageId, tasks);
        }, 100);
      }
    };

    return (
      <div className="json-questions-container">
        {jsonQuestions.map((q: { question: string; header?: string; multiSelect?: boolean; options: { label: string; description?: string }[] }, qi: number) => (
          <div key={qi} className="json-question-block">
            {q.header && <div className="json-question-header">{q.header}</div>}
            <div className="json-question-text">{q.question}</div>
            <div className="json-options-list">
              {q.options.map((opt, oi) => {
                const taskKey = qi * 100 + oi;
                const checked = taskState ? (taskState[taskKey] ?? false) : false;
                return (
                  <label key={oi} className="json-option-item">
                    <input
                      type={q.multiSelect ? 'checkbox' : 'radio'}
                      name={`json-q-${messageId}-${qi}`}
                      checked={checked}
                      onChange={() => q.multiSelect ? (messageId != null && onTaskToggle?.(messageId, taskKey)) : handleJsonRadioChange(qi, oi)}
                      className="json-option-input"
                    />
                    <div className="json-option-content">
                      <div className="json-option-label">{opt.label}</div>
                      {opt.description && <div className="json-option-desc">{opt.description}</div>}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        {/* 多选模式显示确认按钮 */}
        {jsonQuestions.some((q: { multiSelect?: boolean }) => q.multiSelect) && messageId != null && onTaskConfirm && (
          <button
            type="button"
            className="task-confirm-btn"
            onClick={() => {
              const tasks: { text: string; checked: boolean }[] = [];
              jsonQuestions.forEach((q: { question: string; options: { label: string }[] }, qi: number) => {
                q.options.forEach((opt, oi) => {
                  const taskKey = qi * 100 + oi;
                  const checked = taskState ? (taskState[taskKey] ?? false) : false;
                  if (checked) {
                    tasks.push({ text: `${q.question} - ${opt.label}`, checked: true });
                  }
                });
              });
              onTaskConfirm(messageId, tasks);
            }}
          >
            确认选择
          </button>
        )}
        {/* 可复制的文本内容 */}
        <div className="json-questions-text-content">
          {jsonQuestions.map((q: { question: string; options: { label: string; description?: string }[] }, qi: number) => (
            <div key={qi}>
              <p><strong>{q.question}</strong></p>
              <ul>
                {q.options.map((opt, oi) => (
                  <li key={oi}>
                    {opt.label}
                    {opt.description && `：${opt.description}`}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          const match = part.match(/```(\w*)\n?([\s\S]*?)```/);
          if (match) {
            const lang = match[1];
            const code = match[2];
            return (
              <div key={i} className="code-block-wrapper">
                <div className="code-block-header">
                  {lang && <span className="code-block-lang">{lang}</span>}
                  <button
                    type="button"
                    className="code-block-copy"
                    onClick={(e) => copyToClipboard(code, e.currentTarget)}
                  >
                    复制
                  </button>
                </div>
                <pre>
                  <code>{code}</code>
                </pre>
              </div>
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

        // 预处理：检测是否有多行加粗选项格式
        // 只有当内容中包含明确的选择指示词，且有多行加粗选项时，才认为是选择题格式
        const hasExplicitSelectKeyword = content.includes('请选择') || content.includes('请勾选') || content.includes('可多选') || content.includes('可单选') || content.includes('请选择以下') || content.includes('请从以下') || content.includes('勾选出') || content.includes('选择1个') || content.includes('选择2个') || content.includes('选择3个') || content.includes('多选') || content.includes('单选');
        const boldOptionLines = lines.filter(l => l.match(/^\*\*[^*]+\*\*[：:]/));
        const hasMultipleBoldOptions = hasExplicitSelectKeyword && boldOptionLines.length >= 2;

        // 预处理：检测是否有数字列表格式的选择题
        const olLines = lines.filter(l => l.match(/^\d+\.\s/));
        const hasMultipleOlOptions = hasExplicitSelectKeyword && olLines.length >= 2;

        // 预处理：检测是否有任务列表格式的选择题
        const taskListLines = lines.filter(l => l.match(/^[-*] \[[ x]\]/));
        const hasMultipleTaskListOptions = hasExplicitSelectKeyword && taskListLines.length >= 2;

        for (const line of lines) {
          let type = 'p';
          if (line.startsWith('# ')) type = 'h1';
          else if (line.startsWith('## ')) type = 'h2';
          else if (line.startsWith('### ')) type = 'h3';
          else if (line.startsWith('> ')) type = 'blockquote';
          else if (hasMultipleTaskListOptions && line.match(/^[-*] \[[ x]\]/)) type = 'task-list';
          else if (line.match(/^[-*] /)) type = 'ul';
          else if (hasMultipleOlOptions && line.match(/^\d+\.\s/)) type = 'ol';
          else if (hasMultipleBoldOptions && line.match(/^\*\*[^*]+\*\*[：:]/)) type = 'bold-options';

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
          if (block.type === 'ol') {
            // 检测是否是多选模式（检查前面的文本是否包含"多选"关键词）
            const isMultiSelect = content.includes('多选') || content.includes('可多选');
            const tasks = block.lines.map((line, k) => {
              const text = line.replace(/^\d+\.\s*/, '');
              const checked = taskState ? (taskState[k] ?? false) : false;
              return { text, checked };
            });
            return (
              <div key={key} className="task-list-container">
                <ul className="task-list">
                  {tasks.map((task, k) => (
                    <li key={k} className="task-item">
                      <input
                        type={isMultiSelect ? 'checkbox' : 'radio'}
                        name={isMultiSelect ? undefined : `ol-options-${messageId}`}
                        checked={task.checked}
                        onChange={() => messageId != null && onTaskToggle?.(messageId, k, !isMultiSelect)}
                        className="task-checkbox"
                      />
                      <span className="task-text">{task.text}</span>
                    </li>
                  ))}
                </ul>
                {messageId != null && onTaskConfirm && (
                  <button
                    type="button"
                    className="task-confirm-btn"
                    onClick={() => onTaskConfirm(messageId, tasks)}
                  >
                    确认
                  </button>
                )}
                {/* 可复制的文本内容 */}
                <div className="json-questions-text-content">
                  <ul>
                    {tasks.map((task, k) => (
                      <li key={k}>{task.text}</li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          }
          if (block.type === 'task-list') {
            // 检测是否是多选模式（检查前面的文本是否包含"多选"关键词）
            const isMultiSelect = content.includes('多选') || content.includes('可多选');
            const tasks = block.lines.map((line, k) => {
              const defaultChecked = line.match(/^[-*] \[x\]/i) !== null;
              const text = line.replace(/^[-*] \[[ x]\]\s*/i, '');
              const checked = taskState ? (taskState[k] ?? defaultChecked) : defaultChecked;
              return { text, checked };
            });
            return (
              <div key={key} className="task-list-container">
                <ul className="task-list">
                  {tasks.map((task, k) => (
                    <li key={k} className="task-item">
                      <input
                        type={isMultiSelect ? 'checkbox' : 'radio'}
                        name={isMultiSelect ? undefined : `task-list-${messageId}`}
                        checked={task.checked}
                        onChange={() => messageId != null && onTaskToggle?.(messageId, k, !isMultiSelect)}
                        className="task-checkbox"
                      />
                      <span className={task.checked ? 'task-text-done' : 'task-text'}>{task.text}</span>
                    </li>
                  ))}
                </ul>
                {messageId != null && onTaskConfirm && (
                  <button
                    type="button"
                    className="task-confirm-btn"
                    onClick={() => onTaskConfirm(messageId, tasks)}
                  >
                    确认
                  </button>
                )}
                {/* 可复制的文本内容 */}
                <div className="json-questions-text-content">
                  <ul>
                    {tasks.map((task, k) => (
                      <li key={k}>{task.text}</li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          }
          if (block.type === 'bold-options') {
            // 检测是否是多选模式（检查前面的文本是否包含"多选"关键词）
            const isMultiSelect = content.includes('多选') || content.includes('可多选');
            const tasks = block.lines.map((line, k) => {
              const match = line.match(/^\*\*([^*]+)\*\*[：:]\s*(.*)/);
              const label = match ? match[1] : line;
              const desc = match ? match[2] : '';
              const checked = taskState ? (taskState[k] ?? false) : false;
              return { label, desc, checked };
            });

            // 处理单选自动确认（选择后自动发送结果）
            const handleRadioChange = (k: number) => {
              if (messageId == null || !onTaskToggle || !onTaskConfirm) return;
              onTaskToggle(messageId, k, true);
              // 单选模式下，选择后自动发送结果
              if (!isMultiSelect) {
                setTimeout(() => {
                  onTaskConfirm(messageId, [{ text: tasks[k].label, checked: true }]);
                }, 100);
              }
            };

            return (
              <div key={key} className="task-list-container">
                <ul className="task-list">
                  {tasks.map((task, k) => (
                    <li key={k} className="task-item">
                      <input
                        type={isMultiSelect ? 'checkbox' : 'radio'}
                        name={isMultiSelect ? undefined : `bold-options-${messageId}`}
                        checked={task.checked}
                        onChange={() => isMultiSelect ? (messageId != null && onTaskToggle?.(messageId, k, false)) : handleRadioChange(k)}
                        className="task-checkbox"
                      />
                      <div className="task-text">
                        <strong>{task.label}</strong>
                        {task.desc && <span className="task-desc">：{task.desc}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
                {isMultiSelect && messageId != null && onTaskConfirm && (
                  <button
                    type="button"
                    className="task-confirm-btn"
                    onClick={() => onTaskConfirm(messageId, tasks.map(t => ({ text: t.label, checked: t.checked })))}
                  >
                    确认选择
                  </button>
                )}
                {/* 可复制的文本内容 */}
                <div className="json-questions-text-content">
                  <ul>
                    {tasks.map((task, k) => (
                      <li key={k}>
                        {task.label}
                        {task.desc && `：${task.desc}`}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
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
      {/* 确认按钮 - 用于确认性语句 */}
      {showConfirmButton && messageId != null && onTaskConfirm && (
        <div className="confirm-prompt-container">
          <button
            type="button"
            className="task-confirm-btn"
            onClick={() => onTaskConfirm(messageId, [{ text: '确认', checked: true }])}
          >
            确认
          </button>
        </div>
      )}
    </>
  );
})
