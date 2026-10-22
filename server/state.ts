import { db, eq } from 'void/db';
import { gameState } from '@schema';

export type Player = {
  id: string;
  secret: string;
  name: string;
  profession: string;
  industry: string;
  level: number;
  xp: number;
  updatedAt: string;
  [key: string]: unknown;
};

export type Quest = {
  id: string;
  members: string[];
  createdAt: string;
  status: string;
  [key: string]: any;
};

export type AppState = {
  players: Record<string, Player>;
  friends: Record<string, string[]>;
  invites: Record<string, { owner: string; expires: number }>;
  partyQuests: Record<string, Quest>;
};

const emptyState = (): AppState => ({ players: {}, friends: {}, invites: {}, partyQuests: {} });

export async function loadState(): Promise<AppState> {
  const [row] = await db.select().from(gameState).where(eq(gameState.id, 1));
  if (!row) return emptyState();
  try {
    return { ...emptyState(), ...JSON.parse(row.payload) } as AppState;
  } catch {
    return emptyState();
  }
}

export async function saveState(state: AppState): Promise<void> {
  const payload = JSON.stringify(state);
  await db.insert(gameState).values({ id: 1, payload }).onConflictDoUpdate({
    target: gameState.id,
    set: { payload },
  });
}

export function cleanName(value: unknown): string {
  return String(value || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 20) || '冒険者';
}

export function publicPlayer(player: Player) {
  return {
    id: player.id,
    name: player.name,
    profession: player.profession || '未設定',
    industry: player.industry || '未設定',
    level: player.level || 1,
    xp: player.xp || 0,
    updatedAt: player.updatedAt || null,
  };
}

export function friendsFor(state: AppState, id: string) {
  return [...new Set(state.friends[id] || [])]
    .map((key) => state.players[key])
    .filter((player): player is Player => Boolean(player))
    .map(publicPlayer)
    .sort((a, b) => b.xp - a.xp);
}

export function authorized(state: AppState, id: string, secret: string): boolean {
  return Boolean(state.players[id] && state.players[id].secret === secret);
}

const error = (c: any, status: 400 | 401 | 403 | 404 | 409, message: string) => c.json({ error: message }, status);
const playersForQuest = (state: Awaited<ReturnType<typeof loadState>>, quest: any) =>
  quest.members.map((id: string) => state.players[id]).filter(Boolean).map(publicPlayer);

export async function handleGet(c: any) {
  const state = await loadState();
  const path = c.req.path;
  const id = c.req.query('id') || '';
  if (path === '/api/social') {
    const player = state.players[id];
    if (!player) return error(c, 404, 'profile not found');
    return c.json({ me: publicPlayer(player), friends: friendsFor(state, id) });
  }
  if (path === '/api/party-quests') {
    if (!state.players[id]) return error(c, 404, 'profile not found');
    const quests = Object.values(state.partyQuests)
      .filter((quest) => quest.members.includes(id))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((quest) => ({ ...quest, players: playersForQuest(state, quest) }));
    return c.json({ quests });
  }
  return error(c, 404, 'not found');
}

export async function handlePut(c: any) {
  const match = c.req.path.match(/^\/api\/profile\/([^/]+)$/);
  if (!match) return error(c, 404, 'not found');
  const id = decodeURIComponent(match[1]);
  const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return error(c, 400, 'invalid json');
  const state = await loadState();
  if (!authorized(state, id, String(body.secret || ''))) return error(c, 401, 'unauthorized');
  const player = state.players[id];
  player.name = cleanName(body.name);
  player.profession = String(body.profession || '未設定').slice(0, 30);
  player.industry = String(body.industry || '未設定').slice(0, 30);
  player.level = Math.max(1, Math.min(999, Number(body.level) || 1));
  player.xp = Math.max(0, Math.min(1_000_000, Number(body.xp) || 0));
  player.updatedAt = new Date().toISOString();
  await saveState(state);
  return c.json({ player: publicPlayer(player) });
}

