// 頁面可直接開啟；所有雲端請求都使用可公開的金鑰，權限由資料庫檢查。
const 雲端網址 = 'https://ndgxlvwiodttgefziwys.supabase.co';
const 公開金鑰 = 'sb_publishable__7wKNjVBX54BKmkm5giE3g__hctMbFi';
const 本機儲存名稱 = 'zhixu-notes';
const 登入儲存名稱 = 'zhixu-session';
const 資料表 = { '會議紀錄': '會議紀錄', '待辦事項': '研究待辦', '文獻閱讀': '文獻閱讀', '研究筆記': '研究筆記', '靈感收集': '研究筆記' };
const 分類色彩 = { '研究筆記': 'green', '會議紀錄': 'green', '文獻閱讀': 'peach', '靈感收集': 'purple', '待辦事項': 'yellow' };
const 取得 = 選擇器 => document.querySelector(選擇器);
function 今日() {
  const 現在 = new Date();
  return [現在.getFullYear(), String(現在.getMonth() + 1).padStart(2, '0'), String(現在.getDate()).padStart(2, '0')].join('-');
}
function 讀取本機(名稱, 預設值) {
  try { return JSON.parse(localStorage.getItem(名稱)) ?? 預設值; }
  catch (錯誤) { return 預設值; }
}
function 存入本機(名稱, 值) {
  try { localStorage.setItem(名稱, JSON.stringify(值)); return true; }
  catch (錯誤) { return false; }
}
const 範例 = [
  { 標題: '我的研究，從這裡開始', 分類: '研究筆記', 內容: '記下目前的研究方向、想回答的問題，以及接下來想探索的可能性。', 日期: 今日() },
  { 標題: '文獻閱讀筆記範本', 分類: '文獻閱讀', 內容: '研究問題是什麼？作者使用了什麼方法？有哪些發現值得進一步思考？', 日期: 今日() },
  { 標題: '隨手記下的靈感', 分類: '靈感收集', 內容: '一個還不成熟的想法，也值得被好好保存。', 日期: 今日() }
];
let 原有筆記 = 讀取本機(本機儲存名稱, 範例);
if (!Array.isArray(原有筆記)) 原有筆記 = 範例;
// 兼容原本的筆記格式，並固定編號，讓反覆匯入不會建立重複資料。
let 本機紀錄 = 原有筆記.filter(項目 => 項目 && typeof 項目 === 'object').map(項目 => ({
  ...項目,
  編號: 項目.編號 || (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(項目.id || '') ? 項目.id : crypto.randomUUID()),
  標題: String(項目.標題 ?? 項目.title ?? ''),
  內容: String(項目.內容 ?? 項目.content ?? ''),
  分類: 項目.分類 || 項目.category || '研究筆記',
  日期: 項目.日期 || 項目.date || 今日()
}));
存入本機(本機儲存名稱, 本機紀錄);
let 登入資料 = 讀取本機(登入儲存名稱, null);
if (!登入資料?.access_token || !登入資料?.refresh_token || !登入資料?.user?.id) 登入資料 = null;
let 雲端紀錄 = [];
let 目前分類 = '全部';
let 編輯紀錄 = null;
let 憑證更新中 = null;
let 資料處理中 = false;
const 編輯視窗 = 取得('#note-dialog');
const 編輯表單 = 取得('#note-form');

