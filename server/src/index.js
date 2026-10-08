import express from 'express';
import cors from 'cors';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import dotenv from 'dotenv';
import {createServer} from 'http';
import {Server} from 'socket.io';
import pg from 'pg';
import {DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';

dotenv.config();
const {Pool}=pg;
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(__dirname,'..');
const DATA_DIR=path.resolve(process.env.DATA_DIR||ROOT);
const DATA=path.join(DATA_DIR,'data.json');
const UPLOADS=path.join(DATA_DIR,'uploads');
const ADMIN_EMAIL=String(process.env.ADMIN_EMAIL||'').trim().toLowerCase();
const ADMIN_PASSWORD=String(process.env.ADMIN_PASSWORD||'');
const SECRET=String(process.env.TOKEN_SECRET||'');
const DATABASE_URL=String(process.env.DATABASE_URL||'');
const GEMINI_API_KEY=String(process.env.GEMINI_API_KEY||'').trim();
const GEMINI_MODEL=String(process.env.GEMINI_MODEL||'gemini-2.5-flash').trim();
const MAX_TOTAL_VIDEO_BYTES=200*1000**3;
const production=process.env.NODE_ENV==='production';
const R2_ACCOUNT_ID=String(process.env.R2_ACCOUNT_ID||'');
const R2_BUCKET=String(process.env.R2_BUCKET||'');
const r2Ready=!!(R2_ACCOUNT_ID&&R2_BUCKET&&process.env.R2_ACCESS_KEY_ID&&process.env.R2_SECRET_ACCESS_KEY);
const aiRequests=new Map();

if(!/^\S+@\S+\.\S+$/.test(ADMIN_EMAIL)||ADMIN_PASSWORD.length<8||SECRET.length<32)throw new Error('Set ADMIN_EMAIL, an ADMIN_PASSWORD of at least 8 characters, and a TOKEN_SECRET of at least 32 characters.');
if(production&&!DATABASE_URL)throw new Error('Production requires a DATABASE_URL for persistent account and chat storage.');

const empty={users:[],videos:[],messages:[],notifications:[],next:{user:1,video:1,message:1,notification:1}};
const pool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:3,idleTimeoutMillis:30000,connectionTimeoutMillis:10000}):null;
const s3=r2Ready?new S3Client({region:'auto',endpoint:`https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY}}):null;
fs.mkdirSync(UPLOADS,{recursive:true});

let db=empty;
let saveQueue=Promise.resolve();
const save=()=>{
  if(!pool){
    fs.writeFileSync(DATA,JSON.stringify(db,null,2));
    return Promise.resolve();
  }
  const snapshot=JSON.stringify(db);
  const write=saveQueue.catch(()=>{}).then(()=>pool.query(
    'INSERT INTO public.krynx_app_state (id,state,updated_at) VALUES (1,$1::jsonb,now()) ON CONFLICT (id) DO UPDATE SET state=EXCLUDED.state,updated_at=now()',
    [snapshot]
  ));
  saveQueue=write;
  return write;
};
const initPersistence=async()=>{
  if(!pool){
    db=fs.existsSync(DATA)?JSON.parse(fs.readFileSync(DATA,'utf8')):empty;
  }else{
    await pool.query('CREATE TABLE IF NOT EXISTS public.krynx_app_state (id SMALLINT PRIMARY KEY CHECK (id=1), state JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const result=await pool.query('SELECT state FROM public.krynx_app_state WHERE id=1');
    if(result.rowCount)db=result.rows[0].state;
  }
  for(const key of Object.keys(empty))if(db[key]===undefined)db[key]=empty[key];
  if(!db.next)db.next={...empty.next};
  for(const key of Object.keys(empty.next))if(!Number.isInteger(db.next[key]))db.next[key]=empty.next[key];
};
const now=()=>new Date().toISOString();
const hashPassword=p=>{const salt=crypto.randomBytes(16).toString('hex');const hash=crypto.scryptSync(String(p),salt,64).toString('hex');return `scrypt:${salt}:${hash}`};
const verifyPassword=(p,stored)=>{try{const [,salt,hash]=String(stored).split(':');if(!salt||!hash)return false;const a=Buffer.from(hash,'hex');const b=crypto.scryptSync(String(p),salt,64);return a.length===b.length&&crypto.timingSafeEqual(a,b)}catch{return false}};
const tokenFor=id=>{const body=Buffer.from(JSON.stringify({id,exp:Date.now()+7*86400000})).toString('base64url');const sig=crypto.createHmac('sha256',SECRET).update(body).digest('base64url');return `${body}.${sig}`};
const userPublic=u=>({id:u.id,email:u.email,name:u.name,username:u.username,avatar:u.avatar||'',role:u.role,created_at:u.created_at});
const decodeToken=t=>{const [body,sig]=String(t||'').split('.');if(!body||!sig)return null;const expected=crypto.createHmac('sha256',SECRET).update(body).digest('base64url');if(sig.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;const p=JSON.parse(Buffer.from(body,'base64url').toString());return p.exp>Date.now()?p:null};
const asyncRoute=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);

const objectUrl=async(key,downloadName='')=>{
  if(!s3)return `/uploads/${encodeURIComponent(path.basename(key))}`;
  const getCommand=new GetObjectCommand({
    Bucket:R2_BUCKET,Key:key,
    ...(downloadName?{ResponseContentDisposition:`attachment; filename="${String(downloadName).replace(/["\\\r\n]/g,'_')}"`}:{})
  });
  return getSignedUrl(s3,getCommand,{expiresIn:43200});
};
const videoView=async v=>({...v,...(v.storage_key?{source:await objectUrl(v.storage_key)}:{}),uploader_name:db.users.find(u=>u.id===v.uploader_id)?.name||'Unknown',uploader_username:db.users.find(u=>u.id===v.uploader_id)?.username||'unknown',uploader_avatar:db.users.find(u=>u.id===v.uploader_id)?.avatar||''});
const messageView=async m=>({...m,...(m.attachment_key?{attachment_url:await objectUrl(m.attachment_key,m.attachment_name)}:{}),...(()=>{const u=db.users.find(x=>x.id===m.user_id)||{};return{name:u.name,username:u.username,avatar:u.avatar||'',role:u.role}})()});
const removeObject=async key=>{
  if(s3)await s3.send(new DeleteObjectCommand({Bucket:R2_BUCKET,Key:key}));
  else fs.rmSync(path.join(UPLOADS,path.basename(key)),{force:true});
};
const removeUserObjects=async id=>{
  const keys=[
    ...db.videos.filter(v=>v.uploader_id===id&&v.storage_key).map(v=>v.storage_key),
    ...db.messages.filter(m=>m.user_id===id&&m.attachment_key).map(m=>m.attachment_key)
  ];
  if(s3)await Promise.all(keys.map(key=>removeObject(key)));
  else for(const key of keys)await removeObject(key);
};