export async function handlePost(c: any) {
  const path = c.req.path;
  const body = await c.req.json().catch(() => null) as Record<string, any> | null;
  if (!body) return error(c, 400, 'invalid json');
  const state = await loadState();

  if (path === '/api/register') {
    const id = String(body.id || ''), secret = String(body.secret || '');
    if (!/^[\w-]{20,80}$/.test(id) || secret.length < 20) return error(c, 400, 'invalid profile');
    if (state.players[id] && state.players[id].secret !== secret) return error(c, 409, 'profile exists');
    if (state.players[id]) {
      state.players[id].name = cleanName(body.name);
      state.players[id].profession = String(body.profession || state.players[id].profession || '未設定').slice(0, 30);
      state.players[id].industry = String(body.industry || state.players[id].industry || '未設定').slice(0, 30);
    } else {
      state.players[id] = { id, secret, name: cleanName(body.name), profession: String(body.profession || '未設定').slice(0, 30), industry: String(body.industry || '未設定').slice(0, 30), level: 1, xp: 0, updatedAt: new Date().toISOString() };
    }
    state.friends[id] ??= [];
    await saveState(state);
    return c.json({ player: publicPlayer(state.players[id]) });
  }

  if (path === '/api/invites') {
    const id = String(body.id || '');
    if (!authorized(state, id, String(body.secret || ''))) return error(c, 401, 'unauthorized');
    for (const [code, invite] of Object.entries(state.invites)) if (invite.expires < Date.now()) delete state.invites[code];
    let code = '';
    do {
      const bytes = crypto.getRandomValues(new Uint8Array(3));
      code = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase();
    } while (state.invites[code]);
    state.invites[code] = { owner: id, expires: Date.now() + 30 * 60 * 1000 };
    await saveState(state);
    return c.json({ code, expiresIn: 1800 });
  }

  if (path === '/api/friends/join') {
    const id = String(body.id || ''), code = String(body.code || '').trim().toUpperCase(), invite = state.invites[code];
    if (!authorized(state, id, String(body.secret || ''))) return error(c, 401, 'unauthorized');
    if (!invite || invite.expires < Date.now()) return error(c, 404, '招待コードの期限切れ、またはコードが違います');
    if (invite.owner === id) return error(c, 400, '自分の招待コードは使えません');
    state.friends[id] ??= [];
    state.friends[invite.owner] ??= [];
    if (!state.friends[id].includes(invite.owner)) state.friends[id].push(invite.owner);
    if (!state.friends[invite.owner].includes(id)) state.friends[invite.owner].push(id);
    delete state.invites[code];
    await saveState(state);
    return c.json({ friends: friendsFor(state, id) });
  }

  if (path === '/api/party-quests') {
    const id = String(body.id || ''), friendId = String(body.friendId || '');
    if (!authorized(state, id, String(body.secret || ''))) return error(c, 401, 'unauthorized');
    if (!(state.friends[id] || []).includes(friendId)) return error(c, 403, '先にフレンド登録してください');
    const monsters: Record<string, { name: string; hp: number; xp: number }> = {
      slime: { name: 'スライム', hp: 90, xp: 40 }, goblin: { name: 'ゴブリン', hp: 150, xp: 65 },
      golem: { name: 'いしの巨人', hp: 240, xp: 100 }, greatbeast: { name: '森角獣', hp: 360, xp: 150 },
    };
    const monster = monsters[body.monster] || monsters.slime, idQuest = crypto.randomUUID(), members = [id, friendId];
    const quest = { id: idQuest, name: `${monster.name}を狩猟しよう`, monsterType: monsters[body.monster] ? body.monster : 'slime', monsterName: monster.name, hp: monster.hp, maxHp: monster.hp, partyHp: Object.fromEntries(members.map((member) => [member, 100])), partyMaxHp: 100, partyMp: Object.fromEntries(members.map((member) => [member, 20])), potions: Object.fromEntries(members.map((member) => [member, 1])), xp: monster.xp, createdBy: id, members, completedBy: [], status: 'active', createdAt: new Date().toISOString() };
    state.partyQuests[idQuest] = quest;
    await saveState(state);
    return c.json({ quest: { ...quest, players: playersForQuest(state, quest) } }, 201);
  }

  const match = path.match(/^\/api\/party-quests\/([\w-]+)\/(complete|travel|attack|retry)$/);
  if (!match) return error(c, 404, 'not found');
  const [, questId, actionPath] = match, id = String(body.id || ''), quest = state.partyQuests[questId];
  if (!authorized(state, id, String(body.secret || ''))) return error(c, 401, 'unauthorized');
  if (!quest || !quest.members.includes(id)) return error(c, 404, '参加中のクエストがありません');

  if (actionPath === 'complete') {
    if (quest.status === 'active' && !quest.completedBy.includes(id)) quest.completedBy.push(id);
    if (quest.completedBy.length === quest.members.length) quest.status = 'complete';
    await saveState(state);
    return c.json({ quest: { ...quest, players: playersForQuest(state, quest) } });
  }
  if (actionPath === 'travel') {
    if (quest.status !== 'active') return error(c, 409, 'この冒険は終了しています');
    const direction = ['up', 'down', 'left', 'right'].includes(body.direction) ? body.direction : 'up';
    quest.distance = Number(quest.distance || 0);
    quest.encounterAt = Number(quest.encounterAt || 3);
    quest.positionX = Math.max(-1.25, Math.min(1.25, Number(quest.positionX || 0) + (direction === 'left' ? .45 : direction === 'right' ? -.45 : 0)));
    quest.positionZ = Math.max(-1.2, Math.min(1.2, Number(quest.positionZ || 0) + (direction === 'up' ? -.32 : direction === 'down' ? .32 : 0)));
    if (!quest.encountered && direction === 'up') quest.distance = Math.min(quest.encounterAt, quest.distance + 1);
    if (!quest.encountered && direction === 'down') quest.distance = Math.max(0, quest.distance - 1);
    quest.lastTravel = { playerName: state.players[id].name, distance: quest.distance, direction, at: new Date().toISOString() };
    if (quest.distance >= quest.encounterAt) quest.encountered = true;
    await saveState(state);
    return c.json({ quest: { ...quest, players: playersForQuest(state, quest) } });
  }
  if (actionPath === 'attack') {
    if (quest.status !== 'active') return error(c, 409, 'この戦いは終了しています');
    const player = state.players[id], action = ['attack', 'spell', 'item', 'guard'].includes(body.action) ? body.action : 'attack';
    quest.partyHp ??= Object.fromEntries(quest.members.map((member: string) => [member, 100]));
    quest.partyMp ??= Object.fromEntries(quest.members.map((member: string) => [member, 20]));
    quest.potions ??= Object.fromEntries(quest.members.map((member: string) => [member, 1]));
    for (const member of quest.members) { quest.partyHp[member] ??= 100; quest.partyMp[member] ??= 20; quest.potions[member] ??= 1; }
    let damage = 0, command = 'こうげき';
    if (action === 'spell') {
      if (quest.partyMp[id] < 8) return error(c, 400, 'MPが足りない！');
      quest.partyMp[id] -= 8; damage = 35 + Math.floor(Math.random() * 16) + Math.min(12, Math.floor((player.level || 1) / 2)); command = 'ほのお';
    } else if (action === 'attack') {
      damage = 18 + Math.floor(Math.random() * 12) + Math.min(12, Math.floor((player.level || 1) / 2)); command = 'こうげき';
    } else if (action === 'item') {
      if (quest.potions[id] < 1) return error(c, 400, 'やくそうがありません');
      quest.potions[id]--; quest.partyHp[id] = Math.min(quest.partyMaxHp || 100, quest.partyHp[id] + 45); command = 'やくそう';
    } else command = 'ぼうぎょ';
    quest.hp = Math.max(0, (Number(quest.hp) || 90) - damage);
    quest.lastAction = { playerName: player.name, command, damage, at: new Date().toISOString() };
    if (quest.hp === 0) quest.status = 'complete';
    else {
      const ranges: Record<string, [number, number]> = { slime: [8, 14], goblin: [12, 19], golem: [17, 25], greatbeast: [20, 30] };
      const [low, high] = ranges[quest.monsterType] || ranges.slime;
      let hit = low + Math.floor(Math.random() * (high - low + 1));
      if (action === 'guard') hit = Math.ceil(hit * .4);
      quest.partyHp[id] = Math.max(0, quest.partyHp[id] - hit);
      quest.lastEnemyAttack = { playerId: id, playerName: player.name, damage: hit, at: new Date().toISOString() };
      if (quest.members.every((member: string) => quest.partyHp[member] === 0)) quest.status = 'defeated';
    }
    await saveState(state);
    return c.json({ quest: { ...quest, players: playersForQuest(state, quest) } });
  }
  if (quest.status !== 'defeated') return error(c, 409, '再挑戦できません');
  quest.status = 'active'; quest.hp = quest.maxHp;
  quest.partyHp = Object.fromEntries(quest.members.map((member: string) => [member, 70]));
  quest.partyMp = Object.fromEntries(quest.members.map((member: string) => [member, 20]));
  quest.potions = Object.fromEntries(quest.members.map((member: string) => [member, 1]));
  delete quest.lastAction; delete quest.lastEnemyAttack;
  await saveState(state);
  return c.json({ quest: { ...quest, players: playersForQuest(state, quest) } });
}
