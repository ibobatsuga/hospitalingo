import React, { useMemo, useState } from 'react';

const scenarios = [
  { icon: '🛎️', title: 'Hotel check-in', subtitle: 'Welcome a new guest', prompt: 'Good evening. I have a reservation under the name Sarah Lee.', hint: 'Welcome the guest, confirm the reservation, and offer help with luggage.' },
  { icon: '🍽️', title: 'Restaurant order', subtitle: 'Recommend tonight’s menu', prompt: 'Could you recommend something popular for dinner?', hint: 'Recommend a dish, describe it briefly, and ask about allergies.' },
  { icon: '☕', title: 'Coffee conversation', subtitle: 'Make friendly small talk', prompt: 'It is my first morning in Bali. What should I visit?', hint: 'Suggest one place and explain why it is worth visiting.' },
  { icon: '📞', title: 'Guest request', subtitle: 'Respond with confidence', prompt: 'My air conditioner is not working. Could someone help?', hint: 'Apologize, confirm action, and give a realistic time estimate.' }
];

const vocabulary = [
  { word: 'reservation', type: 'noun', id: 'pemesanan', example: 'I have a reservation under the name Lee.' },
  { word: 'available', type: 'adjective', id: 'tersedia', example: 'An early check-in is available today.' },
  { word: 'luggage', type: 'noun', id: 'barang bawaan', example: 'May I help you with your luggage?' },
  { word: 'complimentary', type: 'adjective', id: 'gratis', example: 'Breakfast is complimentary for hotel guests.' },
  { word: 'recommend', type: 'verb', id: 'merekomendasikan', example: 'I recommend our signature seafood pasta.' },
  { word: 'apologize', type: 'verb', id: 'meminta maaf', example: 'I apologize for the inconvenience.' }
];

const lessons = [
  ['01', 'Vocabulary', '8 useful hotel words', '3 min'],
  ['02', 'Listening', 'A guest arrives', '4 min'],
  ['03', 'Grammar', 'May I help you?', '3 min'],
  ['04', 'Speaking', 'Welcome your guest', '5 min'],
  ['05', 'Conversation', 'Role-play with Mia', '6 min']
];

