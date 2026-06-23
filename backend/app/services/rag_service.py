"""
Lightweight RAG retrieval engine — no external dependencies.

Uses TF-IDF cosine similarity for relevance scoring, with text chunking
to handle long knowledge entries.
"""

import math
import re
from collections import Counter

# --- Stopwords ---

ENGLISH_STOPWORDS = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "shall",
    "should", "may", "might", "must", "can", "could", "i", "me", "my",
    "we", "our", "you", "your", "he", "him", "his", "she", "her", "it",
    "its", "they", "them", "their", "this", "that", "these", "those",
    "what", "which", "who", "whom", "where", "when", "why", "how",
    "and", "but", "or", "nor", "not", "no", "so", "if", "then", "than",
    "too", "very", "just", "about", "above", "after", "again", "all",
    "also", "am", "any", "as", "at", "because", "before", "between",
    "both", "by", "come", "each", "for", "from", "get", "got", "here",
    "in", "into", "like", "make", "many", "more", "most", "much",
    "new", "now", "of", "off", "on", "once", "one", "only", "other",
    "out", "over", "own", "put", "same", "see", "some", "still",
    "such", "take", "there", "these", "through", "to", "under", "up",
    "us", "use", "want", "way", "well", "went", "were", "what",
    "while", "with", "within", "without", "work", "world", "your",
}

CHINESE_STOPWORDS = {
    "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都",
    "一", "一个", "上", "也", "很", "到", "说", "要", "去", "你",
    "会", "着", "没有", "看", "好", "自己", "这", "他", "她", "它",
    "们", "那", "被", "从", "把", "与", "及", "或", "但", "而",
    "如果", "因为", "所以", "但是", "虽然", "还是", "已经", "可以",
    "这个", "那个", "什么", "怎么", "哪个", "哪些", "这样", "那样",
    "之", "其", "为", "以", "于", "对", "等", "中", "让", "向",
    "给", "由", "用", "如", "更", "比", "将", "又", "并", "所",
}

ALL_STOPWORDS = ENGLISH_STOPWORDS | CHINESE_STOPWORDS

# Regex patterns
_CJK_RANGE = r"一-鿿㐀-䶿"
_ENGLISH_WORD = re.compile(r"[a-zA-Z]+")
_CJK_CHAR = re.compile(f"[{_CJK_RANGE}]")
_PUNCTUATION = re.compile(r"[^\w\s]", re.UNICODE)


def tokenize(text: str) -> list[str]:
    """Tokenize mixed Chinese/English text into terms.

    English: lowercase words split by non-alpha chars.
    Chinese: bigrams (2-char sliding window) over consecutive CJK chars.
    Stopwords are filtered out.
    """
    text = text.lower()
    tokens: list[str] = []

    # Extract English words
    for m in _ENGLISH_WORD.finditer(text):
        w = m.group()
        if w not in ALL_STOPWORDS and len(w) > 1:
            tokens.append(w)

    # Extract Chinese bigrams
    # First, find all consecutive CJK runs
    cjk_runs: list[str] = []
    run = []
    for ch in text:
        if _CJK_CHAR.match(ch):
            run.append(ch)
        else:
            if run:
                cjk_runs.append("".join(run))
                run = []
    if run:
        cjk_runs.append("".join(run))

    for run_str in cjk_runs:
        chars = list(run_str)
        # Single chars (filter stopwords)
        for c in chars:
            if c not in ALL_STOPWORDS:
                tokens.append(c)
        # Bigrams
        for i in range(len(chars) - 1):
            bg = chars[i] + chars[i + 1]
            if chars[i] not in ALL_STOPWORDS and chars[i + 1] not in ALL_STOPWORDS:
                tokens.append(bg)

    return tokens


def chunk_text(text: str, chunk_size: int = 300, overlap: int = 50) -> list[str]:
    """Split text into overlapping chunks by character count.

    Tries to break at sentence boundaries (。.!!\n) when possible.
    """
    if len(text) <= chunk_size:
        return [text]

    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        if end < len(text):
            # Try to find a sentence boundary in the last 30% of the chunk
            search_start = start + int(chunk_size * 0.7)
            best_break = -1
            for i in range(end - 1, search_start - 1, -1):
                if text[i] in "。！.!?\n":
                    best_break = i + 1
                    break
            if best_break > 0:
                end = best_break
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(text):
            break
        start = end - overlap
    return chunks


class _ChunkIndex:
    """A single indexed chunk with its TF vector."""

    __slots__ = ("text", "entry_id", "entry_title", "tf", "tokens")

    def __init__(self, text: str, entry_id: str, entry_title: str, tokens: list[str]):
        self.text = text
        self.entry_id = entry_id
        self.entry_title = entry_title
        self.tokens = tokens
        # Normalized TF vector
        total = len(tokens) or 1
        counts = Counter(tokens)
        norm = math.sqrt(sum((c / total) ** 2 for c in counts.values())) or 1.0
        self.tf = {t: (c / total) / norm for t, c in counts.items()}


