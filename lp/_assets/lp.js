/* Гармония Улыбки — общий скрипт рекламных лендингов /lp/*.
   Страница перед подключением задаёт window.LP = { CONFIG, QUIZ }.
   Логика заявок перенесена 1:1 с прежних лендингов: POST JSON → /lp/lead.php → редирект /lp/thanks/.
   Цели Метрики: form_submit, quiz_start, quiz_complete, call_click, video_play, msgr_click. */
(function(){
'use strict';

const LP = window.LP || {};
const CONFIG = LP.CONFIG || {};
const QUIZ = LP.QUIZ || [];

/* Боевой домен: только там уходят заявки. На превью/локально форма показывает «спасибо» без отправки. */
const H = location.hostname;
const ON_PROD = (H === 'harmonysmile.ru' || H.slice(-15) === '.harmonysmile.ru');
if (!ON_PROD){
  const bar = document.createElement('div');
  bar.className = 'prev-bar';
  document.documentElement.classList.add('is-preview');
  bar.textContent = 'Превью редизайна · заявки с этой страницы никуда не отправляются · аналитика отключена';
  document.body.prepend(bar);
}

/* ---- UTM / метки: считываем один раз ---- */
const TRACKED_PARAMS = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','yclid','ymclid','gclid','_openstat','roistat','from'];
const LEAD_META = (function(){
  const p = new URLSearchParams(location.search);
  const o = {};
  TRACKED_PARAMS.forEach(k => { const v = p.get(k); if (v) o[k] = v; });
  o.page_url = location.href;
  o.referrer = document.referrer || '';
  return o;
})();
function injectMeta(form){
  Object.entries(LEAD_META).forEach(([k,v]) => {
    if (form.querySelector('[name="'+k+'"]')) return;
    const i = document.createElement('input');
    i.type = 'hidden'; i.name = k; i.value = v; form.appendChild(i);
  });
}

/* ---- ClientID Метрики (сквозная аналитика AMO → офлайн-конверсии) ---- */
let YM_CLIENT_ID = '';
(function initClientID(tries){
  try {
    if (typeof window.ym === 'function') {
      window.ym(CONFIG.METRIKA_ID, 'getClientID', function(id){ if (id) YM_CLIENT_ID = String(id); });
      return;
    }
  } catch(e){}
  if ((tries || 0) < 20) setTimeout(function(){ initClientID((tries || 0) + 1); }, 500);
})(0);
function getYmClientID(){
  if (YM_CLIENT_ID) return YM_CLIENT_ID;
  const m = document.cookie.match(/(?:^|;\s*)_ym_uid=(\d+)/);
  return m ? m[1] : '';
}

/* ---- Цели: dataLayer + Метрика ---- */
function trackGoal(goal, params){
  try { window.dataLayer = window.dataLayer || []; window.dataLayer.push(Object.assign({event: goal}, params||{})); } catch(e){}
  try { if (typeof window.ym === 'function') window.ym(CONFIG.METRIKA_ID, 'reachGoal', goal, params||{}); } catch(e){}
  console.log('[track]', goal, params || {});
}
document.querySelectorAll('[data-goal="call_click"]').forEach(el => {
  el.addEventListener('click', () => trackGoal('call_click', LEAD_META));
});
document.querySelectorAll('[data-goal="msgr_click"]').forEach(el => {
  el.addEventListener('click', () => trackGoal('msgr_click', Object.assign({msgr: el.dataset.msgr || ''}, LEAD_META)));
});

/* ---- Маска телефона +7 ---- */
function maskPhone(input){
  input.addEventListener('input', () => {
    let d = input.value.replace(/\D/g,'');
    if (d.startsWith('8')) d = '7' + d.slice(1);
    if (!d.startsWith('7')) d = '7' + d;
    d = d.slice(0,11);
    let r = '+7';
    if (d.length > 1) r += ' (' + d.slice(1,4);
    if (d.length > 4) r += ') ' + d.slice(4,7);
    if (d.length > 7) r += '-' + d.slice(7,9);
    if (d.length > 9) r += '-' + d.slice(9,11);
    input.value = r;
  });
}
function phoneValid(v){ return v.replace(/\D/g,'').length === 11; }
document.querySelectorAll('input[type="tel"]').forEach(maskPhone);

/* ---- Отправка формы ---- */
function handleForm(form, onSuccess){
  injectMeta(form);
  form.addEventListener('submit', function(e){
    e.preventDefault();
    const phone = form.querySelector('input[type="tel"]');
    const name = form.querySelector('input[name="name"]');
    const consent = form.querySelector('input[name="consent"]');
    let ok = true;
    if (name && !name.value.trim()){ name.classList.add('err'); ok = false; } else if (name){ name.classList.remove('err'); }
    if (phone && !phoneValid(phone.value)){ phone.classList.add('err'); ok = false; } else if (phone){ phone.classList.remove('err'); }
    if (consent){ consent.closest('.consent').classList.toggle('err', !consent.checked); if (!consent.checked) ok = false; }
    if (!ok) return;

    // honeypot: боты заполняют скрытое поле — тихо «принимаем», ничего не шлём
    const hp = form.querySelector('input[name="company"]');
    if (hp && hp.value){ if (typeof onSuccess === 'function') onSuccess(); return; }

    const isQuiz = (form.dataset.formId === 'quiz');
    const data = {
      name: name ? name.value.trim() : '',
      phone: phone ? phone.value : '',
      source: CONFIG.LEAD_SOURCE + (isQuiz ? ' (квиз)' : '')
    };
    data.ym_client_id = getYmClientID();
    Object.assign(data, LEAD_META);
    const qa = form.querySelector('[name="quiz_answers"]');
    if (qa) data.quiz_answers = qa.value;

    // 1) Метрика
    trackGoal('form_submit', { form_id: form.dataset.formId || 'form' });
    // 2) CallTouch — sessionId для склейки заявки со звонками
    try { if (typeof window.ct === 'function') data.ctSessionId = (window.ct('calltracking_params','c8g8250b')||{}).sessionId || ''; } catch(_) {}

    // 3) Превью: не шлём, показываем «спасибо» на месте
    if (!ON_PROD){
      console.log('[preview] заявка НЕ отправлена:', data);
      if (typeof onSuccess === 'function') onSuccess(data);
      return;
    }
    // 4) Боевой: обработчик клиники + редирект на /lp/thanks/ (это и есть конверсия для Метрики)
    const go = () => { window.location.href = CONFIG.THANKS_URL + '?source=' + encodeURIComponent(data.source) + '&lp=' + CONFIG.LP_SLUG; };
    let fired = false; const once = () => { if (!fired){ fired = true; go(); } };
    if (CONFIG.LEAD_ENDPOINT){
      fetch(CONFIG.LEAD_ENDPOINT, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data), keepalive:true }).then(once, once);
      setTimeout(once, 1500);
    } else if (typeof onSuccess === 'function'){ onSuccess(data); } else { go(); }
  });
}

