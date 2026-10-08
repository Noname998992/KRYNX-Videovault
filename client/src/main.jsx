import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import axios from 'axios';
import {io} from 'socket.io-client';
import {Upload,Video,MessageCircle,UserCircle,Shield,Search,Play,Pause,Volume2,VolumeX,Maximize,Trash2,Send,Paperclip,LogOut,Users,Lock,Link as LinkIcon,Menu,X,Bot,Bell,Download,UserCog,LayoutDashboard,RefreshCw} from 'lucide-react';
import './styles.css';
import './wallpaper.css';

const api=axios.create({baseURL:''});
api.interceptors.request.use(c=>{const t=localStorage.getItem('krynx_token');if(t)c.headers.Authorization=`Bearer ${t}`;return c});
const socket=io({autoConnect:false});
const uploadToCloud=(url,file,headers,onProgress)=>new Promise((resolve,reject)=>{
  const request=new XMLHttpRequest();
  request.open('PUT',url);
  for(const [name,value] of Object.entries(headers||{}))request.setRequestHeader(name,value);
  request.upload.onprogress=event=>{if(event.lengthComputable)onProgress(Math.round(event.loaded/event.total*100))};
  request.onload=()=>request.status>=200&&request.status<300?resolve():reject(new Error(`Cloud upload failed (${request.status}).`));
  request.onerror=()=>reject(new Error('Cloud upload failed. Check your connection and try again.'));
  request.onabort=()=>reject(new Error('Cloud upload was cancelled.'));
  request.send(file);
});
const externalUrl=value=>{try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:null}catch{return null}};
const formatTime=value=>{if(!Number.isFinite(value))return '0:00';const seconds=Math.floor(value);return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`};
const linkPlayer=value=>{
  const href=externalUrl(value);
  if(!href)return null;
  const url=new URL(href);
  const host=url.hostname.toLowerCase().replace(/^www\./,'');
  const videoFile=/\.(?:mp4|webm|ogg|ogv|m4v|mov)$/i.test(url.pathname);
  if(videoFile)return {type:'video',src:href};
  if(host==='youtu.be'){
    const id=url.pathname.split('/').filter(Boolean)[0];
    if(id)return {type:'embed',src:`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}${url.searchParams.has('start')?`?start=${encodeURIComponent(url.searchParams.get('start'))}`:''}`};
  }
  if(host==='youtube.com'||host.endsWith('.youtube.com')){
    const id=url.searchParams.get('v')||url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1];
    if(id){
      const params=new URLSearchParams();
      for(const key of ['start','list','index'])if(url.searchParams.has(key))params.set(key,url.searchParams.get(key));
      const query=params.size?`?${params}`:'';
      return {type:'embed',src:`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}${query}`};
    }
    const playlist=url.searchParams.get('list');
    if(playlist)return {type:'embed',src:`https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(playlist)}`};
  }
  if(host==='vimeo.com'||host.endsWith('.vimeo.com')){
    const id=url.pathname.match(/\/(\d+)(?:$|\/)/)?.[1];
    if(id)return {type:'embed',src:`https://player.vimeo.com/video/${id}`};
  }
  if(host==='dailymotion.com'){
    const id=url.pathname.match(/\/(?:video|embed\/video)\/([a-zA-Z0-9]+)/)?.[1];
    if(id)return {type:'embed',src:`https://www.dailymotion.com/embed/video/${encodeURIComponent(id)}`};
  }
  if(host==='twitch.tv'||host==='clips.twitch.tv'){
    const clip=host==='clips.twitch.tv'?url.pathname.split('/').filter(Boolean)[0]:url.pathname.match(/\/clip\/([^/?]+)/)?.[1];
    const video=url.pathname.match(/\/videos\/(\d+)/)?.[1];
    const channel=url.pathname.match(/^\/([a-zA-Z0-9_]+)\/?$/)?.[1];
    const params=new URLSearchParams({parent:window.location.hostname});
    if(clip)params.set('clip',clip);
    else if(video)params.set('video',`v${video}`);
    else if(channel)params.set('channel',channel);
    if(clip||video||channel)return {type:'embed',src:`https://player.twitch.tv/?${params}`};
  }
  if(host==='drive.google.com'){
    const id=url.pathname.match(/\/file\/d\/([^/]+)/)?.[1];
    if(id)return {type:'embed',src:`https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`};
  }
  if(host==='tiktok.com'||host.endsWith('.tiktok.com')){
    const id=url.pathname.match(/\/video\/(\d+)/)?.[1];
    if(id)return {type:'embed',src:`https://www.tiktok.com/embed/v2/${id}`};
  }
  return {type:'page',src:href};
};
const pics=[
  'asta-black-clover-3840x2160-11213.png',
  'asta-demon-black-3840x2160-11222.png',
  'black-asta-black-3840x2160-22972.jpg',
  'dandadan-evil-eye-3840x2160-22717.jpg',
  'demon-slayer-3840x2160-23652.jpg',
  'devil-may-cry-3840x2160-26087.png',
  'fire-force-shinra-3840x2160-24851.jpg',
  'gachiakuta-season-2-3840x2160-26936.jpg',
  'izuku-midoriya-5120x2880-25013.jpg',
  'jujutsu-kaisen-3840x2160-27211.png',
  'kafka-hibino-5120x2880-26033.jpg',
  'kaiju-no-8-anime-7680x4320-24391.jpg',
  'lord-of-mysteries-3840x2160-26428.jpg',
  'monkey-d-luffy-3840x2160-25434.jpg',
  'monkey-d-luffy-3840x2160-26035.jpg',
  'okarun-ken-takakura-3840x2160-26023.jpg',
  'one-piece-anime-3840x2160-20908.jpg',
  'power-chainsaw-man-3840x2160-27164.jpg',
  'rudo-surebrec-5120x2880-26037.jpg',
  'saitama-genos-one-3840x2160-27162.jpg',
  'satoru-gojo-kento-3840x2160-27151.jpg',
  'trafalgar-law-logo-3840x2160-15258.jpg',
  'zeff-one-piece-logo-3840x2160-18637.jpg',
  'zenitsu-agatsuma-3840x2160-26521.jpg',
  'zenitsu-agatsuma-5120x2880-26520.jpg'
];
const fmt=d=>new Date(d).toLocaleString();

