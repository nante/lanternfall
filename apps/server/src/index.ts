import { createServer } from 'node:http';
import { mkdirSync,chmodSync,writeFileSync } from 'node:fs';
import { createHash,randomBytes,timingSafeEqual } from 'node:crypto';
import express from 'express';
import Database from 'better-sqlite3';
import { defineServer,defineRoom,Room,type Client } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { z } from 'zod';
import { Engine,GameError } from '../../../packages/game/src/engine.ts';
import { GameState,Envelope,HeroName,type State } from '../../../packages/game/src/model.ts';
import { accountOf,applyAccountEdit,AccountEdit,StaleItems } from '../../../packages/game/src/accounts.ts';
import { buildTown } from '../../../packages/game/src/town.ts';
import { defaultBalance } from '../../../packages/game/src/default-balance.ts';

mkdirSync('.local',{recursive:true});
const db=new Database(process.env.LANTERNFALL_DB??'.local/lanternfall.sqlite');
db.pragma('journal_mode=WAL');db.pragma('synchronous=NORMAL');
if(!process.env.LANTERNFALL_DB)chmodSync('.local/lanternfall.sqlite',0o600);
db.exec('CREATE TABLE IF NOT EXISTS world(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS receipts(player TEXT NOT NULL, request TEXT NOT NULL, hash TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(player,request));');
const saved=z.object({data:z.string()}).optional().parse(db.prepare('SELECT data FROM world WHERE id=1').get());
const map=buildTown();
const restored=saved?GameState.safeParse(JSON.parse(saved.data)):undefined;
if(restored&&!restored.success)console.warn(JSON.stringify({event:'world_reset',reason:'saved world is from an older version'}));
const engine=new Engine(map,defaultBalance,restored?.success?restored.data:undefined);
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
  const id=transaction(()=>{const p=existing?engine.state.players[existing.id]:engine.createPlayer(options.name);engine.tidy(p);p.connected=true;p.epoch++;p.seq=0;p.path=[];return p.id;});const p=engine.state.players[id];
  for(const old of this.clients){const binding=this.bindings.get(old.sessionId);if(old!==client&&binding?.id===id){old.send('fenced',{});old.leave();}}
  this.bindings.set(client.sessionId,{id,epoch:p.epoch});client.send('welcome',{id:p.id,token:p.token,epoch:p.epoch});this.sendView(client);this.flushNotices();}
 onLeave(client:Client){this.detachPlayer(client);}
 onDrop(client:Client){this.detachPlayer(client);}
 detachPlayer(client:Client){const b=this.bindings.get(client.sessionId);this.bindings.delete(client.sessionId);if(b&&engine.state.players[b.id]?.epoch===b.epoch)transaction(()=>{const p=engine.state.players[b.id];p.connected=false;p.path=[];p.target=null;});}
 player(client:Client){const b=this.bindings.get(client.sessionId);if(!b)return;const p=engine.state.players[b.id];return p?.epoch===b.epoch?p:undefined;}
 sendView(client:Client){const p=this.player(client);if(p)client.send('view',engine.view(p));}
 flushNotices(){for(const n of engine.notices.splice(0))for(const c of this.clients)if(this.bindings.get(c.sessionId)?.id===n.player)c.send('notice',n);}
 action(client:Client,input:unknown){const parsed=Envelope.safeParse(input);const p=this.player(client);if(!parsed.success||!p){client.send('result',{ok:false,text:'Invalid action. Reconnect to resynchronize.'});return;}const req=parsed.data,hash=createHash('sha256').update(JSON.stringify(req.action)).digest('hex');
  const prior=z.object({hash:z.string(),result:z.string()}).optional().parse(getReceipt.get(p.id,req.requestId));
  if(prior){client.send('result',prior.hash===hash?JSON.parse(prior.result):{ok:false,text:'Request identity was reused for another action.'});return;}
  if(req.epoch!==p.epoch||req.seq!==p.seq+1){client.send('result',{ok:false,text:'Action sequence changed. Reconnect to continue.',resync:true});return;}
  const id=p.id;let result:{ok:boolean;text:string;requestId:string};
  try{result=transaction(()=>{const current=engine.state.players[id];if(current.epoch!==req.epoch)throw new GameError('This session has ended.');engine.action(current,req.action);current.seq=req.seq;return {ok:true,text:'',requestId:req.requestId};},value=>({player:id,request:req.requestId,hash,result:JSON.stringify(value)}));}
  catch(error){if(!(error instanceof GameError)){console.error(JSON.stringify({event:'action_failed',error:String(error)}));client.send('result',{ok:false,text:'The action could not be saved. Reconnect before trying again.',resync:true});return;}
   result=transaction(()=>{engine.state.players[id].seq=req.seq;return {ok:false,text:error.message,requestId:req.requestId};},value=>({player:id,request:req.requestId,hash,result:JSON.stringify(value)}));}
  client.send('result',result);this.sendView(client);this.flushNotices();}
 /** A Studio edit changed this character: show it to them at once. */
 edited(id:string){const p=engine.state.players[id];if(p?.connected)engine.note(p,'Your character was changed in the Studio.');for(const c of this.clients)if(this.bindings.get(c.sessionId)?.id===id)this.sendView(c);this.flushNotices();}
 tick(){if(!Object.values(engine.state.players).some(p=>p.connected||p.combatUntil>engine.state.time))return;const started=performance.now();try{transaction(()=>engine.tick(50),undefined,++ticks%40===0);if(ticks%2===0)for(const c of this.clients)this.sendView(c);this.flushNotices();}catch(error){console.error(JSON.stringify({event:'tick_rolled_back',error:String(error)}));}const elapsed=performance.now()-started;if(elapsed>50)console.warn(JSON.stringify({event:'tick_overrun',ms:Math.round(elapsed)}));}
}
let room:TownRoom|undefined;
const PORT=Number(process.env.PORT??2567);
const app=express();app.get('/health',(_req,res)=>res.json({ok:true,revision:engine.state.revision,players:Object.keys(engine.state.players).length}));
// Studio account editing. The Studio reads this token from .local and proxies to us; nothing else on the machine should get in.
const adminToken=randomBytes(24).toString('hex');
writeFileSync('.local/admin-token',adminToken,{mode:0o600});
app.use('/admin',(req,res,next)=>{const got=Buffer.from(req.get('x-admin-token')??''),want=Buffer.from(adminToken);
 if(req.headers.host!==`127.0.0.1:${PORT}`||got.length!==want.length||!timingSafeEqual(got,want)){res.status(403).json({message:'Not allowed'});return;}next();},express.json({limit:'256kb'}));
