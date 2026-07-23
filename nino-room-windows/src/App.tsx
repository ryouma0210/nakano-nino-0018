import { useEffect, useMemo, useRef, useState } from "react";
import {
  achievementMessages,
  dailyOrderMessages,
  managementFinalDayMessages,
  managementInstructionMessages,
  preparationChecklistMessages,
  rewardBrutalOrderMessages,
  rewardInsultMessages,
  rewardPraiseMessages,
} from "./messages";
import { secondsToClock, toDateKey } from "../../shared/date";
import { chastityContractRule, requiredContractRuleTexts } from "../../shared/contract";

type Page = "start" | "home" | "menu" | "preparation" | "defeat" | "orders" | "training" | "management" | "punishment" | "contract" | "records" | "report" | "files" | "collection" | "rewards" | "settings";
type RecordEntry = { id: string; date: string; type: string; title: string; detail: string; seconds?: number };
type RewardEntry = { id: string; kind: "insult" | "praise" | "brutal" | "video" | "voice"; content: string; cost: number };
type AppData = {
  name: string; contractDate: string; points: number; spent: number;
  records: RecordEntry[]; rewards: RewardEntry[]; preparation: Record<string, string[]>;
  defeat: Record<string, string[]>; orders: Record<string, { text: string; completed: boolean }>;
  management: { mode: "release" | "chastity"; start: string; end: string; completedDates: string[] } | null;
  bgm: boolean; effects: boolean; volume: number;
};

const initialData: AppData = { name: "マゾ", contractDate: "", points: 0, spent: 0, records: [], rewards: [], preparation: {}, defeat: {}, orders: {}, management: null, bgm: true, effects: true, volume: .35 };
const today = () => toDateKey();
const id = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function usePersistentData() {
  const [data, setData] = useState<AppData>(() => {
    try { return { ...initialData, ...JSON.parse(localStorage.getItem("nino-room-data") ?? "{}") }; }
    catch { return initialData; }
  });
  useEffect(() => localStorage.setItem("nino-room-data", JSON.stringify(data)), [data]);
  return [data, setData] as const;
}

const pageTitles: Record<Page, string> = { start: "START", home: "ホーム", menu: "記録・管理メニュー", preparation: "準備部屋", defeat: "敗北部屋", orders: "本日の命令部屋", training: "調教部屋", management: "射精管理部屋", punishment: "お仕置き部屋", contract: "契約部屋", records: "調教日記", report: "週間報告", files: "ファイル格納", collection: "コレクション", rewards: "ご褒美", settings: "設定" };
const character: Partial<Record<Page, string>> = { home: "home-nino.png", menu: "settings-nino.png", preparation: "preparation-nino.png", defeat: "defeat-nino.png", orders: "orders-nino.png", training: "training-nino-v3.png", management: "chastity-nino.png", punishment: "punishment-nino.png", contract: "home-nino.png", records: "diary-nino.png", report: "diary-nino.png", files: "files-nino.png", collection: "settings-nino.png", rewards: "home-nino.png", settings: "settings-nino.png" };

