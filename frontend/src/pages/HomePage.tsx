import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchAgents,
  fetchSettings,
  fetchModelsCatalog,
  uploadFile,
  type Agent,
  type ModelOption,
  type ModelInfo,
} from '../services/api';
import { useToast } from '../hooks/useToast';
import './HomePage.css';

const CATEGORY_LABELS: Record<string, { icon: string; name: string }> = {
  general: { icon: '🤖', name: '通用' },
  management: { icon: '📋', name: '管理工具' },
  ecommerce: { icon: '🛒', name: '电商工具' },
  design: { icon: '🎨', name: '设计工具' },
  xiaohongshu: { icon: '📕', name: '小红书工具' },
  business_coach: { icon: '👔', name: '商业教练' },
  caishui: { icon: '💰', name: '财税工具' },
};

const KNOWN_CATEGORY_ORDER = ['general', 'management', 'ecommerce', 'design', 'xiaohongshu', 'business_coach', 'caishui'];

const SUGGESTIONS = [
  { icon: '📊', label: '高效办公', prompt: '帮我整理一份高效办公方案' },
  { icon: '✍️', label: '创意写作', prompt: '帮我写一篇创意文案' },
  { icon: '💻', label: '编程助手', prompt: '帮我写一段代码' },
  { icon: '📈', label: '数据分析', prompt: '帮我分析一下数据趋势' },
];

interface UploadedFile {
  filename: string;
  path: string;
}

export default function HomePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [allModels, setAllModels] = useState<ModelOption[]>([]);
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState<ModelOption | null>(null);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAgents().then(setAgents).catch(() => {});
    Promise.all([fetchSettings(), fetchModelsCatalog()])
      .then(([s, catalog]) => {
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
        if (found) setSelectedModel(found);
        else if (modelOpts.length) setSelectedModel(modelOpts[0]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSend = () => {
    if (!input.trim()) return;
    let message = input.trim();
    if (files.length > 0) {
      const fileInfo = files.map((f) => `[附件: ${f.filename}]`).join(' ');
      message = `${message}\n\n${fileInfo}`;
    }
    navigate(`/chat/general`, {
      state: {
        initialMessage: message,
        model: selectedModel,
      },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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
        toast(err instanceof Error ? err.message : '上传失败', 'error');
      }
    }
    e.target.value = '';
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSuggestion = (prompt: string) => {
    setInput(prompt);
    textareaRef.current?.focus();
  };

  const grouped = agents.reduce<Record<string, Agent[]>>((acc, item) => {
    (acc[item.category] ||= []).push(item);
    return acc;
  }, {});

  // Dynamic category order: known categories first, then any unknown ones from data
  const dataCategories = Object.keys(grouped);
  const categoryOrder = [
    ...KNOWN_CATEGORY_ORDER.filter((c) => dataCategories.includes(c)),
    ...dataCategories.filter((c) => !KNOWN_CATEGORY_ORDER.includes(c)),
  ];

  return (
    <div className="content-area">
      {/* Ambient background orbs */}
      <div className="home-ambient">
        <div className="home-ambient-orb home-ambient-orb--gold" />
        <div className="home-ambient-orb home-ambient-orb--violet" />
        <div className="home-ambient-orb home-ambient-orb--rose" />
      </div>

      <div className="home-page">
        <p className="hero-greeting">AI 电商智能平台</p>
        <h1 className="hero-title">需要我为你做些什么？</h1>
        <p className="hero-subtitle">30+ 智能工具，覆盖电商运营全链路，让效率触手可及</p>

        <div className="input-card">
          <textarea
            ref={textareaRef}
            className="input-textarea"
            placeholder="在这里输入任何问题..."
            rows={2}
            maxLength={5000}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />

          {files.length > 0 && (
            <div className="file-preview-area">
              {files.map((f, i) => (
                <div key={i} className="file-preview-item">
                  <span>{f.filename}</span>
                  <button className="file-preview-remove" onClick={() => removeFile(i)}>
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

              <button
                className="send-btn"
                type="button"
                disabled={!input.trim() || !selectedModel}
                onClick={handleSend}
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className="suggestions-row">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              className="suggestion-chip"
              type="button"
              onClick={() => handleSuggestion(s.prompt)}
            >
              <span className="suggestion-icon">{s.icon}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>

        <div className="categories-section">
          <div className="section-header">
            <h2 className="section-title">热门应用</h2>
          </div>
          {categoryOrder.map((cat, ci) => {
            const catTools = grouped[cat];
            if (!catTools?.length) return null;
            const meta = CATEGORY_LABELS[cat] || { icon: '📁', name: cat };
            return (
              <div
                key={cat}
                className="category-group"
                style={{ opacity: 0, animation: `hero-fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) ${0.8 + ci * 0.1}s forwards` }}
              >
                <div className="category-header">
                  <span className="category-icon">{meta.icon}</span>
                  <span className="category-name">{meta.name}</span>
                  <span className="category-count">{catTools.length}</span>
                </div>
                <div className="tool-grid">
                  {catTools.map((tool) => (
                    <a
                      key={tool.id}
                      className="tool-card"
                      href={`/chat/${tool.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(`/chat/${tool.id}`);
                      }}
                    >
                      <span
                        className="tool-card-icon"
                        style={{ background: tool.icon_bg_color, color: tool.icon_color }}
                      >
                        {tool.icon}
                      </span>
                      <span className="tool-card-info">
                        <span className="tool-card-name">{tool.name}</span>
                        <span className="tool-card-desc">{tool.description}</span>
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
