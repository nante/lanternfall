import { createServer } from 'node:http';
import { mkdirSync,chmodSync,writeFileSync } from 'node:fs';
import { createHash,randomBytes,timingSafeEqual } from 'node:crypto';
import express from 'express';
import Database from 'better-sqlite3';
import { defineServer,defineRoom,Room,type Client } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { z } from 'zod';
import { Engine,GameError } from '../../../packages/game/src/engine.ts';
import { HeroName,type State } from '../../../packages/game/src/model.ts';
import { loadWorld } from '../../../packages/game/src/save.ts';
import { readEnvelope } from './envelope.ts';
import { accountOf,applyAccountEdit,AccountEdit,StaleItems } from '../../../packages/game/src/accounts.ts';
import { buildTown } from '../../../packages/game/src/town.ts';
import { defaultBalance } from '../../../packages/game/src/default-balance.ts';

mkdirSync('.local',{recursive:true});
const db=new Database(process.env.LANTERNFALL_DB??'.local/lanternfall.sqlite');
db.pragma('journal_mode=WAL');db.pragma('synchronous=NORMAL');
if(!process.env.LANTERNFALL_DB)chmodSync('.local/lanternfall.sqlite',0o600);
db.exec('CREATE TABLE IF NOT EXISTS world(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS receipts(player TEXT NOT NULL, request TEXT NOT NULL, hash TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(player,request)); CREATE TABLE IF NOT EXISTS world_backup(id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, problems TEXT NOT NULL, data TEXT NOT NULL);');
const saved=z.object({data:z.string()}).optional().parse(db.prepare('SELECT data FROM world WHERE id=1').get());
const map=buildTown();
const loaded=loadWorld(saved?.data);
if(!loaded.ok){
 // A save that does not load is never written over: it is copied aside first, and the server only starts empty when told to.
 db.prepare('INSERT INTO world_backup(at,problems,data) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM world_backup WHERE data=?)').run(new Date().toISOString(),JSON.stringify(loaded.problems),saved!.data,saved!.data);
 const backup=z.object({id:z.number()}).parse(db.prepare('SELECT id FROM world_backup WHERE data=?').get(saved!.data)).id;
 const where=`world_backup row ${backup} in ${process.env.LANTERNFALL_DB??'.local/lanternfall.sqlite'}`;
 if(process.env.LANTERNFALL_FRESH_WORLD!=='1'){
  console.error(JSON.stringify({event:'world_unreadable',problems:loaded.problems,backup:where,fix:'Repair the save, or start an empty world with LANTERNFALL_FRESH_WORLD=1 (the backup stays).'}));
  db.close();process.exit(1);
 }
 console.warn(JSON.stringify({event:'world_reset',problems:loaded.problems,backup:where}));
}
const engine=new Engine(map,defaultBalance,loaded.ok?loaded.state:undefined);
for(const p of Object.values(engine.state.players)){p.connected=false;p.combatUntil=0;p.path=[];p.target=null;p.talking=null;}
for(const m of Object.values(engine.state.monsters))m.target=null;
const writeWorld=db.prepare('INSERT INTO world VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data');
const getReceipt=db.prepare('SELECT hash,result FROM receipts WHERE player=? AND request=?');
const putReceipt=db.prepare('INSERT INTO receipts VALUES(?,?,?,?)');
type Receipt={player:string;request:string;hash:string;result:string};
const persist=db.transaction((state:State,receipt?:Receipt)=>{writeWorld.run(JSON.stringify(state));if(receipt)putReceipt.run(receipt.player,receipt.request,receipt.hash,receipt.result);});
persist(engine.state);
function transaction<T>(fn:()=>T,receipt?:(value:T)=>Receipt,save=true){const before=engine.state,noticeCount=engine.notices.length;engine.state=structuredClone(before);try{const result=fn();engine.assertItems();engine.state.revision++;if(save)persist(engine.state,receipt?.(result));return result;}catch(error){engine.state=before;engine.notices.length=noticeCount;throw error;}}
let ticks=0;
const Join=z.object({token:z.string().optional(),name:HeroName.default('Wayfarer')});
class TownRoom extends Room {
 autoDispose=false;
 maxClients=16;
 bindings=new Map<string,{id:string;epoch:number}>();
 onCreate(){room=this;this.onMessage('action',(client:Client,input:unknown)=>this.action(client,input));this.onMessage('ready',(client:Client)=>this.sendView(client));this.setSimulationInterval(()=>this.tick(),50);}
 onJoin(client:Client,input:unknown){const options=Join.parse(input);const existing=options.token?Object.values(engine.state.players).find(p=>p.token===options.token):undefined;if(options.token&&!existing)throw new Error('This character could not be found. Start a new wayfarer.');
  const id=transaction(()=>{const p=existing?engine.state.players[existing.id]:engine.createPlayer(options.name);engine.tidy(p);engine.rejoin(p);p.epoch++;p.seq=0;p.path=[];return p.id;});const p=engine.state.players[id];
  for(const old of this.clients){const binding=this.bindings.get(old.sessionId);if(old!==client&&binding?.id===id){old.send('fenced',{});old.leave();}}
  this.bindings.set(client.sessionId,{id,epoch:p.epoch});client.send('welcome',{id:p.id,token:p.token,epoch:p.epoch});this.sendView(client);this.flushNotices();}
 onLeave(client:Client){this.detachPlayer(client);}
 onDrop(client:Client){this.detachPlayer(client);}
 detachPlayer(client:Client){const b=this.bindings.get(client.sessionId);this.bindings.delete(client.sessionId);if(b&&engine.state.players[b.id]?.epoch===b.epoch)transaction(()=>{const p=engine.state.players[b.id];p.connected=false;p.path=[];p.target=null;});}
 player(client:Client){const b=this.bindings.get(client.sessionId);if(!b)return;const p=engine.state.players[b.id];return p?.epoch===b.epoch?p:undefined;}
 sendView(client:Client){const p=this.player(client);if(p)client.send('view',engine.view(p));}
 flushNotices(){for(const n of engine.notices.splice(0))for(const c of this.clients)if(this.bindings.get(c.sessionId)?.id===n.player)c.send('notice',n);}
 action(client:Client,input:unknown){const read=readEnvelope(input);const p=this.player(client);
  if(!p){client.send('result',{ok:false,text:'This session has ended. Reconnect to continue.',resync:true});return;}
  // A message the server cannot act on still advances the sequence when its header is valid, so client and server stay in step.
  const req=read.ok?read.req:read.header;if(!req){client.send('result',{ok:false,text:'Invalid action. Reconnect to resynchronize.',resync:true});return;}
  const hash=createHash('sha256').update(JSON.stringify(read.ok?read.req.action:(input as {action?:unknown}).action??null)).digest('hex');
  const prior=z.object({hash:z.string(),result:z.string()}).optional().parse(getReceipt.get(p.id,req.requestId));
  if(prior){client.send('result',prior.hash===hash?JSON.parse(prior.result):{ok:false,text:'Request identity was reused for another action.'});return;}
  if(req.epoch!==p.epoch||req.seq!==p.seq+1){client.send('result',{ok:false,text:'Action sequence changed. Reconnect to continue.',resync:true});return;}
  const id=p.id,receipt=(value:unknown)=>({player:id,request:req.requestId,hash,result:JSON.stringify(value)});
  const refuse=(text:string)=>transaction(()=>{engine.state.players[id].seq=req.seq;return {ok:false,text,requestId:req.requestId};},receipt);
  let result:{ok:boolean;text:string;requestId:string};
  if(!read.ok)result=refuse('That action is not understood.');
  else try{result=transaction(()=>{const current=engine.state.players[id];if(current.epoch!==req.epoch)throw new GameError('This session has ended.');engine.action(current,read.req.action);current.seq=req.seq;return {ok:true,text:'',requestId:req.requestId};},receipt);}
  catch(error){
   if(error instanceof GameError)result=refuse(error.message);
   else{console.error(JSON.stringify({event:'action_failed',error:String(error)}));
    try{result=refuse('That did not work. Try again.');}
    catch(again){console.error(JSON.stringify({event:'action_unsaved',error:String(again)}));client.send('result',{ok:false,text:'The action could not be saved. Reconnect before trying again.',resync:true});return;}}}
  client.send('result',result);
  this.sendView(client);this.flushNotices();}
 /** A Studio edit changed this character: show it to them at once. */
 edited(id:string){const p=engine.state.players[id];if(p?.connected)engine.note(p,'Your character was changed in the Studio.');for(const c of this.clients)if(this.bindings.get(c.sessionId)?.id===id)this.sendView(c);this.flushNotices();}
 /** The world runs whenever the server is up. With nobody online it is saved every 10 s instead of every 2 s: only respawns and rot are at stake. */
 tick(){const online=Object.values(engine.state.players).some(p=>engine.present(p));const started=performance.now();try{transaction(()=>engine.tick(50),undefined,++ticks%(online?40:200)===0);if(ticks%2===0)for(const c of this.clients)this.sendView(c);this.flushNotices();}catch(error){console.error(JSON.stringify({event:'tick_rolled_back',error:String(error)}));}const elapsed=performance.now()-started;if(elapsed>50)console.warn(JSON.stringify({event:'tick_overrun',ms:Math.round(elapsed)}));}
}
let room:TownRoom|undefined;
const PORT=Number(process.env.PORT??2567);
// Hosting for friends: bind wider with LANTERNFALL_HOST=0.0.0.0, and serve a built client from the same port with LANTERNFALL_STATIC=dist/client.
const HOST=process.env.LANTERNFALL_HOST??'127.0.0.1',STATIC=process.env.LANTERNFALL_STATIC;
const loopback=(a?:string)=>a==='127.0.0.1'||a==='::1'||a==='::ffff:127.0.0.1';
const app=express();app.get('/health',(_req,res)=>res.json({ok:true,revision:engine.state.revision,players:Object.keys(engine.state.players).length}));
// Studio account editing. The Studio reads this token from .local and proxies to us; nothing else on the machine should get in.
const adminToken=randomBytes(24).toString('hex');
writeFileSync('.local/admin-token',adminToken,{mode:0o600});
app.use('/admin',(req,res,next)=>{const got=Buffer.from(req.get('x-admin-token')??''),want=Buffer.from(adminToken);
 if(!loopback(req.socket.remoteAddress)||req.headers.host!==`127.0.0.1:${PORT}`||got.length!==want.length||!timingSafeEqual(got,want)){res.status(403).json({message:'Not allowed'});return;}next();},express.json({limit:'256kb'}));