const css = `
  :root{font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#29231f;background:#f7f3ec;font-synthesis:none}
  *{box-sizing:border-box}body{margin:0}button,input,select,textarea{font:inherit}button{color:inherit}.app{min-height:100vh;background:#f7f3ec}.hidden{display:none!important}
  .onboard{min-height:100vh;display:grid;place-items:center;padding:24px;background-color:#f8fafc;background-image:linear-gradient(#e9edf5 1px,transparent 1px),linear-gradient(90deg,#e9edf5 1px,transparent 1px);background-size:30px 30px}.oncard{width:min(620px,100%);padding:46px;border-top:5px solid #f78b17;border-radius:30px;background:#fff;box-shadow:0 30px 80px #6f7f9c2c}.brand{display:flex;align-items:center;gap:11px;font-size:21px;font-weight:900}.brand.center{justify-content:center}.mark{width:42px;height:42px;display:grid;place-items:center;border-radius:50% 50% 50% 13px;background:linear-gradient(145deg,#ffb441,#ed7907);color:#fff;box-shadow:0 10px 25px #ef8b2240}.brand em{color:#f68b18;font-style:normal}.oncard h1{text-align:center;margin:27px 0 8px;font:600 38px Georgia,serif}.intro{text-align:center;color:#778093;line-height:1.55;font-size:14px}.form{margin-top:30px;display:grid;grid-template-columns:1fr 1fr;gap:15px}.field{display:grid;gap:8px}.field.full{grid-column:1/-1}.field label{font-size:10px;font-weight:900;letter-spacing:.7px}.field input,.field select,.search{width:100%;padding:15px;border:1px solid #dde4ef;border-radius:14px;background:#fbfcff;outline:none}.field input:focus,.field select:focus,.search:focus{border-color:#f69a33;box-shadow:0 0 0 4px #f69a3318}.level-note{grid-column:1/-1;padding:15px 17px;display:flex;justify-content:space-between;align-items:center;border:1px solid #f1d4ab;border-radius:15px;background:#fff8ec}.level-note b{font-size:12px}.level-note small{display:block;color:#8e7e69;font-size:10px}.cta{border:0;border-radius:14px;background:linear-gradient(135deg,#fa9b28,#ea7605);color:#fff;padding:15px 20px;font-weight:850;cursor:pointer;box-shadow:0 12px 28px #e8841738}.form>.cta{grid-column:1/-1}.cta:disabled{opacity:.45;cursor:not-allowed}
  .shell{min-height:100vh;display:flex}.sidebar{width:246px;height:100vh;position:sticky;top:0;padding:28px 21px 21px;display:flex;flex-direction:column;background:#2b241e;color:#fff}.sidebar .brand{font-size:19px}.nav{display:grid;gap:7px;margin-top:44px}.nav button{border:0;background:transparent;color:#c9bfb5;padding:12px 13px;border-radius:12px;display:flex;align-items:center;gap:12px;text-align:left;cursor:pointer}.nav button.active,.nav button:hover{background:#493827;color:#fff;box-shadow:inset 3px 0 #ff9b1d}.nav button span{font-size:19px}.section-label{margin:31px 12px 9px;padding-top:24px;border-top:1px solid #ffffff18;color:#91867b;font-size:9px;font-weight:900;letter-spacing:1.5px}.quick{display:grid}.quick button{border:0;background:none;color:#c9bfb5;padding:9px 12px;text-align:left;cursor:pointer}.quick button:before{content:"";width:8px;height:8px;margin-right:11px;display:inline-block;border-radius:50%;background:#ffad3d}.user{margin-top:auto;padding-top:16px;border-top:1px solid #ffffff18;display:flex;align-items:center;gap:10px}.avatar{width:37px;height:37px;display:grid;place-items:center;border-radius:50%;background:#f38a16;font-size:11px;font-weight:900}.user div{display:grid;gap:2px}.user b{font-size:11px}.user small{color:#9d9288;font-size:8px}.workspace{width:calc(100% - 246px)}.topbar{height:72px;padding:0 36px;position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e9e1d7;background:#f7f3eced;backdrop-filter:blur(14px)}.crumb{font-size:11px;font-weight:850}.status{display:flex;align-items:center;gap:9px}.pill{padding:8px 12px;border:1px solid #e9e1d7;border-radius:999px;background:#fff;font-size:10px;font-weight:850}.page{max-width:1240px;margin:auto;padding:30px 35px 80px}.home{display:grid;grid-template-columns:.92fr 1.08fr;gap:25px}.focus,.panel{padding:25px;border:1px solid #e8dfd4;border-radius:29px;background:#fffefa;box-shadow:0 22px 60px #67451f16}.welcome{display:flex;align-items:center;justify-content:space-between}.person{display:flex;align-items:center;gap:12px}.big-avatar{width:53px;height:53px;display:grid;place-items:center;border:3px solid #f59224;border-radius:50%;background:#fff0dd;font-size:23px}.person span{display:grid;gap:3px}.person small{color:#968e86;font-size:10px}.person strong{font:600 18px Georgia,serif}.bell{width:42px;height:42px;border:0;border-radius:50%;background:#edf4f5;cursor:pointer}.level{margin-top:20px;padding:17px;display:grid;grid-template-columns:1fr auto;gap:13px;border-radius:21px;background:#eef4f5}.level small{display:block;color:#777;font-size:9px}.level strong{font-size:14px}.segments{grid-column:1/-1;display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.segments i{height:7px;border-radius:20px;background:#fff}.segments i:first-child,.segments i:nth-child(2){background:linear-gradient(90deg,#f4860d,#ffc56f)}.headline{margin:26px 0 44px}.eyebrow{color:#d87508;font-size:9px;font-weight:900;letter-spacing:1.3px}.headline h1,.pagehead h1{margin:7px 0 7px;font:500 39px/1.05 Georgia,serif}.headline p,.pagehead p{margin:0;color:#817a73;font-size:11px;line-height:1.55}.coach{min-height:390px;padding:23px;display:flex;flex-direction:column;align-items:center;border-radius:28px;background:radial-gradient(circle at 50% 55%,#ffffff35 0 10%,transparent 11% 23%,#ffffff1c 24% 31%,transparent 32%),linear-gradient(150deg,#f57f05,#ff9f24 60%,#ffc56b);color:#fff;box-shadow:0 24px 52px #d96c003d}.bubble{margin:-48px auto 17px;padding:12px 16px;border-radius:17px 17px 17px 5px;background:#fff8ef;color:#55483e;font-size:11px}.coach-top{width:100%;display:flex;align-items:center;justify-content:space-between}.mini-faces span{width:29px;height:29px;margin-left:-5px;display:inline-grid;place-items:center;border:2px solid #ef8611;border-radius:50%;background:#fff;color:#a45d0e;font-size:12px}.coach h2{max-width:420px;margin:42px 0 25px;text-align:center;font:400 29px/1.2 Georgia,serif}.controls{display:flex;align-items:center;gap:22px}.controls button{width:52px;height:52px;border:0;border-radius:50%;background:#ffffff2b;color:#fff;cursor:pointer}.controls .mic{width:82px;height:82px;border:9px solid #ffffff3b;background:#fff;color:#ee7e0a;font-size:24px}.coach>small{margin-top:14px;color:#ffffffc8}.coach .start{width:100%;margin-top:auto;border:0;border-radius:15px;background:#fff;padding:15px;font-weight:850;cursor:pointer}.coach-note{margin-top:13px;padding:13px 15px;border-radius:14px;background:#fff5e7;font-size:10px}.library{display:grid;align-content:start;gap:18px}.title{display:flex;align-items:end;justify-content:space-between}.title h2{margin:5px 0 0;font:500 25px Georgia,serif}.title button{border:0;background:none;color:#d97508;font-size:9px;font-weight:850;cursor:pointer}.scenes{display:grid;grid-template-columns:1fr 1fr;gap:11px}.scene{min-height:160px;padding:18px;position:relative;overflow:hidden;border:0;border-radius:23px;color:#fff;text-align:left;cursor:pointer;box-shadow:inset 0 -70px 70px #1c110a72}.scene:nth-child(1){background:linear-gradient(145deg,#6f4b36,#c18d68)}.scene:nth-child(2){background:linear-gradient(145deg,#665a31,#d69b42)}.scene:nth-child(3){background:linear-gradient(145deg,#3d6261,#74a49b)}.scene:nth-child(4){background:linear-gradient(145deg,#4d456a,#9a76a2)}.scene .art{position:absolute;right:17px;top:18px;font-size:56px;filter:drop-shadow(0 9px 8px #0003)}.scene span{position:absolute;left:17px;right:17px;bottom:15px;z-index:1;display:grid}.scene b{font:500 15px Georgia,serif}.scene small{color:#ffffffc9;font-size:9px}.path{padding:19px;border:1px solid #e8dfd4;border-radius:23px;background:#fff}.path h3{margin:5px 0 8px;font:500 20px Georgia,serif}.lesson{width:100%;padding:10px 0;display:grid;grid-template-columns:33px 1fr auto;gap:10px;align-items:center;border:0;border-bottom:1px solid #f0e9e0;background:none;text-align:left;cursor:pointer}.num{width:31px;height:31px;display:grid;place-items:center;border-radius:10px;background:#ffe1bb;color:#ae5d08;font-size:8px;font-weight:900}.lesson span:nth-child(2){display:grid}.lesson b{font-size:10px}.lesson small,.lesson>small{color:#999;font-size:8px}
  .content{max-width:900px;margin:auto}.pagehead{margin-bottom:25px}.back{margin-bottom:18px;border:0;background:none;color:#c76c06;font-weight:800;cursor:pointer}.practice-card{padding:34px;border:1px solid #e8dfd4;border-radius:28px;background:#fff;box-shadow:0 22px 58px #66431d12}.scenario-title{display:flex;align-items:center;gap:14px}.scenario-title .emoji{width:52px;height:52px;display:grid;place-items:center;border-radius:17px;background:#fff1de;font-size:26px}.practice-card h2{margin:18px 0 8px;font:500 30px Georgia,serif}.guest{padding:18px;border-radius:17px 17px 17px 5px;background:#f4eee6;line-height:1.55}.hint{margin:16px 0;color:#786f68;font-size:12px}.answer{width:100%;min-height:110px;padding:15px;border:1px solid #e4dbd0;border-radius:15px;resize:vertical;outline:none}.answer:focus{border-color:#f19022;box-shadow:0 0 0 4px #f1902218}.actions{margin-top:14px;display:flex;gap:10px}.secondary{border:1px solid #e5d9cb;border-radius:13px;background:#fff;padding:13px 17px;font-weight:800;cursor:pointer}.feedback{margin-top:15px;padding:16px;border-radius:15px;background:#edf8ed;color:#356443;font-size:12px;line-height:1.5}.feedback.warn{background:#fff2e6;color:#8a4c23}.wordbar{display:flex;gap:12px;margin-bottom:18px}.wordbar .search{flex:1}.wordgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}.word{padding:21px;border:1px solid #e8dfd4;border-radius:20px;background:#fff;transition:.2s}.word.learned{border-color:#bcdab9;background:#f4fbf3}.wordtop{display:flex;justify-content:space-between;gap:10px}.word h3{margin:0;font:500 25px Georgia,serif}.word .type{color:#d8790d;font-size:9px;font-weight:900;text-transform:uppercase}.word p{color:#756e68;font-size:11px;line-height:1.55}.word button{border:0;background:none;color:#bd6808;font-size:10px;font-weight:850;cursor:pointer}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:13px}.stat{padding:21px;border:1px solid #e8dfd4;border-radius:19px;background:#fff}.stat:first-child{background:#2b241e;color:#fff}.stat small{color:#999;font-size:8px}.stat b{display:block;margin-top:8px;font-size:29px}.chart{margin-top:18px;padding:24px;border:1px solid #e8dfd4;border-radius:23px;background:#fff}.bars{height:200px;margin-top:22px;display:flex;align-items:end;justify-content:space-around;border-bottom:1px solid #eee3d8}.day{height:100%;display:flex;flex-direction:column;justify-content:end;align-items:center;gap:8px;color:#999;font-size:9px}.bar{width:31px;border-radius:10px 10px 3px 3px;background:linear-gradient(#ffad3e,#ed7a08)}.bottomnav{display:none}
  @media(max-width:1050px){.home{grid-template-columns:1fr}.page{max-width:760px}.stats{grid-template-columns:1fr 1fr}}
  @media(max-width:720px){.sidebar{display:none}.workspace{width:100%;padding-bottom:66px}.topbar{height:62px;padding:0 16px}.page{padding:20px 14px 85px}.focus,.panel{padding:18px}.headline h1,.pagehead h1{font-size:30px}.coach{margin-top:38px}.scenes{gap:8px}.scene{min-height:145px}.oncard{padding:31px 21px}.form{grid-template-columns:1fr}.field.full,.level-note,.form>.cta{grid-column:auto}.wordgrid{grid-template-columns:1fr}.stats{grid-template-columns:1fr 1fr}.bottomnav{position:fixed;left:0;right:0;bottom:0;z-index:30;padding:8px;display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid #e8dfd4;background:#fffdf9f2;backdrop-filter:blur(12px)}.bottomnav button{border:0;background:none;color:#8c837b;font-size:9px}.bottomnav button.active{color:#e37a07;font-weight:900}}
`;