await initPersistence();
let admin=db.users.find(u=>u.email===ADMIN_EMAIL);
if(!admin){
  admin={id:db.next.user++,email:ADMIN_EMAIL,password:hashPassword(ADMIN_PASSWORD),name:'KRYNX Admin',username:'krynx_admin',avatar:'',role:'admin',created_at:now()};
  db.users.push(admin);
  await save();
}else{
  admin.role='admin';
  admin.password=hashPassword(ADMIN_PASSWORD);
  await save();
}

const app=express();
const server=createServer(app);
const io=new Server(server,{cors:{origin:process.env.CLIENT_URL||true,credentials:true}});
app.use(cors({origin:process.env.CLIENT_URL||true,credentials:true}));
app.use(express.json({limit:'20mb'}));
app.use('/uploads',express.static(UPLOADS));

const videoUpload=multer({storage:multer.diskStorage({destination:UPLOADS,filename:(r,f,cb)=>cb(null,`${Date.now()}-${crypto.randomBytes(5).toString('hex')}${path.extname(f.originalname)}`)}),limits:{fileSize:1024*1024*1024},fileFilter:(r,f,cb)=>cb(null,!!f.mimetype?.startsWith('video/'))});
const fileUpload=multer({storage:multer.diskStorage({destination:UPLOADS,filename:(r,f,cb)=>cb(null,`${Date.now()}-${crypto.randomBytes(5).toString('hex')}${path.extname(f.originalname)}`)}),limits:{fileSize:50*1024*1024}});
const auth=(req,res,next)=>{try{const p=decodeToken((req.headers.authorization||'').replace(/^Bearer\s+/i,''));const u=p&&db.users.find(x=>x.id===p.id);if(!u)throw new Error('Invalid session');req.user=u;next()}catch{res.status(401).json({error:'Session expired. Please log in again.'})}};
const adminOnly=(req,res,next)=>req.user?.role==='admin'?next():res.status(403).json({error:'Admin access required'});
const notifyAdmins=async(actorId,message,type='profile')=>{
  for(const u of db.users.filter(x=>x.role==='admin'))db.notifications.push({id:db.next.notification++,user_id:u.id,actor_id:actorId,type,message,created_at:now(),read_at:null});
  await save();
  io.emit('notification:new');
};
const emitVideo=async(event,v)=>io.emit(event,await videoView(v));
const safeTitle=(value,fallback)=>String(value||fallback).trim().slice(0,200);
const safeDescription=value=>String(value||'').trim().slice(0,5000);

