import { useState, useMemo, useEffect } from "react";
import { db } from "./firebase";
import { ref, onValue, push, remove } from "firebase/database";

const CARS = [
  { id: 1, name: "아이오닉5",   plate: "50너8219",  type: "SUV",  seats: 5, color: "#2563eb" },
  { id: 2, name: "테슬라 모델3", plate: "19무7668",  type: "세단", seats: 5, color: "#111827" },
  { id: 3, name: "레이EV",      plate: "10두4661",  type: "경차", seats: 4, color: "#0891b2" },
  { id: 4, name: "레이",        plate: "125라7077", type: "경차", seats: 4, color: "#d97706" },
];

function CarLabel({ car, size = "md" }) {
  const big = size === "lg" ? 17 : 14;
  const small = size === "lg" ? 12 : 11;
  return (
    <div>
      <div style={{fontWeight:800, fontSize:big, color:"#111827", letterSpacing:"0.04em"}}>{car.plate}</div>
      <div style={{fontSize:small, color:"#9ca3af", marginTop:1}}>{car.name} · {car.type} · {car.seats}인승</div>
    </div>
  );
}

const WEEK_DAYS = ["월","화","수","목","금","토","일"];
const HOURS = Array.from({ length: 11 }, (_, i) => i + 8);

function fmt(d)        { return d.toISOString().slice(0,10); }
function addD(s, n)    { const d=new Date(s); d.setDate(d.getDate()+n); return fmt(d); }
function getWeekDates(anchor) {
  const d=new Date(anchor), dow=d.getDay()===0?6:d.getDay()-1;
  const mon=new Date(d); mon.setDate(d.getDate()-dow);
  return Array.from({length:7},(_,i)=>addD(fmt(mon),i));
}
function getMonthDates(anchor) {
  const d=new Date(anchor), y=d.getFullYear(), m=d.getMonth();
  const first=new Date(y,m,1), last=new Date(y,m+1,0);
  const startDow=first.getDay()===0?6:first.getDay()-1;
  const dates=[];
  for(let i=-startDow; i<=last.getDate()-1+(6-(last.getDay()===0?6:last.getDay()-1)); i++) {
    const dd=new Date(y,m,1+i);
    dates.push({dateStr:fmt(dd), inMonth:dd.getMonth()===m});
  }
  return dates;
}
function weekLabel(dates) {
  if(!dates.length) return "";
  const s=new Date(dates[0]),e=new Date(dates[6]);
  return `${s.getMonth()+1}/${s.getDate()} ~ ${e.getMonth()+1}/${e.getDate()}`;
}
function monthLabel(anchor) {
  const d=new Date(anchor); return `${d.getFullYear()}년 ${d.getMonth()+1}월`;
}

const SAMPLE_RES = [];
const SAMPLE_HOLIDAYS = [];

function hasConflict(reservations, carId, date, start, end, excludeId=null) {
  return reservations
    .filter(r=>r.id!==excludeId && r.carId===carId && r.date===date)
    .some(r=>start<r.end && end>r.start);
}

/* ── 공통 컴포넌트 ── */
function Avatar({ name, color, size=32 }) {
  return (
    <div style={{width:size,height:size,borderRadius:"50%",background:color||"#2563eb",
      display:"flex",alignItems:"center",justifyContent:"center",
      color:"#fff",fontSize:size*0.38,fontWeight:700,flexShrink:0}}>
      {name[0]}
    </div>
  );
}