function Backdrop(){const [i,setI]=useState(0);useEffect(()=>{const id=setInterval(()=>setI(x=>(x+1)%pics.length),6500);return()=>clearInterval(id)},[]);return <div className="backdrop"><div key={pics[i]} className="bgslide show" style={{backgroundImage:`url('/wallpapers/${encodeURIComponent(pics[i])}')`}}/><div className="bgshade"/><div className="bglight one"/><div className="bglight two"/></div>}

function App(){const [user,setUser]=useState(null),[mode,setMode]=useState('login'),[boot,setBoot]=useState(true);useEffect(()=>{const t=localStorage.getItem('krynx_token');if(!t){setBoot(false);return}api.get('/api/me').then(r=>setUser(r.data)).catch(()=>localStorage.removeItem('krynx_token')).finally(()=>setBoot(false))},[]);if(boot)return <><Backdrop/><div className="loader"><div className="logo">K</div><b>Opening the Vault…</b><span>Checking your session</span></div></>;return <><Backdrop/>{user?<Dashboard user={user} setUser={setUser}/>:<Auth mode={mode} setMode={setMode} onLogin={setUser}/>}</>}

function Auth({mode,setMode,onLogin}){const [f,setF]=useState({email:'',password:'',name:'',username:''}),[err,setErr]=useState(''),[busy,setBusy]=useState(false),[ok,setOk]=useState('');const submit=async e=>{e.preventDefault();setErr('');setOk('');setBusy(true);try{const body={...f,email:f.email.trim().toLowerCase(),username:f.username.trim().replace(/^@/,'').toLowerCase()};const r=await api.post(mode==='login'?'/api/auth/login':'/api/auth/register',body);localStorage.setItem('krynx_token',r.data.token);onLogin(r.data.user)}catch(e){setErr(e.response?.data?.error||'Cannot connect to the server. Start it with npm run dev.')}finally{setBusy(false)}};return <main className="auth"><section className="authcard"><div className="brand"><div className="mark">K</div><div><b>KRYNX</b><small>VIDEO VAULT</small></div></div><div className="eyebrow">STUDENT CREATOR NETWORK</div><h1>{mode==='login'?'Enter the Vault':'Create your account'}</h1><p className="lead">{mode==='login'?'Private storage. Shared learning. Zero chaos.':'Create your personal space for educational videos.'}</p><form onSubmit={submit}>{mode==='register'&&<><input placeholder="Full name" value={f.name} onChange={e=>setF({...f,name:e.target.value})} required/><input placeholder="Username (3–20 chars)" value={f.username} onChange={e=>setF({...f,username:e.target.value})} required/></>}<input type="email" autoComplete="email" placeholder="Email" value={f.email} onChange={e=>setF({...f,email:e.target.value})} required/><input type="password" autoComplete={mode==='login'?'current-password':'new-password'} placeholder="Password" value={f.password} onChange={e=>setF({...f,password:e.target.value})} required/>{err&&<div className="alert">{err}</div>}{ok&&<div className="success">{ok}</div>}<button className="cta" disabled={busy}>{busy?'CONNECTING…':mode==='login'?'LOGIN':'CREATE ACCOUNT'}</button></form><div className="switch">{mode==='login'?<>New user? <button onClick={()=>{setMode('register');setErr('');setF({email:'',password:'',name:'',username:''})}}>Create account</button></>:<>Already registered? <button onClick={()=>{setMode('login');setErr('');setF({email:'',password:'',name:'',username:''})}}>Login</button></>}</div><div className="demo">Sign in with credentials provided by your administrator.</div></section></main>}

