/**
 * VCM XDDD — Tiến độ hạng mục công việc theo dự án
 *
 * Danh mục hạng mục import từ file Excel nhiều sheet (mỗi sheet = một hạng mục
 * lớn). Kỹ sư cập nhật khối lượng đã thực hiện hàng ngày; mỗi lần ghi là một
 * dòng trong project_work_item_logs.
 *
 * `completed_qty` là LUỸ KẾ (tổng đã làm đến thời điểm ghi), KHÔNG cộng dồn.
 * Giá trị hiển thị luôn lấy từ log có log_date MỚI NHẤT — nên sửa/xoá một log
 * quá khứ không kéo tụt được con số hiện tại. Đây đúng là lỗi đã gặp ở
 * daily-logs của page Plan (nhóm test 2.6 trong verify-plans.js).
 *
 * progress_pct và status KHÔNG lưu xuống DB — tính khi đọc để không lệch.
 */
const router = require('express').Router();
const { query, getClient } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const {
  badRequest,
  forbidden,
  assertRequiredDate,
  assertDate,
  assertNonNegative,
  textOrEmpty,
} = require('./_planValidators');

/** Chặn một file Excel hỏng dựng cả nghìn dòng rác */
const MAX_ITEMS = 5000;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Trạng thái suy ra từ tỉ lệ hoàn thành — khớp nhãn trong file Excel mẫu */
function deriveStatus(pct) {
  if (pct <= 0) return 'NOT_STARTED';
  if (pct >= 100) return 'DONE';
  return 'IN_PROGRESS';
}

function mapItem(r) {
  const planned = num(r.planned_qty);
  const completed = num(r.completed_qty);
  // Dòng nhóm (level 0/1) không có khối lượng riêng — % của nó được frontend
  // tổng hợp từ các dòng lá bên dưới, ở đây trả 0 chứ không chia cho 0.
  const pct = planned > 0 ? Math.min(100, (completed / planned) * 100) : 0;
  return {
    id: r.id,
    projectId: r.project_id,
    sheetName: r.sheet_name || '',
    sheetOrder: r.sheet_order,
    sortOrder: r.sort_order,
    level: r.level,
    code: r.code || '',
    nameVi: r.name_vi,
    nameEn: r.name_en || '',
    unitVi: r.unit_vi || '',
    unitEn: r.unit_en || '',
    plannedQty: planned,
    completedQty: completed,
    progressPct: Math.round(pct * 10) / 10,
    status: deriveStatus(pct),
    note: r.note || '',
    targetDate: r.target_date || null,
    actualDate: r.actual_date || null,
    updatedBy: r.updated_by || '',
    updatedAt: r.updated_at,
  };
}