app.get('/api/health',asyncRoute(async(req,res)=>{
  if(pool)await pool.query('SELECT 1');
  res.json({ok:true,service:'KRYNX Video Vault',time:now(),persistentDatabase:!!pool,objectStorage:!!s3});
}));
app.get('/api/storage/config',(req,res)=>res.json({directUploads:!!s3,fileUploads:!production||!!s3}));
app.post('/api/ai/chat',auth,asyncRoute(async(req,res)=>{
  if(!GEMINI_API_KEY)return res.status(503).json({error:'AI Buddy is not configured yet. Add GEMINI_API_KEY to the Render service environment.'});
  const messages=req.body.messages;
  if(!Array.isArray(messages)||messages.length<1||messages.length>12)return res.status(400).json({error:'Send between 1 and 12 recent chat messages.'});
  const normalized=[];
  let totalLength=0;
  for(const message of messages){
    if(!message||!['user','assistant'].includes(message.role)||typeof message.content!=='string')return res.status(400).json({error:'The chat history contains an invalid message.'});
    const content=message.content.trim();
    if(!content||content.length>4000)return res.status(400).json({error:'Each message must contain 1 to 4,000 characters.'});
    totalLength+=content.length;
    if(totalLength>12000)return res.status(400).json({error:'The recent chat history is too long. Start a new chat and try again.'});
    normalized.push({role:message.role,content});
  }
  if(normalized.at(-1).role!=='user')return res.status(400).json({error:'The latest chat message must be from you.'});
  const windowStart=Date.now()-60_000;
  const recent=(aiRequests.get(req.user.id)||[]).filter(time=>time>windowStart);
  if(recent.length>=10)return res.status(429).json({error:'You have reached the AI Buddy limit of 10 messages per minute. Please wait and try again.'});
  recent.push(Date.now());
  aiRequests.set(req.user.id,recent);
  if(aiRequests.size>1000)for(const [id,times] of aiRequests)if(!times.some(time=>time>windowStart))aiRequests.delete(id);

  let response;
  try{
    response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,{
      method:'POST',
      headers:{'x-goog-api-key':GEMINI_API_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({
        systemInstruction:{parts:[{text:'You are KRYNX AI Buddy, a friendly, thoughtful, conversational study and everyday assistant. Respond naturally to greetings and general conversation, answer questions directly, explain concepts clearly, and adapt detail to the user’s request. For learning questions, support understanding with examples and optional practice questions. Do not insist that the user consult vault resources unless relevant. You cannot see or search the user’s private vault, class chat, or account data unless it is explicitly included in the conversation. Be honest about uncertainty and capabilities. Keep responses clear and reasonably concise.'}]},
        contents:normalized.map(message=>({role:message.role==='assistant'?'model':'user',parts:[{text:message.content}]})),
        generationConfig:{maxOutputTokens:700,temperature:0.7}
      }),
      signal:AbortSignal.timeout(30_000)
    });
  }catch(error){
    if(error.name==='TimeoutError')return res.status(504).json({error:'The AI Buddy took too long to respond. Please try again.'});
    console.error('Could not reach Gemini:',error.message);
    return res.status(502).json({error:'Could not reach the AI service. Please try again shortly.'});
  }
  const result=await response.json().catch(()=>null);
  if(!response.ok){
    if(response.status===429||result?.error?.status==='RESOURCE_EXHAUSTED')return res.status(429).json({error:'Gemini has reached its current rate or usage limit. Please wait and try again later, or check the API key’s quota.'});
    if(response.status===401||response.status===403||result?.error?.status==='PERMISSION_DENIED'||result?.error?.status==='INVALID_ARGUMENT'){
      console.error('Gemini rejected its API configuration:',response.status,result?.error?.status||'unknown provider error');
      return res.status(502).json({error:'Gemini rejected its API configuration. Check that GEMINI_API_KEY is valid and Gemini API access is enabled.'});
    }
    console.error('Gemini chat request failed:',response.status,result?.error?.status||'unknown provider error');
    return res.status(502).json({error:'The AI Buddy could not get a response right now. Please try again shortly.'});
  }
  const reply=result?.candidates?.[0]?.content?.parts?.map(part=>part.text||'').join('').trim();
  if(!reply)return res.status(502).json({error:'Gemini returned no text response. Please rephrase your message and try again.'});
  res.json({reply});
}));

