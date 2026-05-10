import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  fetchAgent,
  fetchAgents,
  createAgent,
  updateAgent,
  uploadFile,
  fetchSettings,
  fetchModelsCatalog,
  fetchDepartments,
  type Agent,
  type ModelOption,
  type ModelInfo,
  type Department,
} from '../services/api';
import './AgentFormPage.css';

const CATEGORY_LABELS: Record<string, string> = {
  general: '通用',
  management: '管理工具',
  ecommerce: '电商工具',
  design: '设计工具',
  xiaohongshu: '小红书工具',
  business_coach: '商业教练',
  caishui: '财税工具',
};

const ICON_PRESETS = ['🤖', '✍️', '💻', '📊', '🎨', '📈', '🔍', '🎯', '💡', '🚀', '📝', '🎬', '💰', '👥', '📕', '🔧', '📐', '🧪', '🌐', '⚡'];

const COLOR_PRESETS = [
  { bg: '#7c6cf014', color: '#7c6cf0' },
  { bg: '#1a73e814', color: '#1a73e8' },
  { bg: '#22c55e14', color: '#22c55e' },
  { bg: '#f59e0b14', color: '#f59e0b' },
  { bg: '#ef444414', color: '#ef4444' },
  { bg: '#ec489914', color: '#ec4899' },
  { bg: '#06b6d414', color: '#06b6d4' },
  { bg: '#8b5cf614', color: '#8b5cf6' },
];

type AgentForm = Omit<Agent, 'id' | 'created_at' | 'updated_at'>;

const defaultForm: AgentForm = {
  name: '',
  description: '',
  icon: '🤖',
  icon_bg_color: '#7c6cf014',
  icon_color: '#7c6cf0',
  category: 'general',
  system_prompt: '',
  welcome_message: '',
  suggestions: [],
  knowledge_files: [],
  default_model: 'gpt-4o',
  default_provider: 'openai',
  department_id: '',
};

