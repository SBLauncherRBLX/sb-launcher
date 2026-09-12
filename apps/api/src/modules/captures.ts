import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { promises as fs, createReadStream } from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "./auth/service.js";
import { env } from "../config.js";

const types:Record<string,string>={".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".mp4":"video/mp4",".webm":"video/webm",".wmv":"video/x-ms-wmv"};
type Capture={id:string;userId:string;filename:string;extension:string;createdAt:number;universeId:string|null;gameName:string|null;size:number};
const pending=new Map<string,{size:number;modified:number;observed:number}>();
let scan:Promise<void>|null=null;
export async function ensureCaptureTables(){
  await prisma.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "CaptureSettings" ("userId" TEXT PRIMARY KEY,"since" REAL NOT NULL,"enabled" INTEGER NOT NULL DEFAULT 1)');
  await prisma.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "JournalCapture" ("id" TEXT PRIMARY KEY,"userId" TEXT NOT NULL,"filename" TEXT NOT NULL,"extension" TEXT NOT NULL,"createdAt" REAL NOT NULL,"universeId" TEXT,"gameName" TEXT,"size" REAL NOT NULL)');
}
export function captureId(source:string,createdAt:number){return createHash("sha256").update(`${path.resolve(source)}:${createdAt}`).digest("hex");}
export function parseMediaRange(header:string|undefined,size:number):{start:number;end:number}|null|false{
  if(!header)return null;const match=/^bytes=(\d*)-(\d*)$/.exec(header);if(!match||(!match[1]&&!match[2]))return false;
  const start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));
  const end=match[1]?(match[2]?Math.min(Number(match[2]),size-1):size-1):size-1;
  return Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&start<size&&end>=start?{start,end}:false;
}
async function settings(userId:string):Promise<{since:number;enabled:number}>{
  await prisma.$executeRaw`INSERT INTO "CaptureSettings" ("userId","since") VALUES (${userId},${Date.now()}) ON CONFLICT("userId") DO NOTHING`;
  const row=(await prisma.$queryRaw<Array<{since:number;enabled:number}>>`SELECT "since","enabled" FROM "CaptureSettings" WHERE "userId"=${userId}`)[0];
  if(!row)throw new Error("Could not initialize capture settings.");
  return row;
}
async function importCaptures(userId:string){
  const prefs=await settings(userId);if(!prefs.enabled)return;
  const destination=process.env.SB_JOURNAL_MEDIA;if(!destination)return;
  const roots=[process.env.SB_CAPTURE_PICTURES,process.env.SB_CAPTURE_VIDEOS].filter((x):x is string=>!!x);
  const existing=new Set((await prisma.$queryRaw<Array<{id:string}>>`SELECT "id" FROM "JournalCapture"`).map(c=>c.id));
  for(const root of roots){
    let entries;try{entries=await fs.readdir(root,{withFileTypes:true});}catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")continue;throw e;}
    for(const entry of entries){
      const extension=path.extname(entry.name).toLowerCase();if(!entry.isFile()||!types[extension])continue;
      const source=path.join(root,entry.name);const stat=await fs.stat(source);
      const createdAt=stat.birthtimeMs||stat.mtimeMs;
      if(createdAt<prefs.since||!stat.size)continue;
      const id=captureId(source,createdAt);if(existing.has(id))continue;
      const previous=pending.get(source);pending.set(source,{size:stat.size,modified:stat.mtimeMs,observed:previous?.size===stat.size&&previous.modified===stat.mtimeMs?previous.observed:Date.now()});
      if(!previous||previous.size!==stat.size||previous.modified!==stat.mtimeMs||Date.now()-previous.observed<15_000||Date.now()-stat.mtimeMs<15_000)continue;
      if(stat.size>2*1024**3)throw new Error("A Roblox recording exceeds the 2 GB auto-import limit. The original is still in Videos/Roblox.");
      const sessions=await prisma.$queryRaw<Array<{universeId:string;name:string}>>`SELECT "universeId","name" FROM "PlaySession" WHERE "userId"=${userId} AND "startedAt"<=${createdAt} AND "lastSeen">=${createdAt-60_000} ORDER BY "startedAt" DESC LIMIT 1`;
      await fs.mkdir(destination,{recursive:true});const target=path.join(destination,`${id}${extension}`),temp=target+".partial";
      await fs.copyFile(source,temp);
      const after=await fs.stat(source);if(after.size!==stat.size||after.mtimeMs!==stat.mtimeMs){await fs.unlink(temp);continue;}
      await fs.rename(temp,target);
      await prisma.$executeRaw`INSERT INTO "JournalCapture" ("id","userId","filename","extension","createdAt","universeId","gameName","size") VALUES (${id},${userId},${entry.name},${extension},${createdAt},${sessions[0]?.universeId??null},${sessions[0]?.name??null},${stat.size}) ON CONFLICT("id") DO NOTHING`;
      pending.delete(source);
    }
  }
}
function signature(id:string,expires:number){return createHmac("sha256",env.SESSION_SECRET).update(`${id}:${expires}`).digest("hex");}
export async function registerCaptureRoutes(app:FastifyInstance){
  app.get("/api/captures",async(req,reply)=>{
    const auth=requireAuth(req,reply);if(!auth)return;const prefs=await settings(auth.user.id);
    const rows=await prisma.$queryRaw<Capture[]>`SELECT * FROM "JournalCapture" WHERE "userId"=${auth.user.id} ORDER BY "createdAt" DESC LIMIT 1000`;
    const expires=Date.now()+3600_000;
    return {enabled:!!prefs.enabled,configured:!!process.env.SB_JOURNAL_MEDIA,items:rows.map(({userId,...c})=>{const contentType=types[c.extension]??"application/octet-stream";return {...c,kind:contentType.startsWith("video")?"video":"image",url:`/api/captures/${c.id}/media?expires=${expires}&signature=${signature(c.id,expires)}`};})};
  });
  app.post("/api/captures/sync",async(req,reply)=>{
    const auth=requireAuth(req,reply);if(!auth)return;
    if(scan){await scan;return {ok:true};}
    scan=importCaptures(auth.user.id);try{await scan;return {ok:true};}catch(e){req.log.warn({err:e},"Capture import failed");return reply.code(503).send({error:(e as Error).message});}finally{scan=null;}
  });
  app.put("/api/captures/settings",async(req,reply)=>{
    const auth=requireAuth(req,reply);if(!auth)return;
    const enabled=(req.body as {enabled?:unknown})?.enabled;if(typeof enabled!=="boolean")return reply.code(400).send({error:"Invalid capture settings"});
    await settings(auth.user.id);await prisma.$executeRaw`UPDATE "CaptureSettings" SET "enabled"=${enabled?1:0},"since"=${Date.now()} WHERE "userId"=${auth.user.id}`;return {ok:true};
  });
  app.get<{Params:{id:string};Querystring:{expires:string;signature:string}}>("/api/captures/:id/media",async(req,reply)=>{
    const {id}=req.params,{expires:raw,signature:sig}=req.query,expires=Number(raw);
    if(!/^[a-f0-9]{64}$/.test(id)||!Number.isFinite(expires)||expires<Date.now()||!sig||!/^[a-f0-9]{64}$/.test(sig)||!timingSafeEqual(Buffer.from(sig,"hex"),Buffer.from(signature(id,expires),"hex")))return reply.code(403).send({error:"Media link expired. Refresh Journal."});
    const row=(await prisma.$queryRaw<Capture[]>`SELECT * FROM "JournalCapture" WHERE "id"=${id}`)[0];
    if(!row||!process.env.SB_JOURNAL_MEDIA)return reply.code(404).send();
    const file=path.join(process.env.SB_JOURNAL_MEDIA,`${id}${row.extension}`);let stat;try{stat=await fs.stat(file);}catch{return reply.code(404).send();}
    const range=parseMediaRange(req.headers.range,stat.size);if(range===false)return reply.code(416).header("Content-Range",`bytes */${stat.size}`).send();
    const contentType=types[row.extension]??"application/octet-stream";
    reply.header("Cache-Control","private, no-store").header("Accept-Ranges","bytes").header("X-Content-Type-Options","nosniff").type(contentType);
    if(row.extension===".wmv")reply.header("Content-Disposition","attachment; filename=Roblox-recording.wmv");
    if(range)return reply.code(206).header("Content-Range",`bytes ${range.start}-${range.end}/${stat.size}`).header("Content-Length",range.end-range.start+1).send(createReadStream(file,range));
    return reply.header("Content-Length",stat.size).send(createReadStream(file));
  });
}