function App() {
  const [profile, setProfile] = useState(null);
  const [view, setView] = useState('home');
  const [scenario, setScenario] = useState(0);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [learned, setLearned] = useState([]);
  const [query, setQuery] = useState('');

  const go = (next) => { setView(next); setFeedback(null); window.scrollTo(0, 0); };
  const practice = (index = 0) => { setScenario(index); setAnswer(''); setFeedback(null); go('practice'); };
  const submit = () => {
    const value = answer.trim();
    if (!value) return setFeedback({ ok: false, score: 0, text: 'Write or say your response first.' });
    const polite = /welcome|may i|could i|please|apologize|sorry|recommend/i.test(value);
    setFeedback({ ok: polite, score: polite ? 92 : 76, text: polite ? 'Guest-ready! Your tone is warm, clear, and professional.' : 'Good start. Add a polite phrase such as “May I…” or “I apologize…” for a warmer tone.' });
  };

  if (!profile) return <><style>{css}</style><Onboarding onStart={setProfile} /></>;

  const nav = [
    ['home', '⌂', 'Home'], ['practice', '🎤', 'Practice'], ['vocab', '◫', 'Vocabulary'], ['progress', '▥', 'Progress']
  ];
  return <div className="app"><style>{css}</style><div className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="mark">H</span><span>Hospita<em>Lingo</em></span></div>
      <nav className="nav">{nav.map(([id, icon, label]) => <button key={id} className={view === id ? 'active' : ''} onClick={() => id === 'practice' ? practice(scenario) : go(id)}><span>{icon}</span>{label}</button>)}</nav>
      <div className="section-label">QUICK SKILLS</div>
      <div className="quick"><button onClick={() => practice(0)}>Speaking</button><button onClick={() => go('vocab')}>Vocabulary</button><button onClick={() => practice(1)}>Listening</button></div>
      <div className="user"><span className="avatar">{profile.name.slice(0, 2).toUpperCase()}</span><div><b>{profile.name}</b><small>{profile.role} · {profile.level}</small></div></div>
    </aside>
    <section className="workspace">
      <header className="topbar"><div className="crumb">UNIT 1 · GUEST ARRIVAL</div><div className="status"><span className="pill">🔥 7 day streak</span><span className="pill">{learned.length}/6 words</span></div></header>
      {view === 'home' && <Home profile={profile} practice={practice} go={go} />}
      {view === 'practice' && <Practice scenario={scenario} setScenario={setScenario} answer={answer} setAnswer={setAnswer} feedback={feedback} submit={submit} practice={practice} go={go} />}
      {view === 'vocab' && <Vocabulary query={query} setQuery={setQuery} learned={learned} setLearned={setLearned} go={go} />}
      {view === 'progress' && <Progress learned={learned} go={go} />}
    </section>
  </div><nav className="bottomnav">{nav.map(([id, icon, label]) => <button key={id} className={view === id ? 'active' : ''} onClick={() => id === 'practice' ? practice(scenario) : go(id)}>{icon}<br />{label}</button>)}</nav></div>;
}