function Sheet({ open, onClose, title, children, cta, onCta, ctaColor="#2563eb", ctaDisabled }) {
  if (!open) return null;
  return (
    <div style={{position:"fixed",inset:0,zIndex:300,display:"flex",alignItems:"flex-end"}}>
      <div onClick={onClose} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.45)"}}/>
      <div style={{position:"relative",width:"100%",maxWidth:600,margin:"0 auto",
        background:"#fff",borderRadius:"20px 20px 0 0",maxHeight:"92vh",
        display:"flex",flexDirection:"column",animation:"su .22s ease"}}>
        <style>{`@keyframes su{from{transform:translateY(60px);opacity:0}to{transform:none;opacity:1}}`}</style>
        <div style={{textAlign:"center",padding:"10px 0 4px"}}>
          <div style={{width:36,height:4,borderRadius:2,background:"#e5e7eb",margin:"0 auto"}}/>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 20px 4px"}}>
          <h3 style={{margin:0,fontWeight:700,fontSize:17,color:"#111827"}}>{title}</h3>
          <button onClick={onClose} style={{background:"#f3f4f6",border:"none",borderRadius:"50%",
            width:30,height:30,cursor:"pointer",fontSize:15,color:"#6b7280"}}>✕</button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"12px 20px"}}>{children}</div>
        {cta && (
          <div style={{padding:"10px 20px 28px"}}>
            <button onClick={onCta} disabled={ctaDisabled} style={{
              width:"100%",padding:15,border:"none",borderRadius:14,
              background:ctaDisabled?"#e5e7eb":ctaColor,
              color:ctaDisabled?"#9ca3af":"#fff",
              fontWeight:700,fontSize:15,cursor:ctaDisabled?"not-allowed":"pointer"}}>
              {cta}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const Fl = ({label, children}) => (
  <label style={{display:"flex",flexDirection:"column",gap:5}}>
    <span style={{fontSize:12,fontWeight:600,color:"#374151"}}>{label}</span>
    {children}
  </label>
);

const inp = {
  padding:"12px 14px",border:"1px solid #e5e7eb",borderRadius:10,
  fontSize:15,color:"#111827",background:"#f9fafb",
  width:"100%",boxSizing:"border-box",WebkitAppearance:"none",
};

/* ════════════ 메인 ════════════ */
export default function App() {
  const TODAY = fmt(new Date());

  const [tab, setTab]           = useState("calendar");
  const [view, setView]         = useState("day");
  const [anchor, setAnchor]     = useState(TODAY);
  const [selDate, setSelDate]   = useState(TODAY);
  const [reservations, setRes]  = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [showForm, setShowForm]       = useState(false);
  const [detail, setDetail]           = useState(null);
  const [carDetail, setCarDetail]     = useState(null); // 차량 클릭 시 해당 날 예약 목록
  const [form, setForm]               = useState({carId:"",date:TODAY,start:9,end:10,purpose:"",
    name:localStorage.getItem("userName")||"",dept:localStorage.getItem("userDept")||""});
  const [toast, setToast]       = useState(null);

  // 휴무 등록 폼
  const [hForm, setHForm] = useState({carId:"",date:""});

  useEffect(() => {
    const unsub1 = onValue(ref(db, "reservations"), snap => {
      const val = snap.val();
      setRes(val ? Object.entries(val).map(([id, v]) => ({...v, id})) : []);
    });
    const unsub2 = onValue(ref(db, "holidays"), snap => {
      const val = snap.val();
      setHolidays(val ? Object.entries(val).map(([id, v]) => ({...v, id})) : []);
    });
    return () => { unsub1(); unsub2(); };
  }, []);

  const fv  = (k,v) => setForm(p=>({...p,[k]:v}));
  const hfv = (k,v) => setHForm(p=>({...p,[k]:v}));

  function showToast(msg,err) { setToast({msg,err}); setTimeout(()=>setToast(null),2400); }

  function go(dir) {
    if(view==="day") { const next=addD(anchor,dir); setAnchor(next); setSelDate(next); }
    if(view==="week")  setAnchor(a=>addD(a,dir*7));
    if(view==="month") { const d=new Date(anchor); d.setMonth(d.getMonth()+dir); setAnchor(fmt(d)); }
  }

  function pickDate(date) { setSelDate(date); if(view!=="day"){setView("day");} setAnchor(date); }

  function submit() {
    const {carId,date,start,end,purpose,name,dept}=form;
    if(!carId||!date||!purpose||!name||!dept) return showToast("모든 항목을 입력해주세요",true);
    if(end<=start) return showToast("종료 시간을 시작 시간보다 늦게 설정해주세요",true);
    if(isCarHoliday(Number(carId),date)) return showToast("해당 차량의 휴무일이에요",true);
    if(hasConflict(reservations,Number(carId),date,start,end))
      return showToast("해당 시간에 이미 예약이 있어요",true);
    localStorage.setItem("userName", name);
    localStorage.setItem("userDept", dept);
    push(ref(db, "reservations"), {carId:Number(carId),date,
      start:Number(start),end:Number(end),purpose,user:name,dept});
    setShowForm(false); showToast("예약이 완료됐어요 🎉");
  }

  function cancel(id) {
    remove(ref(db, `reservations/${id}`)); setDetail(null); showToast("예약이 취소됐어요");
  }

  // 휴무 등록
  function addHoliday() {
    if(!hForm.carId||!hForm.date) return showToast("차량과 날짜를 모두 선택해주세요",true);
    const exists = holidays.some(h=>h.carId===Number(hForm.carId)&&h.date===hForm.date);
    if(exists) return showToast("이미 등록된 휴무예요",true);
    const car = CARS.find(c=>c.id===Number(hForm.carId));
    push(ref(db, "holidays"), {carId:Number(hForm.carId),date:hForm.date});
    setHForm({carId:"",date:""});
    showToast(`${car.name} ${hForm.date} 휴무 등록 완료`);
  }

  function removeHoliday(id) {
    remove(ref(db, `holidays/${id}`));
    showToast("휴무가 삭제됐어요");
  }

  // 특정 차량이 특정 날짜에 휴무인지
  function isCarHoliday(carId, date) {
    return holidays.some(h=>h.carId===carId && h.date===date);
  }

  // 특정 날짜에 휴무인 차량 목록
  function holidayCarsOnDate(date) {
    return holidays.filter(h=>h.date===date).map(h=>h.carId);
  }

  const CAR    = id => CARS.find(c=>c.id===id);
  const totalH = HOURS.length-1;
  const myRes  = reservations.filter(r=>r.user===form.name);

  const weekDates  = useMemo(()=>getWeekDates(anchor),[anchor]);
  const monthDates = useMemo(()=>getMonthDates(anchor),[anchor]);

  const dayRes   = reservations.filter(r=>r.date===selDate);
  const conflict = form.carId && hasConflict(
    reservations,Number(form.carId),form.date,Number(form.start),Number(form.end)
  );
  const formCarHoliday = form.carId && isCarHoliday(Number(form.carId),form.date);

  const headerLabel =
    view==="day"   ? `${new Date(anchor).getMonth()+1}월 ${new Date(anchor).getDate()}일` :
    view==="week"  ? weekLabel(weekDates) :
    monthLabel(anchor);

  const navTs = id=>({
    padding:"6px 14px",border:"none",borderRadius:20,
    background:view===id?"#2563eb":"transparent",
    color:view===id?"#fff":"#6b7280",
    fontWeight:700,fontSize:13,cursor:"pointer",
  });

  const tabTs = id=>({
    flex:1,padding:"11px 0 10px",border:"none",background:"transparent",cursor:"pointer",
    display:"flex",flexDirection:"column",alignItems:"center",gap:3,
    borderTop:tab===id?"2px solid #2563eb":"2px solid transparent",
  });

  return (
    <div style={{fontFamily:"'Noto Sans KR',-apple-system,sans-serif",background:"#f1f5f9",
      minHeight:"100vh",paddingBottom:72}}>

      {/* 헤더 */}
      <div style={{background:"#1e40af",padding:"14px 20px 12px"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.18)",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>🚗</div>
          <div>
            <div style={{fontWeight:800,fontSize:17,color:"#fff"}}>법인차량 예약시스템</div>
          </div>
        </div>
      </div>

      {/* 토스트 */}
      {toast && (
        <div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",zIndex:999,
          background:toast.err?"#ef4444":"#111827",color:"#fff",
          padding:"10px 20px",borderRadius:12,fontSize:13,fontWeight:600,
          whiteSpace:"nowrap",animation:"fi .2s ease"}}>
          <style>{`@keyframes fi{from{opacity:0;transform:translateX(-50%) translateY(-6px)}to{opacity:1;transform:translateX(-50%)}}`}</style>
          {toast.msg}
        </div>
      )}

      <div style={{padding:"16px 24px 0",maxWidth:1200,margin:"0 auto"}}>

        {/* ══ 예약 현황 탭 ══ */}
        {tab==="calendar" && (<>

          {/* 뷰 전환 + 네비 */}
          <div style={{background:"#fff",borderRadius:14,padding:"10px 12px",marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"center",gap:4,marginBottom:10}}>
              {[{id:"day",label:"일"},{id:"week",label:"주"},{id:"month",label:"월"}].map(v=>(
                <button key={v.id} style={navTs(v.id)} onClick={()=>setView(v.id)}>{v.label}</button>
              ))}
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <button onClick={()=>go(-1)} style={{background:"#f3f4f6",border:"none",borderRadius:8,
                width:32,height:32,cursor:"pointer",fontSize:16,color:"#374151"}}>‹</button>
              <span style={{fontWeight:700,fontSize:15,color:"#111827"}}>{headerLabel}</span>
              <button onClick={()=>go(1)} style={{background:"#f3f4f6",border:"none",borderRadius:8,
                width:32,height:32,cursor:"pointer",fontSize:16,color:"#374151"}}>›</button>
            </div>
          </div>

          {/* ─── 일 뷰 ─── */}
          {view==="day" && (<>
            {holidayCarsOnDate(selDate).length>0 && (
              <div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:12,
                padding:"10px 14px",marginBottom:12,fontSize:13,color:"#9a3412",fontWeight:600}}>
                🔧 {holidayCarsOnDate(selDate).map(cid=>CAR(cid)?.name).join(", ")} — 휴무일
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:14}}>
            {CARS.map(car=>{
              const blocks    = dayRes.filter(r=>r.carId===car.id);
              const isHoliday = isCarHoliday(car.id, selDate);
              return (
                <div key={car.id} style={{background:"#fff",borderRadius:14,marginBottom:10,
                  overflow:"hidden",opacity:isHoliday?0.8:1}}>
                  {/* 헤더 클릭 → 차량 시트 */}
                  <div onClick={()=>setCarDetail({car,blocks,isHoliday})}
                    style={{padding:"13px 16px 10px",display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}>
                    <div style={{width:9,height:9,borderRadius:"50%",background:car.color,flexShrink:0}}/>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <div style={{fontWeight:800,fontSize:15,color:"#111827",letterSpacing:"0.04em"}}>{car.plate}</div>
                        {isHoliday && (
                          <span style={{fontSize:10,fontWeight:700,background:"#fed7aa",color:"#9a3412",
                            padding:"2px 7px",borderRadius:20}}>휴무</span>
                        )}
                        {!isHoliday && blocks.length>0 && (
                          <span style={{fontSize:10,fontWeight:700,
                            background:car.color+"18",color:car.color,
                            padding:"2px 7px",borderRadius:20}}>{blocks.length}건</span>
                        )}
                      </div>
                      <div style={{fontSize:11,color:"#9ca3af",marginTop:1}}>{car.name} · {car.type} · {car.seats}인승</div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      {isHoliday ? (
                        <div style={{background:"#f3f4f6",color:"#9ca3af",borderRadius:8,
                          padding:"5px 12px",fontSize:12,fontWeight:700}}>🔧 휴무</div>
                      ) : (
                        <button onClick={e=>{e.stopPropagation();fv("carId",String(car.id));fv("date",selDate);setShowForm(true);}}
                          style={{background:car.color,color:"#fff",border:"none",borderRadius:8,
                            padding:"5px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>예약</button>
                      )}
                      <span style={{fontSize:16,color:"#d1d5db"}}>›</span>
                    </div>
                  </div>
                  {/* 타임라인만 */}
                  <div style={{margin:"0 16px 14px"}}>
                    <div style={{position:"relative",height:26}}>
                      {[0,2,4,6,8,10].map(o=>(
                        <div key={o} style={{position:"absolute",left:`${(o/totalH)*100}%`,
                          top:0,bottom:0,width:1,background:"#e5e7eb"}}/>
                      ))}
                      <div style={{position:"absolute",inset:0,borderRadius:6,
                        background:isHoliday?"repeating-linear-gradient(45deg,#f9fafb,#f9fafb 4px,#f3f4f6 4px,#f3f4f6 8px)":"#f8fafc",
                        border:"1px solid #f1f5f9"}}/>
                      {!isHoliday && blocks.map(r=>{
                        const left=((r.start-8)/totalH)*100, width=((r.end-r.start)/totalH)*100;
                        return (
                          <div key={r.id}
                            style={{position:"absolute",top:3,bottom:3,left:`${left}%`,width:`${width}%`,
                              background:r.user===form.name?car.color:car.color+"60",
                              borderRadius:4,minWidth:4}}/>
                        );
                      })}
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",marginTop:3}}>
                      {[8,10,12,14,16,18].map(h=>(
                        <span key={h} style={{fontSize:9,color:"#c4c9d4"}}>{h}시</span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
            <button onClick={()=>{setForm(p=>({...p,carId:"",date:selDate,start:9,end:10,purpose:""}));setShowForm(true);}}
              style={{position:"fixed",bottom:84,right:20,zIndex:200,
                width:56,height:56,borderRadius:"50%",background:"#2563eb",color:"#fff",
                border:"none",fontSize:26,cursor:"pointer",boxShadow:"0 4px 16px rgba(37,99,235,0.4)"}}>+</button>
          </>)}

          {/* ─── 주 뷰 ─── */}
          {view==="week" && (
            <div style={{background:"#fff",borderRadius:14,overflow:"hidden"}}>
              <div style={{display:"grid",gridTemplateColumns:"52px repeat(7,1fr)",
                borderBottom:"1px solid #f3f4f6"}}>
                <div style={{padding:"8px 0"}}/>
                {weekDates.map((date,i)=>{
                  const isToday=date===TODAY, isSel=date===selDate;
                  const hCnt=holidays.filter(h=>h.date===date).length;
                  return (
                    <button key={date} onClick={()=>pickDate(date)} style={{
                      padding:"8px 0",border:"none",background:"transparent",cursor:"pointer",
                      borderBottom:isSel?"2px solid #2563eb":"2px solid transparent"}}>
                      <div style={{fontSize:10,color:i>=5?"#9ca3af":"#6b7280",fontWeight:500}}>{WEEK_DAYS[i]}</div>
                      <div style={{width:26,height:26,borderRadius:"50%",margin:"2px auto 0",
                        background:isToday?"#2563eb":"transparent",
                        display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <span style={{fontSize:13,fontWeight:700,
                          color:isToday?"#fff":i>=5?"#9ca3af":"#111827"}}>{date.slice(8)}</span>
                      </div>
                      {hCnt>0&&<div style={{fontSize:9,color:"#d97706",marginTop:1}}>🔧{hCnt}</div>}
                    </button>
                  );
                })}
              </div>
              {CARS.map(car=>(
                <div key={car.id} style={{display:"grid",gridTemplateColumns:"52px repeat(7,1fr)",
                  borderBottom:"1px solid #f9fafb",minHeight:52}}>
                  <div style={{padding:"8px 6px",display:"flex",flexDirection:"column",
                    justifyContent:"center",borderRight:"1px solid #f3f4f6"}}>
                    <div style={{width:7,height:7,borderRadius:"50%",background:car.color,marginBottom:3}}/>
                    <div style={{fontSize:10,fontWeight:700,color:"#374151",lineHeight:1.3}}>
                      {car.plate.slice(0,4)}<br/>{car.plate.slice(4)}
                    </div>
                  </div>
                  {weekDates.map((date,di)=>{
                    const cellRes=reservations.filter(r=>r.carId===car.id&&r.date===date);
                    const isH=isCarHoliday(car.id,date);
                    return (
                      <div key={date} onClick={()=>pickDate(date)}
                        style={{padding:"3px 2px",borderRight:"1px solid #f9fafb",minHeight:52,
                          background:isH?"repeating-linear-gradient(45deg,#fff7ed,#fff7ed 4px,#fef3c7 4px,#fef3c7 8px)":di>=5?"#fafafa":"#fff",
                          cursor:"pointer",position:"relative"}}>
                        {isH&&(
                          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",
                            justifyContent:"center",fontSize:14,opacity:0.5}}>🔧</div>
                        )}
                        {!isH&&cellRes.map(r=>(
                          <div key={r.id} onClick={e=>{e.stopPropagation();setDetail(r);}}
                            style={{background:r.user===form.name?car.color:car.color+"55",
                              borderRadius:3,padding:"2px 4px",marginBottom:2,cursor:"pointer"}}>
                            <div style={{fontSize:9,color:"#fff",fontWeight:700,whiteSpace:"nowrap",
                              overflow:"hidden",textOverflow:"ellipsis"}}>{r.start}~{r.end}시</div>
                            <div style={{fontSize:8,color:"rgba(255,255,255,0.85)",whiteSpace:"nowrap",
                              overflow:"hidden",textOverflow:"ellipsis"}}>{r.purpose}</div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {/* ─── 월 뷰 ─── */}
          {view==="month" && (
            <div style={{background:"#fff",borderRadius:14,overflow:"hidden"}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",borderBottom:"1px solid #f3f4f6"}}>
                {WEEK_DAYS.map((d,i)=>(
                  <div key={d} style={{textAlign:"center",padding:"8px 0",
                    fontSize:11,fontWeight:600,color:i>=5?"#9ca3af":"#6b7280"}}>{d}</div>
                ))}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
                {monthDates.map(({dateStr,inMonth},idx)=>{
                  const dayR=reservations.filter(r=>r.date===dateStr);
                  const isToday=dateStr===TODAY, isSel=dateStr===selDate;
                  const hCars=holidays.filter(h=>h.date===dateStr);
                  const di=idx%7;
                  const myDayR=dayR.filter(r=>r.user===form.name);
                  return (
                    <div key={dateStr+idx} onClick={()=>inMonth&&pickDate(dateStr)}
                      style={{minHeight:60,padding:"4px",
                        borderRight:"1px solid #f9fafb",borderBottom:"1px solid #f9fafb",
                        background:!inMonth?"#fafafa":"#fff",
                        cursor:inMonth?"pointer":"default",
                        outline:isSel?"2px solid #2563eb":"none",
                        outlineOffset:"-2px",borderRadius:isSel?4:0}}>
                      <div style={{width:22,height:22,borderRadius:"50%",marginBottom:2,
                        background:isToday?"#2563eb":"transparent",
                        display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <span style={{fontSize:12,fontWeight:isToday?700:500,
                          color:!inMonth?"#d1d5db":isToday?"#fff":di>=5?"#9ca3af":"#111827"}}>
                          {dateStr.slice(8)}
                        </span>
                      </div>
                      {inMonth&&hCars.length>0&&(
                        <div style={{fontSize:8,color:"#d97706",fontWeight:700,marginBottom:1}}>
                          🔧 {hCars.length}대 휴무
                        </div>
                      )}
                      {inMonth&&(()=>{
                        const show=dayR.slice(0,2), more=dayR.length-show.length;
                        return (<>
                          {show.map(r=>{const car=CAR(r.carId);return(
                            <div key={r.id} style={{background:r.user===form.name?car.color:car.color+"55",
                              borderRadius:3,padding:"1px 3px",marginBottom:1}}>
                              <div style={{fontSize:8,color:"#fff",fontWeight:600,whiteSpace:"nowrap",
                                overflow:"hidden",textOverflow:"ellipsis"}}>{car.plate}</div>
                            </div>
                          );})}
                          {more>0&&<div style={{fontSize:8,color:"#9ca3af",fontWeight:600}}>+{more}건</div>}
                        </>);
                      })()}
                      {myDayR.length>0&&inMonth&&(
                        <div style={{width:4,height:4,borderRadius:"50%",background:"#2563eb",marginTop:1}}/>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {view==="month"&&selDate&&(()=>{
            const list=reservations.filter(r=>r.date===selDate);
            const hCars=holidays.filter(h=>h.date===selDate);
            return (
              <div style={{marginTop:12,background:"#fff",borderRadius:14,overflow:"hidden"}}>
                <div style={{padding:"12px 16px 8px",fontSize:13,fontWeight:700,color:"#374151"}}>
                  {selDate} · 예약 {list.length}건
                  {hCars.length>0&&<span style={{color:"#d97706",marginLeft:8}}>🔧 {hCars.map(h=>CAR(h.carId)?.name).join(", ")} 휴무</span>}
                </div>
                {list.length===0&&<div style={{padding:"12px 16px",fontSize:13,color:"#9ca3af"}}>예약 없음</div>}
                {list.map(r=>{const car=CAR(r.carId);return(
                  <button key={r.id} onClick={()=>setDetail(r)} style={{
                    display:"flex",alignItems:"center",gap:10,width:"100%",
                    padding:"10px 16px",border:"none",borderTop:"1px solid #f3f4f6",
                    background:r.user===form.name?car.color+"08":"#fafafa",cursor:"pointer",textAlign:"left"}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:car.color,flexShrink:0}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:"#111827"}}>
                        [{car.name}] {r.start}:00~{r.end}:00
                        <span style={{fontWeight:400,color:"#9ca3af"}}> · {r.purpose}</span>
                      </div>
                    </div>
                    {r.user===form.name&&<span style={{fontSize:11,color:car.color,fontWeight:700}}>나</span>}
                    <span style={{fontSize:11,color:"#d1d5db"}}>›</span>
                  </button>
                );})}
              </div>
            );
          })()}
        </>)}

        {/* ══ 내 예약 탭 ══ */}
        {tab==="mine"&&(<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontWeight:700,fontSize:16,color:"#111827"}}>내 예약</div>
            <span style={{fontSize:13,color:"#6b7280"}}>총 {myRes.length}건</span>
          </div>
          {myRes.length===0&&(
            <div style={{textAlign:"center",padding:"60px 20px",color:"#9ca3af"}}>
              <div style={{fontSize:40,marginBottom:10}}>🗓</div>
              <div style={{fontSize:14}}>예약 내역이 없어요</div>
              <button onClick={()=>setTab("calendar")} style={{marginTop:16,padding:"10px 24px",
                border:"none",borderRadius:10,background:"#2563eb",color:"#fff",
                fontWeight:600,fontSize:13,cursor:"pointer"}}>예약하러 가기</button>
            </div>
          )}
          {myRes.map(r=>{const car=CAR(r.carId);return(
            <div key={r.id} style={{background:"#fff",borderRadius:14,marginBottom:10,overflow:"hidden"}}>
              <div style={{height:4,background:car.color}}/>
              <div style={{padding:"14px 16px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:15,color:"#111827",letterSpacing:"0.04em"}}>{car.plate}</div>
                    <div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>{car.name}</div>
                  </div>
                  <span style={{fontSize:12,fontWeight:700,color:car.color,
                    background:car.color+"14",padding:"4px 10px",borderRadius:20}}>
                    {r.date.slice(5).replace("-","/")} {r.start}시~{r.end}시
                  </span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
                  {[{label:"날짜",val:r.date},{label:"이용시간",val:`${r.start}:00~${r.end}:00 (${r.end-r.start}h)`},
                    {label:"목적",val:r.purpose},{label:"차종",val:`${car.type} · ${car.seats}인승`}
                  ].map(s=>(
                    <div key={s.label} style={{background:"#f8fafc",borderRadius:8,padding:"8px 10px"}}>
                      <div style={{fontSize:10,color:"#9ca3af"}}>{s.label}</div>
                      <div style={{fontSize:13,fontWeight:600,color:"#374151",marginTop:2}}>{s.val}</div>
                    </div>
                  ))}
                </div>
                <button onClick={()=>cancel(r.id)} style={{width:"100%",padding:11,
                  border:"1px solid #fecaca",borderRadius:10,background:"#fff",
                  color:"#ef4444",fontWeight:600,fontSize:13,cursor:"pointer"}}>예약 취소</button>
              </div>
            </div>
          );})}
        </>)}

        {/* ══ 설정 탭 ══ */}
        {tab==="settings"&&(<>
          <div style={{fontWeight:700,fontSize:16,color:"#111827",marginBottom:4}}>설정</div>
          <div style={{fontSize:13,color:"#9ca3af",marginBottom:20}}>
            차량별 휴무 날짜를 등록하면 해당 날짜에 예약 버튼이 비활성화됩니다.
          </div>

          {/* 휴무 등록 카드 */}
          <div style={{background:"#fff",borderRadius:14,padding:16,marginBottom:14}}>
            <div style={{fontWeight:700,fontSize:14,color:"#111827",marginBottom:14}}>
              🔧 휴무 날짜 등록
            </div>

            {/* 차량 선택 */}
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <Fl label="차량 선택">
                <select value={hForm.carId} onChange={e=>hfv("carId",e.target.value)} style={inp}>
                  <option value="">차량을 선택하세요</option>
                  {CARS.map(c=>(
                    <option key={c.id} value={c.id}>
                      {c.plate} ({c.name})
                    </option>
                  ))}
                </select>
              </Fl>

              {/* 선택한 차량 미리보기 */}
              {hForm.carId && (() => {
                const car = CAR(Number(hForm.carId));
                return (
                  <div style={{display:"flex",alignItems:"center",gap:10,
                    background:car.color+"0f",borderRadius:10,padding:"10px 12px"}}>
                    <div style={{width:10,height:10,borderRadius:"50%",background:car.color,flexShrink:0}}/>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:"#111827"}}>{car.name}</div>
                      <div style={{fontSize:11,color:"#9ca3af"}}>{car.plate} · {car.type} · {car.seats}인승</div>
                    </div>
                  </div>
                );
              })()}

              <Fl label="휴무 날짜">
                <input type="date" value={hForm.date} onChange={e=>hfv("date",e.target.value)} style={inp}/>
              </Fl>

              {/* 이미 등록 여부 체크 */}
              {hForm.carId && hForm.date && holidays.some(h=>h.carId===Number(hForm.carId)&&h.date===hForm.date) && (
                <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:10,
                  padding:"10px 14px",fontSize:13,color:"#991b1b",fontWeight:600}}>
                  ⚠️ 이미 등록된 휴무예요
                </div>
              )}

              <button onClick={addHoliday} style={{
                width:"100%",padding:13,border:"none",borderRadius:10,
                background:"#ea580c",color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer"}}>
                휴무 등록
              </button>
            </div>
          </div>

          {/* 등록된 휴무 목록 */}
          <div style={{background:"#fff",borderRadius:14,padding:16}}>
            <div style={{fontWeight:700,fontSize:14,color:"#111827",marginBottom:12}}>
              📋 등록된 휴무
              <span style={{fontWeight:400,fontSize:12,color:"#9ca3af",marginLeft:8}}>총 {holidays.length}건</span>
            </div>

            {holidays.length===0&&(
              <div style={{textAlign:"center",padding:"20px 0",fontSize:13,color:"#9ca3af"}}>
                등록된 휴무가 없어요
              </div>
            )}

            {/* 날짜 기준 정렬 */}
            {[...holidays].sort((a,b)=>a.date.localeCompare(b.date)).map(h=>{
              const car=CAR(h.carId);
              const d=new Date(h.date), dow=d.getDay()===0?6:d.getDay()-1;
              return (
                <div key={h.id} style={{display:"flex",alignItems:"center",gap:12,
                  padding:"12px 0",borderBottom:"1px solid #f3f4f6"}}>
                  {/* 날짜 블록 */}
                  <div style={{width:46,height:46,borderRadius:10,background:"#fff7ed",
                    display:"flex",flexDirection:"column",alignItems:"center",
                    justifyContent:"center",flexShrink:0,border:"1px solid #fed7aa"}}>
                    <span style={{fontSize:9,color:"#d97706",fontWeight:600}}>{WEEK_DAYS[dow]}</span>
                    <span style={{fontSize:16,fontWeight:800,color:"#9a3412"}}>{h.date.slice(8)}</span>
                    <span style={{fontSize:9,color:"#d97706"}}>{h.date.slice(5,7)}월</span>
                  </div>
                  {/* 차량 정보 */}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:car.color}}/>
                      <div style={{fontSize:13,fontWeight:700,color:"#111827"}}>{car.name}</div>
                    </div>
                    <div style={{fontSize:11,color:"#9ca3af"}}>{car.plate} · {h.date}</div>
                  </div>
                  <button onClick={()=>removeHoliday(h.id)} style={{background:"none",
                    border:"1px solid #e5e7eb",borderRadius:8,padding:"5px 12px",
                    fontSize:12,color:"#9ca3af",cursor:"pointer",flexShrink:0}}>삭제</button>
                </div>
              );
            })}
          </div>
        </>)}
      </div>

      {/* 하단 탭바 */}
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",
        width:"100%",background:"#fff",borderTop:"1px solid #e5e7eb",
        display:"flex",zIndex:200}}>
        {[
          {id:"calendar",emoji:"📅",label:"예약 현황"},
          {id:"mine",    emoji:"🙋",label:"내 예약"  },
          {id:"settings",emoji:"⚙️", label:"설정"    },
        ].map(item=>(
          <button key={item.id} style={tabTs(item.id)} onClick={()=>setTab(item.id)}>
            <span style={{fontSize:22}}>{item.emoji}</span>
            <span style={{fontSize:10,fontWeight:600,color:tab===item.id?"#2563eb":"#9ca3af"}}>{item.label}</span>
          </button>
        ))}
      </div>

      {/* 예약 신청 시트 */}
      <Sheet open={showForm} onClose={()=>setShowForm(false)} title="🗓 차량 예약"
        cta="예약 확정" onCta={submit} ctaDisabled={!!conflict||!!formCarHoliday}>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <Fl label="차량 선택">
            <select value={form.carId} onChange={e=>fv("carId",e.target.value)} style={inp}>
              <option value="">차량을 선택하세요</option>
              {CARS.map(c=>{
                const isH=isCarHoliday(c.id,form.date);
                return <option key={c.id} value={c.id}>{c.plate} ({c.name}){isH?" — 휴무":""}</option>;
              })}
            </select>
          </Fl>
          <Fl label="사용 날짜">
            <input type="date" value={form.date} onChange={e=>fv("date",e.target.value)} style={inp}/>
          </Fl>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <Fl label="시작 시간">
              <select value={form.start} onChange={e=>fv("start",Number(e.target.value))} style={inp}>
                {HOURS.slice(0,-1).map(h=><option key={h} value={h}>{h}:00</option>)}
              </select>
            </Fl>
            <Fl label="종료 시간">
              <select value={form.end} onChange={e=>fv("end",Number(e.target.value))} style={inp}>
                {HOURS.slice(1).map(h=><option key={h} value={h}>{h}:00</option>)}
              </select>
            </Fl>
          </div>
          {formCarHoliday ? (
            <div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:10,
              padding:"10px 14px",fontSize:13,color:"#9a3412",fontWeight:600}}>
              🔧 선택한 날짜에 해당 차량은 휴무예요.
            </div>
          ) : conflict ? (
            <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:10,
              padding:"10px 14px",fontSize:13,color:"#991b1b",fontWeight:600}}>
              ⚠️ 해당 시간에 이미 예약이 있어요.
            </div>
          ) : form.carId&&form.end>form.start ? (
            <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:10,
              padding:"10px 14px",fontSize:13,color:"#1e40af"}}>
              ✅ {form.start}:00 ~ {form.end}:00 ({form.end-form.start}시간) 예약 가능
            </div>
          ) : null}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <Fl label="부서명">
              <input value={form.dept} onChange={e=>fv("dept",e.target.value)}
                placeholder="예: 개발팀" style={inp}/>
            </Fl>
            <Fl label="이름">
              <input value={form.name} onChange={e=>fv("name",e.target.value)}
                placeholder="예: 홍길동" style={inp}/>
            </Fl>
          </div>
          <Fl label="사용 목적">
            <input value={form.purpose} onChange={e=>fv("purpose",e.target.value)}
              placeholder="예: 거래처 방문, 공항 픽업" style={inp}/>
          </Fl>
        </div>
      </Sheet>

      {/* 차량 클릭 시트 — 해당 날 예약 목록 */}
      <Sheet open={!!carDetail} onClose={()=>setCarDetail(null)}
        title={carDetail ? `${carDetail.car.name} · ${selDate.slice(5).replace("-","/")}` : ""}>
        {carDetail&&(()=>{
          const {car,blocks,isHoliday}=carDetail;
          return (
            <div style={{display:"flex",flexDirection:"column",gap:0}}>
              {/* 차량 정보 */}
              <div style={{display:"flex",alignItems:"center",gap:12,
                background:"#f8fafc",borderRadius:12,padding:"14px",marginBottom:16}}>
                <div style={{width:48,height:48,borderRadius:14,background:car.color+"18",
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:26}}>🚗</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:800,fontSize:16,color:"#111827",letterSpacing:"0.04em"}}>{car.plate}</div>
                  <div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>{car.name} · {car.type} · {car.seats}인승</div>
                </div>
                {isHoliday
                  ? <span style={{fontSize:12,fontWeight:700,background:"#fed7aa",color:"#9a3412",
                      padding:"4px 10px",borderRadius:20}}>🔧 휴무</span>
                  : !isHoliday && (
                    <button onClick={()=>{setCarDetail(null);fv("carId",String(car.id));fv("date",selDate);setShowForm(true);}}
                      style={{background:car.color,color:"#fff",border:"none",borderRadius:8,
                        padding:"8px 16px",fontSize:13,fontWeight:700,cursor:"pointer"}}>예약하기</button>
                  )
                }
              </div>

              {/* 예약 없음 */}
              {!isHoliday && blocks.length===0 && (
                <div style={{textAlign:"center",padding:"32px 0",color:"#9ca3af"}}>
                  <div style={{fontSize:32,marginBottom:8}}>📭</div>
                  <div style={{fontSize:14}}>이 날 예약이 없어요</div>
                </div>
              )}

              {/* 휴무 안내 */}
              {isHoliday && (
                <div style={{textAlign:"center",padding:"32px 0",color:"#d97706"}}>
                  <div style={{fontSize:32,marginBottom:8}}>🔧</div>
                  <div style={{fontSize:14,fontWeight:600}}>정비·휴무일입니다</div>
                  <div style={{fontSize:12,color:"#9ca3af",marginTop:6}}>예약을 받지 않아요</div>
                </div>
              )}

              {/* 예약 목록 */}
              {!isHoliday && blocks.map((r,i)=>(
                <div key={r.id} style={{
                  borderRadius:12,padding:"14px",marginBottom:8,
                  background:r.user===form.name?car.color+"0d":"#f8fafc",
                  border:`1px solid ${r.user===form.name?car.color+"30":"#f1f5f9"}`}}>
                  {/* 시간 바 */}
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                    <div style={{width:4,height:32,borderRadius:2,background:car.color,flexShrink:0}}/>
                    <div>
                      <div style={{fontWeight:700,fontSize:15,color:"#111827"}}>
                        {r.start}:00 ~ {r.end}:00
                        <span style={{fontSize:12,fontWeight:400,color:"#9ca3af",marginLeft:6}}>({r.end-r.start}시간)</span>
                      </div>
                      <div style={{fontSize:12,color:"#6b7280",marginTop:2}}>{r.purpose}</div>
                    </div>
                    {r.user===form.name && (
                      <span style={{marginLeft:"auto",fontSize:11,color:car.color,fontWeight:700,
                        background:car.color+"18",padding:"3px 8px",borderRadius:20}}>내 예약</span>
                    )}
                  </div>
                  {/* 예약자 */}
                  <div style={{display:"flex",alignItems:"center",gap:8,paddingLeft:12}}>
                    <Avatar name={r.user} color={car.color} size={26}/>
                    <span style={{fontSize:13,color:"#374151",fontWeight:600}}>{r.user}</span>
                    <span style={{fontSize:12,color:"#9ca3af"}}>({r.dept})</span>
                    {r.user===form.name && (
                      <button onClick={()=>{cancel(r.id);setCarDetail(null);}}
                        style={{marginLeft:"auto",background:"none",border:"1px solid #fecaca",
                          borderRadius:8,padding:"3px 10px",fontSize:11,color:"#ef4444",cursor:"pointer"}}>
                        취소
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </Sheet>

      {/* 예약 상세 시트 */}
      <Sheet open={!!detail} onClose={()=>setDetail(null)} title="예약 상세"
        cta={detail?.user===form.name?"예약 취소":null}
        onCta={()=>cancel(detail?.id)} ctaColor="#ef4444">
        {detail&&(()=>{const car=CAR(detail.carId);return(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:48,height:48,borderRadius:14,background:car.color+"18",
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:26}}>🚗</div>
              <div>
                <div style={{fontWeight:700,fontSize:16,color:"#111827"}}>{car.name}</div>
                <div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>{car.plate} · {car.type}</div>
              </div>
            </div>
            <div style={{height:1,background:"#f3f4f6"}}/>
            <div style={{display:"flex",alignItems:"center",gap:12,
              background:"#f8fafc",borderRadius:12,padding:"12px 14px"}}>
              <Avatar name={detail.user} color={car.color} size={36}/>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:"#111827"}}>{detail.user}</div>
                <div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>{detail.dept}</div>
              </div>
              {detail.user===form.name&&(
                <span style={{marginLeft:"auto",fontSize:12,color:car.color,fontWeight:700}}>내 예약</span>
              )}
            </div>
            {[{label:"날짜",val:detail.date},
              {label:"시간",val:`${detail.start}:00 ~ ${detail.end}:00 (${detail.end-detail.start}시간)`},
              {label:"목적",val:detail.purpose}
            ].map(s=>(
              <div key={s.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:13,color:"#9ca3af"}}>{s.label}</span>
                <span style={{fontSize:13,fontWeight:600,color:"#374151"}}>{s.val}</span>
              </div>
            ))}
          </div>
        );})()} 
      </Sheet>
    </div>
  );
}
