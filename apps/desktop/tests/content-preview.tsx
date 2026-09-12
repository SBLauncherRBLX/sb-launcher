// Development-only UI fixture. Not imported by the production entry or bundled in Setup.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { DEFAULT_THEME, DEFAULT_CAPABILITIES, ContentDataSchema } from '@sb/contracts';
import App from '../src/App';
import { useAppStore } from '../src/store';
import '../src/styles.css';
import '../src/content.css';

const games = [
  { universeId:'1001', placeId:'2001', name:'QA · Glass Islands', tags:['Adventure','Co-op'], collections:['weekend'], pinned:true, later:false },
  { universeId:'1002', placeId:'2002', name:'QA · Night Drive', tags:['Racing'], collections:[], pinned:false, later:true },
  { universeId:'1003', placeId:'2003', name:'QA · Studio Garden', tags:['Creative'], collections:['weekend'], pinned:false, later:false },
];
let doc = { revision:0, data:ContentDataSchema.parse({ games, collections:[{id:'weekend',name:'Weekend with friends'}], journal:[{ id:'entry1',universeId:'1001',title:'Find the hidden island',text:'Bring friends and explore the northern shore.\nThis is an isolated QA note.',images:[],createdAt:new Date().toISOString() }] }) };
let room = {code:'AABBCCDDEEFF',name:'QA · Friday night',ownerId:'900001',createdAt:Date.now(),updatedAt:Date.now(),members:[{id:'900001',name:'QA Preview',ready:false},{id:'900002',name:'QA Friend',ready:true}],queue:[{...games[0],id:'queue1',addedBy:'900001',votes:['900002']}],selected:null as string|null};
let item = {code:'112233AABBCC',title:'QA · Violet Glass',description:'An isolated theme fixture for layout and installation checks.',authorId:'900002',authorName:'QA Creator',createdAt:Date.now(),theme:DEFAULT_THEME,likes:12,liked:false};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
window.fetch=async(input,init)=>{
  const url=new URL(String(input),location.href); const body=init?.body?JSON.parse(String(init.body)):{};
  if(url.pathname==='/api/content') {
    if(init?.method==='PUT'){if(body.revision!==doc.revision)return reply({error:'Revision conflict'},409);doc={revision:doc.revision+1,data:ContentDataSchema.parse(body.data)};}
    return reply(doc);
  }
  if(url.pathname==='/api/play-sessions')return reply({items:[{id:'session1',...games[0],startedAt:Date.now()-7200000,lastSeen:Date.now(),seconds:5400,ended:true},{id:'session2',...games[1],startedAt:Date.now()-86400000,lastSeen:Date.now()-83000000,seconds:3300,ended:true}]});
  if(url.pathname==='/api/community') {
    const a=body.action,p=body.input;
    if(a==='rooms.mine')return reply({items:[room]});
    if(a==='rooms.ready')room={...room,updatedAt:Date.now(),members:room.members.map(m=>m.id==='900001'?{...m,ready:p.ready}:m)};
    if(a==='rooms.select')room={...room,selected:p.id,updatedAt:Date.now(),members:room.members.map(m=>({...m,ready:false}))};
    if(a==='rooms.vote')room={...room,updatedAt:Date.now(),queue:room.queue.map(g=>({...g,votes:g.votes.includes('900001')?g.votes.filter(v=>v!=='900001'):[...g.votes,'900001']}))};
    if(a.startsWith('rooms.'))return reply(room);
    if(a==='workshop.list')return reply({items:[item]});
    if(a==='workshop.like')item={...item,liked:!item.liked,likes:item.likes+(item.liked?-1:1)};
    if(a.startsWith('workshop.'))return reply(item);
  }
  if(url.pathname==='/api/games/search')return reply({items:games,nextCursor:null});
  if(url.pathname.startsWith('/api/games/'))return reply(games.find(g=>url.pathname.endsWith(g.universeId))??games[0]);
  if(url.pathname==='/api/themes')return reply(init?.method==='POST'?{id:'qa-preset',...body}:{items:[]});
  if(url.pathname.includes('wallpapers'))return reply({items:[]});
  return reply({ok:true,items:[]});
};
useAppStore.setState({ready:true,demoMode:false,bootstrap:async()=>{},persistPreferences:async()=>{},session:{authenticated:true,user:{id:'900001',name:'QA Preview',displayName:'QA Preview',username:'qa_preview'},activeUserId:'900001',accounts:[],scopes:[],capabilities:DEFAULT_CAPABILITIES} as any});
createRoot(document.getElementById('root')!).render(<HashRouter><App/></HashRouter>);