def _build_index(entries: list[dict]) -> tuple[list[_ChunkIndex], dict[str, float]]:
    """Build search index from knowledge entries, returning (chunks, idf) as local values.

    Thread-safe: does not mutate any shared state.
    """
    chunks: list[_ChunkIndex] = []

    for entry in entries:
        eid = entry.get("id", "")
        title = entry.get("title", "")
        tags = entry.get("tags", [])

        # Build the full text to index
        parts = [title]
        parts.extend(tags)
        if entry.get("format") == "table" and entry.get("columns") and entry.get("rows"):
            parts.append(" | ".join(entry["columns"]))
            for row in entry["rows"]:
                parts.append(" | ".join(str(c) for c in row))
        elif entry.get("content"):
            parts.append(entry["content"])

        full_text = "\n".join(p for p in parts if p)
        if not full_text.strip():
            continue

        for chunk in chunk_text(full_text):
            tokens = tokenize(chunk)
            if tokens:
                chunks.append(_ChunkIndex(chunk, eid, title, tokens))

    # Compute IDF
    n_docs = len(chunks) or 1
    df: dict[str, int] = {}
    for ci in chunks:
        seen = set(ci.tokens)
        for t in seen:
            df[t] = df.get(t, 0) + 1
    idf = {t: math.log(n_docs / (1 + count)) for t, count in df.items()}
    return chunks, idf


class RAGService:
    """Lightweight TF-IDF based RAG retrieval."""

    def __init__(self):
        self._chunks: list[_ChunkIndex] = []
        self._idf: dict[str, float] = {}
        self._dirty = True

    def clear(self):
        self._chunks.clear()
        self._idf.clear()
        self._dirty = True

    def index_entries(self, entries: list[dict]):
        """Build search index from knowledge entries.

        Each entry dict needs: id, title, content, format, columns, rows, tags.
        """
        self._chunks, self._idf = _build_index(entries)
        self._dirty = False

    def search(
        self,
        query: str,
        entries: list[dict],
        top_k: int = 5,
        max_chars_per_entry: int = 2000,
    ) -> list[dict]:
        """Search knowledge entries using TF-IDF cosine similarity.

        Returns list of {entry_id, entry_title, text, score} dicts,
        grouped by entry, each entry truncated to max_chars_per_entry.

        Thread-safe: builds index in local variables, never mutates singleton state.
        """
        if not entries:
            return []

        # Build index in local variables to avoid concurrent mutation
        chunks, idf = _build_index(entries)

        query_tokens = tokenize(query)
        if not query_tokens:
            return []

        # Query TF vector (normalized)
        q_total = len(query_tokens) or 1
        q_counts = Counter(query_tokens)
        q_norm = math.sqrt(sum((c / q_total) ** 2 for c in q_counts.values())) or 1.0
        q_tf = {t: (c / q_total) / q_norm for t, c in q_counts.items()}

        # Score each chunk
        scored: list[tuple[float, _ChunkIndex]] = []
        for ci in chunks:
            score = 0.0
            for qt, qv in q_tf.items():
                if qt in ci.tf:
                    score += qv * ci.tf[qt] * idf.get(qt, 1.0)
            if score > 0:
                scored.append((score, ci))

        scored.sort(key=lambda x: x[0], reverse=True)

        # Deduplicate: keep top chunks, aggregate by entry
        seen_chunks: set[str] = set()
        entry_chunks: dict[str, list[tuple[float, str]]] = {}

        for score, ci in scored:
            chunk_key = ci.text[:100]  # rough dedup
            if chunk_key in seen_chunks:
                continue
            seen_chunks.add(chunk_key)

            if ci.entry_id not in entry_chunks:
                entry_chunks[ci.entry_id] = []
            entry_chunks[ci.entry_id].append((score, ci.text))

            if len(entry_chunks) >= top_k * 2:
                break

        # Build results, truncate per entry
        results: list[dict] = []
        entry_titles: dict[str, str] = {}
        for ci in chunks:
            if ci.entry_id not in entry_titles:
                entry_titles[ci.entry_id] = ci.entry_title

        for eid, chunk_list in entry_chunks.items():
            combined = "\n".join(t for _, t in chunk_list)
            if len(combined) > max_chars_per_entry:
                combined = combined[:max_chars_per_entry] + "\n[...内容已截断]"
            max_score = max(s for s, _ in chunk_list)
            results.append({
                "entry_id": eid,
                "entry_title": entry_titles.get(eid, ""),
                "text": combined,
                "score": round(max_score, 4),
            })

        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:top_k]


# Singleton instance
rag_service = RAGService()
