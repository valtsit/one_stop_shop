import copy
import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.schemas import KnowledgeSubmissionCreate, KnowledgeSubmissionResponse, KnowledgeRejectRequest
from ..core.auth import get_current_user, require_permission
from ..core.database import get_db
from ..core.crud import (
    get_submission as crud_get_submission,
    list_submissions as crud_list_submissions,
    list_submissions_by_user as crud_list_submissions_by_user,
    count_pending_submissions as crud_count_pending_submissions,
    create_submission as crud_create_submission,
    update_submission as crud_update_submission,
    get_knowledge as crud_get_knowledge,
    create_knowledge as crud_create_knowledge,
    update_knowledge as crud_update_knowledge,
    find_pending_cell_submission,
)

router = APIRouter(prefix="/api/knowledge-submissions", tags=["knowledge-submissions"])


def _get_user_display_name(user: dict) -> str:
    return user.get("display_name") or user.get("username", "未知用户")


def _is_cell_fill(submission: dict) -> bool:
    """Check if a submission is a cell-fill (not row insert).

    A cell-fill has no row_values AND a non-negative target_row.
    """
    row_vals = submission.get("row_values")
    target_row = submission.get("target_row", -1)
    # row_values can be None (NULL) or [] (empty list) for cell-fill
    is_empty_values = row_vals is None or row_vals == []
    has_valid_row = target_row is not None and int(target_row) >= 0
    return is_empty_values and has_valid_row


async def _append_table_row(db, target_id: str, row_values: list[str], selected_text: str, target_column: int, target_row: int = -1):
    """Append or insert a new row to a table knowledge entry."""
    target = await crud_get_knowledge(db, target_id)
    if not target:
        raise HTTPException(status_code=400, detail="目标知识库条目不存在")
    cols = target.get("columns", [])
    rows = list(target.get("rows", []))
    if row_values:
        new_row = list(row_values)
        while len(new_row) < len(cols):
            new_row.append("")
        new_row = new_row[: len(cols)]
    else:
        col_idx = target_column if 0 <= target_column < len(cols) else 0
        new_row = [""] * len(cols)
        new_row[col_idx] = selected_text
    if 0 <= target_row <= len(rows):
        rows.insert(target_row, new_row)
    else:
        rows.append(new_row)
    now = datetime.now().isoformat()
    await crud_update_knowledge(db, target_id, {"rows": rows, "updated_at": now})


async def _fill_table_cell(db, target_id: str, target_row: int, target_column: int, text: str):
    """Fill a specific cell in a table knowledge entry."""
    target = await crud_get_knowledge(db, target_id)
    if not target:
        raise HTTPException(status_code=400, detail="目标知识库条目不存在")
    rows = copy.deepcopy(target.get("rows", []))
    cols = target.get("columns", [])
    if target_row < 0 or target_row >= len(rows):
        raise HTTPException(status_code=400, detail="目标行不存在")
    if target_column < 0 or target_column >= len(cols):
        raise HTTPException(status_code=400, detail="目标列不存在")
    rows[target_row][target_column] = text
    now = datetime.now().isoformat()
    await crud_update_knowledge(db, target_id, {"rows": rows, "updated_at": now})


async def _append_text(db, target_id: str, selected_text: str):
    """Append text to a text knowledge entry."""
    target = await crud_get_knowledge(db, target_id)
    if not target:
        raise HTTPException(status_code=400, detail="目标知识库条目不存在")
    new_content = (target.get("content", "") + "\n\n" + selected_text).strip()
    now = datetime.now().isoformat()
    await crud_update_knowledge(db, target_id, {"content": new_content, "updated_at": now})


async def _check_cell_conflicts(db, kb_id: str, target_row: int, target_column: int, user_id: str):
    """Check if a cell can be filled. Returns error message or None."""
    target = await crud_get_knowledge(db, kb_id)
    if not target:
        return "目标知识库条目不存在"
    rows = target.get("rows", [])
    cols = target.get("columns", [])
    tr = int(target_row) if target_row is not None else -1
    tc = int(target_column) if target_column is not None else 0
    if tr < 0 or tr >= len(rows):
        return "目标行不存在"
    if tc < 0 or tc >= len(cols):
        return "目标列不存在"
    # Check if cell already has content
    if rows[tr][tc]:
        return "该单元格已有内容，无法覆盖"
    # Check if another user has a pending submission for this cell
    other_pending = await find_pending_cell_submission(db, kb_id, tr, tc, exclude_user_id=user_id)
    if other_pending:
        return f"该单元格已有用户 {other_pending.get('submitted_by_name', '其他用户')} 的提交在审核中，请等待审核完成"
    return None


