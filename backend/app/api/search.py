import re
import httpx
from lxml import html as lxml_html
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from ..core.auth import get_current_user

router = APIRouter(prefix="/api/search", tags=["search"])


class SearchRequest(BaseModel):
    query: str
    max_results: int = 5


class SearchResult(BaseModel):
    title: str
    url: str
    snippet: str


@router.post("/", response_model=list[SearchResult])
async def search_web(request: SearchRequest, current_user: dict = Depends(get_current_user)):
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="搜索词不能为空")

    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        }
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            resp = await client.get(
                "https://www.bing.com/search",
                params={"q": request.query, "count": request.max_results},
                headers=headers,
            )
        resp.raise_for_status()

        tree = lxml_html.fromstring(resp.text)
        results = []

        for item in tree.xpath('//li[@class="b_algo"]')[: request.max_results]:
            title_nodes = item.xpath('.//h2/a')
            if not title_nodes:
                continue
            title_el = title_nodes[0]
            title = title_el.text_content().strip()
            url = title_el.get("href", "")

            snippet_parts = item.xpath('.//p | .//div[contains(@class,"b_caption")]//text()')
            snippet = ""
            for part in snippet_parts:
                if isinstance(part, str):
                    snippet += part
                else:
                    snippet += part.text_content()
            snippet = snippet.strip()

            if title and url:
                results.append(SearchResult(title=title, url=url, snippet=snippet))

        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"搜索失败: {str(e)[:200]}")