function Dashboard({user,setUser}){
  const [tab,setTab]=useState(user.role==='admin'?'home':'videos'),[mobile,setMobile]=useState(false);
  const logout=()=>{localStorage.removeItem('krynx_token');setUser(null)};
  const items=[['home','Dashboard',LayoutDashboard],['videos','Video Vault',Video],['upload','Upload',Upload],['chat','Class Chat',MessageCircle],['profile','Profile',UserCircle],['ai','AI Buddy',Bot]];
  if(user.role==='admin')items.push(['admin','Admin Console',Shield]);
  useEffect(()=>{
    if(!mobile)return;
    const closeOnEscape=e=>{if(e.key==='Escape')setMobile(false)};
    window.addEventListener('keydown',closeOnEscape);
    return()=>window.removeEventListener('keydown',closeOnEscape);
  },[mobile]);
  return <div className="app">
    {mobile&&<button className="menuScrim" aria-label="Close navigation menu" onClick={()=>setMobile(false)}/>}
    <aside className={mobile?'side open':'side'}>
      <div className="sidebrand"><div className="mark">K</div><div><b>KRYNX</b><small>VIDEO VAULT</small></div></div>
      <div className="sideuser"><div className="avatar">{user.avatar?<img src={user.avatar}/>:user.name[0]}</div><div><b>{user.name}</b><span>@{user.username}</span></div></div>
      <nav>{items.map(([id,label,I])=><button className={tab===id?'active':''} onClick={()=>{setTab(id);setMobile(false)}} key={id}><I size={18}/>{label}</button>)}</nav>
      <button className="logout" onClick={logout}><LogOut size={17}/>Logout</button>
    </aside>
    <main className="main">
      <header>
        <button className="menubtn" type="button" aria-label={mobile?'Close menu':'Open menu'} aria-expanded={mobile} onClick={()=>setMobile(open=>!open)}>{mobile?<X size={21}/>:<Menu size={21}/>}</button>
        <div><span className="crumb">KRYNX / {tab.toUpperCase()}</span><h2>{tab==='home'?'Command Center':tab==='videos'?'Video Vault':tab==='upload'?'Upload Resource':tab==='chat'?'Class Chat':tab==='profile'?'Your Profile':tab==='ai'?'AI Buddy':'Admin Console'}</h2></div>
        <div className="headuser"><div className="onlineDot"/> <span>{user.role}</span></div>
      </header>
      {tab==='home'&&<Home user={user} setTab={setTab}/>} {tab==='videos'&&<Videos user={user}/>} {tab==='upload'&&<UploadPage setTab={setTab}/>} {tab==='chat'&&<Chat user={user}/>} {tab==='profile'&&<Profile user={user} setUser={setUser}/>} {tab==='ai'&&<AI user={user}/>} {tab==='admin'&&<Admin user={user}/>}
    </main>
  </div>
}

function Home({user,setTab}){const [stats,setStats]=useState(null),[recent,setRecent]=useState([]),[player,setPlayer]=useState(null);useEffect(()=>{Promise.all([api.get('/api/videos'),user.role==='admin'?api.get('/api/admin/stats'):Promise.resolve({data:null})]).then(([v,s])=>{setRecent(v.data.slice(0,4));setStats(s.data)})},[]);return <div><section className="hero"><div><span className="pill">⚡ CLASS RESOURCE HUB</span><h1>Study. Store.<br/><em>Share.</em></h1><p>One private vault for your class videos, resources, links and conversations.</p><div className="heroBtns"><button className="cta" onClick={()=>setTab('upload')}>Upload a video <Upload size={17}/></button><button className="ghost" onClick={()=>setTab('videos')}>Browse vault <Video size={17}/></button></div></div><div className="heroart"><div className="ring">K</div><span>20+ anime scenes</span></div></section><div className="quick"><div><b>{stats?.videos??recent.length}</b><span>Resources</span></div><div><b>{stats?.users??'—'}</b><span>Members</span></div><div><b>LINKS</b><span>YouTube inside KRYNX</span></div><div><b>LIVE</b><span>Class chat</span></div></div><section><div className="sectionhead"><div><span className="eyebrow">LATEST</span><h3>Recently added</h3></div><button className="ghost" onClick={()=>setTab('videos')}>View all →</button></div><div className="cards">{recent.length?recent.map(v=><VideoCard key={v.id} v={v} open={setPlayer} isAdmin={user.role==='admin'}/>):<div className="empty">No videos yet. Upload your first class resource.</div>}</div></section>{player&&<Player v={player} close={()=>setPlayer(null)}/>}</div>}

