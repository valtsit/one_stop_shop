import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { marked } from 'marked';
import {
  fetchWikiSpace, fetchWikiPages, fetchWikiSources, fetchWikiLogs, fetchWikiPage,
  deleteWikiPage, deleteWikiSource, createWikiSource, uploadWikiSource, downloadWikiSource,
  type WikiSpace, type WikiPageBrief, type WikiSource, type WikiLogEntry,
  type WikiPage,
} from '../services/api';
import { useHasPermission } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import './WikiShared.css';
import './WikiSpacePage.css';

type Tab = 'pages' | 'sources' | 'logs';

function parseMd(text: string): string {
  if (!text) return '';
  try { return marked.parse(text, { async: false, breaks: true }) as string; }
  catch { return text.replace(/</g, '&lt;').replace(/\n/g, '<br>'); }
}

interface SelectedPage { id: string; title: string; }

export default function WikiSpacePage() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const navigate = useNavigate();
  const hasPerm = useHasPermission();
  const { toast, confirm } = useToast();
  const canCreate = hasPerm('wiki:create');
  const canDelete = hasPerm('wiki:delete');

  const [space, setSpace] = useState<WikiSpace | null>(null);
  const [pages, setPages] = useState<WikiPageBrief[]>([]);
  const [sources, setSources] = useState<WikiSource[]>([]);
  const [logs, setLogs] = useState<WikiLogEntry[]>([]);
  const [tab, setTab] = useState<Tab>('pages');
  const [loading, setLoading] = useState(true);

  const [showAddSource, setShowAddSource] = useState(false);
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceContent, setSourceContent] = useState('');
  const [sourceMode, setSourceMode] = useState<'text' | 'file'>('text');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploading, setUploading] = useState(false);

  // Inline page view
  const [selectedPage, setSelectedPage] = useState<SelectedPage | null>(null);
  const [pageContent, setPageContent] = useState<WikiPage | null>(null);
  const [pageLoading, setPageLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!spaceId) return;
    setLoading(true);
    try {
      const [s, p, src, l] = await Promise.all([
        fetchWikiSpace(spaceId),
        fetchWikiPages(spaceId),
        fetchWikiSources(spaceId),
        fetchWikiLogs(spaceId),
      ]);
      setSpace(s);
      setPages(p);
      setSources(src);
      setLogs(l);
    } catch {
      toast('加载数据失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [spaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [loadData]);

  // Load page for inline view
  useEffect(() => {
    if (!selectedPage) { setPageContent(null); return; }
    setPageLoading(true);
    fetchWikiPage(selectedPage.id)
      .then(setPageContent)
      .catch(() => toast('加载页面失败', 'error'))
      .finally(() => setPageLoading(false));
  }, [selectedPage]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeletePage = async (pageId: string, title: string) => {
    if (!(await confirm(`确定删除页面"${title}"吗？`))) return;
    try {
      await deleteWikiPage(pageId);
      setPages((prev) => prev.filter((p) => p.id !== pageId));
      toast('页面已删除', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : '删除失败', 'error');
    }
  };

  const handleDeleteSource = async (sourceId: string) => {
    if (!(await confirm('确定删除这份资料吗？'))) return;
    try {
      await deleteWikiSource(sourceId);
      setSources((prev) => prev.filter((s) => s.id !== sourceId));
      toast('资料已删除', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : '删除失败', 'error');
    }
  };

  const handleAddSource = async () => {
    if (!spaceId) return;
    if (sourceMode === 'file' && uploadFiles.length > 0) {
      setUploading(true);
      const progressMap: Record<string, number> = {};
      for (const f of uploadFiles) progressMap[f.name] = 0;
      setUploadProgress(progressMap);
      const newSources: WikiSource[] = [];
      for (const f of uploadFiles) {
        try {
          const src = await uploadWikiSource(spaceId, f, (pct) => {
            setUploadProgress((prev) => ({ ...prev, [f.name]: pct }));
          });
          newSources.push(src);
        } catch (e) {
          toast(`${f.name} 上传失败: ${e instanceof Error ? e.message : ''}`, 'error');
        }
      }
      if (newSources.length > 0) {
        setSources((prev) => [...newSources, ...prev]);
        toast(`${newSources.length} 个文件上传成功`, 'success');
      }
      setShowAddSource(false);
      resetSourceForm();
      setUploading(false);
      return;
    }
    if (!sourceTitle.trim()) return;
    try {
      const src = await createWikiSource({
        space_id: spaceId, title: sourceTitle.trim(),
        content: sourceContent.trim(), source_type: 'text',
      });
      setSources((prev) => [src, ...prev]);
      setShowAddSource(false);
      resetSourceForm();
      toast('资料已添加', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : '添加失败', 'error');
    }
  };

  const resetSourceForm = () => {
    setSourceTitle(''); setSourceContent(''); setSourceMode('text');
    setUploadFiles([]); setUploadProgress({});
  };

  const PAGE_TYPE_LABELS: Record<string, string> = {
    article: '文章', entity: '实体', concept: '概念', comparison: '对比', index: '索引', log: '日志',
  };

  const ACTION_LABELS: Record<string, string> = {
    ingest: '导入', edit: '编辑', query: '问答', lint: '检查', create: '创建', delete: '删除',
  };

  if (loading) {
    return <div className="content-area"><div className="wiki-space-page"><div className="wiki-loading"><div className="wiki-spinner" /> 加载中...</div></div></div>;
  }

  if (!space) {
    return <div className="content-area"><div className="wiki-space-page"><p style={{ color: 'var(--ink-subtle)' }}>知识空间不存在</p></div></div>;
  }

  const displayPages = pages.filter((p) => p.page_type !== 'index' && p.page_type !== 'log');
  const pageGroups: Record<string, WikiPageBrief[]> = {};
  for (const p of displayPages) {
    const pt = p.page_type || 'article';
    if (!pageGroups[pt]) pageGroups[pt] = [];
    pageGroups[pt].push(p);
  }

  return (
    <div className="content-area">
      <div className="wiki-space-layout">
        <div className="wiki-space-main">
          <div className="wiki-space-header">
            <div className="wiki-space-title-row">
              <button className="wiki-back-btn" onClick={() => navigate('/wiki')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
              </button>
              <div style={{ minWidth: 0, overflow: 'hidden' }}>
                <h1>{space.name}</h1>
                {space.description && <p className="wiki-space-desc">{space.description}</p>}
              </div>
            </div>
          </div>

          {selectedPage ? (
            /* Inline page view */
            <div className="wiki-inline-page">
              <div className="wiki-inline-page-topbar">
                <button className="wiki-back-btn" onClick={() => setSelectedPage(null)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
                </button>
                <span className="wiki-inline-page-breadcrumb">
                  <button className="wiki-pv-bc-link" onClick={() => setSelectedPage(null)}>{space.name}</button>
                  <span className="wiki-pv-bc-sep"> / </span>
                  <span className="wiki-pv-bc-current">{selectedPage.title}</span>
                </span>
                {hasPerm('wiki:update') && (
                  <button className="wiki-btn-primary small" onClick={() => navigate(`/wiki/${spaceId}/edit/${selectedPage.id}`)}>编辑</button>
                )}
              </div>
              {pageLoading ? (
                <div className="wiki-loading"><div className="wiki-spinner" /> 加载中...</div>
              ) : pageContent ? (
                <>
                  <div className="wiki-pv-header">
                    <h1>{pageContent.title}</h1>
                    <div className="wiki-pv-meta">
                      <span className="wiki-page-type-badge">{PAGE_TYPE_LABELS[pageContent.page_type] || pageContent.page_type}</span>
                      <span>{pageContent.word_count} 字</span>
                      <span>更新于 {new Date(pageContent.updated_at).toLocaleString()}</span>
                    </div>
                    {pageContent.tags.length > 0 && (
                      <div className="wiki-pv-tags">{pageContent.tags.map((t, i) => <span key={i} className="wiki-tag-chip">{t}</span>)}</div>
                    )}
                  </div>
                  <div className="wiki-pv-content">
                    <div className="wiki-pv-markdown" dangerouslySetInnerHTML={{ __html: parseMd(pageContent.content) }} />
                  </div>
                </>
              ) : <p style={{ color: 'var(--ink-subtle)' }}>页面不存在</p>}
            </div>
          ) : (
            /* Space tabs */
            <>
              <div className="wiki-tabs">
                <button className={`wiki-tab ${tab === 'pages' ? 'active' : ''}`} onClick={() => setTab('pages')}>
                  页面 <span className="wiki-tab-count">{displayPages.length}</span>
                </button>
                <button className={`wiki-tab ${tab === 'sources' ? 'active' : ''}`} onClick={() => setTab('sources')}>
                  资料 <span className="wiki-tab-count">{sources.length}</span>
                </button>
                <button className={`wiki-tab ${tab === 'logs' ? 'active' : ''}`} onClick={() => setTab('logs')}>
                  日志 <span className="wiki-tab-count">{logs.length}</span>
                </button>
              </div>

              <div className="wiki-tab-content">
                {tab === 'pages' && (
                  <>
                    <div className="wiki-tab-toolbar">
                      {canCreate && (
                        <button className="wiki-create-btn" onClick={() => navigate(`/wiki/${spaceId}/create`)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          新建页面
                        </button>
                      )}
                    </div>
                    {displayPages.length === 0 ? (
                      <div className="wiki-empty"><p>还没有任何页面，可以通过「智能导入」或手动创建</p></div>
                    ) : (
                      Object.entries(pageGroups).map(([pt, items]) => (
                        <div key={pt} className="wiki-page-group">
                          <h3 className="wiki-group-title">{PAGE_TYPE_LABELS[pt] || pt} ({items.length})</h3>
                          <div className="wiki-page-list">
                            {items.map((page) => (
                              <div key={page.id} className="wiki-page-item" onClick={() => navigate(`/wiki/${spaceId}/page/${page.id}`)}>
                                <div className="wiki-page-item-title">{page.title}</div>
                                <div className="wiki-page-item-meta">
                                  <span className="wiki-page-type-badge">{PAGE_TYPE_LABELS[page.page_type] || page.page_type}</span>
                                  <span>{page.word_count} 字</span>
                                  <span>{new Date(page.updated_at).toLocaleDateString()}</span>
                                </div>
                                {page.tags.length > 0 && (
                                  <div className="wiki-page-item-tags">{page.tags.map((t, i) => <span key={i} className="wiki-tag-chip">{t}</span>)}</div>
                                )}
                                {canDelete && (
                                  <button className="wiki-page-delete" onClick={(e) => { e.stopPropagation(); handleDeletePage(page.id, page.title); }}>删除</button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </>
                )}

                {tab === 'sources' && (
                  <>
                    <div className="wiki-tab-toolbar">
                      {canCreate && (
                        <button className="wiki-create-btn" onClick={() => setShowAddSource(true)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          添加资料
                        </button>
                      )}
                    </div>
                    {sources.length === 0 ? (
                      <div className="wiki-empty"><p>还没有添加任何资料</p></div>
                    ) : (
                      <div className="wiki-source-list">
                        {sources.map((src) => (
                          <div key={src.id} className="wiki-source-item">
                            <div className="wiki-source-info">
                              <div className="wiki-source-title">{src.title}</div>
                              <div className="wiki-source-meta">
                                <span>{src.source_type}</span>
                                <span>{[...src.content].length} 字</span>
                                <span>{new Date(src.created_at).toLocaleDateString()}</span>
                              </div>
                            </div>
                            <div className="wiki-source-actions">
                              {canCreate && src.source_type === 'file' && (
                                <button className="wiki-action-chip small" onClick={() => downloadWikiSource(src.id, src.title).catch((e) => toast(e instanceof Error ? e.message : '下载失败', 'error'))}>
                                  下载
                                </button>
                              )}
                              {canDelete && (
                                <button className="wiki-card-delete" onClick={() => handleDeleteSource(src.id)}>删除</button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {tab === 'logs' && (
                  <>
                    {logs.length === 0 ? (
                      <div className="wiki-empty"><p>暂无操作记录</p></div>
                    ) : (
                      <div className="wiki-log-list">
                        {logs.map((log) => (
                          <div key={log.id} className="wiki-log-item">
                            <div className="wiki-log-action">{ACTION_LABELS[log.action] || log.action}</div>
                            <div className="wiki-log-summary">{log.summary}</div>
                            <div className="wiki-log-time">{new Date(log.created_at).toLocaleString()}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Add source modal */}
      {showAddSource && (
        <div className="wiki-modal-overlay" onClick={() => { setShowAddSource(false); resetSourceForm(); }}>
          <div className="wiki-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wiki-modal-header">
              <h2>添加资料</h2>
              <button className="wiki-modal-close" onClick={() => { setShowAddSource(false); resetSourceForm(); }}>&times;</button>
            </div>
            <div className="wiki-modal-body">
              <div className="wiki-import-modes">
                <button className={`wiki-import-mode ${sourceMode === 'text' ? 'active' : ''}`} onClick={() => setSourceMode('text')}>粘贴内容</button>
                <button className={`wiki-import-mode ${sourceMode === 'file' ? 'active' : ''}`} onClick={() => setSourceMode('file')}>上传文件</button>
              </div>
              {sourceMode === 'text' && (
                <>
                  <div className="wiki-form-group">
                    <label>资料标题</label>
                    <input type="text" placeholder="资料标题..." value={sourceTitle} onChange={(e) => setSourceTitle(e.target.value)} autoFocus />
                  </div>
                  <div className="wiki-form-group">
                    <label>资料内容</label>
                    <textarea placeholder="粘贴原始资料内容..." value={sourceContent} onChange={(e) => setSourceContent(e.target.value)} rows={10} />
                  </div>
                </>
              )}
              {sourceMode === 'file' && (
                <div className="wiki-form-group">
                  <label>选择文件</label>
                  <div
                    className="wiki-file-drop"
                    onClick={() => document.getElementById('wiki-file-input')?.click()}
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
                    onDragLeave={(e) => { e.currentTarget.classList.remove('drag-over'); }}
                    onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('drag-over'); const files = Array.from(e.dataTransfer.files); if (files.length) setUploadFiles(files); }}
                  >
                    <input id="wiki-file-input" type="file" multiple accept=".txt,.md,.csv,.json,.yaml,.yml,.xml,.html,.htm,.log,.pdf,.docx,.doc,.xlsx,.rtf" style={{ display: 'none' }} onChange={(e) => { const files = e.target.files ? Array.from(e.target.files) : []; setUploadFiles(files); }} />
                    {uploadFiles.length > 0 ? (
                      <div className="wiki-file-selected">
                        <span className="wiki-file-name">已选择 {uploadFiles.length} 个文件</span>
                      </div>
                    ) : (
                      <div className="wiki-file-placeholder">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 32, height: 32, marginBottom: 8 }}><path d="M12 3v12"/><path d="m8 11 4 4 4-4"/><path d="M8 5H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V7a2 2 0 00-2-2h-4"/></svg>
                        <span>点击选择或拖拽文件到此处</span>
                        <span className="wiki-file-hint">支持多选，txt, md, csv, json, pdf, docx 等格式</span>
                      </div>
                    )}
                  </div>
                  {uploadFiles.length > 0 && (
                    <div className="wiki-upload-file-list">
                      {uploadFiles.map((f) => (
                        <div key={f.name} className="wiki-upload-file-item">
                          <span className="wiki-upload-file-name">{f.name}</span>
                          <span className="wiki-upload-file-size">{(f.size / 1024).toFixed(1)} KB</span>
                          {uploading && (
                            <div className="wiki-upload-file-progress">
                              <div className="wiki-upload-bar" style={{ width: `${Math.max(uploadProgress[f.name] ?? 0, 2)}%` }} />
                              <span>{uploadProgress[f.name] ?? 0}%</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="wiki-modal-footer">
              <button className="wiki-btn-secondary" onClick={() => { setShowAddSource(false); resetSourceForm(); }}>取消</button>
              <button className="wiki-btn-primary" onClick={handleAddSource} disabled={sourceMode === 'text' ? !sourceTitle.trim() : uploadFiles.length === 0 || uploading}>
                {uploading ? '上传中...' : '添加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
