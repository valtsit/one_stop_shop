import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fetchSkills, deleteSkill, importSkillFolder, type Skill } from '../services/api';
import { useHasPermission } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import './SkillManagePage.css';

// --- folder reading helpers ---

interface FolderFile {
  file: File;
  path: string;
}

async function readFolderEntry(entry: any, prefix: string = ''): Promise<FolderFile[]> {
  const files: FolderFile[] = [];
  if (entry.isFile) {
    const file: File = await new Promise((resolve) => entry.file(resolve));
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    files.push({ file, path });
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    const readEntries = (): Promise<any[]> => new Promise((resolve) => reader.readEntries(resolve));
    let entries = await readEntries();
    while (entries.length > 0) {
      for (const child of entries) {
        const childPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
        const childFiles = await readFolderEntry(child, childPrefix);
        files.push(...childFiles);
      }
      entries = await readEntries();
    }
  }
  return files;
}

function getCommonPrefix(paths: string[]): string {
  if (paths.length === 0) return '';
  let prefix = paths[0];
  for (let i = 1; i < paths.length; i++) {
    while (!paths[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
      if (!prefix) break;
    }
    if (!prefix) break;
  }
  const lastSlash = prefix.lastIndexOf('/');
  if (lastSlash >= 0) {
    prefix = prefix.slice(0, lastSlash);
  }
  return prefix;
}

function stripCommonPrefix(files: FolderFile[]): FolderFile[] {
  if (files.length === 0) return files;
  const paths = files.map((f) => f.path);
  const prefix = getCommonPrefix(paths);
  const prefixWithSlash = prefix ? (prefix.endsWith('/') ? prefix + '/' : prefix + '/') : '';
  return files.map(({ file, path }) => ({
    file,
    path: prefixWithSlash ? path.slice(prefixWithSlash.length) : path,
  }));
}

export default function SkillManagePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hasPerm = useHasPermission();
  const { toast, confirm } = useToast();
  const canCreate = hasPerm('skill:create');
  const canUpdate = hasPerm('skill:update');
  const canDelete = hasPerm('skill:delete');
  const [skills, setSkills] = useState<Skill[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(searchParams.get('highlight'));
  const skillCardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const loadSkills = () => {
    fetchSkills().then((data) => {
      setSkills(data);
      // If there's a highlighted skill, scroll to it after skills load
      const hl = searchParams.get('highlight');
      if (hl) {
        setHighlightedId(hl);
        // Clear the highlight param from URL without navigating
        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);
      }
    }).catch(() => {});
  };

  useEffect(() => {
    loadSkills();
  }, []);

  // Scroll to highlighted skill after render
  useEffect(() => {
    if (highlightedId && skillCardRefs.current[highlightedId]) {
      skillCardRefs.current[highlightedId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Remove highlight after 3 seconds
      const timer = setTimeout(() => setHighlightedId(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [highlightedId, skills]);

  const handleDelete = async (id: string, name: string) => {
    if (!(await confirm(`确定删除Skill"${name}"吗？可在回收站中恢复。`))) return;
    setDeleting(id);
    try {
      await deleteSkill(id);
      setSkills((prev) => prev.filter((s) => s.id !== id));
      toast('删除成功', 'success');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '删除失败', 'error');
    } finally {
      setDeleting(null);
    }
  };

  const getPreview = (skill: Skill) => {
    const s = skill.structure;
    if (!s) return '暂无内容';
    const parts: string[] = [];
    if (s.skill_md) parts.push('SKILL.md');
    if (s.references?.length) parts.push(`${s.references.length} 个参考文档`);
    if (s.scripts?.length) parts.push(`${s.scripts.length} 个脚本`);
    if (s.assets?.length) parts.push(`${s.assets.length} 个资源`);
    return parts.length ? parts.join(' · ') : '空 Skill';
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      setImportError(null);

      const items = e.dataTransfer.items;
      if (!items || items.length === 0) return;

      const allFiles: FolderFile[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const entry = (item as any).webkitGetAsEntry?.();
        if (entry) {
          const entryFiles = await readFolderEntry(entry);
          allFiles.push(...entryFiles);
        } else {
          const file = item.getAsFile();
          if (file) allFiles.push({ file, path: file.name });
        }
      }

      if (allFiles.length === 0) {
        setImportError('没有检测到可导入的文件');
        return;
      }

      // Strip common prefix (root folder name)
      const normalized = stripCommonPrefix(allFiles);

      // Use root folder name as skill name if available
      const firstPath = allFiles[0].path;
      const rootName = firstPath.split('/')[0] || '导入的Skill';

      setImporting(true);
      try {
        await importSkillFolder(rootName, '', normalized);
        loadSkills();
        toast('导入成功', 'success');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '导入失败';
        setImportError(msg);
        toast(msg, 'error');
      } finally {
        setImporting(false);
      }
    },
    [],
  );

  return (
    <div className="content-area">
      <div className="skill-manage-page">
        <div className="skill-manage-header">
          <div>
            <h1>Skill 管理</h1>
            <p>{canCreate ? '创建和管理 Skill 目录，支持拖拽文件夹导入' : '查看可用的 Skill'}</p>
          </div>
          {canCreate && (
            <button
              className="create-skill-btn"
              type="button"
              onClick={() => navigate('/skills/create')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>创建 Skill</span>
            </button>
          )}
        </div>

        {/* Drag & drop zone */}
        {canCreate && (
          <div
            className={`skill-drop-zone ${dragging ? 'dragging' : ''} ${importing ? 'importing' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {importing ? (
              <span>正在导入...</span>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span>拖拽 Skill 文件夹到此处导入</span>
                <span className="skill-drop-hint">文件夹需包含 SKILL.md</span>
              </>
            )}
          </div>
        )}
        {importError && <div className="skill-import-error">{importError}</div>}

        {skills.length === 0 ? (
          <div className="skill-empty">
            <div className="skill-empty-icon">⚡</div>
            <p>{canCreate ? '还没有创建任何 Skill' : '暂无可用的 Skill'}</p>
            {canCreate && (
              <button className="create-skill-btn" type="button" onClick={() => navigate('/skills/create')}>
                创建第一个 Skill
              </button>
            )}
          </div>
        ) : (
          <div className="skill-grid">
            {skills.map((skill) => (
              <div
                key={skill.id}
                className={`skill-card ${highlightedId === skill.id ? 'skill-card-highlighted' : ''}`}
                ref={(el) => { skillCardRefs.current[skill.id] = el; }}
              >
                <div className="skill-card-name">{skill.name}</div>
                <p className="skill-card-desc">{skill.description || '暂无描述'}</p>
                <div className="skill-card-meta">
                  <span className="skill-card-meta-item">
                    {skill.structure?.skill_md ? '✓ SKILL.md' : '— SKILL.md'}
                  </span>
                  {skill.structure?.references && skill.structure.references.length > 0 && (
                    <span className="skill-card-meta-item">{skill.structure.references.length} 参考</span>
                  )}
                  {skill.structure?.scripts && skill.structure.scripts.length > 0 && (
                    <span className="skill-card-meta-item">{skill.structure.scripts.length} 脚本</span>
                  )}
                  {skill.structure?.assets && skill.structure.assets.length > 0 && (
                    <span className="skill-card-meta-item">{skill.structure.assets.length} 资源</span>
                  )}
                </div>
                <div className="skill-card-content-preview">{getPreview(skill)}</div>
                <div className="skill-card-actions">
                  {canUpdate && (
                    <button
                      className="skill-action-btn edit"
                      type="button"
                      onClick={() => navigate(`/skills/edit/${skill.id}`)}
                    >
                      编辑
                    </button>
                  )}
                  {canDelete && (
                    <button
                      className="skill-action-btn delete"
                      type="button"
                      disabled={deleting === skill.id}
                      onClick={() => handleDelete(skill.id, skill.name)}
                    >
                      {deleting === skill.id ? '删除中...' : '删除'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