function Videos({user}){const [items,setItems]=useState([]),[q,setQ]=useState(''),[player,setPlayer]=useState(null);const load=()=>api.get('/api/videos').then(r=>setItems(r.data));useEffect(()=>{load();const add=v=>setItems(x=>[v,...x.filter(y=>y.id!==v.id)]),del=id=>setItems(x=>x.filter(v=>v.id!==id));socket.on('video:new',add);socket.on('video:deleted',del);return()=>{socket.off('video:new',add);socket.off('video:deleted',del)}},[]);const shown=useMemo(()=>items.filter(v=>(v.title+' '+v.description+' '+v.uploader_name).toLowerCase().includes(q.toLowerCase())),[items,q]);return <><div className="toolbar"><div className="search"><Search size={17}/><input placeholder="Search videos, people, topics…" value={q} onChange={e=>setQ(e.target.value)}/></div><button className="ghost" onClick={load}><RefreshCw size={16}/>Refresh</button></div><div className="cards">{shown.map(v=><VideoCard key={v.id} v={v} open={setPlayer} isAdmin={user?.role==='admin'}/>)}{!shown.length&&<div className="empty">No resources match your search.</div>}</div>{player&&<Player v={player} close={()=>setPlayer(null)}/>}</>}
function VideoCard({v,open,isAdmin=false}){
  const link=v.source_type==='link'?externalUrl(v.source):null;
  const activate=()=>open?.(v);
  const del=async()=>{if(!confirm(`Delete “${v.title}”?`))return;try{await api.delete(isAdmin?'/api/admin/videos/'+v.id:'/api/videos/'+v.id)}catch(e){alert(e.response?.data?.error||'Delete failed')}};
  const artwork=<div className="thumb"><div className="thumbbg"/><div className="play">{v.source_type==='file'?<Play fill="currentColor" size={22}/>:<LinkIcon size={22}/>}</div><span>{v.source_type==='file'?'LOCAL':'OPEN LINK'}</span></div>;
  const details=<div className="cardbody"><h3>{v.title}</h3><p>{v.description||'Educational resource'}</p></div>;
  return <article className="card" onClick={activate} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate()}}} role="button" tabIndex={0} aria-label={v.source_type==='file'?`Play video: ${v.title}`:`Open link in player: ${v.title}`}>
    {artwork}{details}
    <div className="cardbody"><div className="meta"><span>by {v.uploader_name}</span><button onClick={e=>{e.stopPropagation();del()}} title="Delete"><Trash2 size={15}/></button></div></div>
  </article>
}
function Player({v,close}){
  const playback=v.source_type==='file'?{type:'video',src:v.source}:linkPlayer(v.source);
  const video=playback?.type==='video';
  const videoRef=useRef(null),containerRef=useRef(null);
  const [playing,setPlaying]=useState(false),[current,setCurrent]=useState(0),[duration,setDuration]=useState(0),[volume,setVolume]=useState(1),[muted,setMuted]=useState(false),[mediaError,setMediaError]=useState('');
  const togglePlayback=()=>{const media=videoRef.current;if(!media)return;if(media.paused)media.play().catch(()=>setMediaError('Playback was blocked. Check that the video URL is public and directly serves a video file.'));else media.pause()};
  const seek=value=>{const media=videoRef.current;if(media&&Number.isFinite(media.duration)){media.currentTime=Number(value);setCurrent(media.currentTime)}};
  const changeVolume=value=>{const next=Number(value);setVolume(next);setMuted(next===0);if(videoRef.current){videoRef.current.volume=next;videoRef.current.muted=next===0}};
  const toggleMute=()=>{const next=!muted;setMuted(next);if(videoRef.current)videoRef.current.muted=next};
  const fullscreen=()=>{const container=containerRef.current;if(!container)return;if(document.fullscreenElement)document.exitFullscreen?.();else container.requestFullscreen?.()};
  const videoNode=video&&<div className="customVideo">
    <video ref={videoRef} src={playback.src} autoPlay playsInline preload="metadata" onTimeUpdate={e=>setCurrent(e.currentTarget.currentTime)} onLoadedMetadata={e=>setDuration(Number.isFinite(e.currentTarget.duration)?e.currentTarget.duration:0)} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)} onError={()=>setMediaError('This source did not provide a playable video stream. Use a direct MP4/WebM link or a supported video-site URL.')} onClick={togglePlayback}/>
    {mediaError&&<div className="mediaError" role="alert">{mediaError}</div>}
    <div className="videoControls">
      <button type="button" onClick={togglePlayback} aria-label={playing?'Pause video':'Play video'}>{playing?<Pause size={19} fill="currentColor"/>:<Play size={19} fill="currentColor"/>}</button>
      <span className="videoTime">{formatTime(current)}</span>
      <input className="seekBar" type="range" min="0" max={duration||0} step="0.1" value={Math.min(current,duration||0)} onChange={e=>seek(e.target.value)} aria-label="Seek video"/>
      <span className="videoTime">{formatTime(duration)}</span>
      <button type="button" onClick={toggleMute} aria-label={muted?'Unmute video':'Mute video'}>{muted?<VolumeX size={18}/>:<Volume2 size={18}/>}</button>
      <input className="volumeBar" type="range" min="0" max="1" step="0.05" value={muted?0:volume} onChange={e=>changeVolume(e.target.value)} aria-label="Video volume"/>
      <button type="button" onClick={fullscreen} aria-label="Fullscreen video"><Maximize size={18}/></button>
    </div>
  </div>;
  return <div className="modal" onClick={e=>{if(e.target===e.currentTarget)close()}}>
    <div className="player" ref={containerRef}>
      <div className="playerhead"><b>{v.title}</b><button onClick={close} aria-label="Close player"><X/></button></div>
      {video?videoNode:playback?<iframe src={playback.src} title={v.title} allow="autoplay; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>:<div className="playerUnavailable">This link is not a valid HTTP or HTTPS URL.</div>}
      <div className="playerfoot">
        <span>{v.source_type==='file'?`Uploaded by ${v.uploader_name}`:video?'Playing with KRYNX player controls.':playback?.type==='page'?'Some sites prohibit embedding or require sign-in; use Open source if blocked.':'Playing this resource inside the website.'}</span>
        {v.source_type==='link'&&<a href={externalUrl(v.source)||undefined} target="_blank" rel="noopener noreferrer">Open source <LinkIcon size={14}/></a>}
      </div>
    </div>
  </div>
}

