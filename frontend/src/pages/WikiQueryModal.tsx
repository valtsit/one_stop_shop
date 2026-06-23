import { useState } from 'react';
import { wikiQuery, type WikiModelConfig } from '../services/api';
import './WikiShared.css';
import './WikiQueryModal.css';

interface Props {
  spaceId: string;
  modelConfig: Partial<WikiModelConfig>;
  onClose: () => void;
}

export default function WikiQueryModal({ spaceId, modelConfig, onClose }: Props) {
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState('');
  const [citations, setCitations] = useState<{ page_id: string; title: string; excerpt: string }[]>([]);
  const [error, setError] = useState('');

  const handleAsk = async () => {
    if (!question.trim()) return;
    setError('');
    setAsking(true);
    setAnswer('');
    setCitations([]);
    try {
      const r = await wikiQuery({ space_id: spaceId, question: question.trim(), ...modelConfig });
      setAnswer(r.answer);
      setCitations(r.citations);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '问答失败');
    } finally {
      setAsking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  return (
    <div className="wiki-modal-overlay" onClick={onClose}>
      <div className="wiki-query-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wiki-modal-header">
          <h2>AI 问答</h2>
          <button className="wiki-modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="wiki-modal-body wiki-query-body">
          <div className="wiki-query-input-row">
            <textarea
              className="wiki-query-input"
              placeholder="输入你的问题..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              autoFocus
            />
            <button
              className="wiki-query-send"
              onClick={handleAsk}
              disabled={!question.trim() || asking}
            >
              {asking ? (
                <div className="wiki-spinner" style={{ width: 18, height: 18 }} />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>
              )}
            </button>
          </div>

          {error && <div className="wiki-query-error">{error}</div>}

          {answer && (
            <div className="wiki-query-answer">
              <pre className="wiki-query-answer-text">{answer}</pre>
            </div>
          )}

          {citations.length > 0 && (
            <div className="wiki-query-citations">
              <div className="wiki-query-citations-title">引用来源</div>
              {citations.map((c, i) => (
                <div key={i} className="wiki-query-citation">
                  <div className="wiki-query-cite-title">{c.title}</div>
                  <div className="wiki-query-cite-excerpt">{c.excerpt}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