app.post('/api/auth/register',asyncRoute(async(req,res)=>{
  const email=String(req.body.email||'').trim().toLowerCase(),password=String(req.body.password||''),name=String(req.body.name||'').trim(),username=String(req.body.username||'').trim().replace(/^@/,'').toLowerCase();
  if(!/^\S+@\S+\.\S+$/.test(email))return res.status(400).json({error:'Enter a valid email address.'});
  if(password.length<6)return res.status(400).json({error:'Password must be at least 6 characters.'});
  if(!name||name.length<2)return res.status(400).json({error:'Enter your full name.'});
  if(!/^[a-z0-9_.-]{3,20}$/.test(username))return res.status(400).json({error:'Username must be 3–20 characters: letters, numbers, _, ., -'});
  if(email===ADMIN_EMAIL)return res.status(400).json({error:'That email belongs to the admin account.'});
  if(db.users.some(u=>u.email===email))return res.status(409).json({error:'An account with this email already exists. Try Login.'});
  if(db.users.some(u=>u.username===username))return res.status(409).json({error:'That username is already taken.'});
  const u={id:db.next.user++,email,password:hashPassword(password),name,username,avatar:'',role:'user',created_at:now()};
  db.users.push(u);await save();res.json({token:tokenFor(u.id),user:userPublic(u)});
}));
app.post('/api/auth/login',(req,res)=>{
  const email=String(req.body.email||'').trim().toLowerCase(),password=String(req.body.password||''),u=db.users.find(x=>x.email===email);
  if(!u||!verifyPassword(password,u.password))return res.status(401).json({error:'Wrong email or password. If you are new, create an account below.'});
  res.json({token:tokenFor(u.id),user:userPublic(u)});
});
app.get('/api/me',auth,(req,res)=>res.json(userPublic(req.user)));
app.put('/api/me',auth,asyncRoute(async(req,res)=>{
  const name=String(req.body.name||'').trim(),username=String(req.body.username||'').trim().replace(/^@/,'').toLowerCase(),avatar=String(req.body.avatar||'').trim();
  if(!name||!username)return res.status(400).json({error:'Name and username are required.'});
  if(db.users.some(u=>u.username===username&&u.id!==req.user.id))return res.status(409).json({error:'Username already taken.'});
  const old={...req.user};Object.assign(req.user,{name,username,avatar});await save();
  if(old.name!==name)await notifyAdmins(req.user.id,`@${old.username} changed name from “${old.name}” to “${name}”.`);
  if(old.username!==username)await notifyAdmins(req.user.id,`A user changed username from @${old.username} to @${username}.`);
  if(old.avatar!==avatar)await notifyAdmins(req.user.id,`@${username} changed their profile picture.`);
  res.json(userPublic(req.user));
}));
app.put('/api/me/password',auth,asyncRoute(async(req,res)=>{
  if(req.user.role==='admin')return res.status(403).json({error:'Admin password is controlled by the server.'});
  const {currentPassword,newPassword}=req.body;
  if(!verifyPassword(currentPassword,req.user.password))return res.status(400).json({error:'Current password is incorrect.'});
  if(String(newPassword||'').length<6)return res.status(400).json({error:'New password must be at least 6 characters.'});
  req.user.password=hashPassword(newPassword);await save();
  await notifyAdmins(req.user.id,`@${req.user.username} changed their password. Password values are never shown.`,'password');res.json({ok:true});
}));

