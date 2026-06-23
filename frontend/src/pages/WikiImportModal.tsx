import { useState } from 'react';
import { wikiIngest, type WikiSource, type WikiModelConfig } from '../services/api';
import './WikiShared.css';
import './WikiImportModal.css';

const PAGE_TYPE_LABELS: Record<string, string> = {
  article: '文章', entity: '实体', concept: '概念', comparison: '对比', index: '索引', log: '日志',
};

interface Props {
  spaceId: string;
  sources: WikiSource[];
  modelConfig: Partial<WikiModelConfig>;
  onClose: () => void;
  onDone: () => void;
}

export default function WikiImportModal({ spaceId, sources, modelConfig, onClose, onDone }: Props) {
  const [mode, setMode] = useState<'source' | 'paste'>('paste');
  const [selectedSource, setSelectedSource] = useState('');
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteContent, setPasteContent] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ pages: { id: string; title: string; page_type: string }[]; references_created: number; summary: string } | null>(null);
  const [error, setError] = useState('');

  const handleImport = async () => {
    setError('');
    setImporting(true);
    try {
      const payload: { space_id: string; source_id?: string; content?: string; title?: string } & Partial<WikiModelConfig> = { space_id: spaceId, ...modelConfig };
      if (mode === 'source' && selectedSource) {
        const src = sources.find((s) => s.id === selectedSource);
        if (src) {
          payload.source_id = src.id;
          payload.content = src.content;
          payload.title = src.title;
        }
      } else {
        payload.content = pasteContent;
        payload.title = pasteTitle;
      }
      const r = await wikiIngest(payload);
      setResult(r);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '导入失败');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="wiki-modal-overlay" onClick={onClose}>
      <div className="wiki-import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wiki-modal-header">
          <h2>智能导入</h2>
          <button className="wiki-modal-close" onClick={onClose}>&times;</button>
        </div>

        {!result ? (
          <>
            <div className="wiki-modal-body">
              <div className="wiki-import-modes">
                <button
                  className={`wiki-import-mode ${mode === 'paste' ? 'active' : ''}`}
                  onClick={() => setMode('paste')}
                >
                  粘贴内容
                </button>
                <button
                  className={`wiki-import-mode ${mode === 'source' ? 'active' : ''}`}
                  onClick={() => setMode('source')}
                  disabled={sources.length === 0}
                >
                  从资料导入 ({sources.length})
                </button>
              </div>

              {mode === 'paste' && (
                <>
                  <div className="wiki-form-group">
                    <label>资料标题</label>
                    <input
                      type="text"
                      placeholder="可选标题..."
                      value={pasteTitle}
                      onChange={(e) => setPasteTitle(e.target.value)}
                    />
                  </div>
                  <div className="wiki-form-group">
                    <label>内容</label>
                    <textarea
                      placeholder="粘贴要导入的原始资料内容..."
                      value={pasteContent}
                      onChange={(e) => setPasteContent(e.target.value)}
                      rows={10}
                    />
                  </div>
                </>
              )}

              {mode === 'source' && (
                <div className="wiki-form-group">
                  <label>选择资料</label>
                  <div className="wiki-source-select">
                    {sources.map((src) => (
                      <div
                        key={src.id}
                        className={`wiki-source-option ${selectedSource === src.id ? 'selected' : ''}`}
                        onClick={() => setSelectedSource(src.id)}
                      >
                        <div className="wiki-source-option-title">{src.title}</div>
                        <div className="wiki-source-option-meta">{[...src.content].length} 字</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {error && <div className="wiki-import-error">{error}</div>}
            </div>
            <div className="wiki-modal-footer">
              <button className="wiki-btn-secondary" onClick={onClose}>取消</button>
              <button
                className="wiki-btn-primary"
                onClick={handleImport}
                disabled={importing || (mode === 'paste' ? !pasteContent.trim() : !selectedSource)}
              >
                {importing ? <><div className="wiki-spinner" /> AI 正在分析...</> : '开始导入'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="wiki-modal-body">
              <div className="wiki-import-result">
                <div className="wiki-import-success">导入完成</div>
                <p className="wiki-import-summary">{result.summary}</p>
                <div className="wiki-import-stats">
                  <span>创建 {result.pages.length} 个页面</span>
                  <span>{result.references_created} 个交叉引用</span>
                </div>
                <div className="wiki-import-pages">
                  {result.pages.map((p) => (
                    <div key={p.id} className="wiki-import-page-item">
                      <span className="wiki-import-page-title">{p.title}</span>
                      <span className="wiki-import-page-type">{PAGE_TYPE_LABELS[p.page_type] || p.page_type}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="wiki-modal-footer">
              <button className="wiki-btn-primary" onClick={onDone}>完成</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