export default function AgentFormPage() {
  const navigate = useNavigate();
  const { agentId } = useParams();
  const isEdit = !!agentId;

  const [form, setForm] = useState<AgentForm>(defaultForm);
  const [suggestionInput, setSuggestionInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [categories, setCategories] = useState<{ value: string; label: string }[]>([
    { value: 'general', label: '通用' },
  ]);
  const [departments, setDepartments] = useState<Department[]>([]);

  useEffect(() => {
    fetchAgents()
      .then((agents) => {
        const catSet = new Set(agents.map((a) => a.category));
        const cats = Array.from(catSet).map((c) => ({
          value: c,
          label: CATEGORY_LABELS[c] || c,
        }));
        if (cats.length) setCategories(cats);
      })
      .catch(() => {});

    fetchDepartments()
      .then((depts) => setDepartments(depts as Department[]))
      .catch(() => {});

    Promise.all([fetchSettings(), fetchModelsCatalog()])
      .then(([s, catalog]) => {
        const enabledProviders = new Set(
          Object.entries(s.providers)
            .filter(([, p]) => p.enabled !== false)
            .map(([k]) => k),
        );
        const opts: ModelOption[] = catalog
          .filter((m) => !m.builtin || enabledProviders.has(m.provider))
          .map((m: ModelInfo) => ({
            provider: m.provider,
            model: m.model,
            label: m.label,
          }));
        if (opts.length) setModelOptions(opts);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (agentId) {
      fetchAgent(agentId)
        .then((agent) => {
          const { id, created_at, updated_at, ...rest } = agent;
          setForm(rest);
        })
        .catch(() => {});
    }
  }, [agentId]);

  const updateField = <K extends keyof AgentForm>(key: K, value: AgentForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const addSuggestion = () => {
    const text = suggestionInput.trim();
    if (!text || form.suggestions.length >= 4) return;
    updateField('suggestions', [...form.suggestions, text]);
    setSuggestionInput('');
  };

  const removeSuggestion = (idx: number) => {
    updateField('suggestions', form.suggestions.filter((_, i) => i !== idx));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      try {
        const result = await uploadFile(file);
        updateField('knowledge_files', [...form.knowledge_files, result.path]);
      } catch {
        // skip failed
      }
    }
    e.target.value = '';
  };

  const removeFile = (idx: number) => {
    updateField('knowledge_files', form.knowledge_files.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (isEdit && agentId) {
        await updateAgent(agentId, form);
      } else {
        await createAgent(form);
      }
      navigate('/agents');
    } catch {
      setSaving(false);
    }
  };

  const selectedModel = modelOptions.find(
    (m) => m.model === form.default_model && m.provider === form.default_provider,
  ) || modelOptions[0];

  return (
    <div className="content-area">
      <div className="agent-form-page">
        <div className="agent-form-header">
          <h1>{isEdit ? '编辑智能体' : '创建智能体'}</h1>
          <p>{isEdit ? '修改智能体配置' : '自定义你的专属 AI 智能体'}</p>
        </div>

        <div className="agent-form-card">
          <div className="agent-form-row">
            <div className="agent-form-field" style={{ flex: '0 0 auto' }}>
              <label>图标</label>
              <div className="icon-picker-trigger">
                <button
                  className="icon-preview-btn"
                  type="button"
                  onClick={() => setShowIconPicker(!showIconPicker)}
                  style={{ background: form.icon_bg_color, color: form.icon_color }}
                >
                  {form.icon}
                </button>
                {showIconPicker && (
                  <div className="icon-picker-dropdown">
                    <div className="icon-picker-grid">
                      {ICON_PRESETS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          className={`icon-pick-item ${form.icon === emoji ? 'selected' : ''}`}
                          onClick={() => {
                            updateField('icon', emoji);
                            setShowIconPicker(false);
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                    <div className="color-pick-row">
                      {COLOR_PRESETS.map((c) => (
                        <button
                          key={c.color}
                          type="button"
                          className={`color-pick-item ${form.icon_color === c.color ? 'selected' : ''}`}
                          style={{ background: c.bg, borderColor: form.icon_color === c.color ? c.color : 'transparent' }}
                          onClick={() => {
                            updateField('icon_bg_color', c.bg);
                            updateField('icon_color', c.color);
                          }}
                        >
                          <span style={{ color: c.color }}>{form.icon}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="agent-form-field" style={{ flex: 1 }}>
              <label>名称 *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="给智能体起个名字"
                maxLength={50}
              />
            </div>
          </div>

          <div className="agent-form-field">
            <label>描述</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="简要描述这个智能体的功能"
              maxLength={200}
            />
          </div>

          <div className="agent-form-row">
            <div className="agent-form-field">
              <label>分类</label>
              <input
                type="text"
                value={form.category}
                onChange={(e) => updateField('category', e.target.value)}
                placeholder="输入分类名称"
                list="category-suggestions"
                maxLength={50}
              />
              <datalist id="category-suggestions">
                {categories.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </datalist>
            </div>
            <div className="agent-form-field">
              <label>所属部门</label>
              <select
                value={form.department_id}
                onChange={(e) => updateField('department_id', e.target.value)}
              >
                <option value="">全部部门（公共）</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="agent-form-row">
            <div className="agent-form-field">
              <label>默认模型</label>
              <select
                value={selectedModel ? `${selectedModel.provider}:${selectedModel.model}` : ''}
                onChange={(e) => {
                  const [provider, model] = e.target.value.split(':');
                  updateField('default_provider', provider);
                  updateField('default_model', model);
                }}
              >
                {modelOptions.map((m) => (
                  <option key={`${m.provider}:${m.model}`} value={`${m.provider}:${m.model}`}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="agent-form-field">
            <label>系统提示词</label>
            <textarea
              value={form.system_prompt}
              onChange={(e) => updateField('system_prompt', e.target.value)}
              placeholder="定义智能体的角色、能力和行为方式..."
              rows={6}
              maxLength={5000}
            />
          </div>

          <div className="agent-form-field">
            <label>欢迎语</label>
            <input
              type="text"
              value={form.welcome_message}
              onChange={(e) => updateField('welcome_message', e.target.value)}
              placeholder="用户进入聊天时显示的欢迎消息"
              maxLength={500}
            />
          </div>

          <div className="agent-form-field">
            <label>建议卡片（最多 4 个）</label>
            <div className="suggestions-editor">
              {form.suggestions.map((s, i) => (
                <div key={i} className="suggestion-tag">
                  <span>{s}</span>
                  <button type="button" onClick={() => removeSuggestion(i)}>×</button>
                </div>
              ))}
              {form.suggestions.length < 4 && (
                <div className="suggestion-input-wrap">
                  <input
                    type="text"
                    value={suggestionInput}
                    onChange={(e) => setSuggestionInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addSuggestion();
                      }
                    }}
                    placeholder="输入建议文案，回车添加"
                    maxLength={50}
                  />
                  <button type="button" onClick={addSuggestion} disabled={!suggestionInput.trim()}>添加</button>
                </div>
              )}
            </div>
          </div>

          <div className="agent-form-field">
            <label>知识库文件</label>
            <div className="knowledge-files">
              {form.knowledge_files.map((f, i) => (
                <div key={i} className="knowledge-file-item">
                  <span>{f.split('/').pop()}</span>
                  <button type="button" onClick={() => removeFile(i)}>×</button>
                </div>
              ))}
              <label className="knowledge-upload-btn">
                <input type="file" hidden multiple accept=".pdf,.docx,.txt,.md,.xlsx,.csv" onChange={handleFileUpload} />
                <span>+ 上传文件</span>
              </label>
            </div>
          </div>
        </div>

        <div className="agent-form-actions">
          <button className="cancel-btn" type="button" onClick={() => navigate('/agents')}>取消</button>
          <button
            className="save-agent-btn"
            type="button"
            disabled={!form.name.trim() || saving}
            onClick={handleSave}
          >
            {saving ? '保存中...' : (isEdit ? '保存修改' : '创建智能体')}
          </button>
        </div>
      </div>
    </div>
  );
}
