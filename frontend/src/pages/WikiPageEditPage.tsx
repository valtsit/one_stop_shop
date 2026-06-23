import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  fetchWikiPage, createWikiPage, updateWikiPage,
} from '../services/api';
import { useToast } from '../hooks/useToast';
import './WikiShared.css';
import './WikiPageEditPage.css';

const PAGE_TYPES = [
  { value: 'article', label: '文章' },
  { value: 'entity', label: '实体' },
  { value: 'concept', label: '概念' },
  { value: 'comparison', label: '对比' },
];

export default function WikiPageEditPage() {
  const { spaceId, pageId } = useParams<{ spaceId: string; pageId?: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isEdit = !!pageId;
  const dirtyRef = useRef(false);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [pageType, setPageType] = useState('article');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  useEffect(() => {
    if (isEdit && pageId) {
      fetchWikiPage(pageId).then((p) => {
        setTitle(p.title);
        setContent(p.content);
        setPageType(p.page_type);
        setTags(p.tags);
      }).catch(() => {
        toast('加载页面失败', 'error');
      }).finally(() => setLoading(false));
    }
  }, [isEdit, pageId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dirtyRef.current && (title || content)) dirtyRef.current = true;
  }, [title, content]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const handleTagKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim())) {
        setTags([...tags, tagInput.trim()]);
      }
      setTagInput('');
    }
  };

  const removeTag = (idx: number) => {
    setTags(tags.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!title.trim() || !spaceId) return;
    setSaving(true);
    try {
      const data = { space_id: spaceId, title: title.trim(), content, page_type: pageType, tags };
      if (isEdit && pageId) {
        await updateWikiPage(pageId, data);
      } else {
        await createWikiPage(data);
      }
      dirtyRef.current = false;
      toast('保存成功', 'success');
      navigate(`/wiki/${spaceId}`);
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="content-area"><div className="wiki-edit-page"><div className="wiki-loading"><div className="wiki-spinner" /> 加载中...</div></div></div>;
  }

  return (
    <div className="content-area">
      <div className="wiki-edit-page">
        <div className="wiki-edit-topbar">
          <button className="wiki-back-btn" onClick={() => navigate(`/wiki/${spaceId}`)} aria-label="返回">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          </button>
          <h1>{isEdit ? '编辑页面' : '新建页面'}</h1>
        </div>

        <div className="wiki-edit-form">
          <div className="wiki-form-group">
            <label>标题</label>
            <input
              type="text"
              placeholder="页面标题..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div className="wiki-form-group">
            <label>页面类型</label>
            <div className="wiki-type-selector">
              {PAGE_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className={`wiki-type-btn ${pageType === t.value ? 'active' : ''}`}
                  onClick={() => setPageType(t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="wiki-form-group">
            <label>标签</label>
            <div className="wiki-tag-input-wrap">
              {tags.map((tag, i) => (
                <span key={i} className="wiki-tag-chip">
                  {tag}
                  <button onClick={() => removeTag(i)} aria-label={`移除标签 ${tag}`}>&times;</button>
                </span>
              ))}
              <input
                type="text"
                placeholder={tags.length === 0 ? '输入标签后回车...' : '继续添加...'}
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKey}
              />
            </div>
          </div>

          <div className="wiki-form-group">
            <label>内容 (Markdown)</label>
            <textarea
              className="wiki-content-editor"
              placeholder="在此编写 Markdown 内容..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={20}
            />
            <div className="wiki-char-count">{[...content].length} 字</div>
          </div>
        </div>

        <div className="wiki-edit-footer">
          <button className="wiki-btn-secondary" onClick={() => navigate(`/wiki/${spaceId}`)}>取消</button>
          <button className="wiki-btn-primary" onClick={handleSave} disabled={!title.trim() || saving}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

    </div>
  );
}
