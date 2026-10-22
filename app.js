import { fetch as voidFetch, FetchError } from 'void/client';

const $ = (selector) => document.querySelector(selector);
const storageKey = 'lifequest.profile.v2';
const saved = (() => {
  try {
    const direct = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (direct?.id && direct?.secret) return direct;
    // Preserve profiles created by earlier versions of the app.
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      try {
        const value = JSON.parse(localStorage.getItem(key) || 'null');
        const candidate = value?.profile || value?.player || value;
        if (candidate?.id && (candidate?.secret || candidate?.token)) {
          return { id: candidate.id, secret: candidate.secret || candidate.token, ...candidate };
        }
      } catch { /* ignore unrelated local storage entries */ }
    }
  } catch { /* storage can be unavailable in private browsing */ }
  return null;
})();
const profile = saved || { id: crypto.randomUUID().replaceAll('-', ''), secret: crypto.randomUUID() + crypto.randomUUID(), name: '冒険者', profession: '', industry: '' };
localStorage.setItem(storageKey, JSON.stringify(profile));
let friends = [];
let partyQuests = [];

async function api(path, method = 'GET', data) {
  try { return await voidFetch(path, { method, body: data }); }
  catch (error) { if (error instanceof FetchError) throw new Error(error.data?.error || 'サーバーに接続できません'); throw error; }
}
function say(message) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 2600);
}
function setActiveNav(hash) {
  const isAdventure = hash === '#adventure';
  document.body.classList.toggle('show-adventure-screen', isAdventure);
  document.querySelectorAll('.nav-item').forEach((item) => {
    const itemHash = item.getAttribute('href');
    item.classList.toggle('active', itemHash === hash);
  });
  const target = document.querySelector(hash);
  if (target && !isAdventure) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
document.querySelectorAll('.nav-item').forEach((item) => item.addEventListener('click', (event) => {
  event.preventDefault();
  const hash = item.getAttribute('href');
  history.replaceState(null, '', hash);
  setActiveNav(hash);
}));
window.addEventListener('scroll', () => {
  if (document.body.classList.contains('show-adventure-screen')) return;
  const sections = [['#loot', $('#loot')], ['#hero', $('#hero')], ['#adventure', $('#social')], ['#quests', $('#quests')]];
  const visible = sections.find(([, element]) => element && element.getBoundingClientRect().top < innerHeight * .45 && element.getBoundingClientRect().bottom > 100);
  if (visible) document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.hash === visible[0]));
}, { passive: true });

