// 筆記只存在目前的瀏覽器，重新開啟網頁仍可繼續使用。
const storageKey = 'zhixu-notes';
const examples = [
  { id: '1', title: '我的研究，從這裡開始', category: '研究筆記', content: '記下目前的研究方向、想回答的問題，以及接下來想探索的可能性。', date: '2026-11-02' },
  { id: '2', title: '文獻閱讀筆記範本', category: '文獻閱讀', content: '研究問題是什麼？作者使用了什麼方法？有哪些發現值得我進一步思考？', date: '2026-11-02' },
  { id: '3', title: '隨手記下的靈感', category: '靈感收集', content: '一個還不成熟的想法，也值得被好好保存。點擊這張卡片，寫下你的第一個靈感吧。', date: '2026-11-02' }
];
let notes;
try {
  const saved = localStorage.getItem(storageKey);
  notes = saved ? JSON.parse(saved) : examples;
  if (!Array.isArray(notes)) notes = examples;
} catch (error) {
  notes = examples;
}
let currentFilter = '全部';
let editingId = null;
const grid = document.querySelector('#notes-grid');
const dialog = document.querySelector('#note-dialog');
const form = document.querySelector('#note-form');
const titleInput = document.querySelector('#note-title');
const categoryInput = document.querySelector('#note-category');
const contentInput = document.querySelector('#note-content');
const search = document.querySelector('#search');
const colors = { '研究筆記': 'green', '文獻閱讀': 'peach', '靈感收集': 'purple', '待辦事項': 'yellow' };

function saveNotes() {
  try { localStorage.setItem(storageKey, JSON.stringify(notes)); }
  catch (error) { alert('無法儲存筆記，請檢查瀏覽器是否允許儲存資料。'); }
}

function render() {
  document.querySelector('#total-count').textContent = notes.length;
  document.querySelector('#paper-count').textContent = notes.filter(note => note.category === '文獻閱讀').length;
  document.querySelector('#idea-count').textContent = notes.filter(note => note.category === '靈感收集').length;
  document.querySelector('#task-count').textContent = notes.filter(note => note.category === '待辦事項').length;
  document.querySelector('#filter-count').textContent = notes.length;
  document.querySelector('#breadcrumb').textContent = currentFilter === '全部' ? '總覽' : currentFilter;
  document.querySelectorAll('[data-filter]').forEach(button => button.classList.toggle('active', button.dataset.filter === currentFilter));
  const keyword = search.value.trim().toLowerCase();
  const visible = notes.filter(note => (currentFilter === '全部' || note.category === currentFilter) && (note.title + note.content + note.category).toLowerCase().includes(keyword));
  grid.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = keyword ? '找不到符合的筆記，試試其他關鍵字。' : '這裡還沒有筆記，從一個小想法開始吧。';
    grid.append(empty);
    return;
  }
  visible.forEach(note => {
    const card = document.createElement('button');
    card.className = 'note-card';
    card.type = 'button';
    // 使用文字內容填入資料，避免筆記內容被當成網頁程式碼。
    const top = document.createElement('div'); top.className = 'card-top';
    const tag = document.createElement('span'); tag.className = 'tag ' + (colors[note.category] || 'green'); tag.textContent = note.category;
    const more = document.createElement('span'); more.className = 'card-more'; more.textContent = '···';
    top.append(tag, more);
    const heading = document.createElement('h3'); heading.textContent = note.title;
    const body = document.createElement('p'); body.textContent = note.content;
    const date = document.createElement('div'); date.className = 'card-date'; date.textContent = '◷  ' + note.date.replaceAll('-', ' / ');
    card.append(top, heading, body, date);
    card.addEventListener('click', () => openNote(note));
    grid.append(card);
  });
}

function openNote(note) {
  editingId = note ? note.id : null;
  document.querySelector('#dialog-title').textContent = note ? '編輯筆記' : '新增筆記';
  document.querySelector('#delete-note').hidden = !note;
  titleInput.value = note ? note.title : '';
  categoryInput.value = note ? note.category : (currentFilter === '全部' ? '研究筆記' : currentFilter);
  contentInput.value = note ? note.content : '';
  dialog.showModal();
  titleInput.focus();
}

document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  currentFilter = button.dataset.filter;
  render();
}));
document.querySelector('#new-note').addEventListener('click', () => openNote());
document.querySelector('#new-note-secondary').addEventListener('click', () => openNote());
document.querySelector('#close-dialog').addEventListener('click', () => dialog.close());
document.querySelector('#cancel-dialog').addEventListener('click', () => dialog.close());
document.querySelector('#focus-search').addEventListener('click', () => { search.focus(); search.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
search.addEventListener('input', render);
form.addEventListener('submit', event => {
  event.preventDefault();
  const title = titleInput.value.trim();
  const content = contentInput.value.trim();
  if (!title || !content) return;
  const now = new Date();
  const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
  const note = { id: editingId || String(Date.now()), title, category: categoryInput.value, content, date };
  if (editingId) notes = notes.map(item => item.id === editingId ? note : item);
  else notes.unshift(note);
  saveNotes(); dialog.close(); render();
});
document.querySelector('#delete-note').addEventListener('click', () => {
  if (!confirm('確定要刪除這則筆記嗎？')) return;
  notes = notes.filter(note => note.id !== editingId);
  saveNotes(); dialog.close(); render();
});
render();