function UploadPage({setTab}){
  const [mode,setMode]=useState('link'),[f,setF]=useState({title:'',description:'',url:''}),[file,setFile]=useState(null),[msg,setMsg]=useState(''),[storage,setStorage]=useState({fileUploads:false,directUploads:false});
  useEffect(()=>{let active=true;api.get('/api/storage/config').then(({data})=>{if(active)setStorage(data)}).catch(()=>{if(active)setMsg('Storage settings are unavailable. Refresh and try again.')});return()=>{active=false}},[]);
  const submit=async e=>{
    e.preventDefault();setMsg('');
    try{
      if(mode==='file'){
        if(!file)throw new Error('Select a video first.');
        const {data:config}=await api.get('/api/storage/config');
        if(!config.fileUploads)throw new Error('Direct video uploads are unavailable on this free deployment. Add an Unlisted YouTube link instead.');
        if(config.directUploads){
          const contentType=file.type||'application/octet-stream';
          const {data:upload}=await api.post('/api/storage/upload-url',{purpose:'video',size:file.size,contentType,fileName:file.name});
          await uploadToCloud(upload.uploadUrl,file,upload.headers,percent=>setMsg('Uploading '+percent+' percent...'));
          await api.post('/api/videos/upload-complete',{key:upload.key,title:f.title,description:f.description,originalName:file.name});
        }else{
          const formData=new FormData();formData.append('video',file);formData.append('title',f.title);formData.append('description',f.description);
          await api.post('/api/videos/upload',formData,{onUploadProgress:p=>{if(p.total)setMsg('Uploading '+Math.round(p.loaded/p.total*100)+' percent...')}});
        }
      }else await api.post('/api/videos/link',f);
      setMsg('Resource added successfully.');setF({title:'',description:'',url:''});setFile(null);setTimeout(()=>setTab('videos'),500);
    }catch(e){setMsg(e.response?.data?.error||e.message||'Upload failed')}
  };
  return <div className="uploadgrid"><section className="panel"><div className="tabs">{storage.fileUploads&&<button className={mode==='file'?'sel':''} onClick={()=>setMode('file')}><Upload size={16}/> Device</button>}<button className={mode==='link'?'sel':''} onClick={()=>setMode('link')}><LinkIcon size={16}/> Link</button></div><form onSubmit={submit}><label>Title<input value={f.title} onChange={e=>setF({...f,title:e.target.value})} placeholder="e.g. Compiler Design Unit 3"/></label><label>Description<textarea value={f.description} onChange={e=>setF({...f,description:e.target.value})} placeholder="What is this resource about?"/></label>{mode==='file'&&storage.fileUploads?<label className="drop"><input type="file" accept="video/*" onChange={e=>setFile(e.target.files?.[0]||null)}/><Upload size={34}/><b>{file?file.name:'Choose a video'}</b><span>Maximum 1GB per video</span></label>:<label>Video / resource URL<input type="url" required value={f.url} onChange={e=>setF({...f,url:e.target.value})} placeholder="https://www.youtube.com/watch?v=..."/><span className="hint">For free hosting, upload your video to YouTube as Unlisted, then paste the URL here. KRYNX plays supported YouTube videos inside the site.</span></label>} {msg&&<div className="status">{msg}</div>}<button className="cta">{mode==='file'&&storage.fileUploads?'UPLOAD VIDEO':'SAVE LINK'}</button></form></section><aside className="panel rules"><h3>Vault rules</h3><p>Use this for educational and class resources.</p><p>For free hosting, share an Unlisted YouTube link to play a video inside KRYNX.</p><p>Some websites restrict embedding or require sign-in.</p><p>You can delete your own resources. Admins can manage everything.</p></aside></div>
}
function Chat({user}){
  useEffect(()=>{let active=true;api.get('/api/storage/config').then(({data})=>{if(active)setStorage(data)}).catch(()=>{if(active)setError('Storage settings could not be loaded; chat file uploads are disabled.')});return()=>{active=false}},[]);
  const [msgs,setMsgs]=useState([]),[online,setOnline]=useState([]),[text,setText]=useState(''),[file,setFile]=useState(null),[error,setError]=useState(''),[storage,setStorage]=useState({fileUploads:false,directUploads:false}),bottom=useRef();
  useEffect(()=>{
    let active=true;
    const loadMessages=async()=>{try{const response=await api.get('/api/chat/messages');if(active)setMsgs(response.data)}catch(e){if(active)setError(e.response?.data?.error||'Could not load class chat messages.')}};
    const onMessage=message=>setMsgs(current=>[...current, message]);
    const onPresence=people=>setOnline(people);
    const onConnect=()=>socket.emit('presence:join',user);
    const onConnectError=()=>setError('Live chat could not connect. You can still load and send messages.');
    socket.on('chat:new',onMessage);
    socket.on('presence:list',onPresence);
    socket.on('connect',onConnect);
    socket.on('connect_error',onConnectError);
    socket.connect();
    if(socket.connected)onConnect();
    loadMessages();
    return ()=>{
      active=false;
      socket.off('chat:new',onMessage);
      socket.off('presence:list',onPresence);
      socket.off('connect',onConnect);
      socket.off('connect_error',onConnectError);
      if(socket.connected)socket.emit('presence:leave',user.id);
    };
  },[user]);
  useEffect(()=>{bottom.current?.scrollIntoView({behavior:'smooth'})},[msgs]);
  const send=async e=>{
    e.preventDefault();
    if(!text.trim()&&!file)return;
    setError('');
    try{
      if(file){const {data:config}=await api.get('/api/storage/config');if(!config.fileUploads)throw new Error('File attachments are unavailable on this free deployment. Share a link in chat instead.');if(config.directUploads){const {data:upload}=await api.post('/api/storage/upload-url',{purpose:'chat',size:file.size,contentType:file.type||'application/octet-stream',fileName:file.name});await uploadToCloud(upload.uploadUrl,file,upload.headers,()=>{});await api.post('/api/chat/attachment-complete',{key:upload.key,text,originalName:file.name})}else{const formData=new FormData();formData.append('file',file);formData.append('text',text);await api.post('/api/chat/attachment',formData)}}else await api.post('/api/chat/message',{text});
      setText('');
      setFile(null);
    }catch(e){setError(e.response?.data?.error||'Could not send the message.')}
  };
  return <div className="chatgrid"><section className="panel chat"><div className="chathead"><div><h3>Class Chat</h3><span>Share class messages and resource links.</span></div><b className="live">● LIVE</b></div>{error&&<div className="status" role="alert">{error}</div>}<div className="messages">{msgs.map(m=><div className={'msg '+(m.user_id===user.id?'mine':'')} key={m.id}><div className="avatar">{m.avatar?<img src={m.avatar}/>:m.name?.[0]}</div><div><small><b>{m.name}</b> @{m.username} · {fmt(m.created_at)}</small>{m.text&&<div className="bubble">{m.text}</div>}{m.attachment_url&&<a className="attachment" href={m.attachment_url} target="_blank" rel="noreferrer"><Download size={14}/>{m.attachment_name}</a>}</div></div>)}<div ref={bottom}/></div><form className="chatinput" onSubmit={send}>{storage.fileUploads&&<label className="paper"><Paperclip/><input type="file" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>}<input value={text} onChange={e=>setText(e.target.value)} placeholder={file?file.name:'Message the class…'}/><span>😊</span><button className="cta"><Send size={17}/></button></form></section><aside className="panel"><h3>People online</h3>{online.map(p=><div className="person" key={p.id}><div className="avatar">{p.name?.[0]}</div><div><b>{p.name}</b><span>@{p.username}</span></div><i/></div>)}{!online.length&&<p className="hint">Open this page in another browser to test live presence.</p>}</aside></div>
}

