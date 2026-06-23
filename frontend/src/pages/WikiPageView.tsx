import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { marked } from 'marked';
import {
  fetchWikiPage, fetchWikiPageReferences,
  type WikiPage, type WikiPageReference,
} from '../services/api';
import { useHasPermission } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import './WikiShared.css';
import './WikiPageView.css';

interface TocItem {
  level: number;
  text: string;
  id: string;
}

export default function WikiPageView() {
  const { spaceId, pageId } = useParams<{ spaceId: string; pageId: string }>();
  const navigate = useNavigate();
  const hasPerm = useHasPermission();
  const { toast } = useToast();
  const canUpdate = hasPerm('wiki:update');

  const [page, setPage] = useState<WikiPage | null>(null);
  const [refs, setRefs] = useState<WikiPageReference[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!pageId) return;
    setLoading(true);
    try {
      const [p, r] = await Promise.all([
        fetchWikiPage(pageId),
        fetchWikiPageReferences(pageId),
      ]);
      setPage(p);
      setRefs(r);
    } catch {
      toast('加载页面失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [pageId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const { html, toc } = useMemo(() => {
    if (!page?.content) return { html: '', toc: [] as TocItem[] };
    const headings: TocItem[] = [];
    const renderer = new marked.Renderer();
    renderer.heading = ({ text, depth }) => {
      const plain = typeof text === 'string' ? text : String(text);
      const id = plain.toLowerCase().replace(/[^\w一-鿿]+/g, '-').replace(/^-|-$/g, '');
      headings.push({ level: depth, text: plain, id });
      return `<h${depth} id="${id}">${plain}</h${depth}>`;
    };
    marked.setOptions({ renderer });
    const result = marked.parse(page.content) as string;
    // Reset renderer
    marked.use({ renderer: new marked.Renderer() });
    return { html: result, toc: headings };
  }, [page?.content]);

  const PAGE_TYPE_LABELS: Record<string, string> = {
    article: '文章', entity: '实体', concept: '概念', comparison: '对比', index: '索引', log: '日志',
  };

  if (loading) {
    return <div className="content-area"><div className="wiki-page-view"><div className="wiki-loading"><div className="wiki-spinner" /> 加载中...</div></div></div>;
  }

  if (!page) {
    return <div className="content-area"><div className="wiki-page-view"><p style={{ color: 'var(--ink-subtle)' }}>页面不存在</p></div></div>;
  }

  return (
    <div className="content-area">
      <div className="wiki-page-view">
        <div className="wiki-pv-topbar">
          <button className="wiki-back-btn" onClick={() => navigate(`/wiki/${spaceId}`)} aria-label="返回空间">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          </button>
          <div className="wiki-pv-breadcrumb">
            <button className="wiki-pv-bc-link" onClick={() => navigate('/wiki')}>Wiki</button>
            <span className="wiki-pv-bc-sep">/</span>
            <button className="wiki-pv-bc-link" onClick={() => navigate(`/wiki/${spaceId}`)}>空间</button>
            <span className="wiki-pv-bc-sep">/</span>
            <span className="wiki-pv-bc-current">{page.title}</span>
          </div>
          {canUpdate && (
            <button className="wiki-btn-primary small" onClick={() => navigate(`/wiki/${spaceId}/edit/${page.id}`)}>
              编辑
            </button>
          )}
        </div>

        <div className="wiki-pv-header">
          <h1>{page.title}</h1>
          <div className="wiki-pv-meta">
            <span className="wiki-page-type-badge">{PAGE_TYPE_LABELS[page.page_type] || page.page_type}</span>
            <span>{page.word_count} 字</span>
            <span>更新于 {new Date(page.updated_at).toLocaleString()}</span>
          </div>
          {page.tags.length > 0 && (
            <div className="wiki-pv-tags">
              {page.tags.map((t, i) => <span key={i} className="wiki-tag-chip">{t}</span>)}
            </div>
          )}
        </div>

        <div className="wiki-pv-layout">
          {toc.length > 2 && (
            <nav className="wiki-pv-toc" aria-label="目录导航">
              <div className="wiki-pv-toc-title">目录</div>
              {toc.map((item, i) => (
                <a
                  key={i}
                  href={`#${item.id}`}
                  className="wiki-pv-toc-link"
                  style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  {item.text}
                </a>
              ))}
            </nav>
          )}

          <div className="wiki-pv-content">
            {page.content ? (
              <div className="wiki-pv-markdown" dangerouslySetInnerHTML={{ __html: html }} />
            ) : (
              <p style={{ color: 'var(--ink-subtle)' }}>暂无内容</p>
            )}
          </div>
        </div>

        {refs.length > 0 && (

          <div className="wiki-pv-refs">
            <h3>交叉引用 ({refs.length})</h3>
            <div className="wiki-pv-ref-list">
              {refs.map((ref) => {
                const isOutgoing = ref.from_page_id === page.id;
                const linkedId = isOutgoing ? ref.to_page_id : ref.from_page_id;
                return (
                  <div
                    key={ref.id}
                    className="wiki-pv-ref-item"
                    onClick={() => navigate(`/wiki/${spaceId}/page/${linkedId}`)}
                  >
                    <span className="wiki-pv-ref-dir">{isOutgoing ? '→' : '←'}</span>
                    <span className="wiki-pv-ref-title">{ref.context || '关联页面'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