const accounts=()=>Object.values(engine.state.players).map(p=>accountOf(engine,p)).sort((a,b)=>a.name.localeCompare(b.name));
app.get('/admin/accounts',(_req,res)=>{res.json(accounts());});
app.put('/admin/accounts/:id',(req,res)=>{const id=String(req.params.id),edit=AccountEdit.safeParse(req.body);
 if(!edit.success){res.status(422).json({message:edit.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')});return;}
 if(!engine.state.players[id]){res.status(404).json({message:'That character no longer exists.'});return;}
 try{transaction(()=>applyAccountEdit(engine,id,edit.data));}
 catch(error){if(error instanceof StaleItems){res.status(409).json({message:error.message});return;}if(error instanceof GameError){res.status(422).json({message:error.message});return;}console.error(JSON.stringify({event:'account_edit_failed',error:String(error)}));res.status(500).json({message:'The edit could not be saved.'});return;}
 console.info(JSON.stringify({event:'account_edited',player:id,fields:Object.keys(edit.data)}));
 room?.edited(id);res.json(accountOf(engine,engine.state.players[id]));});
if(STATIC)app.use(express.static(STATIC));
const server=defineServer({transport:new WebSocketTransport({server:createServer(app)}),rooms:{lanternfall:defineRoom(TownRoom)}});
await server.listen(PORT,HOST);
console.info(JSON.stringify({event:'world_ready',host:HOST,port:PORT,static:STATIC??null,map:map.name}));
let closing=false;
function shutdown(){if(closing)return;closing=true;try{persist(engine.state);db.close();}finally{process.exit(0);}}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