const contactForm = document.getElementById('contactForm');
if (contactForm){
  handleForm(contactForm, () => {
    contactForm.style.display = 'none';
    document.getElementById('contactDone').classList.add('show');
  });
}

/* ---- Квиз ---- */
const quizBody = document.getElementById('quizBody');
if (quizBody && QUIZ.length){
  const quizBar = document.getElementById('quizBar');
  const quizStepLabel = document.getElementById('quizStepLabel');
  const quizPct = document.getElementById('quizPct');
  const total = QUIZ.length;
  let qStep = 0, qStarted = false;
  const qAnswers = QUIZ.map(() => []);
  const check = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const render = () => {
    if (qStep >= total) return renderFinal();
    const item = QUIZ[qStep];
    quizStepLabel.textContent = 'Вопрос ' + (qStep+1) + ' из ' + total;
    const pct = Math.round((qStep/total)*100);
    quizBar.style.width = pct + '%'; quizPct.textContent = pct + '%';
    quizBody.innerHTML =
      '<div class="q-q">'+item.q+'</div>'+
      '<div class="q-hint">'+item.hint+'</div>'+
      '<div class="q-opts">'+item.opts.map((o,i)=>(
        '<button type="button" class="q-opt'+(qAnswers[qStep].includes(i)?' sel':'')+'" data-i="'+i+'" aria-pressed="'+qAnswers[qStep].includes(i)+'">'+
          '<span class="box">'+check+'</span><span>'+o+'</span></button>'
      )).join('')+'</div>'+
      '<div class="q-nav">'+
        '<button type="button" class="q-back"'+(qStep===0?' hidden':'')+'>← назад</button>'+
        '<button type="button" class="btn btn-wine" id="qNext">'+(qStep===total-1?'Показать результат':'Далее →')+'</button>'+
      '</div>';
    quizBody.querySelectorAll('.q-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!qStarted){ qStarted = true; trackGoal('quiz_start', LEAD_META); }
        const i = +btn.dataset.i, arr = qAnswers[qStep];
        if (item.multi){
          const at = arr.indexOf(i);
          if (at > -1) arr.splice(at,1); else arr.push(i);
          btn.classList.toggle('sel'); btn.setAttribute('aria-pressed', btn.classList.contains('sel'));
        } else {
          qAnswers[qStep] = [i];
          quizBody.querySelectorAll('.q-opt').forEach(b => { b.classList.remove('sel'); b.setAttribute('aria-pressed','false'); });
          btn.classList.add('sel'); btn.setAttribute('aria-pressed','true');
          const s = qStep;
          setTimeout(() => { if (qStep === s && qAnswers[s][0] === i){ qStep++; render(); } }, 260); // один ответ — сразу дальше
        }
      });
    });
    const back = quizBody.querySelector('.q-back');
    if (back) back.addEventListener('click', () => { qStep--; render(); });
    quizBody.querySelector('#qNext').addEventListener('click', () => {
      if (qAnswers[qStep].length === 0){
        const first = quizBody.querySelector('.q-opt');
        first.animate([{transform:'translateX(0)'},{transform:'translateX(-5px)'},{transform:'translateX(5px)'},{transform:'translateX(0)'}],{duration:250});
        return;
      }
      qStep++; render();
    });
  };

  const renderFinal = () => {
    quizBar.style.width = '100%'; quizPct.textContent = '100%';
    quizStepLabel.textContent = 'Почти готово';
    trackGoal('quiz_complete', LEAD_META);
    quizBody.innerHTML =
      '<div class="q-final">'+
        '<div class="q-q">'+(LP.QUIZ_FINAL_TITLE || 'Готово! Рассчитаем ваш план')+'</div>'+
        '<div class="q-hint">'+(LP.QUIZ_FINAL_TEXT || '').replace('{min}', CONFIG.RESPONSE_MINUTES)+'</div>'+
        '<form id="quizForm" data-form-id="quiz" novalidate>'+
          '<input type="text" name="company" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">'+
          '<div class="field"><label for="qf-name">Как к вам обращаться</label><input type="text" id="qf-name" name="name" placeholder="Имя" autocomplete="name" required></div>'+
          '<div class="field"><label for="qf-phone">Телефон</label><input type="tel" id="qf-phone" name="phone" placeholder="+7 (___) ___-__-__" inputmode="tel" autocomplete="tel" required></div>'+
          '<label class="consent"><input type="checkbox" name="consent" checked required><span>Согласен(на) на обработку персональных данных в соответствии с <a href="'+CONFIG.POLICY_URL+'" target="_blank" rel="noopener">политикой конфиденциальности</a>.</span></label>'+
          '<button type="submit" class="btn btn-wine btn-lg btn-block">Получить план и стоимость</button>'+
          '<div class="form-fine">Ни к чему не обязывает.</div>'+
        '</form>'+
      '</div>';
    const qf = document.getElementById('quizForm');
    maskPhone(qf.querySelector('input[type="tel"]'));
    const ans = document.createElement('input');
    ans.type = 'hidden'; ans.name = 'quiz_answers';
    ans.value = JSON.stringify(qAnswers.map((a,qi) => a.map(i => QUIZ[qi].opts[i])));
    qf.appendChild(ans);
    handleForm(qf, () => {
      quizBody.innerHTML =
        '<div class="q-done">'+
          '<div class="q-q">Спасибо! Заявка принята</div>'+
          '<div class="q-hint" style="text-transform:none;letter-spacing:.02em;font-size:13px">Перезвоним за '+CONFIG.RESPONSE_MINUTES+' минут в рабочее время и всё обсудим без спешки. Вы молодец, что сделали первый шаг.</div>'+
          '<span class="q-bonus">консультацию зачтём в стоимость лечения</span>'+
        '</div>';
    });
  };
  render();
}

