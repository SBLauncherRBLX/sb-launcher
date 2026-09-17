import { LibraryGameSchema, VisualThemeSchema, ROOM_CHAT_LIMIT, ROOM_MESSAGE_LENGTH, type RoomMessage, type FriendRoom, type WorkshopItem } from "../../../packages/contracts/src/index";

type Identity = { id: string; name: string };
type StoredTheme = Omit<WorkshopItem, "likes" | "liked"> & { likedBy: string[]; parts?: number };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const fail = (message: string, status = 400) => { throw Object.assign(new Error(message), { status }); };
function text(v: unknown, max: number, fallback = ""): string { return typeof v === "string" ? v.trim().slice(0, max) : fallback; }
function code(v: unknown): string { const s = text(v, 40).toUpperCase(); if (!/^[A-F0-9]{12}$/.test(s)) fail("Use a valid 12-character code."); return s; }
function portableTheme(value: unknown) {
  const theme = VisualThemeSchema.parse(value);
  if (theme.wallpaperId?.startsWith("custom-")) fail("Upload your custom wallpaper to include it in the shared theme.");
  for (const v of [theme.backgroundImage, theme.wallpaperId]) {
    if (!v || !v.includes(":")) continue;
    if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) continue;
    let url: URL; try { url = new URL(v); } catch { return fail("Wallpaper is not portable."); }
    if (url.protocol !== "https:" || url.hostname.endsWith(".sblauncher") || url.hostname === "localhost") fail("Choose a built-in wallpaper, upload an image or use a public HTTPS wallpaper before publishing.");
  }
  if (JSON.stringify(theme).length > 1_500_000) fail("Theme is too large (1.5 MB maximum).");
  return theme;
}

