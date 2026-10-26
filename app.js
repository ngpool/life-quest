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
let activeQuest = null;
let combatActionBusy = false;

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
function renderCombatState(quest) {
  if (!quest) return;
  $('#battle-hp-text').textContent = `${Math.max(0, Number(quest.hp) || 0)} / ${Number(quest.maxHp) || 0}`;
  const monsterFill = $('#battle-hp-fill');
  if (monsterFill) {
    monsterFill.style.width = `${Math.max(0, Math.min(100, (Number(quest.hp) || 0) / Math.max(1, Number(quest.maxHp) || 1) * 100))}%`;
    monsterFill.classList.toggle('low', Number(quest.hp) / Math.max(1, Number(quest.maxHp) || 1) < .25);
  }
  const stats = $('#party-stat-bars');
  const localHp = Math.max(0, Number(quest.partyHp?.[profile.id] ?? quest.partyMaxHp ?? 100));
  if (stats) {
    stats.replaceChildren();
    for (const player of quest.players || []) {
      const maxHp = Number(quest.partyMaxHp) || 100;
      const hp = Math.max(0, Number(quest.partyHp?.[player.id] ?? maxHp));
      const card = document.createElement('div'); card.className = 'party-vital';
      if (hp === 0) card.classList.add('is-down');
      const name = document.createElement('b'); name.textContent = player.name || 'Hunter';
      const value = document.createElement('span'); value.textContent = `HP ${hp} / ${maxHp}`;
      const track = document.createElement('i'); const fill = document.createElement('em');
      fill.style.width = `${Math.max(0, Math.min(100, hp / maxHp * 100))}%`; track.append(fill);
      card.append(name, value, track); stats.append(card);
    }
  }
  const retry = $('#retry-battle');
  if (retry) retry.hidden = quest.status !== 'defeated';
  const gameOver = localHp <= 0 || quest.status === 'defeated';
  const gameOverScreen = $('#game-over-screen');
  if (gameOverScreen) gameOverScreen.hidden = !gameOver;
  window.battle3D?.setGameOver(gameOver);
  window.battle3D?.setPartyVitals(quest.partyHp || {});
  document.querySelectorAll('.battle-commands [data-command]').forEach((button) => {
    const command = button.dataset.command;
    button.disabled = command === 'retry' ? quest.status !== 'defeated'
      : quest.status !== 'active' || localHp <= 0;
  });
  const status = $('#battle-status'), log = $('#battle-log');
  if (quest.status === 'defeated') status.textContent = 'Party defeated · Retry to recover';
  else if (quest.status === 'complete' || quest.status === 'completed') status.textContent = 'Hunt complete';
  else if (localHp <= 0) status.textContent = 'GAME OVER';
  else if (quest.lastEnemyAttack) {
    const hitPlayer = quest.players?.find((player) => player.id === quest.lastEnemyAttack.playerId);
    status.textContent = `Monster hit ${hitPlayer?.name || 'a hunter'} for ${quest.lastEnemyAttack.damage}`;
  }
  if (log && quest.lastAction) log.textContent = `${quest.lastAction.playerName || 'Hunter'} · ${quest.lastAction.command || 'action'} · ${quest.lastAction.damage || 0} damage`;
}
async function performCombatAction(action, combatPayload = {}) {
  if (!activeQuest || combatActionBusy) return;
  combatActionBusy = true;
  try {
    const endpoint = action === 'retry' ? 'retry' : action === 'enemy-attack' ? 'enemy-attack' : 'attack';
    const result = await api(`/api/party-quests/${encodeURIComponent(activeQuest.id)}/${endpoint}`, 'POST', {
      id: profile.id, secret: profile.secret, action, ...combatPayload,
    });
    if (result.ignored) return;
    activeQuest = result.quest;
    renderCombatState(activeQuest);
    if (action === 'retry') window.battle3D?.setMonster(activeQuest.monsterType, false);
    const index = partyQuests.findIndex((quest) => quest.id === activeQuest.id);
    if (index >= 0) partyQuests[index] = activeQuest;
    if (activeQuest.status === 'defeated' || activeQuest.status === 'complete') {
      window.battle3D?.setMonster(activeQuest.monsterType, true);
    }
  } catch (error) {
    const status = $('#battle-status'); if (status) status.textContent = error.message;
  } finally { combatActionBusy = false; }
}
function enterHunt(quest) {
  activeQuest = quest;
  const panel = $('#battle-panel');
  panel.hidden = false;
  panel.classList.add('is-fullscreen');
  document.body.classList.add('in-hunt');
  $('#battle-canvas')?.focus({ preventScroll: true });
  $('#battle-title').textContent = `${quest.monsterName || quest.name}を討伐しよう`;
  $('#battle-monster-name').textContent = quest.monsterName || 'モンスター';
  renderCombatState(quest);
  $('#battle-party-label').textContent = (quest.players || []).map((player) => player.name).join(' ＋ ');
  window.battle3D?.setMonster(quest.monsterType, quest.status === 'completed' || quest.status === 'complete' || quest.status === 'defeated');
  window.battle3D?.setParty(quest.players || [], profile.id);
}
document.querySelectorAll('.battle-commands [data-command]').forEach((button) => {
  button.addEventListener('click', () => performCombatAction(button.dataset.command));
});
window.addEventListener('lifequest:enemy-strike', (event) => {
  if (activeQuest && Number(activeQuest.partyHp?.[profile.id] ?? activeQuest.partyMaxHp ?? 100) > 0) {
    performCombatAction('enemy-attack', { targets: event.detail?.targets || [] });
  }
});

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
$('#game-over-retry')?.addEventListener('click', () => performCombatAction('retry'));
$('#game-over-exit')?.addEventListener('click', leaveHunt);
$('#adventure-exit')?.addEventListener('click', () => { history.replaceState(null, '', '#quests'); setActiveNav('#quests'); });
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if ($('#battle-panel')?.classList.contains('is-fullscreen')) leaveHunt();
  else if (document.body.classList.contains('show-adventure-screen')) { history.replaceState(null, '', '#quests'); setActiveNav('#quests'); }
});