app.post('/api/storage/upload-url',auth,asyncRoute(async(req,res)=>{
  if(!s3)return res.status(503).json({error:'Direct cloud uploads are not configured.'});
  const purpose=req.body.purpose==='chat'?'chat':'video',size=Number(req.body.size),contentType=String(req.body.contentType||'application/octet-stream').slice(0,200);
  const limit=purpose==='chat'?50*1024*1024:1024*1024*1024;
  if(!Number.isSafeInteger(size)||size<1||size>limit)return res.status(400).json({error:`File exceeds the ${purpose==='chat'?'50MB attachment':'1GB video'} limit.`});
  if(purpose==='video'&&!contentType.startsWith('video/'))return res.status(400).json({error:'Choose a valid video file.'});
  const usedBytes=db.videos.reduce((total,video)=>total+(video.file_size||0),0);
  if(purpose==='video'&&usedBytes+size>MAX_TOTAL_VIDEO_BYTES)return res.status(413).json({error:'The vault has reached its 200GB video storage limit. Delete an existing video before adding another.'});
  const extension=path.extname(String(req.body.fileName||'')).toLowerCase().replace(/[^.a-z0-9]/g,'').slice(0,12);
  const key=`${purpose==='video'?'videos':'attachments'}/${req.user.id}/${crypto.randomUUID()}${extension}`;
  const command=new PutObjectCommand({Bucket:R2_BUCKET,Key:key,ContentType:contentType,Metadata:{owner:String(req.user.id),purpose,size:String(size)}});
  res.json({key,contentType,headers:{'Content-Type':contentType,'x-amz-meta-owner':String(req.user.id),'x-amz-meta-purpose':purpose,'x-amz-meta-size':String(size)},uploadUrl:await getSignedUrl(s3,command,{expiresIn:3600})});
}));

app.get('/api/videos',auth,asyncRoute(async(req,res)=>{
  res.json(await Promise.all(db.videos.slice().sort((a,b)=>b.created_at.localeCompare(a.created_at)).map(videoView)));
}));
app.post('/api/videos/upload',auth,(req,res,next)=>{
  if(production)return res.status(410).json({error:'Direct video uploads are unavailable on this free deployment. Add an unlisted YouTube link instead.'});
  videoUpload.single('video')(req,res,err=>{
  if(err)return res.status(400).json({error:err.code==='LIMIT_FILE_SIZE'?'Video exceeds the 1GB limit.':err.message});
  if(!req.file)return res.status(400).json({error:'Choose a video file first.'});
  void (async()=>{
    const key=req.file.filename;
    const v={id:db.next.video++,title:safeTitle(req.body.title,req.file.originalname),description:safeDescription(req.body.description),source_type:'file',source:`/uploads/${key}`,original_name:req.file.originalname,file_size:req.file.size,uploader_id:req.user.id,created_at:now()};
    db.videos.push(v);await save();const view=await videoView(v);io.emit('video:new',view);res.json(view);
  })().catch(next);
  });
});
app.post('/api/videos/upload-complete',auth,asyncRoute(async(req,res)=>{
  const key=String(req.body.key||''),prefix=`videos/${req.user.id}/`;
  if(!s3||!key.startsWith(prefix)||key.includes('..'))return res.status(400).json({error:'Invalid video upload.'});
  const head=await s3.send(new HeadObjectCommand({Bucket:R2_BUCKET,Key:key}));
  if(head.Metadata?.owner!==String(req.user.id)||head.Metadata?.purpose!=='video'||head.Metadata?.size!==String(head.ContentLength)||!head.ContentType?.startsWith('video/')||!head.ContentLength||head.ContentLength>1024*1024*1024)return res.status(400).json({error:'Uploaded video is invalid or exceeds the 1GB limit.'});
  if(db.videos.some(video=>video.storage_key===key))return res.status(409).json({error:'That uploaded video has already been added.'});
  const usedBytes=db.videos.reduce((total,video)=>total+(video.file_size||0),0);
  if(usedBytes+head.ContentLength>MAX_TOTAL_VIDEO_BYTES){await removeObject(key);return res.status(413).json({error:'The vault has reached its 200GB video storage limit. Delete an existing video before adding another.'})}
  const originalName=String(req.body.originalName||'video').slice(0,255);
  const v={id:db.next.video++,title:safeTitle(req.body.title,originalName),description:safeDescription(req.body.description),source_type:'file',source:key,storage_key:key,original_name:originalName,file_size:head.ContentLength,uploader_id:req.user.id,created_at:now()};
  db.videos.push(v);await save();const view=await videoView(v);io.emit('video:new',view);res.json(view);
}));
app.post('/api/videos/link',auth,asyncRoute(async(req,res)=>{
  let url;
  try{url=new URL(String(req.body.url||'').trim())}catch{return res.status(400).json({error:'Enter a valid http(s) URL.'})}
  if(!['http:','https:'].includes(url.protocol))return res.status(400).json({error:'Enter a valid http(s) URL.'});
  const v={id:db.next.video++,title:safeTitle(req.body.title,url.hostname),description:safeDescription(req.body.description),source_type:'link',source:url.toString(),original_name:'',uploader_id:req.user.id,created_at:now()};
  db.videos.push(v);await save();const view=await videoView(v);io.emit('video:new',view);res.json(view);
}));
const deleteVideo=async(req,res)=>{
  const id=Number(req.params.id),v=db.videos.find(x=>x.id===id);
  if(!v)return res.status(404).json({error:'Video not found.'});
  if(req.user.role!=='admin'&&v.uploader_id!==req.user.id)return res.status(403).json({error:'You can delete only your own videos.'});
  if(v.storage_key)await removeObject(v.storage_key);
  else if(v.source_type==='file')await removeObject(v.source);
  db.videos=db.videos.filter(x=>x.id!==id);await save();io.emit('video:deleted',id);res.json({ok:true});
};
app.delete('/api/videos/:id',auth,asyncRoute(deleteVideo));
app.delete('/api/admin/videos/:id',auth,adminOnly,asyncRoute(deleteVideo));

