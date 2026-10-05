// Синхронизация встроенных форматов этикеток (BUILTIN_LABEL_TEMPLATES) в
// общий Laravel settings.label_templates_all.
//
// POST /settings там защищён middleware 'superadmin' (role === 'admin'),
// поэтому синк возможен только сразу после входа администратора — вызывается
// из auth-save-session в electron-main.cjs. Для кассиров просто no-op: они
// продолжают работать с тем, что уже пришло в label_templates_all с бэкенда
// (realtime-пуш через Setting::saved → PosSyncUpdated('settings') разнесёт
// обновление по остальным терминалам без их участия).
const axios = require('axios');

function mergeBuiltinTemplates(existingList, builtins) {
  const list = Array.isArray(existingList) ? existingList.map((t) => ({ ...t })) : [];
  let changed = false;

  for (const builtin of builtins) {
    const idx = list.findIndex((t) => t.slug === builtin.slug);
    if (idx === -1) {
      list.push({ ...builtin });
      changed = true;
      continue;
    }
    const existing = list[idx];
    if (existing.is_builtin === false) continue; // пользователь отредактировал — не трогаем
    const existingVersion = Number(existing.version) || 0;
    if (existingVersion < builtin.version) {
      list[idx] = { ...builtin, id: existing.id || builtin.id };
      changed = true;
    }
  }

  return { list, changed };
}

async function syncLabelTemplates({ token, apiBase, role }) {
  if (!token || role !== 'admin') return { skipped: true, reason: 'not_admin' };

  const { BUILTIN_LABEL_TEMPLATES } = require('./labelTemplateDefaults.cjs');
  const headers = { Authorization: `Bearer ${token}` };

  const { data: rows } = await axios.get(`${apiBase}/settings`, { headers, timeout: 15000 });
  const row = Array.isArray(rows) ? rows.find((r) => r.key === 'label_templates_all') : null;

  let existingList = [];
  try {
    existingList = row?.value ? JSON.parse(row.value) : [];
    if (!Array.isArray(existingList)) existingList = [];
  } catch (e) {
    existingList = [];
  }

  const { list, changed } = mergeBuiltinTemplates(existingList, BUILTIN_LABEL_TEMPLATES);
  if (!changed) return { skipped: true, reason: 'up_to_date' };

  await axios.post(
    `${apiBase}/settings`,
    { settings: { label_templates_all: JSON.stringify(list) } },
    { headers, timeout: 15000 }
  );
  return { skipped: false, updated: true };
}

module.exports = { syncLabelTemplates, mergeBuiltinTemplates };