function mapLog(r) {
  return {
    id: r.id,
    itemId: r.item_id,
    logDate: r.log_date,
    completedQty: num(r.completed_qty),
    note: r.note || '',
    createdBy: r.created_by || '',
    createdByName: r.created_by_name || '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * Đồng bộ project_work_items.completed_qty từ log có log_date mới nhất.
 * Không có log nào còn lại → 0.
 */
async function syncCompletedQty(client, itemId, userId) {
  await client.query(
    `UPDATE project_work_items SET
       completed_qty = COALESCE((
         SELECT completed_qty FROM project_work_item_logs
         WHERE item_id = $1
         ORDER BY log_date DESC, created_at DESC
         LIMIT 1
       ), 0),
       updated_by = $2,
       updated_at = NOW()
     WHERE id = $1`,
    [itemId, textOrEmpty(userId)]
  );
}

/**
 * Tự điền actual_date khi khối lượng luỹ kế đạt đủ kế hoạch.
 *
 * Lấy MIN(log_date) trong số các lần ghi đã đạt đủ, KHÔNG lấy ngày của lần ghi
 * hiện tại: khối lượng là luỹ kế nên kỹ sư ghi bù một ngày cũ vẫn phải ra đúng
 * ngày thực sự hoàn thành.
 *
 * Cố ý KHÔNG tự xoá khi khối lượng bị sửa tụt xuống dưới 100% — làm vậy sẽ âm
 * thầm huỷ mất ngày người dùng nhập tay. Người dùng tự sửa/xoá qua PUT /:id/dates.
 */
async function syncActualDate(client, itemId) {
  await client.query(
    `UPDATE project_work_items i SET actual_date = (
         SELECT MIN(l.log_date) FROM project_work_item_logs l
         WHERE l.item_id = i.id AND l.completed_qty >= i.planned_qty
       )
     WHERE i.id = $1 AND i.actual_date IS NULL AND i.planned_qty > 0
       AND EXISTS (
         SELECT 1 FROM project_work_item_logs l
         WHERE l.item_id = i.id AND l.completed_qty >= i.planned_qty
       )`,
    [itemId]
  );
}

// GET /project-work-items?projectId=...&date=YYYY-MM-DD
router.get('/', async (req, res, next) => {
  try {
    const { projectId, date } = req.query;
    if (!projectId) throw badRequest('projectId is required');

    const result = await query(
      `SELECT * FROM project_work_items
       WHERE project_id = $1
       ORDER BY sheet_order, sort_order, created_at`,
      [projectId]
    );
    const items = result.rows.map(mapItem);

    // Kèm khối lượng đã ghi đúng ngày đang xem, để form nhập hiện lại giá trị cũ
    // thay vì trống trơn khi kỹ sư mở lại ngày hôm trước.
    if (date && items.length > 0) {
      const cleanDate = assertRequiredDate(date, 'date');
      const logs = await query(
        `SELECT l.item_id, l.completed_qty, l.note
         FROM project_work_item_logs l
         WHERE l.item_id = ANY($1) AND l.log_date = $2`,
        [items.map(i => i.id), cleanDate]
      );
      const byItem = {};
      logs.rows.forEach(r => {
        byItem[r.item_id] = { qty: num(r.completed_qty), note: r.note || '' };
      });
      items.forEach(i => {
        const entry = byItem[i.id];
        i.dayQty = entry ? entry.qty : null;
        i.dayNote = entry ? entry.note : '';
      });
    }

    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
});

// POST /project-work-items/import
// Thay thế TOÀN BỘ danh mục của dự án bằng nội dung file mới, trong một transaction.
//
// LƯU Ý: segment tĩnh '/import' phải đăng ký TRƯỚC mọi route '/:id/...' bên dưới.
// Xem .claude/rules/route-ordering.md — lỗi này đã xảy ra với '/items/batch-status'.
router.post('/import', async (req, res, next) => {
  let client;
  try {
    const { projectId, sheets } = req.body;
    if (!projectId) throw badRequest('projectId is required');
    if (!Array.isArray(sheets) || sheets.length === 0) {
      throw badRequest('sheets is required');
    }

    // Dàn phẳng trước khi mở transaction: file hỏng thì hỏng sớm, chưa xoá gì cả.
    const flat = [];
    sheets.forEach((sheet, sheetOrder) => {
      const sheetName = textOrEmpty(sheet.sheetName).slice(0, 255);
      (sheet.items || []).forEach((it, sortOrder) => {
        const nameVi = textOrEmpty(it.nameVi).trim();
        if (!nameVi) return; // bỏ dòng trống trong file
        flat.push({
          sheetName,
          sheetOrder,
          sortOrder,
          level: [0, 1, 2].includes(Number(it.level)) ? Number(it.level) : 2,
          code: textOrEmpty(it.code).slice(0, 50),
          nameVi,
          nameEn: textOrEmpty(it.nameEn),
          unitVi: textOrEmpty(it.unitVi).slice(0, 50),
          unitEn: textOrEmpty(it.unitEn).slice(0, 50),
          plannedQty: assertNonNegative(it.plannedQty, 'plannedQty'),
          // Chỉ dòng lá mới có mốc thời gian; dòng nhóm là tiêu đề.
          targetDate: Number(it.level) === 2 ? assertDate(it.targetDate, 'targetDate') : null,
          note: textOrEmpty(it.note),
        });
      });
    });

    if (flat.length === 0) throw badRequest('Không có hạng mục nào hợp lệ trong file');
    if (flat.length > MAX_ITEMS) {
      throw badRequest(`Quá nhiều hạng mục (tối đa ${MAX_ITEMS}, file có ${flat.length})`);
    }

    client = await getClient();
    await client.query('BEGIN');

    const exists = await client.query('SELECT 1 FROM projects WHERE id = $1', [projectId]);
    if (exists.rows.length === 0) throw badRequest('Project not found');

    // Cascade xoá luôn project_work_item_logs
    await client.query('DELETE FROM project_work_items WHERE project_id = $1', [projectId]);

    // Bulk insert theo lô: một câu INSERT thay vì N round-trip. Chia lô để không
    // vượt trần 65535 tham số của giao thức PostgreSQL (13 cột × 5000 dòng).
    const COLS = 14;
    const CHUNK = 500;
    for (let start = 0; start < flat.length; start += CHUNK) {
      const chunk = flat.slice(start, start + CHUNK);
      const values = [];
      const placeholders = chunk.map((it, i) => {
        values.push(
          uuidv4(), projectId, it.sheetName, it.sheetOrder, it.sortOrder,
          it.level, it.code, it.nameVi, it.nameEn, it.unitVi, it.unitEn,
          it.plannedQty, it.note, it.targetDate
        );
        const base = i * COLS;
        return `(${Array.from({ length: COLS }, (_, c) => `$${base + c + 1}`).join(',')})`;
      });
      await client.query(
        `INSERT INTO project_work_items
           (id, project_id, sheet_name, sheet_order, sort_order, level, code,
            name_vi, name_en, unit_vi, unit_en, planned_qty, note, target_date)
         VALUES ${placeholders.join(',')}`,
        values
      );
    }

    await client.query('COMMIT');
    res.json({ success: true, data: { count: flat.length, sheets: sheets.length } });
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    }
    next(err);
  } finally {
    if (client) client.release();
  }
});

// PUT /project-work-items/:id/progress
router.put('/:id/progress', async (req, res, next) => {
  let client;
  try {
    const { logDate, completedQty, note } = req.body;
    const cleanDate = assertRequiredDate(logDate, 'logDate');
    const qty = assertNonNegative(completedQty, 'completedQty');

    client = await getClient();
    await client.query('BEGIN');

    const item = await client.query(
      'SELECT id, level, planned_qty FROM project_work_items WHERE id = $1',
      [req.params.id]
    );
    if (item.rows.length === 0) throw badRequest('Work item not found');
    // Dòng nhóm là tiêu đề, % của nó tổng hợp từ dòng lá — không cho ghi trực tiếp.
    if (Number(item.rows[0].level) !== 2) {
      throw badRequest('Chỉ hạng mục chi tiết mới cập nhật được khối lượng');
    }

    await client.query(
      `INSERT INTO project_work_item_logs (id, item_id, log_date, completed_qty, note, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (item_id, log_date) DO UPDATE
         SET completed_qty = EXCLUDED.completed_qty,
             note          = EXCLUDED.note,
             updated_at    = NOW()`,
      [uuidv4(), req.params.id, cleanDate, qty, textOrEmpty(note), textOrEmpty(req.user?.id)]
    );

    await syncCompletedQty(client, req.params.id, req.user?.id);
    await syncActualDate(client, req.params.id);

    const updated = await client.query('SELECT * FROM project_work_items WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');

    res.json({ success: true, data: mapItem(updated.rows[0]) });
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    }
    next(err);
  } finally {
    if (client) client.release();
  }
});

// PUT /project-work-items/:id/dates
// Sửa tay hai cột ngày. Truyền null để xoá.
router.put('/:id/dates', async (req, res, next) => {
  try {
    const { targetDate, actualDate } = req.body;
    const hasTarget = Object.prototype.hasOwnProperty.call(req.body, 'targetDate');
    const hasActual = Object.prototype.hasOwnProperty.call(req.body, 'actualDate');
    if (!hasTarget && !hasActual) throw badRequest('targetDate hoặc actualDate là bắt buộc');

    // Ngày mục tiêu là dữ liệu KẾ HOẠCH: kỹ sư chỉ là thành viên dự án thì không
    // được đụng, dù họ sửa được ngày thực tế. viaMembership do middleware
    // projectMemberAccess đặt, chỉ true khi user có projects=VIEW + là member.
    if (hasTarget && req.projectAccess?.viaMembership) {
      throw forbidden('Forbidden: chỉ quyền projects=EDIT mới sửa được ngày hoàn thành mục tiêu');
    }

    const item = await query(
      'SELECT id, level FROM project_work_items WHERE id = $1',
      [req.params.id]
    );
    if (item.rows.length === 0) throw badRequest('Work item not found');
    if (Number(item.rows[0].level) !== 2) {
      throw badRequest('Chỉ hạng mục chi tiết mới có mốc thời gian');
    }

    const sets = [];
    const params = [];
    if (hasTarget) {
      params.push(assertDate(targetDate, 'targetDate'));
      sets.push(`target_date = $${params.length}`);
    }
    if (hasActual) {
      params.push(assertDate(actualDate, 'actualDate'));
      sets.push(`actual_date = $${params.length}`);
    }
    params.push(textOrEmpty(req.user?.id));
    sets.push(`updated_by = $${params.length}`);
    params.push(req.params.id);

    await query(
      `UPDATE project_work_items SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length}`,
      params
    );

    const updated = await query('SELECT * FROM project_work_items WHERE id = $1', [req.params.id]);
    res.json({ success: true, data: mapItem(updated.rows[0]) });
  } catch (err) {
    next(err);
  }
});

// GET /project-work-items/:id/logs
router.get('/:id/logs', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT l.*, u.name AS created_by_name
       FROM project_work_item_logs l
       LEFT JOIN users u ON u.id = l.created_by
       WHERE l.item_id = $1
       ORDER BY l.log_date DESC`,
      [req.params.id]
    );
    res.json({ success: true, data: result.rows.map(mapLog) });
  } catch (err) {
    next(err);
  }
});

// DELETE /project-work-items/:id/logs/:logId
router.delete('/:id/logs/:logId', async (req, res, next) => {
  let client;
  try {
    client = await getClient();
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM project_work_item_logs WHERE id = $1 AND item_id = $2',
      [req.params.logId, req.params.id]
    );
    // Xoá log mới nhất thì con số hiện tại phải lùi về log còn lại gần nhất.
    await syncCompletedQty(client, req.params.id, req.user?.id);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    }
    next(err);
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
