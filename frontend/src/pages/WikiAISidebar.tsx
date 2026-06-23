import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { marked } from 'marked';
import {
  fetchModelsCatalog, fetchWikiSources, wikiQuery, wikiLint,
  type ModelInfo, type WikiSource, type WikiModelConfig,
} from '../services/api';
import { useHasPermission } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import WikiImportModal from './WikiImportModal';
import './WikiAISidebar.css';

function parseMd(text: string): string {
  if (!text) return '';
  try {
    return marked.parse(text, { async: false, breaks: true }) as string;
  } catch {
    return text.replace(/</g, '&lt;').replace(/\n/g, '<br>');
  }
}

const SIDEBAR_KEY = 'wiki_sidebar_open';
const CHAT_KEY = 'wiki_sidebar_msgs';

interface Citation {
  page_id: string;
  title: string;
  excerpt: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  error?: boolean;
}

interface Props {
  spaceId?: string;
  compact?: boolean;
  onCiteClick?: (pageId: string, title: string) => void;
  onLintDone?: () => void;
  onImportDone?: () => void;
}

export default function WikiAISidebar({ spaceId, compact, onCiteClick, onLintDone, onImportDone }: Props) {
  const navigate = useNavigate();
  const hasPerm = useHasPermission();
  const { toast } = useToast();
  const canCreate = hasPerm('wiki:create');

  const [open, setOpen] = useState(() => {
    try { return sessionStorage.getItem(SIDEBAR_KEY) === '1'; } catch { return false; }
  });
  const [customModels, setCustomModels] = useState<ModelInfo[]>([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [sources, setSources] = useState<WikiSource[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [linting, setLinting] = useState(false);

  // Chat messages - restore from sessionStorage
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(CHAT_KEY) || '[]'); } catch { return []; }
  });
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const queryEndRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      try { sessionStorage.setItem(SIDEBAR_KEY, next ? '1' : '0'); } catch { /* */ }
      return next;
    });
  }, []);

  // Load models + sources
  useEffect(() => {
    fetchModelsCatalog()
      .then((m) => {
        const customs = m.filter((x: ModelInfo) => !x.builtin);
        setCustomModels(customs);
        if (customs.length > 0 && !selectedModelId) {
          setSelectedModelId(customs[0].id || '');
        }
      })
      .catch(() => {});
    if (spaceId) fetchWikiSources(spaceId).then(setSources).catch(() => {});
  }, [spaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    queryEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, asking]);

  // Persist messages to sessionStorage
  useEffect(() => {
    try { sessionStorage.setItem(CHAT_KEY, JSON.stringify(messages)); } catch { /* */ }
  }, [messages]);

  const getModelConfig = (): Partial<WikiModelConfig> => {
    const m = customModels.find((cm) => cm.id === selectedModelId);
    if (!m) return {};
    return { model: m.model, provider: m.provider, api_key: m.api_key || '', base_url: m.base_url || '' };
  };

  const handleAsk = async () => {
    if (!question.trim() || !spaceId) return;
    if (!selectedModelId) {
      setMessages((prev) => [...prev, { role: 'assistant', content: '请先选择一个模型', error: true }]);
      return;
    }
    const q = question.trim();
    setQuestion('');
    setAsking(true);
    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    try {
      const r = await wikiQuery({ space_id: spaceId, question: q, ...getModelConfig() });
      setMessages((prev) => [...prev, { role: 'assistant', content: r.answer, citations: r.citations }]);
    } catch (e: unknown) {
      setMessages((prev) => [...prev, { role: 'assistant', content: e instanceof Error ? e.message : '问答失败', error: true }]);
    } finally {
      setAsking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk(); }
  };

  const handleCiteClick = (pageId: string, title: string) => {
    if (onCiteClick) onCiteClick(pageId, title);
    else navigate(`/wiki/${spaceId}/page/${pageId}`);
  };

  const handleLint = async () => {
    if (!spaceId || linting) return;
    setLinting(true);
    try {
      const result = await wikiLint({ space_id: spaceId, ...getModelConfig() });
      toast(`检查完成：${result.summary}，发现 ${result.issues.length} 个问题`, 'success');
      onLintDone?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : '检查失败', 'error');
    } finally {
      setLinting(false);
    }
  };

  return (
    <>
      {/* Toggle button */}
      <button
        className={`wiki-sidebar-toggle ${open ? 'open' : ''}`}
        onClick={toggle}
        title={open ? '收起 AI 助手' : '展开 AI 助手'}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
        </svg>
        {!open && <span className="wiki-sidebar-toggle-label">AI</span>}
      </button>

      {/* Sidebar panel */}
      {open && (
        <div className="wiki-sidebar">
          <div className="wiki-sidebar-header">
            <h3>AI 助手</h3>
            <button className="wiki-sidebar-close" onClick={toggle}>&times;</button>
          </div>
          <div className="wiki-sidebar-body">
            {/* Model selector */}
            <div className="wiki-sidebar-section">
              <label className="wiki-sidebar-label">模型选择</label>
              {customModels.length > 0 ? (
                <select
                  className="wiki-sidebar-select"
                  value={selectedModelId}
                  onChange={(e) => setSelectedModelId(e.target.value)}
                >
                  {customModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              ) : (
                <span className="wiki-sidebar-hint">
                  请先在<span style={{ color: 'var(--brand)', cursor: 'pointer' }} onClick={() => navigate('/settings')}>模型设置</span>中添加自定义模型
                </span>
              )}
            </div>

            {/* Action buttons - hidden in compact mode */}
            {canCreate && !compact && (
              <div className="wiki-sidebar-section wiki-sidebar-actions">
                <button className="wiki-sidebar-btn" onClick={() => setShowImport(true)} disabled={!selectedModelId}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12"/><path d="m8 11 4 4 4-4"/><path d="M8 5H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V7a2 2 0 00-2-2h-4"/></svg>
                  智能导入
                </button>
                <button className="wiki-sidebar-btn" onClick={handleLint} disabled={!selectedModelId || linting}>
                  {linting ? <div className="wiki-spinner" style={{ width: 14, height: 14 }} /> : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
                  )}
                  {linting ? '检查中...' : '质量检查'}
                </button>
              </div>
            )}

            {/* AI Q&A chat */}
            <div className="wiki-sidebar-section wiki-sidebar-chat">
              <div className="wiki-sidebar-label-row">
                <label className="wiki-sidebar-label" style={{ marginBottom: 0 }}>AI 问答</label>
                {messages.length > 0 && (
                  <button className="wiki-chat-clear" onClick={() => setMessages([])}>清空</button>
                )}
              </div>
              <div className="wiki-chat-messages">
                {messages.length === 0 && !asking && (
                  <div className="wiki-chat-placeholder">
                    {spaceId ? '输入问题，AI 会基于知识库内容回答' : '选择一个知识空间后，即可开始 AI 问答'}
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className={`wiki-chat-msg wiki-chat-msg-${msg.role}`}>
                    {msg.role === 'user' ? (
                      <div className="wiki-chat-bubble-user">{msg.content}</div>
                    ) : (
                      <div className={`wiki-chat-bubble-ai ${msg.error ? 'wiki-chat-bubble-error' : ''}`}>
                        {msg.error ? (
                          <span>{msg.content}</span>
                        ) : (
                          <>
                            <div className="wiki-chat-answer-text" dangerouslySetInnerHTML={{ __html: parseMd(msg.content) }} />
                            {msg.citations && msg.citations.length > 0 && (
                              <div className="wiki-chat-citations">
                                <div className="wiki-chat-citations-title">引用来源</div>
                                {msg.citations.map((c, j) => (
                                  <div key={j} className="wiki-chat-citation" onClick={() => handleCiteClick(c.page_id, c.title)}>
                                    <div className="wiki-chat-cite-title">{c.title}</div>
                                    <div className="wiki-chat-cite-excerpt">{c.excerpt}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {asking && (
                  <div className="wiki-chat-msg wiki-chat-msg-assistant">
                    <div className="wiki-chat-bubble-ai wiki-chat-thinking-bubble">
                      <div className="wiki-spinner" style={{ width: 14, height: 14 }} />
                      AI 正在思考...
                    </div>
                  </div>
                )}
                <div ref={queryEndRef} />
              </div>
              <div className="wiki-chat-input-row">
                <textarea
                  className="wiki-chat-input"
                  placeholder={!spaceId ? '请先进入知识空间，再提问' : selectedModelId ? '输入你的问题，Enter 发送...' : '请先选择模型，再提问'}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  disabled={!spaceId}
                />
                <button
                  className="wiki-chat-send"
                  onClick={handleAsk}
                  disabled={!question.trim() || asking || !spaceId}
                >
                  {asking ? (
                    <div className="wiki-spinner" style={{ width: 16, height: 16 }} />
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showImport && spaceId && (
        <WikiImportModal
          spaceId={spaceId}
          sources={sources}
          modelConfig={getModelConfig()}
          onClose={() => setShowImport(false)}
          onDone={() => { setShowImport(false); onImportDone?.(); }}
        />
      )}
    </>
  );
}