app.get('/api/chat/messages',auth,asyncRoute(async(req,res)=>{
  res.json(await Promise.all(db.messages.slice(-100).map(messageView)));
}));
app.post('/api/chat/message',auth,asyncRoute(async(req,res)=>{
  const text=String(req.body.text||'').trim();
  if(!text)return res.status(400).json({error:'Message is empty.'});
  const m={id:db.next.message++,user_id:req.user.id,text,attachment_name:'',attachment_url:'',created_at:now()};
  db.messages.push(m);await save();const view=await messageView(m);io.emit('chat:new',view);res.json(view);
}));
app.post('/api/chat/attachment',auth,(req,res,next)=>{
  if(production)return res.status(410).json({error:'Chat file attachments are unavailable on this free deployment. Share a link in chat instead.'});
  fileUpload.single('file')(req,res,err=>{
  if(err)return res.status(400).json({error:'Attachment is too large or invalid.'});
  if(!req.file)return res.status(400).json({error:'Choose a file.'});
  void (async()=>{
    const key=req.file.filename,m={id:db.next.message++,user_id:req.user.id,text:String(req.body.text||'').trim(),attachment_name:req.file.originalname,attachment_url:`/uploads/${key}`,created_at:now()};
    db.messages.push(m);await save();const view=await messageView(m);io.emit('chat:new',view);res.json(view);
  })().catch(next);
  });
});
app.post('/api/chat/attachment-complete',auth,asyncRoute(async(req,res)=>{
  const key=String(req.body.key||''),prefix=`attachments/${req.user.id}/`;
  if(!s3||!key.startsWith(prefix)||key.includes('..'))return res.status(400).json({error:'Invalid attachment upload.'});
  const head=await s3.send(new HeadObjectCommand({Bucket:R2_BUCKET,Key:key}));
  if(head.Metadata?.owner!==String(req.user.id)||head.Metadata?.purpose!=='chat'||head.Metadata?.size!==String(head.ContentLength)||!head.ContentLength||head.ContentLength>50*1024*1024)return res.status(400).json({error:'Attachment is invalid or exceeds the 50MB limit.'});
  if(db.messages.some(message=>message.attachment_key===key))return res.status(409).json({error:'That attachment has already been added.'});
  const m={id:db.next.message++,user_id:req.user.id,text:String(req.body.text||'').trim(),attachment_name:String(req.body.originalName||'attachment').slice(0,255),attachment_url:'',attachment_key:key,created_at:now()};
  db.messages.push(m);await save();const view=await messageView(m);io.emit('chat:new',view);res.json(view);
}));