@router.post("/", response_model=KnowledgeSubmissionResponse)
async def create_submission(
    item: KnowledgeSubmissionCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now().isoformat()
    role_id = current_user.get("role_id", "")
    is_admin = role_id in ("role_super_admin", "role_admin")
    user_id = current_user.get("id", "")

    # Determine if this is a cell-fill or row-insert for table append
    # Coerce to int to guard against string values from SQLite flexible typing
    _target_row = int(item.target_row) if item.target_row is not None else -1
    _target_col = int(item.target_column) if item.target_column is not None else 0
    is_cell_fill = (
        item.action_type == "append"
        and item.target_kb_id
        and (item.row_values is None or item.row_values == [])
        and _target_row >= 0
    )
    print(f"[DEBUG create_submission] action={item.action_type} target_kb={item.target_kb_id} row_values={item.row_values!r} target_row={_target_row} target_col={_target_col} is_cell_fill={is_cell_fill} is_admin={is_admin}")

    # For cell-fill, check conflicts before proceeding
    if is_cell_fill:
        conflict = await _check_cell_conflicts(db, item.target_kb_id, _target_row, _target_col, user_id)
        if conflict:
            raise HTTPException(status_code=409, detail=conflict)

    # Append to a skip_review entry is auto-approved
    skip_review = False
    if not is_admin and item.action_type == "append" and item.target_kb_id:
        target = await crud_get_knowledge(db, item.target_kb_id)
        if target and target.get("skip_review"):
            skip_review = True

    # Admin submissions or skip_review appends are auto-approved
    if is_admin or skip_review:
        if item.action_type == "create":
            kb_id = "kb_" + str(uuid.uuid4())[:8]
            kb_entry = {
                "id": kb_id,
                "title": item.title,
                "content": item.selected_text,
                "tags": item.tags,
                "format": "text",
                "columns": [],
                "rows": [],
                "created_at": now,
                "updated_at": now,
            }
            await crud_create_knowledge(db, kb_entry)
        elif item.action_type == "append" and item.target_kb_id:
            target = await crud_get_knowledge(db, item.target_kb_id)
            if not target:
                raise HTTPException(status_code=400, detail="目标知识库条目不存在")
            if target.get("format") == "table":
                if is_cell_fill:
                    print(f"[DEBUG create_submission] auto-approved: calling _fill_table_cell(row={_target_row}, col={_target_col})")
                    await _fill_table_cell(db, item.target_kb_id, _target_row, _target_col, item.selected_text)
                else:
                    print(f"[DEBUG create_submission] auto-approved: calling _append_table_row(row={_target_row}, col={_target_col}, row_values={item.row_values!r})")
                    await _append_table_row(db, item.target_kb_id, item.row_values, item.selected_text, _target_col, _target_row)
            else:
                await _append_text(db, item.target_kb_id, item.selected_text)
        status = "approved"
    else:
        status = "pending"
    print(f"[DEBUG create_submission] is_admin={is_admin} skip_review={skip_review} status={status}")

    # Check if user already has a pending submission for the same cell - update it instead
    if status == "pending" and is_cell_fill:
        own_pending = await find_pending_cell_submission(db, item.target_kb_id, _target_row, _target_col)
        if own_pending and own_pending.get("submitted_by") == user_id:
            # Update existing pending submission
            update_data = {
                "selected_text": item.selected_text,
                "updated_at": now,
            }
            result = await crud_update_submission(db, own_pending["id"], update_data)
            await db.commit()
            return KnowledgeSubmissionResponse(**result)

    sub_id = "sub_" + str(uuid.uuid4())[:8]
    data = {
        "id": sub_id,
        "selected_text": item.selected_text,
        "title": item.title,
        "tags": item.tags,
        "action_type": item.action_type,
        "target_kb_id": item.target_kb_id,
        "target_row": _target_row,
        "target_column": _target_col,
        "row_values": item.row_values if item.row_values is not None else [],
        "status": status,
        "submitted_by": user_id,
        "submitted_by_name": _get_user_display_name(current_user),
        "reviewed_by": current_user.get("id", "") if (is_admin or skip_review) else None,
        "reviewed_at": now if (is_admin or skip_review) else None,
        "reject_reason": None,
        "created_at": now,
        "updated_at": now,
    }
    result = await crud_create_submission(db, data)
    await db.commit()
    return KnowledgeSubmissionResponse(**result)


@router.get("/", response_model=list[KnowledgeSubmissionResponse])
async def list_submissions(
    status: str | None = Query(None),
    current_user: dict = Depends(require_permission("knowledge:review")),
    db: AsyncSession = Depends(get_db),
):
    items = await crud_list_submissions(db, status=status)
    return [KnowledgeSubmissionResponse(**s) for s in items]


@router.get("/my", response_model=list[KnowledgeSubmissionResponse])
async def list_my_submissions(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = current_user.get("id", "")
    items = await crud_list_submissions_by_user(db, user_id)
    return [KnowledgeSubmissionResponse(**s) for s in items]


@router.get("/pending-count")
async def get_pending_count(
    current_user: dict = Depends(require_permission("knowledge:review")),
    db: AsyncSession = Depends(get_db),
):
    count = await crud_count_pending_submissions(db)
    return {"count": count}


@router.post("/{sub_id}/approve", response_model=KnowledgeSubmissionResponse)
async def approve_submission(
    sub_id: str,
    current_user: dict = Depends(require_permission("knowledge:review")),
    db: AsyncSession = Depends(get_db),
):
    sub = await crud_get_submission(db, sub_id)
    if not sub:
        raise HTTPException(status_code=404, detail="提交记录不存在")
    if sub["status"] != "pending":
        raise HTTPException(status_code=400, detail="该提交已处理")

    now = datetime.now().isoformat()

    if sub["action_type"] == "create":
        kb_id = "kb_" + str(uuid.uuid4())[:8]
        kb_entry = {
            "id": kb_id,
            "title": sub["title"],
            "content": sub["selected_text"],
            "tags": sub["tags"],
            "format": "text",
            "columns": [],
            "rows": [],
            "created_at": now,
            "updated_at": now,
        }
        await crud_create_knowledge(db, kb_entry)
    elif sub["action_type"] == "append":
        target_id = sub.get("target_kb_id")
        if not target_id:
            raise HTTPException(status_code=400, detail="目标知识库条目不存在")
        target = await crud_get_knowledge(db, target_id)
        if not target:
            raise HTTPException(status_code=400, detail="目标知识库条目不存在")
        if target.get("format") == "table":
            is_cf = _is_cell_fill(sub)
            print(f"[DEBUG approve_submission] sub_id={sub_id} _is_cell_fill={is_cf} sub_row_values={sub.get('row_values')!r} sub_target_row={sub.get('target_row')!r}")
            if is_cf:
                tr = int(sub.get("target_row", 0)) if sub.get("target_row") is not None else 0
                tc = int(sub.get("target_column", 0)) if sub.get("target_column") is not None else 0
                print(f"[DEBUG approve_submission] calling _fill_table_cell(row={tr}, col={tc})")
                await _fill_table_cell(db, target_id, tr, tc, sub["selected_text"])
            else:
                tr = int(sub.get("target_row", -1)) if sub.get("target_row") is not None else -1
                tc = int(sub.get("target_column", 0)) if sub.get("target_column") is not None else 0
                print(f"[DEBUG approve_submission] calling _append_table_row(row={tr}, col={tc})")
                await _append_table_row(db, target_id, sub.get("row_values", []), sub["selected_text"], tc, tr)
        else:
            await _append_text(db, target_id, sub["selected_text"])

    update_data = {
        "status": "approved",
        "reviewed_by": current_user.get("id", ""),
        "reviewed_at": now,
        "updated_at": now,
    }
    result = await crud_update_submission(db, sub_id, update_data)
    await db.commit()
    return KnowledgeSubmissionResponse(**result)


@router.post("/{sub_id}/reject", response_model=KnowledgeSubmissionResponse)
async def reject_submission(
    sub_id: str,
    body: KnowledgeRejectRequest = KnowledgeRejectRequest(),
    current_user: dict = Depends(require_permission("knowledge:review")),
    db: AsyncSession = Depends(get_db),
):
    sub = await crud_get_submission(db, sub_id)
    if not sub:
        raise HTTPException(status_code=404, detail="提交记录不存在")
    if sub["status"] != "pending":
        raise HTTPException(status_code=400, detail="该提交已处理")

    now = datetime.now().isoformat()
    update_data = {
        "status": "rejected",
        "reviewed_by": current_user.get("id", ""),
        "reviewed_at": now,
        "reject_reason": body.reason,
        "updated_at": now,
    }
    result = await crud_update_submission(db, sub_id, update_data)
    await db.commit()
    return KnowledgeSubmissionResponse(**result)