function Profile({user,setUser}){const [f,setF]=useState(user),[pw,setPw]=useState({currentPassword:'',newPassword:''}),[msg,setMsg]=useState('');const save=async()=>{try{const r=await api.put('/api/me',f);setF(r.data);setUser(r.data);setMsg('Profile updated. Admins are notified of changes.')}catch(e){setMsg(e.response?.data?.error||'Update failed')}};const change=async()=>{try{await api.put('/api/me/password',pw);setPw({currentPassword:'',newPassword:''});setMsg('Password changed. Admin notification sent.')}catch(e){setMsg(e.response?.data?.error||'Password change failed')}};return <div className="profilegrid"><section className="panel"><div className="profiletop"><div className="avatar xl">{f.avatar?<img src={f.avatar}/>:f.name?.[0]}</div><div><h3>{f.name}</h3><span>@{f.username}</span></div></div><label>Name<input value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></label><label>Username<input value={f.username} onChange={e=>setF({...f,username:e.target.value})}/></label><label>Profile photo URL<input value={f.avatar||''} onChange={e=>setF({...f,avatar:e.target.value})} placeholder="https://…"/></label><label>Email<input value={f.email} disabled/></label><button className="cta" onClick={save}>Save profile</button>{msg&&<div className="status">{msg}</div>}</section><section className="panel"><div className="iconbox"><Lock/></div><h3>Change password</h3>{user.role==='admin'?<p className="hint">Admin password is controlled by the server and cannot be changed here.</p>:<><input type="password" placeholder="Current password" value={pw.currentPassword} onChange={e=>setPw({...pw,currentPassword:e.target.value})}/><input type="password" placeholder="New password" value={pw.newPassword} onChange={e=>setPw({...pw,newPassword:e.target.value})}/><button className="ghost" onClick={change}>Update password</button></>}</section></div>}
function AI({user}){
  const [messages,setMessages]=useState([]);
  const [text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const send=async e=>{
    e.preventDefault();
    const prompt=text.trim();
    if(!prompt||busy)return;
    const next=[...messages,{role:'user',text:prompt}];
    setMessages(next);
    setText('');
    setError('');
    setBusy(true);
    try{
      const history=next.slice(-12).map(message=>({role:message.role,content:message.text}));
      const {data}=await api.post('/api/ai/chat',{messages:history});
      setMessages(current=>[...current,{role:'assistant',text:data.reply}]);
    }catch(err){
      setError(err.response?.data?.error||'AI Buddy could not connect. Please try again.');
    }finally{
      setBusy(false);
    }
  };
  return <div className="panel ai">
    <div className="aitop"><Bot/><div><h3>KRYNX AI Buddy</h3><span>Ask anything. Powered by OpenAI.</span></div></div>
    <div className="aimsgs" aria-live="polite">
      <div className="aimsg">Hey {user.name.split(' ')[0]} 👋 I’m KRYNX AI Buddy. Ask me anything—study questions, explanations, or just say hi.</div>
      {messages.map((message,index)=><div className={message.role==='user'?'aimsg me':'aimsg'} key={index}>{message.text}</div>)}
      {busy&&<div className="aimsg" role="status">Thinking…</div>}
    </div>
    {error&&<div className="alert" role="alert">{error}</div>}
    <form onSubmit={send}><input value={text} onChange={e=>setText(e.target.value)} placeholder="Ask your study buddy…" maxLength={4000} disabled={busy}/><button className="cta" disabled={busy||!text.trim()} aria-label="Send message"><Send/></button></form>
  </div>
}
function Admin({user}){
  const [stats,setStats]=useState({}),[users,setUsers]=useState([]),[videos,setVideos]=useState([]),[notifs,setNotifs]=useState([]);
  const [account,setAccount]=useState({name:'',email:'',password:''}),[reset,setReset]=useState({userId:null,password:''}),[message,setMessage]=useState(''),[error,setError]=useState('');
  const load=async()=>{try{const [a,b,c,d]=await Promise.all([api.get('/api/admin/stats'),api.get('/api/admin/users'),api.get('/api/notifications'),api.get('/api/videos')]);setStats(a.data);setUsers(b.data);setNotifs(c.data);setVideos(d.data)}catch(e){setError(e.response?.data?.error||'Could not load admin data.')}}
  useEffect(()=>{load();socket.on('notification:new',load);return()=>socket.off('notification:new',load)},[]);
  const createAccount=async e=>{e.preventDefault();setError('');setMessage('');try{const response=await api.post('/api/admin/users',account);setMessage(`Account created for ${response.data.email} (@${response.data.username}). Share the password with them securely.`);setAccount({name:'',email:'',password:''});await load()}catch(e){setError(e.response?.data?.error||'Could not create account.')}}
  const changePassword=async e=>{e.preventDefault();setError('');setMessage('');try{await api.put(`/api/admin/users/${reset.userId}/password`,{password:reset.password});setMessage('User password reset successfully. Share the new password securely.');setReset({userId:null,password:''});await load()}catch(e){setError(e.response?.data?.error||'Could not reset user password.')}}
  const role=async u=>{setError('');try{await api.patch('/api/admin/users/'+u.id+'/role',{role:u.role==='admin'?'user':'admin'});await load()}catch(e){setError(e.response?.data?.error||'Could not update role.')}}
  const delUser=async u=>{if(!confirm(`Delete ${u.email} and their uploaded resources?`))return;setError('');try{await api.delete('/api/admin/users/'+u.id);await load()}catch(e){setError(e.response?.data?.error||'Could not delete user.')}}
  const delVideo=async v=>{if(!confirm(`Delete “${v.title}”?`))return;setError('');try{await api.delete('/api/admin/videos/'+v.id);setVideos(items=>items.filter(item=>item.id!==v.id));await load()}catch(e){setError(e.response?.data?.error||'Could not delete video.')}}
  return <div className="adminConsole">
    <div className="stats">{[['Users',stats.users,Users],['Videos',stats.videos,Video],['Admins',stats.admins,Shield],['Messages',stats.messages,MessageCircle]].map(([label,value,Icon])=><div className="stat" key={label}><Icon/><b>{value??0}</b><span>{label}</span></div>)}</div>
    {(error||message)&&<div className={error?'alert':'success'} role="status">{error||message}</div>}
    <section className="panel adminSection"><div className="panelhead"><h3>Create a user account</h3><Users size={18}/></div><form className="adminCreateForm" onSubmit={createAccount}><label>Name<input value={account.name} onChange={e=>setAccount({...account,name:e.target.value})} placeholder="User's name (optional)"/></label><label>Email<input type="email" required value={account.email} onChange={e=>setAccount({...account,email:e.target.value})} placeholder="user@example.com"/></label><label>Temporary password<input type="password" minLength={6} required value={account.password} onChange={e=>setAccount({...account,password:e.target.value})} placeholder="At least 6 characters"/></label><button className="cta">Create account</button></form><p className="hint">The user can sign in with this email and password. Share the temporary password privately.</p></section>
    <div className="admingrid">
      <section className="panel adminSection"><div className="sectionhead"><h3>User management</h3><span>{users.length} accounts</span></div>{users.map(u=><div className="userrow" key={u.id}><div className="avatar">{u.name?.[0]}</div><div className="userIdentity"><b>{u.name}</b><span>{u.email} · @{u.username}</span></div><strong>{u.role}</strong><small>{u.video_count} videos</small>{u.role==='user'?<button className="adminIconButton" title="Reset password" aria-label={`Reset password for ${u.email}`} onClick={()=>{setReset({userId:u.id,password:''});setError('');setMessage('')}}><Lock size={16}/></button>:<span/>}<button className="adminIconButton" title="Change role" aria-label={`Change role for ${u.email}`} disabled={u.id===user.id} onClick={()=>role(u)}><UserCog size={16}/></button><button className="adminIconButton danger" title="Delete user" aria-label={`Delete ${u.email}`} disabled={u.id===user.id} onClick={()=>delUser(u)}><Trash2 size={16}/></button></div>)}{reset.userId!==null&&<form className="resetPasswordForm" onSubmit={changePassword}><h4>Reset password for {users.find(u=>u.id===reset.userId)?.email}</h4><input type="password" minLength={6} required autoComplete="new-password" placeholder="New password (at least 6 characters)" value={reset.password} onChange={e=>setReset({...reset,password:e.target.value})}/><button className="cta">Set new password</button><button type="button" className="ghost" onClick={()=>setReset({userId:null,password:''})}>Cancel</button></form>}</section>
      <section className="panel adminSection"><div className="sectionhead"><h3>All videos</h3><span>{videos.length} resources</span></div>{videos.length?videos.map(v=><div className="adminVideoRow" key={v.id}><div><b>{v.title}</b><span>{v.source_type==='file'?'Uploaded video':'External link'} · by {v.uploader_name}</span></div><button className="adminIconButton danger" aria-label={`Delete video ${v.title}`} title="Delete video" onClick={()=>delVideo(v)}><Trash2 size={16}/></button></div>):<div className="empty">No videos to manage.</div>}</section>
    </div>
    <section className="panel adminSection"><div className="sectionhead"><h3>Notifications</h3><Bell/></div>{notifs.length?notifs.map(n=><div className="notice" key={n.id}>{n.message}<small>{fmt(n.created_at)}</small></div>):<div className="empty">No notifications yet.</div>}</section>
  </div>
}

createRoot(document.getElementById('root')).render(<App/>);
