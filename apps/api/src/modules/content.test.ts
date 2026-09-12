import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import {unlinkSync} from "node:fs";
const testDb=vi.hoisted(()=>({file:`.cache/content-test-${Date.now()}.db`}));
vi.mock("../config.js",()=>({env:{SB_CLOUD_URL:"https://example.workers.dev"}}));
vi.mock("./auth/service.js",()=>({requireAuth:(req:any,reply:any)=>{const id=req.headers["x-test-user"];if(!id){reply.code(401).send({error:"Authentication required"});return null;}return {user:{id},accessToken:"test-token"};}}));
vi.mock("../lib/prisma.js",async()=>{
  const {PrismaClient}=await import("@prisma/client");const {PrismaLibSQL}=await import("@prisma/adapter-libsql");
  return {prisma:new PrismaClient({adapter:new PrismaLibSQL({url:`file:${testDb.file}`})})};
});
import {prisma} from "../lib/prisma.js";
import {ensureContentTables,registerContentRoutes,pulseSession} from "./content.js";
const app=Fastify({bodyLimit:5*1024*1024});
beforeAll(async()=>{await ensureContentTables();await registerContentRoutes(app);await app.ready();});
afterAll(async()=>{await app.close();await prisma.$disconnect();try{unlinkSync(testDb.file);}catch{}});
const headers={"x-test-user":"101"};
describe("local content API",()=>{
  it("requires a signed-in account",async()=>{expect((await app.inject({url:"/api/content"})).statusCode).toBe(401);});
  it("persists collections, games and notes, rejects stale saves and isolates users",async()=>{
    const original=(await app.inject({url:"/api/content",headers})).json();
    original.data.collections.push({id:"collection-1",name:"Co-op"});
    original.data.games.push({universeId:"1",placeId:"2",name:"Test game",collections:["collection-1"],tags:["co-op"],pinned:true,later:true});
    original.data.journal.push({id:"note-1",universeId:"1",title:"A goal",text:"Find the hidden area",createdAt:new Date().toISOString(),images:[]});
    const saved=await app.inject({method:"PUT",url:"/api/content",headers,payload:original});expect(saved.statusCode).toBe(200);
    const reload=(await app.inject({url:"/api/content",headers})).json();expect(reload.data.games[0].pinned).toBe(true);expect(reload.data.journal[0].text).toContain("hidden");expect(reload.revision).toBe(1);
    expect((await app.inject({method:"PUT",url:"/api/content",headers,payload:original})).statusCode).toBe(409);
    expect((await app.inject({url:"/api/content",headers:{"x-test-user":"202"}})).json().data.games).toEqual([]);
  });
  it("rejects executable artwork and duplicate game IDs",async()=>{
    const doc=(await app.inject({url:"/api/content",headers})).json();doc.data.games[0].cover="javascript:alert(1)";
    expect((await app.inject({method:"PUT",url:"/api/content",headers,payload:doc})).statusCode).toBe(400);
    delete doc.data.games[0].cover;doc.data.games.push(doc.data.games[0]);
    expect((await app.inject({method:"PUT",url:"/api/content",headers,payload:doc})).statusCode).toBe(400);
  });
  it("starts sessions and prevents another account from updating them",async()=>{
    const started=await app.inject({method:"POST",url:"/api/play-sessions",headers,payload:{universeId:"1",placeId:"2",name:"Test game"}});expect(started.statusCode).toBe(200);
    const id=started.json().id;
    const denied=await app.inject({method:"POST",url:`/api/play-sessions/${id}/pulse`,headers:{"x-test-user":"202"},payload:{running:true}});
    expect(denied.statusCode,denied.body).toBe(404);
    expect((await app.inject({method:"POST",url:`/api/play-sessions/${id}/pulse`,headers,payload:{running:true}})).statusCode).toBe(200);
    expect((await app.inject({url:"/api/play-sessions",headers})).json().items).toHaveLength(1);
  });
});
describe("session clock",()=>{
  const session={id:"s",universeId:"1",placeId:"2",name:"Game",startedAt:0,lastSeen:15000,seconds:10,ended:false};
  it("counts a confirmed process pulse once",()=>{const p=pulseSession(session,true,30000);expect(p.seconds).toBe(25);expect(pulseSession(p,true,30000).seconds).toBe(25);});
  it("does not count downtime or time after exiting",()=>{expect(pulseSession(session,true,200000)).toMatchObject({seconds:10,ended:true});expect(pulseSession(session,false,30000)).toMatchObject({seconds:10,ended:true});});
  it("gives a new launch a grace period, then closes failed launches",()=>{expect(pulseSession({...session,seconds:0},false,30000).ended).toBe(false);expect(pulseSession({...session,seconds:0,lastSeen:110000},false,125000).ended).toBe(true);});
});
