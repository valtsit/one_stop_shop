import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchKnowledge, createKnowledge, updateKnowledge, updateKnowledgeContent } from '../services/api';
import { useHasPermission } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import './KnowledgeFormPage.css';

interface KbForm {
  title: string;
  content: string;
  tags: string[];
  format: string;
  columns: string[];
  rows: string[][];
  skip_review: boolean;
}

const defaultForm: KbForm = { title: '', content: '', tags: [], format: 'text', columns: [], rows: [], skip_review: false };

export default function KnowledgeFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const hasPerm = useHasPermission();
  const { toast } = useToast();

  const canFullEdit = hasPerm('knowledge:update');
  const [contentOnly, setContentOnly] = useState(false);

  const [form, setForm] = useState<KbForm>(defaultForm);
  const [tagInput, setTagInput] = useState('');
  const [colInput, setColInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEdit) {
      if (!hasPerm('knowledge:create')) navigate('/knowledge', { replace: true });
      return;
    }
    if (!id) return;
    fetchKnowledge(id)
      .then((item) => {
        const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = item;
        setForm({ ...defaultForm, ...rest });
        if (!canFullEdit && item.skip_review) {
          setContentOnly(true);
        } else if (!canFullEdit) {
          navigate('/knowledge', { replace: true });
        }
      })
      .catch((e) => {
        toast(e instanceof Error ? e.message : '加载条目失败', 'error');
        navigate('/knowledge', { replace: true });
      });
  }, [id, canFullEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (tag && !form.tags.includes(tag)) {
      setForm((prev) => ({ ...prev, tags: [...prev.tags, tag] }));
    }
    setTagInput('');
  };

  const removeTag = (idx: number) => {
    setForm((prev) => ({ ...prev, tags: prev.tags.filter((_, i) => i !== idx) }));
  };

  // Table operations
  const addColumn = () => {
    const name = colInput.trim() || `列${form.columns.length + 1}`;
    setForm((prev) => ({
      ...prev,
      columns: [...prev.columns, name],
      rows: prev.rows.map((row) => [...row, '']),
    }));
    setColInput('');
  };

  const removeColumn = (colIdx: number) => {
    setForm((prev) => ({
      ...prev,
      columns: prev.columns.filter((_, i) => i !== colIdx),
      rows: prev.rows.map((row) => row.filter((_, i) => i !== colIdx)),
    }));
  };

  const renameColumn = (colIdx: number, name: string) => {
    setForm((prev) => {
      const columns = [...prev.columns];
      columns[colIdx] = name;
      return { ...prev, columns };
    });
  };

  const addRow = () => {
    setForm((prev) => ({
      ...prev,
      rows: [...prev.rows, prev.columns.map(() => '')],
    }));
  };

  const removeRow = (rowIdx: number) => {
    setForm((prev) => ({
      ...prev,
      rows: prev.rows.filter((_, i) => i !== rowIdx),
    }));
  };

  const updateCell = (rowIdx: number, colIdx: number, value: string) => {
    setForm((prev) => {
      const rows = prev.rows.map((row) => [...row]);
      rows[rowIdx][colIdx] = value;
      return { ...prev, rows };
    });
  };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      if (isEdit && id) {
        if (contentOnly) {
          await updateKnowledgeContent(id, { title: form.title, content: form.content, rows: form.rows });
        } else {
          await updateKnowledge(id, form);
        }
      } else {
        await createKnowledge(form);
      }
      navigate('/knowledge');
    } catch (e) {
      setSaving(false);
      toast(e instanceof Error ? e.message : '保存失败', 'error');
    }
  };

  return (
    <div className="content-area">
      <div className="kb-form-page">
        <div className="kb-form-header">
          <h1>{isEdit ? (contentOnly ? '编辑条目内容' : '编辑知识库条目') : '新建知识库条目'}</h1>
          <p>{isEdit ? (contentOnly ? '当前条目已开启免审核，可以编辑和新增内容' : '修改条目内容') : '收藏优秀文案到知识库'}</p>
        </div>

        <div className="kb-form-card">
          <div className="kb-form-field">
            <label>标题 *</label>
            {contentOnly ? (
              <div className="kb-readonly-field">{form.title}</div>
            ) : (
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="给这条内容起个标题"
                maxLength={100}
              />
            )}
          </div>

          {!contentOnly && (
            <div className="kb-form-field">
              <label>内容格式</label>
              <div className="kb-format-toggle">
                <button
                  type="button"
                  className={`kb-format-btn ${form.format === 'text' ? 'active' : ''}`}
                  onClick={() => setForm((prev) => ({ ...prev, format: 'text' }))}
                >
                  自由文本
                </button>
                <button
                  type="button"
                  className={`kb-format-btn ${form.format === 'table' ? 'active' : ''}`}
                  onClick={() => setForm((prev) => ({ ...prev, format: 'table', columns: prev.columns.length ? prev.columns : ['列1', '列2'], rows: prev.rows.length ? prev.rows : [['', '']] }))}
                >
                  表格
                </button>
              </div>
            </div>
          )}

          {form.format === 'text' ? (
            <div className="kb-form-field">
              <label>内容</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
                placeholder="粘贴或输入文案内容..."
                rows={12}
                maxLength={50000}
              />
            </div>
          ) : (
            <div className="kb-form-field">
              <label>表格内容</label>
              <div className="kb-table-wrap">
                <div className="kb-table-scroll">
                  <table className="kb-table">
                    <thead>
                      <tr>
                        {form.columns.map((col, ci) => (
                          <th key={ci}>
                            {contentOnly ? (
                              <span className="kb-col-readonly">{col}</span>
                            ) : (
                              <>
                                <input
                                  type="text"
                                  className="kb-col-input"
                                  value={col}
                                  onChange={(e) => renameColumn(ci, e.target.value)}
                                />
                                <button type="button" className="kb-col-remove" onClick={() => removeColumn(ci)} title="删除列">×</button>
                              </>
                            )}
                          </th>
                        ))}
                        {!contentOnly && (
                          <th className="kb-col-add-cell">
                            <div className="kb-add-col-wrap">
                              <input
                                type="text"
                                className="kb-col-name-input"
                                value={colInput}
                                onChange={(e) => setColInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addColumn(); } }}
                                placeholder="列名"
                                maxLength={20}
                              />
                              <button type="button" className="kb-add-col-btn" onClick={addColumn} title="添加列">+</button>
                            </div>
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {form.rows.map((row, ri) => (
                        <tr key={ri}>
                          {form.columns.map((_, ci) => (
                            <td key={ci}>
                              <input
                                type="text"
                                className="kb-cell-input"
                                value={row[ci] || ''}
                                onChange={(e) => updateCell(ri, ci, e.target.value)}
                              />
                            </td>
                          ))}
                          {!contentOnly && (
                            <td className="kb-row-actions">
                              <button type="button" className="kb-row-remove" onClick={() => removeRow(ri)} title="删除行">×</button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button type="button" className="kb-add-row-btn" onClick={addRow}>+ 添加行</button>
              </div>
            </div>
          )}

          {!contentOnly && (
            <div className="kb-form-field">
              <label>标签</label>
              <div className="kb-tags-area">
                {form.tags.map((tag, i) => (
                  <span key={i} className="kb-form-tag">
                    {tag}
                    <button type="button" onClick={() => removeTag(i)}>×</button>
                  </span>
                ))}
                <div className="kb-tag-input-row">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
                    placeholder="输入标签，回车添加"
                    maxLength={20}
                  />
                  <button type="button" className="kb-tag-add-btn" onClick={handleAddTag} disabled={!tagInput.trim()}>
                    添加
                  </button>
                </div>
              </div>
            </div>
          )}

          {!contentOnly && (
            <div className="kb-form-field">
              <label>提交设置</label>
              <div className="kb-skip-review-toggle">
                <label className="kb-switch">
                  <input
                    type="checkbox"
                    checked={form.skip_review}
                    onChange={(e) => setForm((prev) => ({ ...prev, skip_review: e.target.checked }))}
                  />
                  <span className="kb-switch-slider"></span>
                </label>
                <span className="kb-switch-label">允许直接提交（跳过审核）</span>
              </div>
              <p className="kb-field-hint">开启后，其他用户对此条目的追加内容将直接入库，无需管理员审核</p>
            </div>
          )}
        </div>

        <div className="kb-form-actions">
          <button className="cancel-btn" type="button" onClick={() => navigate('/knowledge')}>取消</button>
          <button
            className="save-kb-btn"
            type="button"
            disabled={!form.title.trim() || saving}
            onClick={handleSave}
          >
            {saving ? '保存中...' : (isEdit ? '保存修改' : '创建')}
          </button>
        </div>
      </div>
    </div>
  );
}
