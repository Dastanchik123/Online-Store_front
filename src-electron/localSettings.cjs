// Локальные настройки терминала (номер кассы, принтеры этикеток, режим печати
// чека, device-токен киоска) — то, что принадлежит конкретному рабочему месту,
// а не магазину. Раньше жили в таблице settings SQLite; после перехода на
// 100% онлайн SQLite не нужна, хватает JSON-файла в userData.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const filePath = path.join(app.getPath('userData'), 'terminal-settings.json');

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!cache || typeof cache !== 'object') cache = {};
  } catch (e) {
    cache = {};
  }
  return cache;
}

function getSetting(key) {
  const value = load()[key];
  return value === undefined ? null : value;
}

// Запись через временный файл + rename: при выключении питания посреди
// записи остаётся либо старый, либо новый файл, но не обрезанный.
function setSetting(key, value) {
  const data = { ...load(), [key]: value };
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
  cache = data;
}

module.exports = { getSetting, setSetting };
