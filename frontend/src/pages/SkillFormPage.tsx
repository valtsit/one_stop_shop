import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  fetchSkill,
  createSkill,
  updateSkill,
  fetchSkillFile,
  uploadSkillFile,
  deleteSkillFile,
  updateSkillFile,
  type Skill,
} from '../services/api';
import { useToast } from '../hooks/useToast';
import './SkillFormPage.css';

interface SkillForm {
  name: string;
  description: string;
  skill_md: string;
}

const SUBDIRS = [
  { key: 'references' as const, label: 'references /', desc: '参考文档（.md 文件会拼接到 prompt）' },
  { key: 'scripts' as const, label: 'scripts /', desc: '可执行脚本' },
  { key: 'assets' as const, label: 'assets /', desc: '静态资源' },
];

const defaultForm: SkillForm = {
  name: '',
  description: '',
  skill_md: '',
};

export default function SkillFormPage() {
  const navigate = useNavigate();
  const { skillId } = useParams();
  const isEdit = !!skillId;

  const [form, setForm] = useState<SkillForm>(defaultForm);
  const [skill, setSkill] = useState<Skill | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [editingLoading, setEditingLoading] = useState(false);

  useEffect(() => {
    if (skillId) {
      fetchSkill(skillId)
        .then((s) => {
          setSkill(s);
          setForm({
            name: s.name,
            description: s.description,
            skill_md: '',
          });
          // Load SKILL.md content
          fetchSkillFile(skillId, 'SKILL.md')
            .then((content) => {
              setForm((prev) => ({ ...prev, skill_md: content }));
            })
            .catch(() => {});
        })
        .catch(() => setError('加载Skill失败'));
    }
  }, [skillId]);

  const updateField = <K extends keyof SkillForm>(key: K, value: SkillForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setError(null);
    setSaving(true);
    try {
      if (isEdit && skillId) {
        await updateSkill(skillId, {
          name: form.name,
          description: form.description,
          skill_md: form.skill_md,
        });
        toast('保存成功', 'success');
      } else {
        const created = await createSkill({
          name: form.name,
          description: form.description,
        });
        // Write initial SKILL.md
        if (form.skill_md.trim()) {
          await updateSkill(created.id, { skill_md: form.skill_md });
        }
        toast('创建成功', 'success');
      }
      navigate('/skills');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '保存失败';
      setError(msg);
      toast(msg, 'error');
      setSaving(false);
    }
  };

  const handleFileUpload = async (subdir: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !skillId) return;
    for (const file of Array.from(files)) {
      setUploading((prev) => ({ ...prev, [`${subdir}-${file.name}`]: true }));
      try {
        await uploadSkillFile(skillId, subdir, file);
        const updated = await fetchSkill(skillId);
        setSkill(updated);
        toast(`上传 ${file.name} 成功`, 'success');
      } catch (err: unknown) {
        const msg = `上传 ${file.name} 失败: ${err instanceof Error ? err.message : '未知错误'}`;
        setError(msg);
        toast(msg, 'error');
      } finally {
        setUploading((prev) => ({ ...prev, [`${subdir}-${file.name}`]: false }));
      }
    }
    e.target.value = '';
  };

  const handleDeleteFile = async (subdir: string, filename: string) => {
    if (!skillId) return;
    try {
      await deleteSkillFile(skillId, `${subdir}/${filename}`);
      const updated = await fetchSkill(skillId);
      setSkill(updated);
      toast(`删除 ${filename} 成功`, 'success');
    } catch (err: unknown) {
      const msg = `删除 ${filename} 失败: ${err instanceof Error ? err.message : '未知错误'}`;
      setError(msg);
      toast(msg, 'error');
    }
  };

  const handleStartEdit = async (subdir: string, filename: string) => {
    if (!skillId) return;
    setEditingLoading(true);
    try {
      const content = await fetchSkillFile(skillId, `${subdir}/${filename}`);
      setEditingContent(content);
      setEditingFile(`${subdir}/${filename}`);
    } catch (err: unknown) {
      setError(`读取 ${filename} 失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setEditingLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!skillId || !editingFile) return;
    setEditingLoading(true);
    try {
      await updateSkillFile(skillId, editingFile, editingContent);
      setEditingFile(null);
      setEditingContent('');
      toast('保存成功', 'success');
    } catch (err: unknown) {
      const msg = `保存失败: ${err instanceof Error ? err.message : '未知错误'}`;
      setError(msg);
      toast(msg, 'error');
    } finally {
      setEditingLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingFile(null);
    setEditingContent('');
  };

  return (
    <div className="content-area">
      <div className="skill-form-page">
        <div className="skill-form-header">
          <h1>{isEdit ? '编辑 Skill' : '创建 Skill'}</h1>
          <p>{isEdit ? '修改 Skill 配置和目录内容' : '创建一个新的 Skill 目录'}</p>
        </div>

        {error && <div className="skill-form-error">{error}</div>}

        <div className="skill-form-card">
          {/* Basic Info */}
          <div className="skill-form-field">
            <label>名称 *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="给 Skill 起个名字"
              maxLength={50}
            />
          </div>

          <div className="skill-form-field">
            <label>描述</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="简要描述这个 Skill 的功能"
              maxLength={200}
            />
          </div>

          {/* SKILL.md */}
          <div className="skill-form-field">
            <label>SKILL.md</label>
            <p className="skill-form-hint">主要指令文件，将作为系统提示词加载到智能体中</p>
            <textarea
              className="skill-md-editor"
              value={form.skill_md}
              onChange={(e) => updateField('skill_md', e.target.value)}
              placeholder="# Skill 指令\n\n在这里输入 Skill 的主要指令..."
              rows={16}
            />
          </div>

          {/* File directories */}
          {isEdit && skill && (
            <div className="skill-dirs">
              {SUBDIRS.map(({ key, label, desc }) => {
                const files = skill.structure?.[key] || [];
                return (
                  <div key={key} className="skill-dir-section">
                    <div className="skill-dir-header">
                      <div>
                        <span className="skill-dir-name">{label}</span>
                        <span className="skill-dir-desc">{desc}</span>
                      </div>
                      <label className="skill-upload-btn-small">
                        <input
                          type="file"
                          hidden
                          multiple
                          ref={(el) => { fileInputRefs.current[key] = el; }}
                          onChange={(e) => handleFileUpload(key, e)}
                        />
                        <span>+ 上传文件</span>
                      </label>
                    </div>
                    {files.length === 0 ? (
                      <div className="skill-dir-empty">暂无文件</div>
                    ) : (
                      <div className="skill-dir-files">
                        {files.map((fname) => {
                          const fileKey = `${key}/${fname}`;
                          const isEditing = editingFile === fileKey;
                          return (
                            <div key={fname} className="skill-dir-file">
                              {isEditing ? (
                                <div className="skill-file-editor">
                                  <textarea
                                    className="skill-file-editor-textarea"
                                    value={editingContent}
                                    onChange={(e) => setEditingContent(e.target.value)}
                                    rows={10}
                                    disabled={editingLoading}
                                  />
                                  <div className="skill-file-editor-actions">
                                    <button
                                      className="skill-file-editor-save"
                                      type="button"
                                      disabled={editingLoading}
                                      onClick={handleSaveEdit}
                                    >
                                      {editingLoading ? '保存中...' : '保存'}
                                    </button>
                                    <button
                                      className="skill-file-editor-cancel"
                                      type="button"
                                      disabled={editingLoading}
                                      onClick={handleCancelEdit}
                                    >
                                      取消
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <span
                                    className="skill-dir-file-name editable"
                                    onClick={() => handleStartEdit(key, fname)}
                                    title="点击编辑"
                                  >
                                    {fname}
                                  </span>
                                  <button
                                    className="skill-dir-file-del"
                                    type="button"
                                    onClick={() => handleDeleteFile(key, fname)}
                                  >
                                    ×
                                  </button>
                                  {uploading[`${key}-${fname}`] && (
                                    <span className="skill-dir-file-uploading">上传中...</span>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="skill-form-actions">
          <button className="cancel-btn" type="button" onClick={() => navigate('/skills')}>
            取消
          </button>
          <button
            className="save-skill-btn"
            type="button"
            disabled={!form.name.trim() || saving}
            onClick={handleSave}
          >
            {saving ? '保存中...' : (isEdit ? '保存修改' : '创建 Skill')}
          </button>
        </div>
      </div>
    </div>
  );
}
