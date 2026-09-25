import {describe,it,expect,vi} from "vitest";
import {CommunityHub} from "./community";
import {DEFAULT_THEME,ROOM_CHAT_LIMIT,ROOM_MESSAGE_LENGTH} from "../../../packages/contracts/src/index";
function hub(){
  const data=new Map<string,unknown>();let queue=Promise.resolve();
  const state={storage:{get:async(key:string|string[])=>Array.isArray(key)?new Map(key.filter(k=>data.has(k)).map(k=>[k,structuredClone(data.get(k))])):structuredClone(data.get(key)),put:async(key:string|Record<string,unknown>,value?:unknown)=>{if(typeof key==="string")data.set(key,structuredClone(value));else for(const[k,v]of Object.entries(key))data.set(k,structuredClone(v));},delete:async(key:string|string[])=>{for(const k of Array.isArray(key)?key:[key])data.delete(k);},list:async({prefix}:{prefix:string})=>new Map([...data].filter(([key])=>key.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v)])),setAlarm:async()=>{}},blockConcurrencyWhile:(fn:()=>Promise<unknown>)=>{const result=queue.then(fn);queue=result.then(()=>undefined,()=>undefined);return result;}};
  const obj=new CommunityHub(state as unknown as DurableObjectState);
  return async(user:string,action:string,input:Record<string,unknown>={},admin=false)=>{const response=await obj.fetch(new Request("https://community/action",{method:"POST",body:JSON.stringify({identity:{id:user,name:`User ${user}`,admin},action,input})}));return {status:response.status,data:await response.json() as any};};
}
describe("rooms",()=>{
  it("limits moderator assignment to admins and message removal to moderators",async()=>{
    const call=hub(),code=(await call("1","rooms.create")).data.code;
    const id=crypto.randomUUID();
    await call("1","rooms.message",{code,id,text:"Remove me"});
    expect((await call("2","roles.set",{userId:"2",role:"moderator"})).status).toBe(403);
    expect((await call("2","rooms.message.delete",{code,id})).status).toBe(403);
    expect((await call("1","roles.set",{userId:"2",role:"moderator"},true)).status).toBe(200);
    expect((await call("2","roles.me")).data.role).toBe("moderator");
    expect((await call("2","rooms.message.delete",{code,id})).data.items).toHaveLength(0);
    await call("1","roles.set",{userId:"2",role:"member"},true);
    expect((await call("2","rooms.chat",{code})).status).toBe(403);
  });
  it("keeps chat private, uses authenticated names, validates messages and deduplicates retries",async()=>{
    const call=hub(),created=await call("1","rooms.create"),code=created.data.code;
    const payload={code,id:crypto.randomUUID(),text:"Hello squad",authorId:"999",authorName:"Impostor"};
    expect((await call("2","rooms.chat",{code})).status).toBe(403);
    expect((await call("2","rooms.message",payload)).status).toBe(403);
    expect((await call("1","rooms.message",{...payload,text:" "})).status).toBe(400);
    expect((await call("1","rooms.message",{...payload,text:"x".repeat(ROOM_MESSAGE_LENGTH+1)})).status).toBe(400);
    const posted=await call("1","rooms.message",payload);
    expect(posted.data.items[0]).toMatchObject({authorId:"1",authorName:"User 1",text:"Hello squad"});
    expect((await call("1","rooms.message",payload)).data.items).toHaveLength(1);
    expect((await call("1","rooms.message",{...payload,id:crypto.randomUUID()})).status).toBe(429);
    await call("2","rooms.join",{code});
    expect((await call("2","rooms.chat",{code})).data.items).toHaveLength(1);
    await call("2","rooms.leave",{code});
    expect((await call("2","rooms.chat",{code})).status).toBe(403);
    await call("1","rooms.close",{code});
    expect((await call("1","rooms.chat",{code})).status).toBe(404);
  });
  it("bounds persisted chat history and preserves simultaneous posts",async()=>{
    let now=Date.now();const clock=vi.spyOn(Date,"now").mockImplementation(()=>now);
    try{
      const call=hub(),code=(await call("1","rooms.create")).data.code;
      await call("2","rooms.join",{code});
      await Promise.all([call("1","rooms.message",{code,id:crypto.randomUUID(),text:"First"}),call("2","rooms.message",{code,id:crypto.randomUUID(),text:"Second"})]);
      expect((await call("1","rooms.chat",{code})).data.items).toHaveLength(2);
      for(let i=0;i<ROOM_CHAT_LIMIT+3;i++){now+=2000;expect((await call("1","rooms.message",{code,id:crypto.randomUUID(),text:`Message ${i}`})).status).toBe(200);}
      const history=(await call("2","rooms.chat",{code})).data.items;
      expect(history).toHaveLength(ROOM_CHAT_LIMIT);expect(history.at(-1).text).toBe(`Message ${ROOM_CHAT_LIMIT+2}`);
    }finally{clock.mockRestore();}
  });
  it("protects host controls and invalidates obsolete launch plans",async()=>{
    const call=hub(),code=(await call("1","rooms.create")).data.code;
    await call("2","rooms.join",{code});
    expect((await call("2","rooms.rename",{code,name:"Other"})).status).toBe(403);
    expect((await call("2","rooms.reset",{code})).status).toBe(403);
    expect((await call("1","rooms.rename",{code,name:"Weekend"})).data.name).toBe("Weekend");
    const id=(await call("1","rooms.add",{code,game:{universeId:"10",placeId:"20",name:"Game"}})).data.queue[0].id;
    await call("1","rooms.select",{code,id});
    const launch=async()=>{await call("1","rooms.ready",{code,ready:true});await call("2","rooms.ready",{code,ready:true});return call("1","rooms.launch",{code,placeId:"20",universeId:"10",gameInstanceId:"server",maxPlayers:10,playing:0});};
    expect((await launch()).data.launchPlan).toBeTruthy();
    expect((await call("2","rooms.ready",{code,ready:false})).data.launchPlan).toBeNull();
    await launch();expect((await call("3","rooms.join",{code})).data.launchPlan).toBeNull();
    await call("3","rooms.leave",{code});await launch();
    const reset=await call("1","rooms.reset",{code});expect(reset.data.launchPlan).toBeNull();expect(reset.data.members.every((m:any)=>!m.ready)).toBe(true);
    await launch();const removed=await call("1","rooms.remove",{code,id});expect(removed.data.selected).toBeNull();expect(removed.data.launchPlan).toBeNull();
  });
  it("protects membership and host selection, handles simultaneous votes and transfers ownership",async()=>{
    const call=hub(),created=await call("1","rooms.create",{name:"Co-op"}),code=created.data.code;
    expect((await call("2","rooms.get",{code})).status).toBe(403);await call("2","rooms.join",{code});
    const added=await call("1","rooms.add",{code,game:{universeId:"10",placeId:"20",name:"A game"}}),id=added.data.queue[0].id;
    expect((await call("2","rooms.select",{code,id})).status).toBe(403);
    await Promise.all([call("1","rooms.vote",{code,id}),call("2","rooms.vote",{code,id})]);
    expect((await call("1","rooms.get",{code})).data.queue[0].votes).toHaveLength(2);
    await call("2","rooms.ready",{code,ready:true});expect((await call("1","rooms.select",{code,id})).data.members.every((m:any)=>!m.ready)).toBe(true);
    await call("1","rooms.leave",{code});expect((await call("2","rooms.get",{code})).data.ownerId).toBe("2");expect((await call("1","rooms.get",{code})).status).toBe(403);
  });
});
describe("workshop",()=>{
  it("roundtrips wallpaper chunks, keeps catalog light and protects author deletion",async()=>{
    const call=hub(),wallpaper="data:image/png;base64,"+"A".repeat(180000);
    const pub=await call("1","workshop.publish",{title:"Test theme",description:"Blue",theme:{...DEFAULT_THEME,backgroundImage:wallpaper,wallpaperId:wallpaper}});
    expect(pub.status).toBe(200);const code=pub.data.code;
    expect(JSON.stringify((await call("2","workshop.list")).data).length).toBeLessThan(3000);
    expect((await call("2","workshop.get",{code})).data.theme.wallpaperId).toBe(wallpaper);
    expect((await call("2","workshop.delete",{code})).status).toBe(403);
    expect((await call("2","workshop.like",{code})).data.likes).toBe(1);expect((await call("2","workshop.like",{code})).data.likes).toBe(0);
    await call("1","workshop.delete",{code});expect((await call("2","workshop.get",{code})).status).toBe(404);
  });
  it("rejects local wallpapers that another computer cannot resolve",async()=>{expect((await hub()("1","workshop.publish",{title:"Local",theme:{...DEFAULT_THEME,wallpaperId:"custom-private-file"}})).status).toBe(400);});
});