function 提示(選擇器, 文字, 有錯誤 = false) {
  const 區塊 = 取得(選擇器);
  區塊.textContent = 文字;
  區塊.classList.toggle('error', 有錯誤);
}
function 鎖定表單(表單, 鎖定) {
  表單.querySelectorAll('input, textarea, select, button').forEach(欄位 => { 欄位.disabled = 鎖定; });
  表單.setAttribute('aria-busy', String(鎖定));
}
async function 請求(路徑, 方法 = 'GET', 資料, 憑證 = '', 偏好 = 'return=representation') {
  const 控制器 = new AbortController();
  const 計時器 = setTimeout(() => 控制器.abort(), 15000);
  try {
    const 回應 = await fetch(雲端網址 + 路徑, {
      method: 方法,
      headers: { apikey: 公開金鑰, 'Content-Type': 'application/json', Prefer: 偏好, ...(憑證 ? { Authorization: 'Bearer ' + 憑證 } : {}) },
      ...(資料 === undefined ? {} : { body: JSON.stringify(資料) }),
      signal: 控制器.signal
    });
    const 文字 = await 回應.text();
    let 結果 = null;
    try { 結果 = 文字 ? JSON.parse(文字) : null; } catch (錯誤) { /* 沒有回傳資料時沿用空值。 */ }
    if (!回應.ok) {
      const 訊息 = {
        invalid_credentials: '電子郵件或密碼不正確。', email_not_confirmed: '請先完成電子郵件驗證，再回來登入。',
        user_already_exists: '此電子郵件已註冊，請直接登入。', over_email_send_rate_limit: '確認信寄送次數已達上限，請稍後再試。',
        email_address_not_authorized: '目前專案只允許授權的電子郵件註冊，請使用專案擁有者的電子郵件。',
        weak_password: '密碼強度不足，請使用更長的密碼。', '23514': '欄位內容不符合限制，請檢查長度、年份與連結。',
        '23503': '關聯的會議不存在或不屬於此帳號，請重新選擇。'
      };
      const 錯誤 = new Error(訊息[結果?.code || 結果?.error_code] || (回應.status === 401 ? '登入已失效，請重新登入。' : 回應.status === 429 ? '請求過於頻繁，請稍後再試。' : '雲端處理失敗，填寫內容已保留，請稍後重試。'));
      錯誤.狀態 = 回應.status;
      錯誤.代碼 = 結果?.code;
      throw 錯誤;
    }
    return 結果;
  } catch (錯誤) {
    if (錯誤.狀態) throw 錯誤;
    throw new Error('目前無法連線到雲端，請確認網路後再試一次。');
  } finally { clearTimeout(計時器); }
}
function 記住登入(資料) {
  登入資料 = { access_token: 資料.access_token, refresh_token: 資料.refresh_token, expires_at: 資料.expires_at || Math.floor(Date.now() / 1000) + 資料.expires_in, user: { id: 資料.user.id, email: 資料.user.email } };
  if (!存入本機(登入儲存名稱, 登入資料)) 提示('#account-status', '已登入；此瀏覽器無法記住登入狀態，關閉後需重新登入。');
}
async function 有效憑證() {
  if (!登入資料) throw new Error('請先登入，才能使用私人雲端資料。');
  if (登入資料.expires_at > Date.now() / 1000 + 60) return 登入資料.access_token;
  // 同時讀取多張表時，共用同一次更新，避免重複使用更新憑證。
  if (!憑證更新中) {
    憑證更新中 = 請求('/auth/v1/token?grant_type=refresh_token', 'POST', { refresh_token: 登入資料.refresh_token })
      .then(資料 => { 記住登入(資料); return 登入資料.access_token; })
      .finally(() => { 憑證更新中 = null; });
  }
  return 憑證更新中;
}
async function 私人請求(路徑, 方法 = 'GET', 資料, 偏好) {
  return 請求(路徑, 方法, 資料, await 有效憑證(), 偏好);
}
function 表格路徑(表名) { return '/rest/v1/' + encodeURIComponent(表名); }
function 目前紀錄() { return 登入資料 ? 雲端紀錄 : 本機紀錄; }