/* ---- Шапка: фон после скролла, прячется при прокрутке вниз ---- */
const hdr = document.querySelector('header.hdr');
if (hdr){
  let lastY = window.scrollY;
  const onScroll = () => {
    const y = window.scrollY;
    hdr.classList.toggle('scrolled', y > 8);
    hdr.classList.toggle('hide', y > 320 && y > lastY + 4);
    if (y < lastY - 4) hdr.classList.remove('hide');
    lastY = y;
  };
  onScroll(); window.addEventListener('scroll', onScroll, {passive:true});
}

/* ---- FAQ: одна открытая панель ---- */
document.querySelectorAll('.qa').forEach(qa => {
  const btn = qa.querySelector('button');
  btn.addEventListener('click', () => {
    const open = !qa.classList.contains('open');
    document.querySelectorAll('.qa.open').forEach(o => { if (o !== qa){ o.classList.remove('open'); o.querySelector('button').setAttribute('aria-expanded','false'); } });
    qa.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
  });
});

/* ---- Видео о клинике: по клику — цвет + контролы; цель video_play ---- */
const tour = document.getElementById('clinicVideo');
if (tour){
  const vid = tour.querySelector('video');
  const btn = tour.querySelector('.g-play');
  btn.addEventListener('click', () => {
    trackGoal('video_play', LEAD_META);
    tour.classList.add('playing');
    vid.controls = true;
    vid.play();
    btn.remove();
  }, {once:true});
}

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---- Заголовок hero: построчный mask-reveal при загрузке ---- */
document.querySelectorAll('h1 .line').forEach((l, i) => {
  if (reduce) { l.classList.add('in'); return; }
  setTimeout(() => l.classList.add('in'), 120 + i * 140);
});

/* ---- Лёгкий параллакс фото в hero ---- */
const heroImg = document.querySelector('.hp-img img');
if (heroImg && !reduce){
  let raf = 0;
  const par = () => {
    raf = 0;
    const r = heroImg.parentElement.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    heroImg.style.transform = 'translate3d(0,' + (Math.max(-1, Math.min(1, -r.top / innerHeight)) * 4) + '%,0)';
  };
  window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(par); }, {passive:true});
}

/* ---- Reveal секций по скроллу (с подстраховкой) ---- */
const rvs = document.querySelectorAll('.rv');
if ('IntersectionObserver' in window && !reduce){
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting){ en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  rvs.forEach(el => io.observe(el));
  setTimeout(() => document.querySelectorAll('.rv:not(.in)').forEach(el => {
    if (el.getBoundingClientRect().top < innerHeight) el.classList.add('in');
  }), 3000);
} else {
  rvs.forEach(el => el.classList.add('in'));
}
})();
