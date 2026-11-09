const byId = (id) => document.getElementById(id);
const create = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const pageSize = 20;
let limit = pageSize;
const taipeiDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' });

function publicationDay(value) {
  return value.length === 10 ? value : taipeiDate.format(new Date(value));
}

function sourceLinks(sources) {
  const group = create('p', '來源　', 'sources');
  for (const [index, source] of sources.entries()) {
    const url = new URL(source.url);
    if (url.protocol !== 'https:') continue;
    if (index) group.append(' · ');
    const link = create('a', source.name);
    link.href = url.href;
    group.append(link);
  }
  return group;
}

function internalLinks(label, ids, entries, prefix) {
  const group = create('p', label + '　', 'sources');
  ids.forEach((id, index) => {
    if (index) group.append(' · ');
    const link = create('a', entries.get(id).title);
    link.href = '#' + prefix + id;
    group.append(link);
  });
  return group;
}

function paragraphs(container, text) {
  for (const part of text.split(/\n\s*\n/)) container.append(create('p', part));
}

function init(data) {
  const names = new Map();
  const parents = new Map();
  const newsById = new Map(data.news.map(item => [item.id, item]));
  const knowledgeById = new Map(data.knowledge.map(item => [item.id, item]));
  for (const group of data.industries) {
    names.set(group.id, group.name);
    parents.set(group.id, group.id);
    byId('industry').add(new Option(group.name, group.id));
    byId('library-industry').add(new Option(group.name, group.id));
    for (const child of group.children) {
      names.set(child.id, child.name);
      parents.set(child.id, group.id);
    }
  }
  const sorted = [...data.news].sort((a, b) => {
    const timestamp = value => Date.parse(value.length === 10 ? value + 'T00:00:00+08:00' : value);
    return timestamp(b.publishedAt) - timestamp(a.publishedAt) || a.id.localeCompare(b.id);
  });
  if (data.cutoff) byId('edition').textContent = '搜尋截至 ' + publicationDay(data.cutoff) + ' · 臺灣時間';

  function syncSubcategories() {
    const group = data.industries.find(entry => entry.id === byId('industry').value);
    byId('subindustry').replaceChildren(new Option('全部細分類', ''));
    byId('subgroup').hidden = !group?.children.length;
    for (const child of group?.children ?? []) byId('subindustry').add(new Option(child.name, child.id));
  }

  function newsCard(item) {
    const card = create('article', undefined, 'card');
    card.id = 'news-' + item.id;
    const meta = create('div', undefined, 'meta');
    const date = create('time', publicationDay(item.publishedAt));
    date.dateTime = item.publishedAt;
    meta.append(date, create('span', names.get(item.category), 'badge'),
      create('span', item.importance === 'important' ? '重要' : '一般', item.importance === 'important' ? 'badge important' : 'badge'));
    card.append(meta, create('h3', item.title), create('p', item.summary), sourceLinks(item.sources));
    if (item.detail) {
      const details = create('details');
      details.append(create('summary', '展開閱讀'));
      paragraphs(details, item.detail);
      card.append(details);
    }
    if (item.previousIds?.length) card.append(internalLinks('先前進展', item.previousIds, newsById, 'news-'));
    if (item.knowledgeIds?.length) card.append(internalLinks('認識相關概念', item.knowledgeIds, knowledgeById, 'kb-'));
    return card;
  }

  function renderNews() {
    const main = byId('industry').value;
    const sub = byId('subindustry').value;
    const from = byId('from').value;
    const to = byId('to').value;
    const query = byId('query').value.trim().toLocaleLowerCase('zh-TW');
    const invalidRange = from && to && from > to;
    const matches = invalidRange ? [] : sorted.filter(item => {
      const day = publicationDay(item.publishedAt);
      const categories = [item.category, ...(item.relatedCategories ?? [])];
      const industryMatch = sub ? categories.includes(sub) : !main || categories.some(id => parents.get(id) === main);
      return industryMatch && (!from || day >= from) && (!to || day <= to)
        && (item.title + ' ' + item.summary).toLocaleLowerCase('zh-TW').includes(query);
    });
    byId('news-status').textContent = invalidRange ? '起始日期須早於或等於結束日期。' : '共 ' + matches.length + ' 則新聞';
    byId('timeline').replaceChildren(...matches.slice(0, limit).map(newsCard));
    if (!matches.length && !invalidRange) byId('timeline').append(create('p',
      data.batchId ? '這個範圍沒有符合條件的新聞。' : '首批新聞尚未發布。完成首次新聞更新後，查證過的報導會顯示在這裡。', 'empty'));
    byId('more').hidden = matches.length <= limit;
  }

  function renderKnowledge() {
    const selected = byId('library-industry').value;
    const articles = data.knowledge.filter(item => parents.get(item.category) === selected);
    byId('library-status').textContent = selected ? '共 ' + articles.length + ' 篇文章' : '選擇一個產業，查看相關的名詞、業務與制度。';
    byId('articles').replaceChildren(...articles.map(item => {
      const card = create('article', undefined, 'card');
      card.id = 'kb-' + item.id;
      card.append(create('p', (item.depth === 'quick' ? '速查條目' : '入門解說') + ' · 修訂於 ' + item.revisedOn, 'meta'),
        create('h3', item.title));
      paragraphs(card, item.body);
      card.append(sourceLinks(item.sources));
      if (item.relatedIds?.length) card.append(internalLinks('相關條目', item.relatedIds, knowledgeById, 'kb-'));
      return card;
    }));
    if (selected && !articles.length) byId('articles').append(create('p', '這個產業的知識條目尚待建立。', 'empty'));
  }

  const toggle = byId('toggle');
  toggle.addEventListener('click', () => {
    const open = toggle.closest('aside').classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  function applyFilters() {
    limit = pageSize;
    renderNews();
  }
  byId('query').addEventListener('input', applyFilters);
  byId('filters').addEventListener('change', event => {
    if (event.target === byId('industry')) syncSubcategories();
    applyFilters();
  });
  byId('filters').addEventListener('submit', event => event.preventDefault());
  byId('filters').addEventListener('reset', () => requestAnimationFrame(() => {
    syncSubcategories();
    limit = pageSize;
    renderNews();
  }));
  byId('more').addEventListener('click', () => {
    limit += pageSize;
    renderNews();
  });
  byId('library-industry').addEventListener('change', renderKnowledge);

  function followEntryLink() {
    const hash = location.hash;
    if (hash.startsWith('#kb-')) {
      const article = knowledgeById.get(hash.slice(4));
      if (!article) return;
      byId('library-industry').value = parents.get(article.category);
      renderKnowledge();
    } else if (hash.startsWith('#news-')) {
      const item = newsById.get(hash.slice(6));
      if (!item) return;
      if (!byId(hash.slice(1))) {
        for (const id of ['query', 'industry', 'from', 'to']) byId(id).value = '';
        syncSubcategories();
        limit = Math.max(pageSize, sorted.indexOf(item) + 1);
        renderNews();
      }
    } else return;
    byId(hash.slice(1))?.scrollIntoView();
  }
  window.addEventListener('hashchange', followEntryLink);
  renderNews();
  renderKnowledge();
  followEntryLink();
}

fetch('./data/platform.json', { cache: 'no-cache' })
  .then(response => {
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  })
  .then(init)
  .catch(error => {
    byId('news-status').textContent = '資料載入失敗，請重新整理頁面。';
    byId('library-status').textContent = '知識庫資料載入失敗。';
    console.error(error);
  });