const accounts=()=>Object.values(engine.state.players).map(p=>accountOf(engine,p)).sort((a,b)=>a.name.localeCompare(b.name));
app.get('/admin/accounts',(_req,res)=>{res.json(accounts());});
app.put('/admin/accounts/:id',(req,res)=>{const id=String(req.params.id),edit=AccountEdit.safeParse(req.body);
 if(!edit.success){res.status(422).json({message:edit.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')});return;}
 if(!engine.state.players[id]){res.status(404).json({message:'That character no longer exists.'});return;}
 try{transaction(()=>applyAccountEdit(engine,id,edit.data));}
 catch(error){if(error instanceof StaleItems){res.status(409).json({message:error.message});return;}if(error instanceof GameError){res.status(422).json({message:error.message});return;}console.error(JSON.stringify({event:'account_edit_failed',error:String(error)}));res.status(500).json({message:'The edit could not be saved.'});return;}
 console.info(JSON.stringify({event:'account_edited',player:id,fields:Object.keys(edit.data)}));
 room?.edited(id);res.json(accountOf(engine,engine.state.players[id]));});
const server=defineServer({transport:new WebSocketTransport({server:createServer(app)}),rooms:{lanternfall:defineRoom(TownRoom)}});
await server.listen(PORT,'127.0.0.1');
console.info(JSON.stringify({event:'world_ready',port:PORT,map:map.name}));
let closing=false;
function shutdown(){if(closing)return;closing=true;try{persist(engine.state);db.close();}finally{process.exit(0);}}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
