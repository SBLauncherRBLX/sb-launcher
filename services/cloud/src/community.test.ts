import {describe,it,expect} from "vitest";
import {CommunityHub} from "./community";
import {DEFAULT_THEME} from "../../../packages/contracts/src/index";
function hub(){
  const data=new Map<string,unknown>();let queue=Promise.resolve();
  const state={storage:{get:async(key:string|string[])=>Array.isArray(key)?new Map(key.filter(k=>data.has(k)).map(k=>[k,structuredClone(data.get(k))])):structuredClone(data.get(key)),put:async(key:string|Record<string,unknown>,value?:unknown)=>{if(typeof key==="string")data.set(key,structuredClone(value));else for(const[k,v]of Object.entries(key))data.set(k,structuredClone(v));},delete:async(key:string|string[])=>{for(const k of Array.isArray(key)?key:[key])data.delete(k);},list:async({prefix}:{prefix:string})=>new Map([...data].filter(([key])=>key.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v)])),setAlarm:async()=>{}},blockConcurrencyWhile:(fn:()=>Promise<unknown>)=>{const result=queue.then(fn);queue=result.then(()=>undefined,()=>undefined);return result;}};
  const obj=new CommunityHub(state as unknown as DurableObjectState);
  return async(user:string,action:string,input:Record<string,unknown>={})=>{const response=await obj.fetch(new Request("https://community/action",{method:"POST",body:JSON.stringify({identity:{id:user,name:`User ${user}`},action,input})}));return {status:response.status,data:await response.json() as any};};
}
describe("rooms",()=>{
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