export function App() {
  const [data, setData] = usePersistentData();
  const [page, setPage] = useState<Page>("start");
  const [zoom, setZoomState] = useState(1);
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => { window.ninoDesktop.getWindowState().then((state) => setZoomState(state.zoom)); return window.ninoDesktop.onZoomChanged(setZoomState); }, []);
  useEffect(() => { if (!audio.current) return; audio.current.volume = data.volume; if (data.bgm && !["training", "punishment", "preparation", "defeat"].includes(page)) audio.current.play().catch(() => {}); else audio.current.pause(); }, [data.bgm, data.volume, page]);
  const patchData = (patch: Partial<AppData>) => setData((current) => ({ ...current, ...patch }));
  const addRecord = (entry: Omit<RecordEntry, "id" | "date">, points = 0) => setData((current) => ({ ...current, points: current.points + points, records: [{ id: id(), date: today(), ...entry }, ...current.records] }));
  async function setZoom(next: number) { await window.ninoDesktop.setZoom(next); setZoomState(next); }

  if (page === "start") return <Start onStart={() => setPage("home")} onSettings={() => setPage("settings")} />;
  return <main className={`app-shell page-${page}`}>
    <audio ref={audio} src="./assets/audio/kyouhunomori.mp4" loop />
    <header className="desktop-toolbar"><button className="brand" onClick={() => setPage("home")}>NINO ROOM</button><div className="toolbar-actions"><label>表示倍率<select value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>{[.75,1,1.25,1.5,1.75,2].map(v => <option key={v} value={v}>{v*100}%</option>)}</select></label><button onClick={() => window.ninoDesktop.toggleFullScreen()}>全画面（F11）</button></div></header>
    <div className="page-wrap"><h1 className="page-title">{pageTitles[page]}</h1>{character[page] && <RoomHero page={page} name={data.name} contracted={Boolean(data.contractDate)} />}
      {page === "home" && <Home contracted={Boolean(data.contractDate)} go={setPage} />}
      {page === "menu" && <Menu go={setPage} />}
      {page === "preparation" && <ChecklistRoom title="準備完了" items={preparationChecklistMessages.map(x => x.text)} saved={data.preparation[today()] ?? []} onSave={(items) => { patchData({ preparation: { ...data.preparation, [today()]: items } }); addRecord({ type:"準備", title:"準備部屋チェック", detail:items.join("\n") }); }} video="preparation_1.mp4" />}
      {page === "defeat" && <ChecklistRoom title="完全敗北を認める" items={["準備部屋で全ての項目を確認すること。","調教を5回受けること♡","お仕置き部屋で60分以上受けること♡","私に直接お貢ぎすること♡"]} saved={data.defeat[today()] ?? []} onSave={(items) => { patchData({ defeat: { ...data.defeat, [today()]: items } }); addRecord({ type:"敗北", title:"敗北部屋記録", detail:items.join("\n") }); }} />}
      {page === "orders" && <Orders data={data} setData={setData} addRecord={addRecord} />}
      {page === "training" && <Training onComplete={(seconds, difficulty) => addRecord({ type:"調教", title:"調教完了記録", detail:`難易度：${difficulty}\n秒数：${seconds}秒`, seconds }, data.records.some(r=>r.type==="調教"&&r.date===today())?0:5)} />}
      {page === "punishment" && <Punishment onComplete={(seconds) => addRecord({ type:"お仕置き", title:"お仕置き記録", detail:`${seconds}秒`, seconds })} />}
      {page === "management" && <Management data={data} setData={setData} addRecord={addRecord} />}
      {page === "contract" && <Contract data={data} patch={patchData} />}
      {page === "records" && <Records records={data.records} onDelete={(recordId) => patchData({ records:data.records.filter(r=>r.id!==recordId) })} />}
      {page === "report" && <Report data={data} />}
      {page === "files" && <Files />}
      {page === "rewards" && <Rewards data={data} setData={setData} />}
      {page === "collection" && <Collection data={data} />}
      {page === "settings" && <Settings data={data} setData={setData} />}
      {!["home","menu"].includes(page) && <nav className="footer-nav">{["records","report","files","collection","rewards","settings"].includes(page) && <Button onClick={() => setPage("menu")}>記録・管理メニューへ戻る</Button>}<Button onClick={() => setPage("home")}>ホームへ戻る</Button></nav>}
    </div>
  </main>;
}

function Start({onStart,onSettings}:{onStart:()=>void;onSettings:()=>void}) { return <main className="start-screen"><div className="start-panel"><p className="kicker">PRIVATE ROOM</p><h1>NINO ROOM</h1><img src="./assets/characters/home-nino.png" /><Button onClick={onStart}>始める</Button><Button onClick={onSettings}>設定</Button><button className="danger-button" onClick={() => window.close()}>ゲーム終了</button><small>Ver:0.1.0 Windows</small></div></main>; }
function Button({children,onClick,className=""}:{children:React.ReactNode;onClick:()=>void;className?:string}) { return <button className={`primary-button ${className}`} onClick={onClick}>{children}</button>; }
function RoomHero({page,name,contracted}:{page:Page;name:string;contracted:boolean}) { return <section className="room-hero"><img src={`./assets/characters/${character[page]}`} /><div><strong>二ノ</strong><p>{name}。今日は何をするのかしら？</p>{contracted&&<p className="contract-line">契約した奴隷として、ルールを忘れないこと♡</p>}</div></section>; }
function Home({contracted,go}:{contracted:boolean;go:(p:Page)=>void}) { const rooms:[Page,string,string][]=[["defeat",contracted?"敗北部屋":"敗北部屋 ※未開放","defeat"],["preparation","準備部屋","preparation"],["orders","本日の命令部屋","orders"],["training","調教部屋","purple"],["management","射精管理部屋","purple"],["punishment","お仕置き部屋","punishment"],["contract","契約部屋","purple"],["menu","記録・管理メニュー","white"]]; return <div className="button-list">{rooms.map(([p,t,c])=><Button key={p} className={c+(p==="defeat"&&!contracted?" disabled":"")} onClick={()=>{if(p!=="defeat"||contracted)go(p)}}>{t}</Button>)}</div>; }
function Menu({go}:{go:(p:Page)=>void}) { return <div className="button-list">{([['report','週間報告','blue'],['records','調教日記','blue'],['files','ファイル格納','preparation'],['collection','コレクション','orange'],['rewards','ご褒美','defeat'],['settings','設定','white']] as [Page,string,string][]).map(([p,t,c])=><Button key={p} className={c} onClick={()=>go(p)}>{t}</Button>)}</div>; }