function Onboarding({ onStart }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('Hotel staff');
  const [level, setLevel] = useState('A2 · Elementary');
  return <main className="onboard"><section className="oncard">
    <div className="brand center"><span className="mark">H</span><span>Hospita<em>Lingo</em></span></div>
    <h1>Welcome!</h1><p className="intro">Build confident English for every guest interaction.<br />Your AI coach adapts each hospitality lesson to you.</p>
    <div className="form"><div className="field full"><label>YOUR NAME</label><input value={name} onChange={e => setName(e.target.value)} placeholder="For example: Bobi" /></div>
      <div className="field"><label>YOUR ROLE</label><select value={role} onChange={e => setRole(e.target.value)}><option>Hotel staff</option><option>Restaurant staff</option><option>Tourism professional</option><option>Student</option></select></div>
      <div className="field"><label>ENGLISH LEVEL</label><select value={level} onChange={e => setLevel(e.target.value)}><option>A1 · Beginner</option><option>A2 · Elementary</option><option>B1 · Intermediate</option><option>B2 · Upper intermediate</option></select></div>
      <div className="level-note"><div><b>Not sure about your level?</b><small>Start at A2 and adjust it anytime.</small></div><span>◎</span></div>
      <button className="cta" disabled={!name.trim()} onClick={() => onStart({ name: name.trim(), role, level })}>Save profile & start learning →</button>
    </div>
  </section></main>;
}