/** A single serialized community catalog. Room and catalog updates are atomic. */
export class CommunityHub {
  constructor(private state: DurableObjectState) {}
  async fetch(request: Request): Promise<Response> {
    const body = await request.json() as { identity: Identity; action: string; input: Record<string, unknown> };
    return this.state.blockConcurrencyWhile(async () => {
      try { return json(await this.action(body.identity, body.action, body.input)); }
      catch (error) { const e = error as Error & { status?: number }; return json({ error: e.message || "Invalid request." }, e.status ?? 400); }
    });
  }
  async alarm() {
    const rooms = await this.state.storage.list<FriendRoom>({ prefix: "room:" });
    const expired = [...rooms].filter(([,r]) => Date.now() - r.updatedAt > 7 * 86400000).map(([key]) => key);
    if (expired.length) await this.state.storage.delete([...expired, ...expired.map(key => key.replace("room:", "chat:"))]);
    if (rooms.size > expired.length) await this.state.storage.setAlarm(Date.now() + 86400000);
  }
  private async action(user: Identity, action: string, input: Record<string, unknown>): Promise<unknown> {
    if (!/^\d+$/.test(user.id)) fail("Sign in required.", 401);
    const storage = this.state.storage;
    const now = Date.now();
    // In-memory limiter is per durable object instance and avoids a KV write on each poll.
    const bucket = `${user.id}:${Math.floor(now / 60000)}`;
    this.rates.set(bucket, (this.rates.get(bucket) ?? 0) + 1);
    if (this.rates.get(bucket)! > 90) fail("Too many requests. Try again in a minute.", 429);
    if (this.rates.size > 2000) for (const k of this.rates.keys()) if (!k.endsWith(`:${Math.floor(now / 60000)}`)) this.rates.delete(k);

    if (action === "rooms.mine") {
      const rooms = await storage.list<FriendRoom>({ prefix: "room:" });
      return { items: [...rooms.values()].filter(r => now-r.updatedAt < 7*86400000 && r.members.some(m => m.id === user.id)).sort((a,b)=>b.updatedAt-a.updatedAt) };
    }
    if (action === "rooms.create") {
      const rooms = await storage.list<FriendRoom>({ prefix: "room:" });
      if (rooms.size >= 500) fail("Room capacity reached. Close an old room or try again later.");
      if ([...rooms.values()].filter(r => r.ownerId===user.id && now-r.updatedAt<7*86400000).length >= 5) fail("You can own up to five rooms. Close an old room first.");
      const room: FriendRoom = { code: crypto.randomUUID().replace(/-/g, "").slice(0,12).toUpperCase(), name: text(input.name,60,"Game night") || "Game night", ownerId: user.id, createdAt: now, updatedAt: now, members: [{ id:user.id, name:user.name, ready:false }], queue:[], selected:null, launchPlan:null };
      await storage.put(`room:${room.code}`, room); await storage.setAlarm(now+86400000); return room;
    }
    if (action.startsWith("rooms.")) {
      const key = `room:${code(input.code)}`;
      const room = await storage.get<FriendRoom>(key);
      if (!room || now-room.updatedAt>7*86400000) return fail("Room not found or expired.",404);
      let member = room.members.find(m=>m.id===user.id);
      if (action === "rooms.join" && !member) {
        if (room.members.length>=16) fail("This room is full.");
        member = { id:user.id,name:user.name,ready:false }; room.members.push(member);
        room.launchPlan = null;
      }
      if (!member) return fail("Join this room with its code first.",403);
      if (action === "rooms.chat" || action === "rooms.message") {
        const chatKey = `chat:${room.code}`;
        const items = await storage.get<RoomMessage[]>(chatKey) ?? [];
        if (action === "rooms.chat") return { items };
        const body = typeof input.text === "string" ? input.text.trim() : "";
        const id = typeof input.id === "string" ? input.id : "";
        if (!/^[a-zA-Z0-9-]{16,80}$/.test(id)) fail("Invalid message identifier.");
        if (!body || body.length > ROOM_MESSAGE_LENGTH) fail(`Messages must contain 1–${ROOM_MESSAGE_LENGTH} characters.`);
        // Retrying a request after a timeout must not post it twice.
        if (items.some(item => item.id === id && item.authorId === user.id)) return { items };
        if (items.some(item => item.authorId === user.id && now - item.createdAt < 1000)) fail("Please wait a moment before sending another message.", 429);
        items.push({ id, authorId: user.id, authorName: text(user.name, 60, user.id), text: body, createdAt: now });
        const recent = items.slice(-ROOM_CHAT_LIMIT);
        room.updatedAt = now;
        await storage.put({ [key]: room, [chatKey]: recent });
        return { items: recent };
      }
      if (action === "rooms.get") return room;
      if (action === "rooms.rename") {
        if (room.ownerId !== user.id) fail("Only the host can rename the room.", 403);
        const name = text(input.name, 60); if (!name) fail("Give your room a name.");
        room.name = name;
      } else if (action === "rooms.reset") {
        if (room.ownerId !== user.id) fail("Only the host can reset the server.", 403);
        room.launchPlan = null; room.members.forEach(m => { m.ready = false; });
      } else if (action === "rooms.ready") {
        member.ready = input.ready === true;
        if (!member.ready) room.launchPlan = null;
      }
      else if (action === "rooms.add") {
        if (room.queue.length>=25) fail("The queue is full.");
        const game = LibraryGameSchema.parse(input.game);
        if (!room.queue.some(g=>g.universeId===game.universeId)) room.queue.push({ id:crypto.randomUUID(), universeId:game.universeId,placeId:game.placeId,name:game.name,iconUrl:game.iconUrl??null,addedBy:user.id,votes:[] });
      } else if (action === "rooms.vote") {
        const game = room.queue.find(g=>g.id===input.id); if (!game) return fail("Game not found.",404);
        game.votes = game.votes.includes(user.id) ? game.votes.filter(id=>id!==user.id) : [...game.votes,user.id];
      } else if (action === "rooms.select") {
        if (room.ownerId!==user.id) fail("Only the host can select the game.",403);
        if (!room.queue.some(g=>g.id===input.id)) fail("Game not found.",404);
        room.selected = String(input.id); room.launchPlan=null; room.members.forEach(m=>{m.ready=false;});
      } else if (action === "rooms.launch") {
        if (room.ownerId!==user.id) fail("Only the host can start the room.",403);
        const selected=room.queue.find(g=>g.id===room.selected); if(!selected) return fail("Select a game first.");
        if (!room.members.length || room.members.some(m=>!m.ready)) fail("Everyone must be ready before starting.");
        const gameInstanceId=text(input.gameInstanceId,80); if(!gameInstanceId) fail("A public server was not selected.");
        const placeId=text(input.placeId,40), universeId=text(input.universeId,40);
        if(placeId!==selected.placeId||universeId!==selected.universeId) fail("The selected game changed. Select it again.");
        const maxPlayers=Number(input.maxPlayers), playing=Number(input.playing);
        if(!Number.isSafeInteger(maxPlayers)||!Number.isSafeInteger(playing)||maxPlayers<=0||playing<0||maxPlayers-playing<room.members.length) fail("That server no longer has enough free slots. Refresh the server list and try again.");
        room.launchPlan={gameInstanceId,placeId,universeId,name:selected.name,iconUrl:typeof input.iconUrl==="string"?input.iconUrl:null,startedAt:now};
      } else if (action === "rooms.remove") {
        const game = room.queue.find(g=>g.id===input.id);
        if (!game || (room.ownerId!==user.id && game.addedBy!==user.id)) fail("Only the host or the person who added it can remove a game.",403);
        room.queue=room.queue.filter(g=>g.id!==input.id); if(room.selected===input.id) { room.selected=null; room.launchPlan=null; room.members.forEach(m=>{m.ready=false;}); }
      } else if (action === "rooms.leave") {
        room.members=room.members.filter(m=>m.id!==user.id); room.queue.forEach(g=>{g.votes=g.votes.filter(id=>id!==user.id);});
        room.launchPlan=null;
        if (!room.members.length) { await storage.delete([key, `chat:${room.code}`]); return { left:true }; }
        if(room.ownerId===user.id) room.ownerId=room.members[0].id;
      } else if (action === "rooms.close") {
        if(room.ownerId!==user.id) fail("Only the host can close a room.",403);
        await storage.delete([key, `chat:${room.code}`]); return { left:true };
      } else if (action !== "rooms.join") fail("Unknown room action.");
      room.updatedAt=now; await storage.put(key,room); return action==="rooms.leave" ? {left:true} : room;
    }
    if (action === "workshop.list") {
      const list = await storage.list<StoredTheme>({prefix:"theme:"});
      const q=text(input.query,100).toLowerCase();
      return { items:[...list.values()].filter(t=>(!input.authorId || t.authorId===input.authorId) && `${t.title} ${t.authorName} ${t.description}`.toLowerCase().includes(q)).sort((a,b)=>b.createdAt-a.createdAt).slice(0,100).map(t=>this.publicTheme(t,user.id)) };
    }
    if (action === "workshop.publish") {
      const all = await storage.list<StoredTheme>({prefix:"theme:"});
      if([...all.values()].filter(t=>t.authorId===user.id).length>=20) fail("You can publish up to 20 themes. Remove an old one first.");
      if(all.size>=500) fail("Workshop capacity reached. Please try again later.");
      const item:StoredTheme = { code:crypto.randomUUID().replace(/-/g,"").slice(0,12).toUpperCase(), title:text(input.title,80), description:text(input.description,500),authorId:user.id,authorName:user.name,createdAt:now,theme:portableTheme(input.theme),likedBy:[] };
      if(!item.title) fail("Give your theme a title.");
      const serialized=JSON.stringify(item.theme), chunks=serialized.match(/[\s\S]{1,16000}/g)??[];
      const t=item.theme as Record<string,unknown>;
      item.parts=chunks.length;
      item.theme=Object.fromEntries(["background","text","surface","accent","accentSecondary","iconColorMode","iconColor"].map(k=>[k,typeof t[k]==="string"?(t[k] as string).slice(0,60):undefined]));
      const writes:Record<string,unknown>={[`theme:${item.code}`]:item};
      chunks.forEach((chunk,i)=>{writes[`theme-data:${item.code}:${i}`]=chunk;});
      await storage.put(writes); return this.publicTheme(item,user.id);
    }
    if(action.startsWith("workshop.")) {
      const key=`theme:${code(input.code)}`, item=await storage.get<StoredTheme>(key);
      if(!item) return fail("Theme not found.",404);
      if(action==="workshop.get") {
        if(item.parts){const keys=Array.from({length:item.parts},(_,i)=>`theme-data:${item.code}:${i}`);const chunks=await storage.get<string>(keys);return this.publicTheme({...item,theme:JSON.parse(keys.map(k=>chunks.get(k)??"").join(""))},user.id);}
        return this.publicTheme(item,user.id);
      }
      if(action==="workshop.delete") {
        if(item.authorId!==user.id) fail("Only the author can remove this theme.",403);
        await storage.delete([key,...Array.from({length:item.parts??0},(_,i)=>`theme-data:${item.code}:${i}`)]); return {deleted:true};
      }
      if(action==="workshop.like") { if(!item.likedBy.includes(user.id)&&item.likedBy.length>=1000)fail("This theme has reached the like limit.");item.likedBy=item.likedBy.includes(user.id)?item.likedBy.filter(id=>id!==user.id):[...item.likedBy,user.id]; await storage.put(key,item); return this.publicTheme(item,user.id); }
    }
    return fail("Unknown action.");
  }
  private rates=new Map<string,number>();
  private publicTheme(item:StoredTheme,userId:string):WorkshopItem { const {likedBy,parts:_,...rest}=item; return {...rest,likes:likedBy.length,liked:likedBy.includes(userId)}; }
}