function ChecklistRoom({title,items,saved,onSave,video}:{title:string;items:string[];saved:string[];onSave:(v:string[])=>void;video?:string}) { const [checks,setChecks]=useState(new Set(saved)); return <section className="panel">{video&&<video className="room-video" src={`./assets/videos/${video}`} autoPlay loop muted controls/>}<h2>{today()}</h2>{items.map(item=><label className="check-row" key={item}><input type="checkbox" checked={checks.has(item)} onChange={()=>setChecks(c=>{const n=new Set(c);n.has(item)?n.delete(item):n.add(item);return n})}/><span>{item}</span></label>)}<Button onClick={()=>onSave([...checks])}>{title}</Button></section>; }
function Orders({data,setData,addRecord}:{data:AppData;setData:React.Dispatch<React.SetStateAction<AppData>>;addRecord:(e:Omit<RecordEntry,"id"|"date">,p?:number)=>void}) { const order=data.orders[today()]; const draw=()=>setData(c=>({...c,orders:{...c.orders,[today()]:{text:dailyOrderMessages[Math.floor(Math.random()*dailyOrderMessages.length)].text,completed:false}}})); const complete=()=>{if(!order||order.completed)return;setData(c=>({...c,orders:{...c.orders,[today()]:{...order,completed:true}}}));addRecord({type:"命令",title:"本日の命令記録",detail:order.text},1)}; return <section className="panel"><h2>本日の命令</h2>{order?<><p className="instruction">{order.text}</p><Button onClick={complete}>{order.completed?"完了済み":"命令完了（1pt）"}</Button></>:<Button onClick={draw}>命令を抽選</Button>}</section>; }

function Training({onComplete}:{onComplete:(s:number,d:string)=>void}) { const [running,setRunning]=useState(false),[seconds,setSeconds]=useState(0),[difficulty,setDifficulty]=useState("ノーマル"),[video,setVideo]=useState(0); useEffect(()=>{if(!running)return;const t=setInterval(()=>setSeconds(s=>s+1),1000);return()=>clearInterval(t)},[running]); return <section className="panel training-panel"><video className="room-video" src={`./assets/videos/habits_${video+1}.mp4`} autoPlay={running} loop muted controls/><div className="segmented">{["イージー","ノーマル","ハード"].map(d=><button className={difficulty===d?"selected":""} onClick={()=>setDifficulty(d)} key={d}>{d}</button>)}</div><div className="timer">{secondsToClock(seconds)}</div><Rhythm kind="heart" running={running}/>{!running?<Button onClick={()=>{setSeconds(0);setVideo(Math.floor(Math.random()*6));setRunning(true)}}>調教開始</Button>:<button className="danger-button" onClick={()=>{setRunning(false);onComplete(seconds,difficulty)}}>射精しました</button>}</section>; }
function Punishment({onComplete}:{onComplete:(s:number)=>void}) { const [minutes,setMinutes]=useState(1),[remaining,setRemaining]=useState(60),[running,setRunning]=useState(false); useEffect(()=>{if(!running)return;const t=setInterval(()=>setRemaining(r=>{if(r<=1){setRunning(false);onComplete(minutes*60);return 0}return r-1}),1000);return()=>clearInterval(t)},[running,minutes,onComplete]); return <section className="panel"><video className="room-video" src="./assets/videos/timer_1.mp4" autoPlay={running} loop muted controls/><label>時間（分）<input type="number" min="1" value={minutes} onChange={e=>{setMinutes(Number(e.target.value));setRemaining(Number(e.target.value)*60)}}/></label><div className="timer">{secondsToClock(remaining)}</div><Rhythm kind="spade" running={running}/>{!running?<Button onClick={()=>{setRemaining(minutes*60);setRunning(true)}}>お仕置き開始</Button>:<button className="danger-button" onClick={()=>{setRunning(false);onComplete(minutes*60-remaining)}}>ギブアップ</button>}</section>; }
function Rhythm({kind,running}:{kind:"heart"|"spade";running:boolean}) { return <div className="rhythm"><strong>RHYTHM</strong><div className="rhythm-line"/>{running&&[0,1,2].map(i=><span key={i} className={`${kind} marker marker-${i}`}>{kind==="heart"?"♥":"♠"}<b>{kind==="heart"?"シコ":"Q"}</b></span>)}</div>; }