function renderFriends() {
  const select = $('#party-friend');
  if (!select) return;
  const selected = select.value;
  select.replaceChildren(new Option(friends.length ? '一緒に行くフレンドを選択' : 'フレンドがいません', ''));
  for (const friend of friends) select.add(new Option(`${friend.name} · Lv.${friend.level || 1}`, friend.id));
  if (friends.some((friend) => friend.id === selected)) select.value = selected;
  const list = $('#friend-list');
  if (list) {
    list.replaceChildren();
    if (!friends.length) {
      const empty = document.createElement('span'); empty.className = 'leader-empty'; empty.textContent = 'フレンドがまだいません。招待コードを共有するか、受け取ったコードを入力してください。'; list.append(empty);
    } else friends.forEach((friend) => {
      const card = document.createElement('button'); card.type = 'button'; card.className = 'leader-row';
      card.innerHTML = `<span class="leader-rank">⚔</span><span class="leader-name"></span><span class="leader-score">Lv.${Number(friend.level) || 1}</span>`;
      card.querySelector('.leader-name').textContent = `${friend.name} · ${friend.profession || '冒険者'}`;
      card.addEventListener('click', () => { select.value = friend.id; select.dispatchEvent(new Event('change', { bubbles: true })); $('#party-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
      list.append(card);
    });
  }
}
function renderPartyQuests() {
  const list = $('#party-quests'); if (!list) return;
  list.replaceChildren();
  if (!partyQuests.length) { const empty = document.createElement('div'); empty.className = 'leader-empty'; empty.textContent = 'フレンドを選んで狩猟クエストを受注しよう。'; list.append(empty); return; }
  for (const quest of partyQuests) {
    const row = document.createElement('div'); row.className = 'leader-row';
    const name = document.createElement('span'); name.className = 'leader-name'; name.textContent = `${quest.monsterName || quest.name} · ${quest.status === 'active' ? '冒険中' : '完了'}`;
    const action = document.createElement('button'); action.className = 'invite-btn'; action.type = 'button'; action.textContent = quest.status === 'active' ? '冒険を再開' : '討伐済み'; action.disabled = quest.status !== 'active';
    action.addEventListener('click', () => enterHunt(quest)); row.append(name, action); list.append(row);
  }
}
function enterHunt(quest) {
  const panel = $('#battle-panel');
  panel.hidden = false;
  panel.classList.add('is-fullscreen');
  document.body.classList.add('in-hunt');
  $('#battle-canvas')?.focus({ preventScroll: true });
  $('#battle-title').textContent = `${quest.monsterName || quest.name}を討伐しよう`;
  $('#battle-monster-name').textContent = quest.monsterName || 'モンスター';
  $('#battle-hp-text').textContent = `${quest.hp} / ${quest.maxHp}`;
  $('#battle-hp-fill').style.width = `${Math.max(0, quest.hp / quest.maxHp * 100)}%`;
  $('#battle-party-label').textContent = (quest.players || []).map((player) => player.name).join(' ＋ ');
  window.battle3D?.setMonster(quest.monsterType, quest.status === 'completed');
  window.battle3D?.setParty(quest.players || [], profile.id);
}

async function refreshSocial() {
  const badge = $('#network-status');
  try {
    await api('/api/register', 'POST', { ...profile, id: profile.id, name: profile.name || '冒険者' });
    const data = await api(`/api/social?id=${encodeURIComponent(profile.id)}`);
    friends = Array.isArray(data.friends) ? data.friends : [];
    renderFriends();
    const result = await api(`/api/party-quests?id=${encodeURIComponent(profile.id)}`).catch(() => ({ quests: [] }));
    partyQuests = result.quests || [];
    renderPartyQuests();
    if (badge) { badge.textContent = 'ONLINE'; badge.classList.remove('offline'); }
    window.battle3D?.setParty([{ ...profile, level: 1 }, ...friends], profile.id);
  } catch (error) {
    friends = [];
    renderFriends();
    if (badge) { badge.textContent = 'OFFLINE'; badge.classList.add('offline'); }
    console.error('Social data could not be loaded:', error);
    say(error.message);
  }
}

$('#profile-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  profile.name = $('#profile-name').value.trim();
  profile.profession = $('#profession').value;
  profile.industry = $('#industry').value;
  localStorage.setItem(storageKey, JSON.stringify(profile));
  try { await api('/api/register', 'POST', profile); say('プロフィールを保存しました'); await refreshSocial(); }
  catch (error) { say(error.message); }
});
if ($('#profile-name')) $('#profile-name').value = profile.name || '';
if ($('#profession') && profile.profession) $('#profession').value = profile.profession;
if ($('#industry') && profile.industry) $('#industry').value = profile.industry;

$('#party-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const friendId = $('#party-friend').value;
  if (!friendId) { say('一緒に行くフレンドを選択してください'); return; }
  try {
    const result = await api('/api/party-quests', 'POST', { id: profile.id, secret: profile.secret, friendId, monster: $('#party-monster').value });
    partyQuests = [result.quest, ...partyQuests]; renderPartyQuests(); enterHunt(result.quest); say('狩猟クエストを受注しました');
  } catch (error) { say(error.message); }
});
$('#create-invite')?.addEventListener('click', async () => {
  try {
    const result = await api('/api/invites', 'POST', { id: profile.id, secret: profile.secret });
    const note = $('#social-note'); note.textContent = `招待コード ${result.code} · 30分間有効`; note.classList.add('invite-code-box');
    await navigator.clipboard?.writeText(result.code).catch(() => {}); say(`招待コード ${result.code} を発行しました`);
  } catch (error) { say(error.message); }
});
$('#join-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/api/friends/join', 'POST', { id: profile.id, secret: profile.secret, code: $('#invite-code').value });
    $('#invite-code').value = ''; $('#join-hint').textContent = 'フレンドになりました！'; await refreshSocial();
  } catch (error) { $('#join-hint').textContent = error.message; }
});

if (location.hash) setActiveNav(location.hash);
refreshSocial();

function leaveHunt() {
  $('#battle-panel')?.classList.remove('is-fullscreen');
  document.body.classList.remove('in-hunt');
}
$('#battle-exit')?.addEventListener('click', leaveHunt);
$('#adventure-exit')?.addEventListener('click', () => { history.replaceState(null, '', '#quests'); setActiveNav('#quests'); });
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if ($('#battle-panel')?.classList.contains('is-fullscreen')) leaveHunt();
  else if (document.body.classList.contains('show-adventure-screen')) { history.replaceState(null, '', '#quests'); setActiveNav('#quests'); }
});