function Home({ profile, practice, go }) {
  return <main className="page home"><section className="focus">
    <div className="welcome"><div className="person"><span className="big-avatar">👨🏽‍💼</span><span><small>WELCOME BACK</small><strong>{profile.name}</strong></span></div><button className="bell">♢</button></div>
    <div className="level"><span><small>CURRENT LEVEL</small><strong>{profile.level}</strong></span><b>48%</b><div className="segments"><i /><i /><i /><i /></div></div>
    <div className="headline"><span className="eyebrow">UNIT 1 · LESSON 4</span><h1>Simple guest<br />conversations</h1><p>Speak naturally, respond politely, and create a warm first impression.</p></div>
    <div className="coach"><div className="bubble">Let’s welcome a guest arriving at the hotel.</div><div className="coach-top"><div className="mini-faces"><span>👩🏻</span><span>👨🏽</span><span>👩🏾</span></div><b>•••</b></div><h2>“Good evening. Welcome to Sunrise Hotel.”</h2><div className="controls"><button>▶</button><button className="mic" onClick={() => practice(0)}>🎤</button><button>•••</button></div><small>Tap the microphone to practice</small><button className="start" onClick={() => practice(0)}>Start speaking</button></div>
    <div className="coach-note">💬 Coach Mia: Focus on a warm tone and clear pronunciation.</div>
  </section><section className="library"><div className="title"><div><span className="eyebrow">PRACTICE ANYWHERE</span><h2>Role-play community</h2></div><button onClick={() => practice(0)}>See all →</button></div>
    <div className="scenes">{scenarios.map((item, i) => <button className="scene" key={item.title} onClick={() => practice(i)}><span className="art">{item.icon}</span><span><b>{item.title}</b><small>{item.subtitle}</small></span></button>)}</div>
    <div className="path"><span className="eyebrow">YOUR LEARNING PATH</span><h3>Guest arrival essentials</h3>{lessons.map(([n, title, sub, time], i) => <button className="lesson" key={title} onClick={() => i === 0 ? go('vocab') : practice(Math.min(i - 1, 3))}><span className="num">{n}</span><span><b>{title}</b><small>{sub}</small></span><small>{time} ›</small></button>)}</div>
  </section></main>;
}