function Management({data,setData,addRecord}:{data:AppData;setData:React.Dispatch<React.SetStateAction<AppData>>;addRecord:(e:Omit<RecordEntry,"id"|"date">,p?:number)=>void}) { const [mode,setMode]=useState<"release"|"chastity">("release"); const active=data.management; const roll=()=>{const dice=Math.floor(Math.random()*6)+1;const end=new Date();end.setDate(end.getDate()+dice*3-1);setData(c=>({...c,management:{mode,start:today(),end:end.toLocaleDateString("sv-SE"),completedDates:[]}}))}; const final=active&&today()>=active.end;const choices=final?managementFinalDayMessages[active?.mode??mode]:managementInstructionMessages[active?.mode??mode];const task=choices[Math.abs(Number(today().replaceAll("-","")))%choices.length].text; const done=active?.completedDates.includes(today()); return <section className="panel">{!active?<><div className="segmented"><button className={mode==="release"?"selected":""} onClick={()=>setMode("release")}>貞操帯なし</button><button className={mode==="chastity"?"selected":""} onClick={()=>setMode("chastity")}>貞操帯あり</button></div><Button onClick={roll}>サイコロを振る</Button></>:<><p>管理期間：{active.start} ～ {active.end}</p><h2>本日の調教指示</h2><p className="instruction">{task}</p><Button onClick={()=>{if(done)return;setData(c=>({...c,management:c.management?{...c.management,completedDates:[...c.management.completedDates,today()]}:null}));addRecord({type:"射精管理",title:"射精管理記録",detail:task},10)}}>{done?"本日は完了済み":"完了（10pt）"}</Button><Button onClick={()=>setData(c=>({...c,management:null}))}>管理方法を選び直す</Button></>}</section>; }
function Contract({data,patch}:{data:AppData;patch:(p:Partial<AppData>)=>void}) { const [signature,setSignature]=useState(data.name); const rules=[...requiredContractRuleTexts,chastityContractRule]; return <section className="panel contract-panel"><h2>二ノ様の奴隷になりますか？</h2>{rules.map(r=><p key={r}>✅ {r}</p>)}{data.contractDate?<><video className="room-video" src="./assets/videos/contract_1.mp4" autoPlay loop muted controls/><p>契約日：{data.contractDate}</p><label>契約者<input value={signature} onChange={e=>setSignature(e.target.value)}/></label><Button onClick={()=>patch({name:signature})}>署名を変更</Button></>:<><label>契約者サイン<input value={signature} onChange={e=>setSignature(e.target.value)}/></label><Button onClick={()=>patch({contractDate:today(),name:signature||"マゾ"})}>契約にサインする</Button></>}</section>; }

function Records({records,onDelete}:{records:RecordEntry[];onDelete:(id:string)=>void}) { return <section className="records">{records.length===0?<p>記録はありません。</p>:records.map(r=><article className={`record record-${r.type}`} key={r.id}><div><small>{r.date} / {r.type}</small><h3>{r.title}</h3><p>{r.detail}</p></div><button onClick={()=>onDelete(r.id)}>削除</button></article>)}</section>; }
function Report({data}:{data:AppData}) { const since=new Date();since.setDate(since.getDate()-6);const recent=data.records.filter(r=>new Date(r.date)>=since);const training=recent.filter(r=>r.type==="調教");const punishment=recent.filter(r=>r.type==="お仕置き").reduce((s,r)=>s+(r.seconds??0),0);return <section className="metric-grid"><Metric label="直近7日の調教" value={`${training.length}回`}/><Metric label="お仕置き" value={`${Math.floor(punishment/60)}分`}/><Metric label="管理完了" value={`${recent.filter(r=>r.type==="射精管理").length}日`}/><Metric label="所持ポイント" value={`${data.points-data.spent}pt`}/></section>; }
function Metric({label,value}:{label:string;value:string}) { return <article><small>{label}</small><strong>{value}</strong></article>; }
function Files() { const [files,setFiles]=useState<DesktopFile[]>([]); useEffect(()=>{window.ninoDesktop.listFiles().then(setFiles)},[]); return <section className="panel"><Button onClick={()=>window.ninoDesktop.pickFiles().then(setFiles)}>画像・動画・音声を格納</Button><p>使用量：{(files.reduce((sum,file)=>sum+file.size,0)/1024/1024).toFixed(1)} MB</p><div className="file-grid">{files.map(f=>{const video=/\.mp4$/i.test(f.name),audio=/\.(m4a|wav)$/i.test(f.name);return <article key={f.path}>{video?<video src={f.url} controls/>:audio?<audio src={f.url} controls/>:<img src={f.url}/>}<span>{f.name}</span><button onClick={()=>window.ninoDesktop.removeFile(f.path).then(setFiles)}>削除</button></article>})}</div></section>; }