async function 載入雲端() {
  const 使用者 = 登入資料?.user.id;
  const 批次 = await Promise.all(['會議紀錄', '研究待辦', '文獻閱讀', '研究筆記'].map(async 表名 => {
    const 全部 = [];
    // 分批讀取，避免紀錄超過預設上限時只顯示一部分。
    for (let 起點 = 0; ; 起點 += 500) {
      const 查詢 = new URLSearchParams({ select: '*', 使用者編號: 'eq.' + 使用者, order: '日期.desc,編號.desc', limit: '500', offset: String(起點) });
      const 頁面 = await 私人請求(表格路徑(表名) + '?' + 查詢);
      全部.push(...頁面.map(項目 => ({ ...項目, 分類: 表名 === '研究待辦' ? '待辦事項' : 表名 === '研究筆記' ? 項目.分類 : 表名 })));
      if (頁面.length < 500) break;
    }
    return 全部;
  }));
  if (登入資料?.user.id !== 使用者) return;
  雲端紀錄 = 批次.flat();
  顯示紀錄();
  取得('#sync-state').textContent = '雲端資料已更新';
}
function 雲端欄位(紀錄) {
  const 欄位 = { 編號: 紀錄.編號, 使用者編號: 登入資料.user.id, 標題: 紀錄.標題, 內容: 紀錄.內容, 日期: 紀錄.日期 };
  if (紀錄.分類 === '會議紀錄') Object.assign(欄位, { 與會人員: 紀錄.與會人員 || '', 建議與結論: 紀錄.建議與結論 || '', 下次會議日期: 紀錄.下次會議日期 || null });
  else if (紀錄.分類 === '待辦事項') Object.assign(欄位, { 截止日期: 紀錄.截止日期 || null, 狀態: 紀錄.狀態 || '未開始', 會議編號: 紀錄.會議編號 || null });
  else if (紀錄.分類 === '文獻閱讀') Object.assign(欄位, { 作者: 紀錄.作者 || '', 年份: 紀錄.年份 || null, 連結: 紀錄.連結 || '' });
  else 欄位.分類 = 紀錄.分類;
  return 欄位;
}
async function 儲存雲端(紀錄, 僅匯入 = false) {
  const 偏好 = 僅匯入 ? 'resolution=ignore-duplicates,return=minimal' : 'resolution=merge-duplicates,return=representation';
  const 結果 = await 私人請求(表格路徑(資料表[紀錄.分類]) + '?on_conflict=' + encodeURIComponent('編號'), 'POST', 雲端欄位(紀錄), 偏好);
  if (!僅匯入 && (!結果 || 結果.length !== 1)) throw new Error('尚未確認儲存成功，請重試。');
  if (!僅匯入) 雲端紀錄 = [{ ...結果[0], 分類: 紀錄.分類 }, ...雲端紀錄.filter(項目 => 項目.編號 !== 紀錄.編號)];
}
function 更新帳號畫面() {
  取得('#account-form').hidden = Boolean(登入資料);
  取得('#account-tools').hidden = !登入資料;
  取得('#account-help').hidden = Boolean(登入資料);
  取得('#import-records').disabled = !本機紀錄.length;
  取得('#account-description').textContent = 登入資料 ? '已登入：' + 登入資料.user.email + '。資料僅供此帳號查看；可在其他裝置登入同一帳號繼續使用。' : '登入後，會議、待辦、文獻與筆記會儲存到你的私人帳號。未登入時仍可使用本機筆記。';
  取得('#library-description').textContent = 登入資料 ? '目前顯示此帳號的雲端紀錄；既有本機資料可透過上方按鈕匯入。' : '目前顯示此瀏覽器的本機紀錄，登入後可匯入雲端。';
  取得('#sync-state').textContent = 登入資料 ? '正在連接雲端' : '目前使用本機資料';
  顯示紀錄();
}

