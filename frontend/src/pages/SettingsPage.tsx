import { useEffect, useState, useCallback } from 'react';
import { useHasPermission } from '../contexts/AuthContext';
import {
  fetchSettings,
  saveSettings,
  fetchModelsCatalog,
  addCustomModel,
  updateCustomModel,
  deleteCustomModel,
  testModelConnection,
  type ModelInfo,
} from '../services/api';
import { useToast } from '../hooks/useToast';
import './SettingsPage.css';

// Blank form for adding a custom model
const EMPTY_CUSTOM: Omit<ModelInfo, 'builtin' | 'id'> = {
  provider: 'openai',
  model: '',
  label: '',
  base_url: '',
  api_key: '',
  max_tokens: 4096,
  headers: {},
};

export default function SettingsPage() {
  const { toast, confirm } = useToast();
  const hasPerm = useHasPermission();
  const canUpdate = hasPerm('settings:update');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { status: string; message: string }>>({});

  // Custom model form
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [customForm, setCustomForm] = useState({ ...EMPTY_CUSTOM });
  const [headersText, setHeadersText] = useState('{}');
  const [saving, setSaving] = useState(false);
  const [memoryDir, setMemoryDir] = useState('./data/conversations');
  const [memoryDirSaving, setMemoryDirSaving] = useState(false);

  const loadAll = useCallback(() => {
    Promise.all([fetchSettings(), fetchModelsCatalog()]).then(([s, m]) => {
      setModels(m.filter((x) => !x.builtin));
      if (s.memory_dir) setMemoryDir(s.memory_dir);
    });
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleTestCustom = async (m: ModelInfo) => {
    const testKey = `custom:${m.id}`;
    setTesting(testKey);
    setTestResult((prev) => ({ ...prev, [testKey]: undefined as never }));
    try {
      const apiKey = m.api_key || '';
      const result = await testModelConnection({
        provider: m.provider,
        model: m.model,
        api_key: apiKey,
        base_url: m.base_url || undefined,
        headers: m.headers || undefined,
      });
      setTestResult((prev) => ({ ...prev, [testKey]: result }));
    } catch {
      setTestResult((prev) => ({ ...prev, [testKey]: { status: 'error', message: '请求失败' } }));
    } finally {
      setTesting(null);
    }
  };

  // Custom model CRUD
  const openAddForm = () => {
    setCustomForm({ ...EMPTY_CUSTOM });
    setHeadersText('{}');
    setEditingId(null);
    setShowCustomForm(true);
  };

  const openEditForm = (m: ModelInfo) => {
    setCustomForm({
      provider: m.provider,
      model: m.model,
      label: m.label,
      base_url: m.base_url || '',
      api_key: m.api_key || '',
      max_tokens: m.max_tokens,
      headers: m.headers || {},
    });
    setHeadersText(m.headers && Object.keys(m.headers).length > 0 ? JSON.stringify(m.headers) : '{}');
    setEditingId(m.id || null);
    setShowCustomForm(true);
  };

  const handleSaveCustom = async () => {
    if (!customForm.model || !customForm.label || !customForm.api_key || !customForm.base_url) return;
    let parsedHeaders = {};
    try {
      parsedHeaders = JSON.parse(headersText || '{}');
    } catch {
      toast('Headers JSON 格式不正确', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...customForm, headers: parsedHeaders };
      if (editingId) {
        await updateCustomModel(editingId, payload);
      } else {
        await addCustomModel(payload);
      }
      setShowCustomForm(false);
      loadAll();
    } catch {
      toast('保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCustom = async (id: string) => {
    if (!id) return;
    if (!(await confirm('确定删除该自定义模型？'))) return;
    try {
      await deleteCustomModel(id);
      loadAll();
    } catch {
      toast('删除失败', 'error');
    }
  };

  const handleSaveMemoryDir = async () => {
    setMemoryDirSaving(true);
    try {
      const s = await fetchSettings();
      s.memory_dir = memoryDir;
      await saveSettings(s);
    } catch {
      toast('保存失败', 'error');
    } finally {
      setMemoryDirSaving(false);
    }
  };

  return (
    <div className="content-area">
      <div className="settings-page">
        <div className="settings-header">
          <h1>模型设置</h1>
          <p>管理自定义模型</p>
        </div>

        {/* ===== Custom Models Section ===== */}
        <div className="settings-section">
          <div className="settings-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>自定义模型</span>
            {canUpdate && <button className="add-model-btn" onClick={openAddForm}>+ 添加模型</button>}
          </div>
          <div className="settings-section-desc">
            添加第三方模型或自建模型，支持任何兼容 OpenAI / Claude API 格式的服务
          </div>

          {/* Custom model list */}
          {models.length === 0 && !showCustomForm && (
            <div className="empty-custom">暂无自定义模型{canUpdate ? '，点击上方"添加模型"开始' : ''}</div>
          )}

          {models.map((m) => {
            const testKey = `custom:${m.id}`;
            const result = testResult[testKey];
            return (
              <div key={m.id} className="custom-model-card">
                <div className="custom-model-header">
                  <div>
                    <span className="custom-model-label">{m.label}</span>
                    <span className="custom-model-id">{m.model}</span>
                  </div>
                  <div className="custom-model-actions">
                    <button
                      className={`test-btn ${testing === testKey ? 'testing' : ''}`}
                      onClick={() => handleTestCustom(m)}
                      disabled={testing === testKey}
                    >
                      {testing === testKey
                        ? '测试中...'
                        : result?.status === 'ok'
                          ? '✓ 正常'
                          : result?.status === 'error' || result?.status === 'fail'
                            ? '✗ 失败'
                            : '测试'}
                    </button>
                    {canUpdate && <button className="edit-btn" onClick={() => openEditForm(m)}>编辑</button>}
                    {canUpdate && <button className="delete-btn" onClick={() => handleDeleteCustom(m.id!)}>删除</button>}
                  </div>
                </div>
                {result && (
                  <div className={`test-result ${result.status === 'ok' ? 'test-ok' : 'test-fail'}`}>
                    {result.status === 'ok' ? `✓ ${result.message}` : `✗ ${result.message}`}
                  </div>
                )}
              </div>
            );
          })}

          {/* Add/Edit form */}
          {showCustomForm && canUpdate && (
            <div className="custom-form-card">
              <div className="custom-form-title">{editingId ? '编辑模型' : '添加模型'}</div>
              <div className="field-group" style={{ marginBottom: 12 }}>
                <div className="field">
                  <label>显示名称 *</label>
                  <input
                    type="text"
                    placeholder="如：我的 GPT-4"
                    value={customForm.label}
                    onChange={(e) => setCustomForm((f) => ({ ...f, label: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>模型 ID *</label>
                  <input
                    type="text"
                    placeholder="如：gpt-4, my-model-v1"
                    value={customForm.model}
                    onChange={(e) => setCustomForm((f) => ({ ...f, model: e.target.value }))}
                  />
                </div>
              </div>
              <div className="field-group" style={{ marginBottom: 12 }}>
                <div className="field">
                  <label>API 兼容格式</label>
                  <select
                    value={customForm.provider}
                    onChange={(e) => setCustomForm((f) => ({ ...f, provider: e.target.value }))}
                  >
                    <option value="openai">OpenAI 兼容</option>
                    <option value="claude">Claude 兼容</option>
                  </select>
                </div>
                <div className="field">
                  <label>最大 Token 数</label>
                  <input
                    type="number"
                    min="256"
                    max="128000"
                    value={customForm.max_tokens}
                    onChange={(e) => setCustomForm((f) => ({ ...f, max_tokens: parseInt(e.target.value) || 4096 }))}
                  />
                </div>
              </div>
              <div className="field-group" style={{ marginBottom: 12 }}>
                <div className="field">
                  <label>API Key *</label>
                  <input
                    type="password"
                    placeholder="该模型的 API Key"
                    value={customForm.api_key}
                    onChange={(e) => setCustomForm((f) => ({ ...f, api_key: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Base URL *</label>
                  <input
                    type="text"
                    placeholder="如：https://api.example.com/v1"
                    value={customForm.base_url}
                    onChange={(e) => setCustomForm((f) => ({ ...f, base_url: e.target.value }))}
                  />
                </div>
              </div>
              <div className="field-group" style={{ marginBottom: 12 }}>
                <div className="field" style={{ flex: 1 }}>
                  <label>自定义 Headers (JSON)</label>
                  <input
                    type="text"
                    placeholder='如：{"User-Agent": "claude-code/1.0"}'
                    value={headersText}
                    onChange={(e) => setHeadersText(e.target.value)}
                  />
                </div>
              </div>
              <div className="custom-form-actions">
                <button
                  className="save-btn"
                  onClick={handleSaveCustom}
                  disabled={!customForm.model || !customForm.label || !customForm.api_key || !customForm.base_url || saving}
                >
                  {saving ? '保存中...' : editingId ? '更新' : '添加'}
                </button>
                {!customForm.model || !customForm.label || !customForm.api_key || !customForm.base_url ? (
                  <span className="save-hint">请填写所有带 * 的字段</span>
                ) : null}
                <button className="cancel-btn" onClick={() => setShowCustomForm(false)}>取消</button>
              </div>
            </div>
          )}
        </div>

        {/* ===== Memory Directory Section ===== */}
        <div className="settings-section">
          <div className="settings-section-title">
            <span>对话记忆目录</span>
          </div>
          <div className="settings-section-desc">
            设置对话历史记录的存储路径，修改后新的对话将存储到新目录
          </div>
          <div className="field-group" style={{ maxWidth: 600 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>存储路径</label>
              <input
                type="text"
                placeholder="./data/conversations"
                value={memoryDir}
                onChange={(e) => setMemoryDir(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              {canUpdate && (
                <button
                  className="save-btn"
                  onClick={handleSaveMemoryDir}
                  disabled={memoryDirSaving}
                >
                  {memoryDirSaving ? '保存中...' : '保存'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