const rewardOptions=[{kind:"insult" as const,name:"罵倒コメント",cost:10,list:rewardInsultMessages},{kind:"praise" as const,name:"称賛コメント",cost:50,list:rewardPraiseMessages},{kind:"video" as const,name:"ご褒美動画",cost:500,list:[{text:"調教動画 1"}]},{kind:"brutal" as const,name:"鬼畜の調教命令",cost:1000,list:rewardBrutalOrderMessages},{kind:"voice" as const,name:"好きボイス3秒",cost:5000,list:[{text:"二ノの好きボイス3秒"}]}];
function Rewards({data,setData}:{data:AppData;setData:React.Dispatch<React.SetStateAction<AppData>>}) { const available=data.points-data.spent;return <section className="panel"><h2>所持ポイント：{available}pt</h2>{rewardOptions.map(o=><article className="reward-row" key={o.kind}><div><strong>{o.name}</strong><small>{o.cost}pt</small></div><Button onClick={()=>{if(available<o.cost)return alert("ポイントが足りません。");const content=o.list[Math.floor(Math.random()*o.list.length)].text;setData(c=>({...c,spent:c.spent+o.cost,rewards:[...c.rewards,{id:id(),kind:o.kind,content,cost:o.cost}]}))}}>交換</Button></article>)}</section>; }
function Collection({data}:{data:AppData}) { const training=data.records.filter(r=>r.type==="調教").length,punishment=Math.floor(data.records.filter(r=>r.type==="お仕置き").reduce((s,r)=>s+(r.seconds??0),0)/60),management=data.records.filter(r=>r.type==="射精管理").length;const titles=[...achievementMessages.training.filter(a=>training>=a.count),...achievementMessages.punishment.filter(a=>punishment>=a.minutes),...achievementMessages.management.filter(a=>management>=a.days)];return <section className="panel"><h2>称号</h2>{titles.map(t=><p key={t.name}>🏆 {t.name} — {t.condition}</p>)}{data.contractDate&&<><h2>契約書・契約ルール</h2><p>契約日：{data.contractDate}</p></>}<h2>獲得済みご褒美</h2>{data.rewards.sort((a,b)=>a.cost-b.cost).map(r=><article className="collection-item" key={r.id}><p>{r.content}</p><small>使用：{r.cost}pt</small>{r.kind==="voice"&&<audio src="./assets/audio/ninosukiboisu.m4a" controls loop/>}{r.kind==="video"&&<video src="./assets/videos/habits_1.mp4" controls loop/>}</article>)}</section>; }
function Settings({data,setData}:{data:AppData;setData:React.Dispatch<React.SetStateAction<AppData>>}) { const [name,setName]=useState(data.name);return <section className="panel"><label>呼ばれたい名前<input value={name} onChange={e=>setName(e.target.value)}/></label><Button onClick={()=>setData(c=>({...c,name:name||"マゾ"}))}>名前を保存</Button><label className="check-row"><input type="checkbox" checked={data.bgm} onChange={e=>setData(c=>({...c,bgm:e.target.checked}))}/>BGM</label><label className="check-row"><input type="checkbox" checked={data.effects} onChange={e=>setData(c=>({...c,effects:e.target.checked}))}/>効果音</label><label>BGM音量<input type="range" min="0" max="1" step=".1" value={data.volume} onChange={e=>setData(c=>({...c,volume:Number(e.target.value)}))}/></label><button className="danger-button" onClick={()=>{if(confirm("全データを初期化しますか？"))setData(initialData)}}>全データを初期化</button></section>; }