function 文字元素(標籤, 類名, 文字) {
  const 元素 = document.createElement(標籤);
  元素.className = 類名;
  元素.textContent = 文字;
  return 元素;
}
function 顯示紀錄() {
  const 紀錄 = 目前紀錄();
  取得('#total-count').textContent = 紀錄.length;
  取得('#paper-count').textContent = 紀錄.filter(項目 => 項目.分類 === '文獻閱讀').length;
  取得('#idea-count').textContent = 紀錄.filter(項目 => 項目.分類 === '靈感收集').length;
  取得('#task-count').textContent = 紀錄.filter(項目 => 項目.分類 === '待辦事項' && 項目.狀態 !== '已完成').length;
  取得('#filter-count').textContent = 紀錄.length;
  取得('#breadcrumb').textContent = 目前分類 === '全部' ? '總覽' : 目前分類;
  document.querySelectorAll('[data-filter]').forEach(按鈕 => 按鈕.classList.toggle('active', 按鈕.dataset.filter === 目前分類));
  const 關鍵字 = 取得('#search').value.trim().toLowerCase();
  const 可見紀錄 = 紀錄.filter(項目 => (目前分類 === '全部' || 項目.分類 === 目前分類) && [項目.標題, 項目.內容, 項目.分類, 項目.與會人員, 項目.建議與結論, 項目.作者, 項目.狀態].join(' ').toLowerCase().includes(關鍵字)).sort((甲, 乙) => 乙.日期.localeCompare(甲.日期));
  const 網格 = 取得('#notes-grid');
  網格.replaceChildren();
  if (!可見紀錄.length) 網格.append(文字元素('div', 'empty', 關鍵字 ? '找不到符合的紀錄，試試其他關鍵字。' : '這裡還沒有紀錄，從一個小想法或一次會議開始吧。'));
  可見紀錄.forEach(項目 => {
    const 卡片 = 文字元素('button', 'note-card', '');
    卡片.type = 'button';
    const 頂部 = 文字元素('div', 'card-top', '');
    頂部.append(文字元素('span', 'tag ' + (分類色彩[項目.分類] || 'green'), 項目.分類), 文字元素('span', 'card-more', '···'));
    // 所有使用者內容都當成文字顯示，避免被當作網頁程式碼執行。
    卡片.append(頂部, 文字元素('h3', '', 項目.標題), 文字元素('p', '', 項目.內容));
    if (項目.分類 === '待辦事項') {
      const 會議 = 紀錄.find(會 => 會.編號 === 項目.會議編號 && 會.分類 === '會議紀錄');
      卡片.append(文字元素('div', 'record-meta', (項目.狀態 || '未開始') + (項目.截止日期 ? ' · 截止 ' + 項目.截止日期 : '') + (會議 ? '\n會議：' + 會議.標題 : '')));
    }
    if (項目.分類 === '會議紀錄') {
      const 待辦數 = 紀錄.filter(待辦 => 待辦.分類 === '待辦事項' && 待辦.會議編號 === 項目.編號).length;
      卡片.append(文字元素('div', 'record-meta', (項目.與會人員 || '尚未填寫與會人員') + '\n關聯待辦 ' + 待辦數 + ' 項' + (項目.下次會議日期 ? ' · 下次 ' + 項目.下次會議日期 : '')));
    }
    if (項目.分類 === '文獻閱讀' && (項目.作者 || 項目.年份)) 卡片.append(文字元素('div', 'record-meta', [項目.作者, 項目.年份].filter(Boolean).join(' · ')));
    卡片.append(文字元素('div', 'card-date', '◷ ' + 項目.日期.replaceAll('-', ' / ') + (登入資料 ? ' · 雲端' : ' · 本機')));
    卡片.addEventListener('click', () => 開啟紀錄(項目));
    網格.append(卡片);
  });
}
function 顯示分類欄位() {
  const 分類 = 取得('#note-category').value;
  for (const [區塊, 對應分類] of [['#meeting-fields', '會議紀錄'], ['#paper-fields', '文獻閱讀'], ['#task-fields', '待辦事項']]) {
    取得(區塊).hidden = 分類 !== 對應分類;
    取得(區塊).querySelectorAll('input, textarea, select').forEach(欄位 => { 欄位.disabled = 分類 !== 對應分類; });
  }
  取得('#note-category').disabled = Boolean(編輯紀錄);
}
function 開啟紀錄(紀錄 = null, 分類 = null, 會議編號 = '') {
  if (資料處理中) return;
  編輯紀錄 = 紀錄;
  編輯表單.reset();
  提示('#note-status', '');
  取得('#dialog-title').textContent = 紀錄 ? '編輯紀錄' : '新增紀錄';
  取得('#note-category').value = 紀錄?.分類 || 分類 || (目前分類 === '全部' ? '研究筆記' : 目前分類);
  const 對照 = { '#note-title': '標題', '#note-content': '內容', '#note-date': '日期', '#meeting-people': '與會人員', '#meeting-conclusion': '建議與結論', '#meeting-next': '下次會議日期', '#paper-author': '作者', '#paper-year': '年份', '#paper-url': '連結', '#task-due': '截止日期', '#task-state': '狀態' };
  for (const [欄位, 名稱] of Object.entries(對照)) 取得(欄位).value = 紀錄?.[名稱] ?? (名稱 === '日期' ? 今日() : 名稱 === '狀態' ? '未開始' : '');
  const 選單 = 取得('#task-meeting');
  選單.replaceChildren();
  const 未指定 = 文字元素('option', '', '不指定會議'); 未指定.value = ''; 選單.append(未指定);
  目前紀錄().filter(項目 => 項目.分類 === '會議紀錄').forEach(會議 => {
    const 選項 = 文字元素('option', '', 會議.日期 + '｜' + 會議.標題); 選項.value = 會議.編號; 選單.append(選項);
  });
  選單.value = 紀錄?.會議編號 || 會議編號;
  取得('#meeting-task').hidden = 紀錄?.分類 !== '會議紀錄';
  顯示分類欄位();
  if (!編輯視窗.open) 編輯視窗.showModal();
  取得('#note-title').focus();
}
編輯表單.addEventListener('submit', async 事件 => {
  事件.preventDefault();
  if (資料處理中) return;
  const 標題 = 取得('#note-title').value.trim();
  const 內容 = 取得('#note-content').value.trim();
  if (!標題 || !內容) { 提示('#note-status', '標題與內容不能只有空白。', true); return; }
  const 連結 = 取得('#paper-url').value.trim();
  if (取得('#note-category').value === '文獻閱讀' && 連結 && !/^https?:\/\//i.test(連結)) { 提示('#note-status', '文獻連結請使用完整的網頁網址。', true); return; }
  const 紀錄 = { 編號: 編輯紀錄?.編號 || crypto.randomUUID(), 標題, 內容, 分類: 取得('#note-category').value, 日期: 取得('#note-date').value, 與會人員: 取得('#meeting-people').value.trim(), 建議與結論: 取得('#meeting-conclusion').value.trim(), 下次會議日期: 取得('#meeting-next').value || null, 作者: 取得('#paper-author').value.trim(), 年份: Number(取得('#paper-year').value) || null, 連結, 截止日期: 取得('#task-due').value || null, 狀態: 取得('#task-state').value, 會議編號: 取得('#task-meeting').value || null };
  // 新增失敗時也保留編號，下一次重試就不會再建立一份。
  編輯紀錄 = 紀錄;
  資料處理中 = true;
  鎖定表單(編輯表單, true);
  提示('#note-status', '正在儲存，請稍候。');
  try {
    if (登入資料) await 儲存雲端(紀錄);
    else {
      const 新紀錄 = [紀錄, ...本機紀錄.filter(項目 => 項目.編號 !== 紀錄.編號)];
      if (!存入本機(本機儲存名稱, 新紀錄)) throw new Error('此瀏覽器無法儲存資料，內容已保留，請登入後儲存到雲端。');
      本機紀錄 = 新紀錄;
    }
    目前分類 = 紀錄.分類;
    取得('#search').value = '';
    顯示紀錄();
    編輯視窗.close();
    取得('#sync-state').textContent = 登入資料 ? '已儲存至雲端' : '已儲存至此瀏覽器';
  } catch (錯誤) { 提示('#note-status', 錯誤.message, true); }
  finally { 資料處理中 = false; 鎖定表單(編輯表單, false); 顯示分類欄位(); }
});

取得('#account-form').addEventListener('submit', async 事件 => {
  事件.preventDefault();
  if (資料處理中) return;
  const 註冊 = 事件.submitter?.id === 'register-account';
  資料處理中 = true;
  鎖定表單(取得('#account-form'), true);
  提示('#account-status', 註冊 ? '正在建立帳號…' : '正在登入…');
  try {
    const 結果 = await 請求(註冊 ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password', 'POST', { email: 取得('#account-email').value.trim(), password: 取得('#account-password').value });
    取得('#account-password').value = '';
    if (!結果.access_token) { 提示('#account-status', '請查看電子郵件並完成帳號驗證，再回到此頁登入；若已註冊，請直接登入。'); return; }
    記住登入(結果);
    更新帳號畫面();
    await 載入雲端();
    提示('#account-status', '登入成功。可開始新增紀錄，或按「匯入本機筆記」帶入既有內容。');
  } catch (錯誤) { 提示('#account-status', 錯誤.message, true); }
  finally { 資料處理中 = false; 鎖定表單(取得('#account-form'), false); }
});
取得('#sync-records').addEventListener('click', async () => {
  if (資料處理中) return;
  資料處理中 = true;
  try { await 載入雲端(); 提示('#account-status', '雲端資料已更新。'); }
  catch (錯誤) { 提示('#account-status', 錯誤.message, true); 取得('#sync-state').textContent = '雲端更新失敗，請重試'; }
  finally { 資料處理中 = false; }
});
取得('#import-records').addEventListener('click', async () => {
  if (資料處理中 || !登入資料) return;
  資料處理中 = true;
  let 完成數 = 0;
  try {
    // 先匯入會議，再匯入待辦，才能維持會議與任務的關聯。
    const 排序紀錄 = [...本機紀錄].sort((甲, 乙) => Number(乙.分類 === '會議紀錄') - Number(甲.分類 === '會議紀錄'));
    for (const 紀錄 of 排序紀錄) {
      提示('#account-status', '正在匯入本機筆記：' + 完成數 + '／' + 排序紀錄.length);
      await 儲存雲端(紀錄, true); 完成數++;
    }
    await 載入雲端();
    提示('#account-status', '已處理 ' + 完成數 + ' 筆本機紀錄；已存在的紀錄會略過，雲端編輯內容會保留。');
  } catch (錯誤) { 提示('#account-status', '已處理 ' + 完成數 + ' 筆。' + 錯誤.message + ' 可再次匯入。', true); }
  finally { 資料處理中 = false; }
});
取得('#sign-out').addEventListener('click', async () => {
  if (資料處理中 || !登入資料) return;
  資料處理中 = true;
  let 已撤銷連線 = true;
  try { await 私人請求('/auth/v1/logout?scope=local', 'POST'); }
  catch (錯誤) { 已撤銷連線 = false; }
  finally {
    // 即使斷線或登入已過期，也能離開此帳號並重新登入。
    登入資料 = null; 雲端紀錄 = [];
    const 已清除登入 = 存入本機(登入儲存名稱, null);
    編輯視窗.close(); 更新帳號畫面();
    提示('#account-status', !已清除登入 ? '已離開此帳號，但瀏覽器無法更新登入紀錄，請關閉此頁並清除此網站的儲存資料。' : 已撤銷連線 ? '已登出，目前顯示此瀏覽器的本機紀錄。' : '已登出此頁面；因連線失敗，尚未確認雲端登入憑證已撤銷。', !已清除登入 || !已撤銷連線);
    資料處理中 = false;
  }
});

// 靈感問卷仍可直接提交；登入後，個人副本也會儲存到私人研究筆記。
let 問卷提交中 = false;
let 待送問卷 = null;
取得('#idea-detail').addEventListener('input', () => { 取得('#idea-length').textContent = '已輸入 ' + 取得('#idea-detail').value.length + '／2000 字'; });
取得('#idea-form').addEventListener('submit', async 事件 => {
  事件.preventDefault();
  if (問卷提交中 || 資料處理中) return;
  const 填答 = { 靈感名稱: 取得('#idea-name').value.trim(), 內容: 取得('#idea-detail').value.trim(), 來源: 取得('#idea-source').value, 下一步: 取得('#idea-next').value.trim() };
  if (!填答.靈感名稱 || !填答.內容) { 提示('#idea-status', '靈感名稱與內容不能只有空白。', true); return; }
  const 文字 = JSON.stringify(填答);
  if (!待送問卷 || 待送問卷.文字 !== 文字) 待送問卷 = { 文字, 編號: crypto.randomUUID(), 雲端已提交: false };
  問卷提交中 = true; 資料處理中 = true;
  鎖定表單(取得('#idea-form'), true);
  取得('#idea-view').hidden = true;
  提示('#idea-status', '正在儲存靈感，請稍候。');
  try {
    if (!待送問卷.雲端已提交) {
      try {
        // 公開問卷僅允許未登入角色新增，這個請求不攜帶個人登入憑證。
        await 請求(表格路徑('靈感問卷'), 'POST', { 編號: 待送問卷.編號, ...填答 }, '', 'return=minimal');
      } catch (錯誤) { if (!(錯誤.狀態 === 409 && 錯誤.代碼 === '23505')) throw 錯誤; }
      待送問卷.雲端已提交 = true;
    }
    const 副本 = { 編號: 待送問卷.編號, 標題: 填答.靈感名稱, 分類: '靈感收集', 日期: 今日(), 內容: 填答.內容 + (填答.來源 ? '\n\n靈感來源：' + 填答.來源 : '') + (填答.下一步 ? '\n下一步：' + 填答.下一步 : '') };
    let 副本已儲存 = true;
    if (登入資料) await 儲存雲端(副本);
    else {
      const 新紀錄 = [副本, ...本機紀錄.filter(項目 => 項目.編號 !== 副本.編號)];
      副本已儲存 = 存入本機(本機儲存名稱, 新紀錄); 本機紀錄 = 新紀錄;
    }
    目前分類 = '靈感收集'; 取得('#search').value = ''; 顯示紀錄();
    取得('#idea-form').reset(); 取得('#idea-length').textContent = '已輸入 0／2000 字';
    待送問卷 = null;
    提示('#idea-status', 登入資料 ? '問卷已提交，個人靈感副本也已儲存至雲端。' : 副本已儲存 ? '問卷已儲存至雲端，並加入此瀏覽器的靈感收集。' : '問卷已儲存至雲端，但此瀏覽器無法保存本機副本。');
    取得('#idea-view').hidden = false;
  } catch (錯誤) { 提示('#idea-status', (待送問卷?.雲端已提交 ? '問卷已提交，但個人副本尚未儲存。' : '') + 錯誤.message + ' 填寫內容已保留。', true); }
  finally { 問卷提交中 = false; 資料處理中 = false; 鎖定表單(取得('#idea-form'), false); }
});

取得('#note-category').addEventListener('change', 顯示分類欄位);
document.querySelectorAll('[data-filter]').forEach(按鈕 => 按鈕.addEventListener('click', () => { 目前分類 = 按鈕.dataset.filter; 顯示紀錄(); if (按鈕.classList.contains('nav-item')) 取得('#notes').scrollIntoView({ behavior: 'smooth' }); }));
取得('#new-note').addEventListener('click', () => 開啟紀錄());
取得('#new-note-secondary').addEventListener('click', () => 開啟紀錄());
取得('#new-meeting').addEventListener('click', () => 開啟紀錄(null, '會議紀錄'));
取得('#meeting-task').addEventListener('click', () => { if (!資料處理中 && 編輯紀錄) 開啟紀錄(null, '待辦事項', 編輯紀錄.編號); });
for (const 按鈕 of ['#close-dialog', '#cancel-dialog']) 取得(按鈕).addEventListener('click', () => { if (!資料處理中) 編輯視窗.close(); });
編輯視窗.addEventListener('cancel', 事件 => { if (資料處理中) 事件.preventDefault(); });
取得('#search').addEventListener('input', 顯示紀錄);
取得('#focus-search').addEventListener('click', () => { 取得('#search').focus(); 取得('#search').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
更新帳號畫面();
if (登入資料) {
  資料處理中 = true;
  載入雲端().catch(錯誤 => { 提示('#account-status', 錯誤.message, true); 取得('#sync-state').textContent = '雲端更新失敗，請重試或重新登入'; })
    .finally(() => { 資料處理中 = false; });
}
