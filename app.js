(function () {
  const $ = (id) => document.getElementById(id);
  const form = $('form');
  const yearSel = $('year');
  const monthSel = $('month');
  const daySel = $('day');
  const STORE_KEY = 'saju-input';
  const THIS_YEAR = new Date().getFullYear();
  const EL_ORDER = ['wood', 'fire', 'earth', 'metal', 'water'];

  // ---------- 입력 폼 ----------

  function fillSelect(sel, from, to, suffix, selected) {
    sel.innerHTML = '';
    for (let i = from; i <= to; i++) {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = i + suffix;
      if (i === selected) opt.selected = true;
      sel.appendChild(opt);
    }
  }

  function isLunar() {
    return form.cal.value === 'lunar';
  }

  function daysInMonth(y, m) {
    if (!isLunar()) return new Date(y, m, 0).getDate();
    const month = LunarMonth.fromYm(y, $('leap').checked ? -m : m);
    return month ? month.getDayCount() : 30;
  }

  function refreshDays() {
    const y = +yearSel.value;
    const m = +monthSel.value;
    const prev = +daySel.value || 1;
    const max = daysInMonth(y, m);
    fillSelect(daySel, 1, max, '일', Math.min(prev, max));
  }

  fillSelect(yearSel, 1920, THIS_YEAR, '년', 1990);
  fillSelect(monthSel, 1, 12, '월', 1);
  refreshDays();

  [yearSel, monthSel, $('leap')].forEach((el) => el.addEventListener('change', refreshDays));
  form.querySelectorAll('input[name=cal]').forEach((el) =>
    el.addEventListener('change', () => {
      $('leapWrap').hidden = !isLunar();
      if (!isLunar()) $('leap').checked = false;
      refreshDays();
    })
  );
  $('noTime').addEventListener('change', () => {
    $('time').disabled = $('noTime').checked;
  });

  function readInput() {
    const [h, mi] = ($('time').value || '12:00').split(':').map(Number);
    return {
      name: $('name').value.trim(),
      gender: +form.gender.value,
      cal: form.cal.value,
      leap: $('leap').checked,
      y: +yearSel.value,
      m: +monthSel.value,
      d: +daySel.value,
      h,
      mi,
      noTime: $('noTime').checked,
      adjust: $('adjust').checked,
    };
  }

  function restoreInput() {
    let saved;
    try {
      saved = JSON.parse(localStorage.getItem(STORE_KEY));
    } catch (e) {
      return;
    }
    if (!saved) return;
    $('name').value = saved.name || '';
    form.gender.value = String(saved.gender);
    form.cal.value = saved.cal;
    $('leapWrap').hidden = saved.cal !== 'lunar';
    $('leap').checked = !!saved.leap;
    yearSel.value = saved.y;
    monthSel.value = saved.m;
    refreshDays();
    daySel.value = saved.d;
    $('time').value = String(saved.h).padStart(2, '0') + ':' + String(saved.mi).padStart(2, '0');
    $('noTime').checked = !!saved.noTime;
    $('time').disabled = !!saved.noTime;
    $('adjust').checked = saved.adjust !== false;
  }

  // ---------- 사주 계산 ----------

  // 1987·1988년 한국 서머타임 기간
  function inKoreanDst(y, m, d) {
    const v = m * 100 + d;
    if (y === 1987) return v >= 510 && v < 1011;
    if (y === 1988) return v >= 508 && v < 1009;
    return false;
  }

  function toSolar(input) {
    let solar;
    if (input.cal === 'lunar') {
      const lunarYear = LunarYear.fromYear(input.y);
      if (input.leap && lunarYear.getLeapMonth() !== input.m) {
        throw new Error(input.y + '년에는 음력 윤' + input.m + '월이 없어요.');
      }
      solar = Lunar.fromYmdHms(input.y, input.leap ? -input.m : input.m, input.d, input.h, input.mi, 0).getSolar();
    } else {
      solar = Solar.fromYmdHms(input.y, input.m, input.d, input.h, input.mi, 0);
    }
    if (input.noTime) return solar;

    // 시계 시간을 실제 태양 시간에 맞춘다
    let shift = 0;
    if (inKoreanDst(solar.getYear(), solar.getMonth(), solar.getDay())) shift -= 60;
    if (input.adjust) shift -= 30;
    if (!shift) return solar;
    const t = new Date(Date.UTC(solar.getYear(), solar.getMonth() - 1, solar.getDay(), solar.getHour(), solar.getMinute()) + shift * 60000);
    return Solar.fromYmdHms(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), t.getUTCHours(), t.getUTCMinutes(), 0);
  }

  function calc(input) {
    const solar = toSolar(input);
    const ec = solar.getLunar().getEightChar();
    const pillar = (key, label) => ({
      label,
      gan: ec['get' + key + 'Gan'](),
      zhi: ec['get' + key + 'Zhi'](),
      ssGan: ec['get' + key + 'ShiShenGan'](),
      ssZhi: ec['get' + key + 'ShiShenZhi']()[0],
      hide: ec['get' + key + 'HideGan'](),
      dishi: ec['get' + key + 'DiShi'](),
    });
    const pillars = [
      input.noTime ? null : pillar('Time', '시주'),
      pillar('Day', '일주'),
      pillar('Month', '월주'),
      pillar('Year', '년주'),
    ];

    const counts = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
    pillars.forEach((p) => {
      if (!p) return;
      counts[SAJU.GAN[p.gan].el]++;
      counts[SAJU.ZHI[p.zhi].el]++;
    });

    const yun = ec.getYun(input.gender);
    const daeun = yun.getDaYun(10).filter((d) => d.getGanZhi());

    const today = Solar.fromDate(new Date()).getLunar().getEightChar();
    const thisYearGan = today.getYearGan();
    const thisYearZhi = today.getYearZhi();

    return {
      input,
      solar,
      lunar: solar.getLunar(),
      pillars,
      dayGan: ec.getDayGan(),
      counts,
      yun,
      daeun,
      thisYear: {
        gan: thisYearGan,
        zhi: thisYearZhi,
        ss: LunarUtil.SHI_SHEN[ec.getDayGan() + thisYearGan],
      },
    };
  }

  // ---------- 결과 화면 ----------

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ganK = (g) => SAJU.GAN[g].k;
  const zhiK = (z) => SAJU.ZHI[z].k;
  const gzK = (gz) => ganK(gz[0]) + zhiK(gz[1]);
  const ssK = (s) => SAJU.SHISHEN[s] || s || '';
  const elTag = (el) => `<span class="tag ${el}">${SAJU.EL[el].k}(${SAJU.EL[el].h})</span>`;

  function charBox(ch, info) {
    return `<div class="char ${info.el}"><span class="h">${ch}</span><span class="k">${info.k}</span></div>`;
  }

  function renderPillars(r) {
    return r.pillars
      .map((p, i) => {
        if (!p) {
          return `<div class="pillar">
            <div class="label">시주</div><div class="ss"></div>
            <div class="char empty"><span class="h">?</span><span class="k">모름</span></div>
            <div class="char empty"><span class="h">?</span><span class="k">모름</span></div>
            <div class="ss"></div></div>`;
        }
        return `<div class="pillar${i === 1 ? ' me' : ''}">
          <div class="label">${p.label}</div>
          <div class="ss">${i === 1 ? '나' : ssK(p.ssGan)}</div>
          ${charBox(p.gan, SAJU.GAN[p.gan])}
          ${charBox(p.zhi, SAJU.ZHI[p.zhi])}
          <div class="ss">${ssK(p.ssZhi)}</div>
          <div class="hide">${p.hide.map(ganK).join(' ')}</div>
          <div class="hide">${SAJU.DISHI[p.dishi] || ''}</div>
        </div>`;
      })
      .join('');
  }

  function renderElements(r) {
    const total = EL_ORDER.reduce((s, el) => s + r.counts[el], 0);
    const bars = EL_ORDER.map((el) => {
      const n = r.counts[el];
      return `<div class="bar"><span>${SAJU.EL[el].k}(${SAJU.EL[el].h})</span>
        <div class="track"><div class="fill ${el}" style="width:${(n / total) * 100}%"></div></div>
        <b>${n}</b></div>`;
    }).join('');

    const notes = [];
    EL_ORDER.forEach((el) => {
      if (r.counts[el] >= 3) notes.push(SAJU.EL_MANY[el]);
    });
    EL_ORDER.forEach((el) => {
      if (r.counts[el] === 0) notes.push(SAJU.EL_NONE[el]);
    });
    if (!notes.length) notes.push('다섯 가지 기운이 고르게 퍼져 있어요. 어느 한쪽으로 치우치지 않아 균형 잡힌 편입니다.');

    return `<div class="bars">${bars}</div>${notes.map((n) => `<p>${n}</p>`).join('')}`;
  }

  function renderDaeun(r) {
    const items = r.daeun
      .map((d) => {
        const now = d.getStartYear() <= THIS_YEAR && THIS_YEAR <= d.getEndYear();
        const gz = d.getGanZhi();
        return `<div class="du${now ? ' now' : ''}">
          <span>${d.getStartAge()}세</span>
          <span class="gz">${gz}</span>
          <span>${gzK(gz)}</span>
        </div>`;
      })
      .join('');
    const y = r.yun;
    return `<p class="muted">대운은 10년마다 바뀌는 큰 흐름이에요. 태어난 뒤 약 ${y.getStartYear()}년 ${y.getStartMonth()}개월 후부터 시작합니다. 테두리가 빨간 칸이 지금 대운이에요.</p>
      <div class="daeun">${items}</div>`;
  }

  function render(r) {
    const dm = SAJU.DAY_MASTER[r.dayGan];
    const dmInfo = SAJU.GAN[r.dayGan];
    const yearPillar = r.pillars[3];
    const animal = SAJU.ZHI[yearPillar.zhi].animal;
    const dayPillar = r.pillars[1];
    const s = r.solar;
    const l = r.lunar;
    const who = r.input.name ? esc(r.input.name) + '님' : '당신';
    const ty = r.thisYear;

    $('result').innerHTML = `
      <div class="card">
        <h2>${who}의 사주팔자</h2>
        <p class="muted">
          양력 ${s.getYear()}.${s.getMonth()}.${s.getDay()}
          · 음력 ${l.getYear()}.${l.getMonth() < 0 ? '윤' : ''}${Math.abs(l.getMonth())}.${l.getDay()}
          ${r.input.noTime ? '· 시간 모름' : `· 보정 시각 ${String(s.getHour()).padStart(2, '0')}:${String(s.getMinute()).padStart(2, '0')}`}
          · ${r.input.gender === 1 ? '남' : '여'}
        </p>
        <div class="pillars">${renderPillars(r)}</div>
        <p class="muted">${SAJU.EL[SAJU.GAN[yearPillar.gan].el].color} ${animal}띠 · 일주 ${gzK(dayPillar.gan + dayPillar.zhi)}(${dayPillar.gan}${dayPillar.zhi})</p>
      </div>

      <div class="card">
        <h2>나를 나타내는 글자: ${dayPillar.gan} ${dmInfo.k}${SAJU.EL[dmInfo.el].k}</h2>
        <p>${elTag(dmInfo.el)}<b>${dm.title}</b></p>
        <p>${dm.text}</p>
      </div>

      <div class="card">
        <h2>오행 분포</h2>
        ${renderElements(r)}
      </div>

      <div class="card">
        <h2>${THIS_YEAR}년 ${gzK(ty.gan + ty.zhi)}년(${ty.gan}${ty.zhi}) 운세</h2>
        <p>${elTag(SAJU.GAN[ty.gan].el)}올해는 나에게 <b>${ssK(ty.ss)}</b>의 해예요.</p>
        <p>${SAJU.YEAR_LUCK[ty.ss]}</p>
      </div>

      <div class="card">
        <h2>대운 흐름</h2>
        ${renderDaeun(r)}
      </div>

      <button type="button" class="go again" id="again">다시 입력하기</button>
    `;
    $('result').hidden = false;
    form.hidden = true;
    $('again').addEventListener('click', () => {
      $('result').hidden = true;
      form.hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const err = $('error');
    err.hidden = true;
    const input = readInput();
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(input));
    } catch (e2) {
      // 저장이 안 돼도 결과는 보여준다
    }
    try {
      render(calc(input));
    } catch (ex) {
      err.textContent = ex.message || '계산 중 문제가 생겼어요. 입력을 확인해 주세요.';
      err.hidden = false;
    }
  });

  restoreInput();
})();