function Practice({ scenario, setScenario, answer, setAnswer, feedback, submit, practice, go }) {
  const item = scenarios[scenario];
  return <main className="page content"><button className="back" onClick={() => go('home')}>← Back to dashboard</button><div className="pagehead"><span className="eyebrow">ROLE-PLAY · LIVE COACH</span><h1>Practice with confidence</h1><p>Respond as if you were speaking to a real guest. Your coach gives instant feedback.</p></div>
    <section className="practice-card"><div className="scenario-title"><span className="emoji">{item.icon}</span><div><b>{item.title}</b><div style={{ color: '#8b827a', fontSize: 11 }}>{item.subtitle}</div></div></div><h2>Your guest says:</h2><div className="guest">“{item.prompt}”</div><p className="hint"><b>Coach hint:</b> {item.hint}</p><textarea className="answer" value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Type your English response here…" />
      <div className="actions"><button className="secondary" onClick={() => setAnswer('Welcome! May I have your name, please?')}>🎤 Use sample answer</button><button className="cta" onClick={submit}>Check my answer</button></div>
      {feedback && <div className={'feedback ' + (feedback.ok ? '' : 'warn')}><b>{feedback.score ? feedback.score + '/100 · ' : ''}{feedback.ok ? 'Guest-ready' : 'Keep improving'}</b><br />{feedback.text}</div>}
      {feedback && <div className="actions"><button className="secondary" onClick={() => practice((scenario + 1) % scenarios.length)}>Next challenge →</button></div>}
    </section>
    <div className="wordbar" style={{ marginTop: 16 }}><select className="search" value={scenario} onChange={e => { setScenario(Number(e.target.value)); practice(Number(e.target.value)); }}>{scenarios.map((s, i) => <option value={i} key={s.title}>{s.title}</option>)}</select></div>
  </main>;
}

function Vocabulary({ query, setQuery, learned, setLearned, go }) {
  const filtered = useMemo(() => vocabulary.filter(v => (v.word + v.id + v.example).toLowerCase().includes(query.toLowerCase())), [query]);
  const toggle = word => setLearned(items => items.includes(word) ? items.filter(x => x !== word) : [...items, word]);
  return <main className="page content"><button className="back" onClick={() => go('home')}>← Back to dashboard</button><div className="pagehead"><span className="eyebrow">WORD BANK</span><h1>Hospitality vocabulary</h1><p>Learn useful words, understand them in Indonesian, and remember them in context.</p></div><div className="wordbar"><input className="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search words or translations…" /><span className="pill">{learned.length}/{vocabulary.length} learned</span></div>
    <div className="wordgrid">{filtered.map(item => <article className={'word ' + (learned.includes(item.word) ? 'learned' : '')} key={item.word}><div className="wordtop"><div><span className="type">{item.type}</span><h3>{item.word}</h3></div><span>{learned.includes(item.word) ? '✓' : '○'}</span></div><p><b>{item.id}</b><br />“{item.example}”</p><button onClick={() => toggle(item.word)}>{learned.includes(item.word) ? 'Mark as reviewing' : 'Mark as learned →'}</button></article>)}</div>
  </main>;
}

function Progress({ learned, go }) {
  const heights = [42, 68, 48, 84, 61, 94, 73];
  return <main className="page content"><button className="back" onClick={() => go('home')}>← Back to dashboard</button><div className="pagehead"><span className="eyebrow">YOUR MOMENTUM</span><h1>Learning progress</h1><p>Small, consistent practice builds confident guest conversations.</p></div>
    <div className="stats"><div className="stat"><small>CURRENT STREAK</small><b>7 🔥</b></div><div className="stat"><small>LESSONS COMPLETE</small><b>12</b></div><div className="stat"><small>WORDS LEARNED</small><b>{learned.length}</b></div><div className="stat"><small>SPEAKING SCORE</small><b>88</b></div></div>
    <section className="chart"><div className="title"><div><span className="eyebrow">LAST 7 DAYS</span><h2>Minutes practiced</h2></div><span className="pill">126 min total</span></div><div className="bars">{heights.map((h, i) => <div className="day" key={i}><div className="bar" style={{ height: h + '%' }} /><span>{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i]}</span></div>)}</div></section>
  </main>;
}

export default App;