app.get('/api/admin/stats',auth,adminOnly,(req,res)=>res.json({users:db.users.length,videos:db.videos.length,admins:db.users.filter(u=>u.role==='admin').length,messages:db.messages.length}));
app.get('/api/admin/users',auth,adminOnly,(req,res)=>res.json(db.users.map(u=>({...userPublic(u),video_count:db.videos.filter(v=>v.uploader_id===u.id).length}))));
app.post('/api/admin/users',auth,adminOnly,asyncRoute(async(req,res)=>{
  const email=String(req.body.email||'').trim().toLowerCase(),password=String(req.body.password||''),name=String(req.body.name||email.split('@')[0]||'').trim();
  if(!/^\S+@\S+\.\S+$/.test(email))return res.status(400).json({error:'Enter a valid email address.'});
  if(password.length<6)return res.status(400).json({error:'Password must be at least 6 characters.'});
  if(name.length<2)return res.status(400).json({error:'Name must be at least 2 characters.'});
  if(db.users.some(u=>u.email===email))return res.status(409).json({error:'An account with this email already exists.'});
  let username=String(req.body.username||email.split('@')[0]).trim().replace(/^@/,'').toLowerCase().replace(/[^a-z0-9_.-]/g,'').slice(0,20);
  if(username.length<3)return res.status(400).json({error:'Username must contain at least 3 valid characters.'});
  if(db.users.some(u=>u.username===username)){const base=username.slice(0,16);let suffix=1;while(db.users.some(u=>u.username===`${base}${suffix}`))suffix++;username=`${base}${suffix}`}
  const u={id:db.next.user++,email,password:hashPassword(password),name,username,avatar:'',role:'user',created_at:now()};
  db.users.push(u);await save();res.status(201).json(userPublic(u));
}));
app.put('/api/admin/users/:id/password',auth,adminOnly,asyncRoute(async(req,res)=>{
  const u=db.users.find(x=>x.id===Number(req.params.id));
  if(!u)return res.status(404).json({error:'User not found.'});
  if(u.role==='admin')return res.status(403).json({error:'Admin passwords are managed by the server.'});
  const password=String(req.body.password||'');
  if(password.length<6)return res.status(400).json({error:'Password must be at least 6 characters.'});
  u.password=hashPassword(password);await save();await notifyAdmins(req.user.id,`Admin reset the password for @${u.username}. Password values are never shown.`,'password');res.json({ok:true});
}));
app.patch('/api/admin/users/:id/role',auth,adminOnly,asyncRoute(async(req,res)=>{
  const u=db.users.find(x=>x.id===Number(req.params.id));
  if(!u)return res.status(404).json({error:'User not found.'});
  if(u.id===req.user.id)return res.status(400).json({error:'You cannot change your own role.'});
  const role=req.body.role==='admin'?'admin':'user';u.role=role;await save();await notifyAdmins(req.user.id,`Admin changed @${u.username} to ${role}.`,'role');res.json(userPublic(u));
}));
app.delete('/api/admin/users/:id',auth,adminOnly,asyncRoute(async(req,res)=>{
  const id=Number(req.params.id);
  if(id===req.user.id)return res.status(400).json({error:'You cannot delete yourself.'});
  const u=db.users.find(x=>x.id===id);
  if(!u)return res.status(404).json({error:'User not found.'});
  await removeUserObjects(id);
  db.users=db.users.filter(x=>x.id!==id);db.videos=db.videos.filter(v=>v.uploader_id!==id);db.messages=db.messages.filter(m=>m.user_id!==id);
  await save();res.json({ok:true});
}));
app.get('/api/notifications',auth,adminOnly,(req,res)=>res.json(db.notifications.filter(n=>n.user_id===req.user.id).sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,100)));

const online=new Map();
io.on('connection',socket=>{
  socket.on('presence:join',u=>{if(!u?.id)return;online.set(u.id,{...u});io.emit('presence:list',[...online.values()])});
  socket.on('presence:leave',id=>{online.delete(Number(id));io.emit('presence:list',[...online.values()])});
  socket.on('disconnect',()=>{});
});

app.use((err,req,res,next)=>{
  console.error(err);
  if(!res.headersSent)res.status(500).json({error:'Server error. Check the server logs for details.'});
});
const dist=path.join(ROOT,'..','client','dist');
if(fs.existsSync(dist)){app.use(express.static(dist));app.get('*',(req,res)=>{if(!req.path.startsWith('/api'))res.sendFile(path.join(dist,'index.html'))})}
const PORT=Number(process.env.PORT||5001);
server.listen(PORT,'0.0.0.0',()=>console.log(`\nKRYNX Video Vault running on port ${PORT}\nStorage: ${pool?'Supabase Postgres':'local JSON'} / ${s3?'Cloudflare R2':'local disk'}\n`));

const close=async()=>{
  server.close();
  if(pool)await pool.end();
  if(s3)s3.destroy();
};
process.on('SIGTERM',()=>{void close()});
process.on('SIGINT',()=>{void close()});
