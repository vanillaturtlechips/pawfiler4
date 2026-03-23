"""
PawFiler 딥페이크 탐지 역량 리포트 v2
- 양피지 텍스처 배경 (matplotlib noise)
- 아바타 이모지 + 레벨/티어 배지 (ProfilePage.tsx 연동)
- 하단 고양이+강아지 발자국 각인
- wkhtmltopdf 기반 PDF 출력
"""
import os, io, json, math, subprocess
import numpy as np
from datetime import datetime
from typing import Optional
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.font_manager import FontProperties

_F_REG  = "/usr/share/fonts/NotoSansCJKkr-Regular.otf"
_F_BOLD = "/usr/share/fonts/NotoSansCJKkr-Regular.otf"
_F_MED  = "/usr/share/fonts/NotoSansCJKkr-Regular.otf"

def _fp(path, fallback=None):
    p = path if os.path.exists(path) else (fallback or path)
    return FontProperties(fname=p) if os.path.exists(p) else FontProperties()

FP_REG  = _fp(_F_REG)
FP_BOLD = _fp(_F_BOLD, _F_REG)
FP_MED  = _fp(_F_MED,  _F_BOLD)

_TMP_IMG_DIR = '/tmp/pawfiler_imgs'
os.makedirs(_TMP_IMG_DIR, exist_ok=True)
_img_counter = 0

def _save_tmp(buf, prefix='img'):
    """base64 대신 /tmp 파일로 저장 → wkhtmltopdf file:// URL 호환"""
    global _img_counter
    _img_counter += 1
    path = f'{_TMP_IMG_DIR}/{prefix}_{_img_counter}.png'
    buf.seek(0)
    with open(path, 'wb') as f:
        f.write(buf.read())
    return f'file://{path}'

def _b64(buf):
    """BytesIO → base64 data URI (HTML inline 이미지용)"""
    import base64
    buf.seek(0)
    return 'data:image/png;base64,' + base64.b64encode(buf.read()).decode()



def make_avatar(emoji, level, tier_name, is_premium):
    """matplotlib 대신 HTML/CSS로 아바타 렌더링 → 이모지 브라우저 처리"""
    ring_c = '#e07b39' if is_premium else '#c8a882'
    crown = '👑' if is_premium else ''
    short = tier_name[:12] if tier_name else ''
    return f'''<div style="position:relative;width:84px;height:96px;flex-shrink:0">
  <div style="width:84px;height:84px;border-radius:50%;background:#fef9f0;
       border:3px solid {ring_c};display:flex;align-items:center;justify-content:center;
       font-size:44px;line-height:1">{emoji}</div>
  <div style="position:absolute;bottom:14px;right:-4px;background:#2d1a0e;
       border:1.5px solid #e07b39;border-radius:3px;padding:1px 5px;
       font-size:10px;font-weight:700;color:white">Lv.{level}</div>
  {f'<div style="position:absolute;top:-4px;left:-4px;font-size:16px">{crown}</div>' if is_premium else ''}
  <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);
       background:#fdf3e0;border:1px solid #c8a882;border-radius:3px;
       padding:1px 6px;font-size:9px;color:#7c4a1e;white-space:nowrap">{short}</div>
</div>'''

def make_chart(weekly):
    if weekly:
        labels=[str(row['week'])[:10] for row in weekly]
        rates=[round(int(row['correct'] or 0)/max(int(row['total'] or 1),1)*100,1) for row in weekly]
    else:
        labels,rates=['데이터 없음'],[0]
    fig,ax = plt.subplots(figsize=(10,3.6),dpi=100)
    fig.patch.set_facecolor('#fdf3e0'); ax.set_facecolor('#fef9f0')
    bar_c=['#e07b39' if r>=70 else('#f0a060' if r>=50 else '#c05621') for r in rates]
    bars=ax.bar(range(len(labels)),rates,color=bar_c,edgecolor='#7c4a1e',lw=0.8,width=0.52,zorder=3)
    for bar,r in zip(bars,rates):
        ax.text(bar.get_x()+bar.get_width()/2,bar.get_height()+1.5,f'{r}%',
                ha='center',va='bottom',fontproperties=FP_BOLD,fontsize=9,color='#4a2c0a')
    ax.set_xticks(range(len(labels)))
    ax.set_xticklabels(labels,fontproperties=FP_REG,fontsize=8.5,color='#4a2c0a')
    ax.set_ylim(0,118)
    ax.set_yticks([0,25,50,75,100])
    ax.set_yticklabels(['0%','25%','50%','75%','100%'],fontproperties=FP_REG,fontsize=8,color='#4a2c0a')
    ax.set_title('Weekly Correct Rate',fontproperties=FP_BOLD,fontsize=13,color='#4a2c0a',pad=8)
    ax.axhline(70,color='#2d7a4f',linestyle='--',lw=1.2,alpha=0.8,zorder=2)
    ax.text(max(len(labels)-0.5,0.1),72,'Target 70%',fontproperties=FP_REG,fontsize=8,color='#2d7a4f',va='bottom')
    ax.grid(axis='y',color='#e8d5b7',lw=0.4,alpha=0.6,zorder=1)
    ax.spines['top'].set_visible(False); ax.spines['right'].set_visible(False)
    ax.spines['left'].set_color('#c8a882'); ax.spines['bottom'].set_color('#c8a882')
    ax.tick_params(colors='#4a2c0a',length=3)
    plt.tight_layout(pad=0.6)
    buf=io.BytesIO()
    plt.savefig(buf,format='png',bbox_inches='tight',facecolor='#fdf3e0',dpi=100)
    plt.close(); return _b64(buf)

def get_grade(rate):
    if rate>=90: return 'S','#1a6b3a','탁월한 딥페이크 탐지 능력을 보유하고 있습니다!'
    if rate>=80: return 'A','#2d7a4f','우수한 탐지 능력이에요. 조금만 더 하면 최고 등급!'
    if rate>=70: return 'B','#b45309','평균 이상이에요. 꾸준한 연습으로 A등급 도전!'
    if rate>=60: return 'C','#b45309','기본기는 갖추었어요. 오답 패턴을 분석해보세요.'
    return 'D','#b91c1c','딥페이크 탐지 훈련이 더 필요해요. 포기하지 마세요!'

# ── 성장 스토리 엔진 ──────────────────────────────────────────────────────────

def detect_story_patterns(total, rate, weekly, type_stats, stats):
    """데이터를 분석해 패턴 태그 + 스코어 반환 (높을수록 우선 노출)"""
    patterns = []
    weekly_rates = []
    if weekly:
        for w in weekly:
            t = int(w['total'] or 0)
            c = int(w['correct'] or 0)
            if t > 0:
                weekly_rates.append(round(c / t * 100, 1))

    # 1. 볼륨 패턴
    if total >= 40:
        patterns.append(('volume_high', 9, total))
    elif total >= 20:
        patterns.append(('volume_mid', 6, total))
    else:
        patterns.append(('volume_low', 4, total))

    # 2. 성장 델타 (첫 주 vs 마지막 주)
    if len(weekly_rates) >= 2:
        delta = weekly_rates[-1] - weekly_rates[0]
        if delta >= 15:
            patterns.append(('growth_fast', 10, delta, weekly_rates[0], weekly_rates[-1]))
        elif delta >= 5:
            patterns.append(('growth_steady', 7, delta, weekly_rates[0], weekly_rates[-1]))
        elif delta <= -10:
            patterns.append(('growth_decline', 5, abs(delta)))
        else:
            patterns.append(('growth_plateau', 4, rate))

    # 3. 현재 정답률 수준
    if rate >= 80:
        patterns.append(('rate_excellent', 8, rate))
    elif rate >= 70:
        patterns.append(('rate_good', 6, rate))
    elif rate >= 55:
        patterns.append(('rate_average', 4, rate))
    else:
        patterns.append(('rate_low', 3, rate))

    # 4. 연속 정답 (user_stats에서 current_streak)
    streak = int(stats.get('current_streak') or 0) if isinstance(stats, dict) else 0
    if streak >= 7:
        patterns.append(('streak_fire', 9, streak))
    elif streak >= 3:
        patterns.append(('streak_good', 6, streak))

    # 5. 취약 유형 (정답률 50% 미만인 유형)
    weak_types = []
    strong_types = []
    type_label_map = {'multiple_choice':'객관식','true_false':'O/X',
                      'region_select':'영역 선택','comparison':'비교'}
    if type_stats:
        from collections import defaultdict
        agg = defaultdict(lambda: [0, 0])
        for row in type_stats:
            agg[row['type']][0] += int(row['total'] or 0)
            agg[row['type']][1] += int(row['correct'] or 0)
        for t, (tot, cor) in agg.items():
            if tot >= 3:
                r = round(cor / tot * 100, 1)
                lbl = type_label_map.get(t, t)
                if r < 50:
                    weak_types.append((lbl, r))
                elif r >= 75:
                    strong_types.append((lbl, r))
        if weak_types:
            weak_types.sort(key=lambda x: x[1])
            patterns.append(('weak_type', 7, weak_types[0][0], weak_types[0][1]))
        if strong_types:
            strong_types.sort(key=lambda x: -x[1])
            patterns.append(('strong_type', 5, strong_types[0][0], strong_types[0][1]))

    # 스코어 내림차순 정렬
    patterns.sort(key=lambda x: -x[1])
    return patterns


def build_story(nickname, patterns):
    """패턴 우선순위 기반으로 3~4문장 스토리 조립"""
    sentences = []
    used = set()

    def pick(tag):
        return any(p[0] == tag for p in patterns)

    def get(tag):
        for p in patterns:
            if p[0] == tag:
                return p
        return None

    # 문장 1: 볼륨 (오프닝)
    vol = get('volume_high') or get('volume_mid') or get('volume_low')
    if vol:
        n = vol[2]
        if vol[0] == 'volume_high':
            sentences.append(f"이번 기간 총 {n}문제를 풀었어요. 정말 열심히 하셨네요! 🎉")
        elif vol[0] == 'volume_mid':
            sentences.append(f"이번 기간 {n}문제에 도전했어요. 꾸준한 연습이 실력을 만들어요.")
        else:
            sentences.append(f"이번 기간 {n}문제로 시작했어요. 앞으로가 더 기대돼요!")
        used.add('volume')

    # 문장 2: 성장 델타 (가장 임팩트 있는 수치)
    growth = get('growth_fast') or get('growth_steady') or get('growth_plateau') or get('growth_decline')
    if growth and growth[0] == 'growth_fast':
        sentences.append(f"첫 주 {growth[3]}%에서 이번 주 {growth[4]}%로 +{growth[2]:.0f}%p 성장했어요! 🚀")
        used.add('growth')
    elif growth and growth[0] == 'growth_steady':
        sentences.append(f"첫 주 {growth[3]}%에서 이번 주 {growth[4]}%로 꾸준히 올라오고 있어요. 📈")
        used.add('growth')
    elif growth and growth[0] == 'growth_plateau':
        sentences.append(f"{growth[2]:.0f}% 근처에서 정체 중이에요. 유형을 바꿔서 도전해보는 건 어떨까요?")
        used.add('growth')
    elif growth and growth[0] == 'growth_decline':
        sentences.append(f"최근 {growth[2]:.0f}%p 하락했어요. 오답노트를 다시 한번 살펴보세요.")
        used.add('growth')
    else:
        # 주간 데이터 부족 (1주 이하) → 더 풀어달라는 격려
        sentences.append(f"아직 데이터가 부족해요. 문제를 더 풀수록 정확한 성장 분석이 가능해져요! 💡")
        used.add('growth')

    # 문장 3: 연속 정답 or 강점 유형 (긍정 모멘텀)
    streak = get('streak_fire') or get('streak_good')
    strong = get('strong_type')
    if streak and streak[0] == 'streak_fire' and 'streak' not in used:
        sentences.append(f"무려 {streak[2]}연속 정답 중이에요! 🔥 지금 엄청난 집중력을 발휘하고 있어요.")
        used.add('streak')
    elif streak and 'streak' not in used:
        sentences.append(f"{streak[2]}연속 정답 기록 중이에요. 이 흐름을 이어가 보세요! 💪")
        used.add('streak')
    elif strong and 'strong' not in used:
        sentences.append(f"{strong[2]}({strong[3]:.0f}%)은 이미 잘 하고 있어요. 강점을 살려보세요! ✨")
        used.add('strong')

    # 문장 4: 취약 유형 → 다음 목표 제시
    weak = get('weak_type')
    if weak and 'weak' not in used:
        sentences.append(f"{weak[2]}({weak[3]:.0f}%)이 아직 아쉬워요. 집중 공략하면 전체 정답률이 빠르게 올라갈 거예요! 🎯")
        used.add('weak')
    elif not weak and 'rate_excellent' in [p[0] for p in patterns]:
        sentences.append(f"모든 유형에서 고르게 잘 하고 있어요. {nickname} 탐정, 최고예요! 🏆")

    return sentences

LABEL_INSIGHTS = {
    "눈 주변 블러/왜곡":      "딥페이크는 눈 주변에서 자연스러운 깜빡임이나 반사광을 재현하지 못해 블러 처리 흔적이 남아요.",
    "피부 텍스처 부자연스러움": "AI 생성 얼굴은 피부 모공이나 잔털이 지나치게 매끄럽거나 반복 패턴을 보여요.",
    "헤어라인 경계 어색함":    "헤어라인은 프레임마다 경계가 흔들리거나 배경과 부자연스럽게 합성된 흔적이 나타나요.",
    "배경과 인물 경계선 흔적":  "인물과 배경의 경계에서 색상 번짐이나 픽셀 아티팩트가 발생하는 경우가 많아요.",
    "조명 방향 불일치":        "얼굴의 하이라이트와 그림자 방향이 배경 조명과 다르면 합성 신호예요.",
    "손가락 개수/형태 이상":   "AI 모델은 손가락 개수나 관절 형태를 정확히 생성하는 데 어려움을 겪어요.",
    "텍스트 왜곡":             "AI 생성 이미지 속 텍스트는 글자가 뭉개지거나 의미 없는 문자가 섞이는 경향이 있어요.",
    "default":                "정답 영역을 주의 깊게 살펴보세요. 딥페이크 단서는 세부 디테일에 숨어있어요.",
}



def build_html(
    user_id, stats, type_stats, weekly,
    wrong_answers=None, weak_labels=None,
    nickname='탐정', avatar_emoji='🐱', email='-',
    subscription_type='free', level=1, tier_name='Lv.1',
    total_coins=0, total_exp=0, days=30,
):
    today=datetime.utcnow().strftime('%Y년 %m월 %d일')
    period_label = f'최근 {days}일 분석 기준' if days else '전체 기간 분석 기준'
    total=int(stats['total'] or 0); correct=int(stats['correct'] or 0)
    rate=round(correct/max(total,1)*100,1); xp=total_exp
    grade,grade_hex,grade_comment=get_grade(rate)
    is_premium=subscription_type=='premium'

    # 성장 스토리 생성
    story_patterns = detect_story_patterns(total, rate, weekly, type_stats, {})
    story_sentences = build_story(nickname, story_patterns)

    print("  이미지 생성 중...")
    avatar_html=make_avatar(avatar_emoji,level,tier_name,is_premium)
    chart_src =make_chart(weekly)
    print("  이미지 생성 완료")

    type_label_map={'multiple_choice':'객관식','true_false':'O/X',
                    'region_select':'영역 선택','comparison':'비교'}
    diff_label={'easy':'🟢 쉬움','medium':'🟡 보통','hard':'🔴 어려움'}

    # type+difficulty 조합으로 그룹핑
    from collections import defaultdict
    type_diff_map = defaultdict(list)
    for row in type_stats:
        type_diff_map[row['type']].append(row)

    type_rows=''
    for q_type, rows in type_diff_map.items():
        t_label = type_label_map.get(q_type, q_type)
        for row in rows:
            t_tot=int(row['total'] or 0); t_cor=int(row['correct'] or 0)
            t_rate=round(t_cor/max(t_tot,1)*100,1)
            g,ghex,_=get_grade(t_rate)
            diff = diff_label.get(row['difficulty'], row['difficulty'])
            type_rows+=f'''<tr>
              <td>{t_label}</td>
              <td class="c">{diff}</td>
              <td class="c">{t_tot}문제</td>
              <td class="c">{t_cor}문제</td>
              <td class="c" style="color:{ghex};font-weight:700">{t_rate}%</td>
              <td class="c" style="color:{ghex};font-weight:700">등급 {g}</td></tr>'''

    sub_badge='<span class="badge-p">프리미엄 ✦</span>' if is_premium else '<span class="badge-f">무료</span>'

    # ── 오답노트 섹션 ──────────────────────────────────────────
    type_label_map={'multiple_choice':'객관식','true_false':'O/X',
                    'region_select':'영역 선택','comparison':'비교'}
    wrong_note_items=''
    for row in (wrong_answers or []):
        q_type = row['type']
        emoji  = row['thumbnail_emoji'] or '❓'
        label  = type_label_map.get(q_type, q_type)
        explanation = row['explanation'] or ''
        media_url = row.get('media_url') or ''

        # 정답 텍스트 구성
        if q_type == 'multiple_choice':
            opts = row['options'] or []
            idx  = row['correct_index']
            if isinstance(opts, str):
                try: opts = json.loads(opts)
                except: opts = []
            answer_txt = opts[idx] if idx is not None and 0 <= idx < len(opts) else '—'
        elif q_type == 'true_false':
            answer_txt = 'O (진짜)' if row['correct_answer'] else 'X (가짜)'
        elif q_type == 'region_select':
            regions = row['correct_regions'] or []
            if isinstance(regions, str):
                try: regions = json.loads(regions)
                except: regions = []
            labels = [r.get('label','') for r in regions if r.get('label')]
            answer_txt = ', '.join(labels) if labels else '표시된 영역'
        elif q_type == 'comparison':
            answer_txt = '왼쪽이 딥페이크' if row['correct_side'] == 'left' else '오른쪽이 딥페이크'
        else:
            answer_txt = '—'

        thumb_html = (
            f'<img src="{media_url}" class="wn-thumb" onerror="this.style.display=\'none\'">'
            if media_url else
            f'<div class="wn-thumb-fallback">{emoji}</div>'
        )

        wrong_note_items += f'''<div class="wn-item">
          <div class="wn-thumb-wrap">{thumb_html}</div>
          <div class="wn-content">
            <div class="wn-hdr">
              <span class="wn-badge">{label}</span>
            </div>
            <div class="wn-answer">✅ 정답: <strong>{answer_txt}</strong></div>
            <div class="wn-exp">💡 {explanation}</div>
          </div>
        </div>'''

    wrong_note_section = ''
    if wrong_note_items:
        wrong_note_section = f'<div class="sec-hdr">📝&nbsp; 오답노트 (최근 틀린 문제)</div><div class="wn-grid">{wrong_note_items}</div>'

    # ── 취약 단서 TOP3 섹션 ────────────────────────────────────
    LABEL_TIPS = {
        "눈 주변 블러/왜곡":      "눈 깜빡임과 반사광 패턴을 집중적으로 확인하세요.",
        "피부 텍스처 부자연스러움": "모공과 잔털의 반복 패턴 여부를 살펴보세요.",
        "헤어라인 경계 어색함":    "프레임마다 헤어라인 경계가 흔들리는지 확인하세요.",
        "배경과 인물 경계선 흔적":  "인물 외곽의 색상 번짐과 픽셀 아티팩트를 보세요.",
        "조명 방향 불일치":        "얼굴 하이라이트와 배경 조명 방향을 비교하세요.",
        "손가락 개수/형태 이상":   "손가락 개수와 관절 형태를 꼼꼼히 세어보세요.",
        "텍스트 왜곡":             "이미지 속 텍스트가 읽히는지 확인하세요.",
    }
    weak_section = ''
    if weak_labels:
        rows_html = ''
        for i, row in enumerate(weak_labels, 1):
            lbl  = row['label'] or '기타'
            rate = int(row['rate'] or 0)
            filled = int(rate / 10)
            bar  = '█' * filled + '░' * (10 - filled)
            tip  = LABEL_TIPS.get(lbl, '해당 유형 문제를 반복 연습해보세요.')
            rows_html += f'''<div class="wk-row">
              <div class="wk-rank">#{i}</div>
              <div class="wk-info">
                <div class="wk-name">{lbl}</div>
                <div class="wk-bar"><span class="wk-fill">{bar[:filled]}</span><span class="wk-empty">{bar[filled:]}</span> <span class="wk-pct">{rate}% 정답</span></div>
              </div>
            </div>'''
        top_label = weak_labels[0]['label'] if weak_labels else ''
        tip_txt   = LABEL_TIPS.get(top_label, '취약 유형 문제를 반복 연습해보세요.')
        weak_section = f'''<div class="sec-hdr">🎯&nbsp; 나의 취약 단서 TOP{len(weak_labels)}</div>
<div class="wk-wrap">{rows_html}
  <div class="wk-tip">💡 이번 주 집중 훈련 추천 &nbsp;→&nbsp; <strong>"{top_label}"</strong> 유형 퀴즈 5문제 도전!</div>
</div>'''
    crown='<span class="crown">👑</span>' if is_premium else ''

    return f'''<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap');
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:'Noto Sans KR',sans-serif;font-size:14px;color:#2d1a0e;
     background:#f5ede0;min-height:100vh}}
/* 배경 양피지 */
.page{{max-width:860px;margin:32px auto;background:#fef9f0;
       box-shadow:0 4px 32px rgba(0,0,0,0.18);border-radius:4px;
       border:1.5px solid #d4b896;overflow:hidden}}
/* 헤더 */
.hdr{{background:#2d1a0e;padding:18px 28px;display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #e07b39}}
.hdr-logo{{font-size:32px;font-weight:700;color:white;letter-spacing:-0.5px}}
.hdr-title{{font-size:14px;font-weight:500;color:#fde8d0}}
.sub-hdr{{background:#4a2c0a;padding:6px 28px;text-align:center;font-size:12px;color:#f5e6d0}}
.body-wrap{{padding:20px 28px}}
/* 프로필 카드 */
.profile-card{{display:flex;gap:0;border:1px solid #e8d5b7;border-radius:4px;background:#fff;margin-bottom:12px;overflow:hidden}}
.p-left{{display:flex;align-items:center;gap:14px;padding:16px;border-right:1px solid #e8d5b7;min-width:220px}}
.av-img{{width:72px;height:84px;object-fit:contain;flex-shrink:0}}
.p-name{{font-size:16px;font-weight:700;color:#2d1a0e;margin-bottom:4px}}
.tier-badge{{display:inline-block;background:#e07b39;color:white;font-size:11px;font-weight:500;padding:2px 10px;border-radius:2px;margin-bottom:4px}}
.p-email{{font-size:11px;color:#718096;margin-bottom:6px}}
.badge-p{{display:inline-block;background:#e07b39;color:white;font-size:11px;font-weight:700;padding:2px 8px;border-radius:2px}}
.badge-f{{display:inline-block;background:#718096;color:white;font-size:11px;padding:2px 8px;border-radius:2px}}
/* 통계 4칸 */
.stat-grid{{display:flex;flex:1}}
.si{{flex:1;text-align:center;padding:16px 8px;border-right:1px solid #e8d5b7;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:80px}}
.si:last-child{{border-right:none}}
.sv{{font-size:18px;font-weight:700;display:block;margin-bottom:4px}}
.sl{{font-size:11px;color:#7c4a1e}}
.si-bl{{background:#eff6ff}}.si-gr{{background:#f0fdf4}}.si-yl{{background:#fefce8}}.si-or{{background:#fff7ed}}
/* 등급 */
.grade-cell{{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px 20px;border-left:1px solid #e8d5b7;min-width:90px}}
.gl{{font-size:56px;font-weight:700;line-height:1}}
.glb{{font-size:11px;color:#7c4a1e;margin-top:4px}}
/* 코멘트 */
.comment{{text-align:center;font-size:13px;font-weight:500;padding:10px 0;border-bottom:1px solid #e8d5b7;margin-bottom:4px}}
.exp-row{{text-align:center;font-size:12px;padding:4px 0 12px;color:#7c4a1e}}
/* 섹션 헤더 */
.sec-hdr{{background:#e07b39;color:white;font-size:14px;font-weight:700;padding:8px 16px;margin:16px 0 8px;border-radius:3px}}
/* 데이터 테이블 */
.data-tbl{{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:8px}}
.data-tbl th{{background:#2d1a0e;color:white;font-weight:700;padding:8px 12px;text-align:center;font-size:12px}}
.data-tbl td{{padding:8px 12px;border:1px solid #e8d5b7;text-align:left}}
.data-tbl td.c{{text-align:center}}
.data-tbl tr:nth-child(even) td{{background:#fef9f0}}
.data-tbl tr:nth-child(odd) td{{background:white}}
/* 성장 스토리 */
.story-box{{background:linear-gradient(135deg,#fef9f0 0%,#fff7ed 100%);border:1.5px solid #e8d5b7;border-left:4px solid #e07b39;border-radius:4px;padding:16px 20px;margin-bottom:8px}}
.story-line{{font-size:13.5px;color:#2d1a0e;line-height:1.9;padding:2px 0}}
.story-line+.story-line{{border-top:1px dashed #f0e0c8;margin-top:4px;padding-top:6px}}
/* 차트 */
.chart-img{{width:100%;display:block;border-radius:4px;margin-bottom:8px}}
/* 등급 기준표 */
.grade-guide{{border:1px solid #e8d5b7;border-radius:4px;background:white;padding:14px 18px;margin-bottom:8px}}
.gg-row{{display:flex;align-items:center;gap:12px;padding:7px 0;border-bottom:1px solid #f5ede0}}
.gg-row:last-of-type{{border-bottom:none}}
.gg-grade{{font-size:22px;font-weight:900;width:24px;text-align:center;flex-shrink:0}}
.gg-range{{font-size:11px;color:#718096;width:60px;flex-shrink:0}}
.gg-bar{{flex:1;height:8px;background:#f0e8d8;border-radius:4px;overflow:hidden}}
.gg-bar span{{display:block;height:100%;border-radius:4px}}
.gg-desc{{font-size:12px;color:#4a2c0a;width:200px;flex-shrink:0}}
.gg-note{{font-size:10px;color:#a0aec0;margin-top:10px;text-align:right}}
/* 오답노트 */
.wn-grid{{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px}}
.wn-item{{border:1px solid #e8d5b7;border-radius:4px;overflow:hidden;background:white;display:flex;flex-direction:column}}
.wn-thumb-wrap{{width:100%;height:120px;overflow:hidden;background:#f0e8d8;flex-shrink:0}}
.wn-thumb{{width:100%;height:120px;object-fit:cover;display:block}}
.wn-thumb-fallback{{width:100%;height:120px;display:flex;align-items:center;justify-content:center;font-size:40px;background:#fef9f0}}
.wn-content{{padding:10px 12px;flex:1}}
.wn-hdr{{display:flex;align-items:center;gap:8px;margin-bottom:6px}}
.wn-badge{{background:#4a2c0a;color:white;font-size:10px;padding:2px 8px;border-radius:2px}}
.wn-answer{{font-size:12px;color:#2d7a4f;margin-bottom:4px;font-weight:600}}
.wn-exp{{font-size:11px;color:#718096;line-height:1.5}}
/* 취약 단서 */
.wk-wrap{{border:1px solid #e8d5b7;border-radius:4px;background:white;padding:14px;margin-bottom:8px}}
.wk-row{{display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid #f0e8d8}}
.wk-row:last-of-type{{border-bottom:none}}
.wk-rank{{font-size:18px;font-weight:700;color:#e07b39;width:24px;text-align:center}}
.wk-info{{flex:1}}
.wk-name{{font-size:13px;font-weight:700;color:#2d1a0e;margin-bottom:3px}}
.wk-bar{{font-size:12px;font-family:monospace}}
.wk-fill{{color:#e07b39}}.wk-empty{{color:#d4b896}}
.wk-pct{{font-size:11px;color:#718096;margin-left:6px}}
.wk-tip{{margin-top:10px;padding:10px 14px;background:#fef9f0;border-left:3px solid #e07b39;font-size:12px;color:#4a2c0a;border-radius:0 4px 4px 0}}
/* 도장 푸터 */
.stamp-footer{{text-align:right;padding:20px 28px 24px;border-top:1px solid #e8d5b7;margin-top:8px}}
.stamp{{display:inline-block;border:4px solid #c0392b;border-radius:8px;padding:10px 22px;
        color:#c0392b;font-size:28px;font-weight:900;letter-spacing:2px;
        transform:rotate(-8deg);opacity:0.82;
        box-shadow:inset 0 0 0 2px #e74c3c;
        text-shadow:1px 1px 0 rgba(192,57,43,0.3);
        font-family:'Noto Sans KR',sans-serif;line-height:1.2}}
.stamp-sub{{font-size:11px;letter-spacing:1px;display:block;margin-top:2px}}
/* 인쇄 버튼 */
.print-bar{{background:#2d1a0e;padding:10px 28px;display:flex;justify-content:flex-end;gap:10px}}
.btn-print{{background:#e07b39;color:white;border:none;padding:8px 20px;font-size:13px;font-weight:700;border-radius:3px;cursor:pointer}}
.btn-print:hover{{background:#c05621}}
@media print{{.print-bar{{display:none}}.page{{box-shadow:none;margin:0;border:none}}}}
</style></head><body>
<div class="page">
  <div class="print-bar">
    <button class="btn-print" onclick="window.print()">🖨️ PDF로 저장</button>
  </div>
  <div class="hdr">
    <span class="hdr-logo">🐾 PawFiler</span>
    <span class="hdr-title">딥페이크 탐지 역량 리포트</span>
  </div>
  <div class="sub-hdr">생성일: {today}&nbsp;|&nbsp;{period_label}&nbsp;|&nbsp;User ID: {user_id[:14]}...</div>
  <div class="body-wrap">
    <div class="profile-card">
      <div class="p-left">
        {avatar_html}
        <div>
          <div class="p-name">{avatar_emoji} {nickname}</div>
          <div class="tier-badge">{tier_name}</div>
          <div class="p-email">{email}</div>
          {sub_badge}
        </div>
      </div>
      <div class="stat-grid">
        <div class="si si-bl"><span class="sv">{total}문제</span><span class="sl">총 풀이 수</span></div>
        <div class="si si-gr"><span class="sv" style="color:#2d7a4f">{rate}%</span><span class="sl">정답률</span></div>
        <div class="si si-yl"><span class="sv" style="color:#b45309">{xp} XP</span><span class="sl">획득 경험치</span></div>
        <div class="si si-or"><span class="sv" style="color:#e07b39">{total_coins:,}</span><span class="sl">보유 코인</span></div>
      </div>
      <div class="grade-cell">
        <span class="gl" style="color:{grade_hex}">{grade}</span>
        <span class="glb">탐지 등급</span>
      </div>
    </div>
    <div class="comment" style="color:{grade_hex}">✦&nbsp; {grade_comment}</div>
    <div class="exp-row">누적 경험치 {total_exp} EXP&nbsp;&nbsp;|&nbsp;&nbsp;보유 코인 {total_coins:,}</div>
    <div class="sec-hdr">📊&nbsp; 유형별 정답률</div>
    <table class="data-tbl"><thead><tr><th>유형</th><th>난이도</th><th>풀이 수</th><th>정답 수</th><th>정답률</th><th>평가</th></tr></thead>
    <tbody>{type_rows}</tbody></table>
    <div class="sec-hdr">🏅&nbsp; 탐지 등급 기준</div>
    <div class="grade-guide">
      <div class="gg-row"><span class="gg-grade" style="color:#1a6b3a">S</span><span class="gg-range">90% 이상</span><span class="gg-bar"><span style="background:#1a6b3a;width:100%"></span></span><span class="gg-desc">탁월한 딥페이크 탐지 능력 보유</span></div>
      <div class="gg-row"><span class="gg-grade" style="color:#2d7a4f">A</span><span class="gg-range">80~89%</span><span class="gg-bar"><span style="background:#2d7a4f;width:88%"></span></span><span class="gg-desc">우수한 탐지 능력, 최고 등급 근접</span></div>
      <div class="gg-row"><span class="gg-grade" style="color:#b45309">B</span><span class="gg-range">70~79%</span><span class="gg-bar"><span style="background:#b45309;width:74%"></span></span><span class="gg-desc">평균 이상, 꾸준한 연습 필요</span></div>
      <div class="gg-row"><span class="gg-grade" style="color:#b45309">C</span><span class="gg-range">60~69%</span><span class="gg-bar"><span style="background:#d97706;width:64%"></span></span><span class="gg-desc">기본기 보유, 오답 패턴 분석 권장</span></div>
      <div class="gg-row"><span class="gg-grade" style="color:#b91c1c">D</span><span class="gg-range">60% 미만</span><span class="gg-bar"><span style="background:#b91c1c;width:40%"></span></span><span class="gg-desc">집중 훈련 필요</span></div>
      <div class="gg-note">※ 등급은 선택한 기간 내 전체 정답률을 기준으로 산정됩니다.</div>
    </div>
    <div class="sec-hdr">📖&nbsp; {nickname} 탐정의 성장 스토리</div>
    <div class="story-box">{''.join(f'<p class="story-line">{s}</p>' for s in story_sentences)}</div>
    <div class="sec-hdr">📈&nbsp; 주간 정답률 추이</div>
    <img src="{chart_src}" class="chart-img"/>    {wrong_note_section}
    {weak_section}
    <div class="stamp-footer">
      <div class="stamp">🐾 PawFiler<span class="stamp-sub">CERTIFIED</span></div>
    </div>
  </div>
</div></body></html>'''


def build_pdf(output_path='/tmp/report.pdf', **kwargs):
    print("HTML 생성 중...")
    html = build_html(**kwargs)
    html_path = '/tmp/pawfiler_report.html'
    with open(html_path,'w',encoding='utf-8') as f: f.write(html)
    print("PDF 변환 중...")
    import shutil
    base_cmd = ['wkhtmltopdf']
    if shutil.which('xvfb-run') and shutil.which('xauth'):
        base_cmd = ['xvfb-run', '-a', '--server-args=-screen 0 1024x768x24'] + base_cmd
    cmd = base_cmd + [
        '--page-size', 'A4',
        '--margin-top', '0', '--margin-bottom', '0',
        '--margin-left', '0', '--margin-right', '0',
        '--encoding', 'UTF-8', '--zoom', '1.0',
        '--no-stop-slow-scripts',
        '--enable-local-file-access',
        '--load-error-handling', 'ignore',
        '--load-media-error-handling', 'ignore',
        html_path, output_path
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    # wkhtmltopdf는 경고가 있어도 exit code 1 반환 → 파일 존재 여부로 판단
    if not os.path.exists(output_path) or os.path.getsize(output_path) < 1000:
        print("wkhtmltopdf stderr:", r.stderr[-500:])
        raise RuntimeError(f"wkhtmltopdf 실패: {r.stderr[-200:]}")
    print("wkhtmltopdf 완료")
    return output_path



# ── FastAPI 앱 ─────────────────────────────────────────────────────────────────
import psycopg2
import psycopg2.extras
import boto3
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from mangum import Mangum

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgres://pawfiler:dev_password@localhost:5433/pawfiler?sslmode=disable"
)
S3_BUCKET = os.environ.get("REPORT_S3_BUCKET", "")
S3_PREFIX = os.environ.get("REPORT_S3_PREFIX", "reports")
REPORTS_DIR = "/tmp/reports"
os.makedirs(REPORTS_DIR, exist_ok=True)


def _upload_to_s3(user_id: str, html: str) -> str:
    """HTML을 S3에 업로드하고 presigned URL 반환 (유효기간 1시간)"""
    s3 = boto3.client("s3")
    key = f"{S3_PREFIX}/{user_id}.html"
    s3.put_object(
        Bucket=S3_BUCKET,
        Key=key,
        Body=html.encode("utf-8"),
        ContentType="text/html; charset=utf-8",
    )
    url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": S3_BUCKET, "Key": key},
        ExpiresIn=3600,
    )
    return url


def get_db():
    url = DATABASE_URL.replace("postgres://", "postgresql://")
    return psycopg2.connect(url, cursor_factory=psycopg2.extras.RealDictCursor)


def fetch_user_report_data(user_id: str, days: Optional[int] = 30):
    from datetime import timedelta
    conn = get_db()
    cur = conn.cursor()

    # days=None이면 전체 기간, 아니면 since 기준 필터
    since = datetime.utcnow() - timedelta(days=days) if days is not None else None
    date_filter = "AND answered_at >= %s" if since else ""

    def params(*base):
        return (*base, since) if since else base

    # 총 횟수/정답률/XP는 항상 user_stats + user_profiles에서 읽음
    # (Redis 배치 지연 없이 즉시 반영된 값 — days 기간 필터와 무관)
    cur.execute("""
        SELECT us.total_answered as total,
               us.correct_count as correct,
               up.total_exp as total_xp
        FROM quiz.user_stats us
        JOIN quiz.user_profiles up ON us.user_id = up.user_id
        WHERE us.user_id = %s
    """, (user_id,))
    stats = cur.fetchone()

    cur.execute(f"""
        SELECT q.type,
               q.difficulty,
               COUNT(*) as total,
               SUM(CASE WHEN ua.is_correct THEN 1 ELSE 0 END) as correct
        FROM quiz.user_answers ua
        JOIN quiz.questions q ON ua.question_id = q.id
        WHERE ua.user_id = %s {date_filter}
        GROUP BY q.type, q.difficulty
        ORDER BY q.type, q.difficulty
    """, params(user_id))
    type_stats = cur.fetchall()

    cur.execute(f"""
        SELECT DATE_TRUNC('week', answered_at) as week,
               COUNT(*) as total,
               SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct
        FROM quiz.user_answers
        WHERE user_id = %s {date_filter}
        GROUP BY week ORDER BY week
    """, params(user_id))
    weekly = cur.fetchall()

    # 오답노트: 틀린 문제 최근 5개 (문제 타입, 미디어, 설명, 정답)
    wrong_date_filter = "AND ua.answered_at >= %s" if since else ""
    cur.execute(f"""
        SELECT DISTINCT ON (q.id)
               q.id, q.type, q.media_url, q.thumbnail_emoji,
               q.explanation, q.options, q.correct_index,
               q.correct_answer, q.correct_regions, q.correct_side,
               ua.answered_at
        FROM quiz.user_answers ua
        JOIN quiz.questions q ON ua.question_id = q.id
        WHERE ua.user_id = %s AND ua.is_correct = false {wrong_date_filter}
        ORDER BY q.id, ua.answered_at DESC
        LIMIT 5
    """, params(user_id))
    wrong_answers = cur.fetchall()

    # 취약 단서 TOP3: region_select 오답에서 correct_regions label 집계
    cur.execute(f"""
        SELECT label, total, correct,
               ROUND(correct::numeric / NULLIF(total,0) * 100) as rate
        FROM (
            SELECT r->>'label' as label,
                   COUNT(*) as total,
                   SUM(CASE WHEN ua.is_correct THEN 1 ELSE 0 END) as correct
            FROM quiz.user_answers ua
            JOIN quiz.questions q ON ua.question_id = q.id,
            jsonb_array_elements(q.correct_regions) r
            WHERE ua.user_id = %s AND q.type = 'region_select' {wrong_date_filter}
              AND r->>'label' IS NOT NULL AND r->>'label' != ''
            GROUP BY r->>'label'
        ) sub
        WHERE total >= 2
        ORDER BY rate ASC
        LIMIT 3
    """, params(user_id))
    weak_labels = cur.fetchall()

    # 유저 프로필 (quiz.user_profiles)
    cur.execute("""
        SELECT total_exp, total_coins, energy, max_energy, current_tier, avatar_emoji
        FROM quiz.user_profiles WHERE user_id = %s
    """, (user_id,))
    profile = cur.fetchone()

    cur.close()
    conn.close()
    return stats, type_stats, weekly, profile, wrong_answers, weak_labels


class ReportRequest(BaseModel):
    user_id: str
    days: Optional[int] = 30  # None이면 전체 기간
    nickname: Optional[str] = None
    avatar_emoji: Optional[str] = None
    email: Optional[str] = None
    subscription_type: Optional[str] = "free"
    # 프론트에서 최신 quizProfile 값을 직접 전달 (user 서비스 비동기 지연 우회)
    total_exp: Optional[int] = None
    total_coins: Optional[int] = None
    tier_name: Optional[str] = None


@app.post("/generate")
def generate_report(req: ReportRequest):
    try:
        stats, type_stats, weekly, profile, wrong_answers, weak_labels = fetch_user_report_data(
            req.user_id, req.days
        )
        if not stats or int(stats['total'] or 0) == 0:
            raise HTTPException(status_code=404, detail="풀이 데이터가 없어요. 퀴즈를 먼저 풀어보세요.")

        html = build_html(
            user_id=req.user_id,
            stats=stats,
            type_stats=type_stats,
            weekly=weekly,
            wrong_answers=wrong_answers,
            weak_labels=weak_labels,
            nickname=req.nickname or '탐정',
            avatar_emoji=req.avatar_emoji or (profile['avatar_emoji'] if profile else '🐾'),
            email=req.email or '-',
            subscription_type=req.subscription_type or 'free',
            level=1,
            tier_name=req.tier_name or (profile['current_tier'] if profile else '알'),
            total_coins=req.total_coins if req.total_coins is not None else (int(profile['total_coins']) if profile else 0),
            total_exp=req.total_exp if req.total_exp is not None else (int(profile['total_exp']) if profile else 0),
            days=req.days,
        )

        # S3 버킷이 설정된 경우 S3에 저장, 아니면 로컬 /tmp 저장 (로컬 개발용)
        if S3_BUCKET:
            presigned_url = _upload_to_s3(req.user_id, html)
            return {"report_url": presigned_url}
        else:
            out_path = os.path.join(REPORTS_DIR, f"{req.user_id}.html")
            with open(out_path, 'w', encoding='utf-8') as f:
                f.write(html)
            return {"report_url": f"/download/{req.user_id}"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/download/{user_id}")
def download_report(user_id: str):
    # S3 모드: S3에서 presigned URL 생성 후 리다이렉트
    if S3_BUCKET:
        try:
            s3 = boto3.client("s3")
            key = f"{S3_PREFIX}/{user_id}.html"
            url = s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": S3_BUCKET, "Key": key},
                ExpiresIn=3600,
            )
            return RedirectResponse(url)
        except Exception as e:
            raise HTTPException(status_code=404, detail="리포트가 없어요. 먼저 생성해주세요.")

    # 로컬 모드: /tmp 파일 반환
    path = os.path.join(REPORTS_DIR, f"{user_id}.html")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="리포트가 없어요. 먼저 생성해주세요.")
    return FileResponse(
        path, media_type="text/html; charset=utf-8",
        filename=f"pawfiler_report_{datetime.utcnow().strftime('%Y%m%d')}.html"
    )


@app.get("/health")
def health():
    return {"status": "ok"}


# ── Lambda Handlers ────────────────────────────────────────────────────────────

# API Gateway / Function URL → FastAPI (mangum)
_mangum_handler = Mangum(app, lifespan="off")


def lambda_handler(event, context):
    """
    통합 Lambda 핸들러 — 이벤트 소스에 따라 자동 분기
    - SQS 트리거: Records 키 존재 → sqs_handler
    - Function URL / API Gateway: HTTP 이벤트 → mangum (FastAPI)
    """
    if "Records" in event and event["Records"][0].get("eventSource") == "aws:sqs":
        return sqs_handler(event, context)
    return _mangum_handler(event, context)


def sqs_handler(event, context):
    """SQS 트리거용 Lambda handler — 메시지 1건씩 리포트 생성 후 S3 저장"""
    import json as _json
    results = []
    for record in event.get("Records", []):
        try:
            body = _json.loads(record["body"])
            user_id = body["user_id"]
            days = body.get("days", 30)  # None이면 전체 기간
            nickname = body.get("nickname", "탐정")
            avatar_emoji = body.get("avatar_emoji", "🐾")
            email = body.get("email", "-")
            subscription_type = body.get("subscription_type", "free")

            stats, type_stats, weekly, profile, wrong_answers, weak_labels = \
                fetch_user_report_data(user_id, days)

            if not stats or int(stats['total'] or 0) == 0:
                print(f"[SKIP] user_id={user_id}: 풀이 데이터 없음")
                results.append({"user_id": user_id, "status": "skipped"})
                continue

            html = build_html(
                user_id=user_id,
                stats=stats,
                type_stats=type_stats,
                weekly=weekly,
                wrong_answers=wrong_answers,
                weak_labels=weak_labels,
                nickname=nickname,
                avatar_emoji=avatar_emoji or (profile['avatar_emoji'] if profile else '🐾'),
                email=email,
                subscription_type=subscription_type,
                level=1,
                tier_name=profile['current_tier'] if profile else '알',
                total_coins=int(profile['total_coins']) if profile else 0,
                total_exp=int(profile['total_exp']) if profile else 0,
            )

            presigned_url = _upload_to_s3(user_id, html)
            print(f"[OK] user_id={user_id} → {presigned_url[:60]}...")
            results.append({"user_id": user_id, "status": "ok", "url": presigned_url})

        except Exception as e:
            print(f"[ERROR] record={record.get('messageId')}: {e}")
            results.append({"status": "error", "error": str(e)})
            # SQS DLQ로 보내기 위해 예외 re-raise (batchItemFailures 방식)
            raise

    return {"results": results}


if __name__ == '__main__':
    import uuid, sys
    # HTML_ONLY=1 로 실행하면 wkhtmltopdf 없이 HTML만 생성 (로컬 미리보기용)
    HTML_ONLY = os.environ.get('HTML_ONLY', '1') == '1'

    stats={'total':44,'correct':23,'total_xp':380}
    type_stats=[
        {'type':'comparison','difficulty':'hard','total':6,'correct':3},
        {'type':'multiple_choice','difficulty':'easy','total':7,'correct':4},
        {'type':'multiple_choice','difficulty':'medium','total':5,'correct':1},
        {'type':'region_select','difficulty':'easy','total':6,'correct':3},
        {'type':'region_select','difficulty':'medium','total':4,'correct':2},
        {'type':'true_false','difficulty':'easy','total':10,'correct':7},
        {'type':'true_false','difficulty':'medium','total':6,'correct':3},
    ]
    weekly=[
        {'week':'2026-02-16','total':10,'correct':5},
        {'week':'2026-02-23','total':12,'correct':7},
        {'week':'2026-03-02','total':8,'correct':4},
        {'week':'2026-03-09','total':14,'correct':7},
    ]
    wrong_answers=[
        {'type':'multiple_choice','thumbnail_emoji':'🎬',
         'media_url':'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=300&fit=crop',
         'explanation':'배경 글씨가 깨져있는 것이 AI 생성 이미지의 특징입니다.',
         'options':['얼굴 표정이 부자연스러워요','배경 글씨가 깨져있어요','조명이 완벽해요','그림자가 정확해요'],
         'correct_index':1,'correct_answer':None,'correct_regions':None,'correct_side':None},
        {'type':'true_false','thumbnail_emoji':'✅',
         'media_url':'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=300&fit=crop',
         'explanation':'이 이미지는 AI가 생성한 가짜입니다.',
         'options':None,'correct_index':None,'correct_answer':False,'correct_regions':None,'correct_side':None},
        {'type':'region_select','thumbnail_emoji':'👁️',
         'media_url':'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400&h=300&fit=crop',
         'explanation':'오른쪽 위 보드의 글씨가 왜곡된 부분이 증거입니다.',
         'options':None,'correct_index':None,'correct_answer':None,
         'correct_regions':[{'x':650,'y':150,'radius':80,'label':'텍스트 왜곡'}],'correct_side':None},
    ]
    weak_labels=[
        {'label':'눈 주변 블러/왜곡','total':10,'correct':4,'rate':40},
        {'label':'헤어라인 경계 어색함','total':8,'correct':4,'rate':50},
        {'label':'조명 방향 불일치','total':6,'correct':2,'rate':33},
    ]
    kwargs = dict(
        user_id=str(uuid.uuid4()),
        stats=stats, type_stats=type_stats,
        weekly=weekly,
        wrong_answers=wrong_answers,
        weak_labels=weak_labels,
        nickname='탐정코난', avatar_emoji='🐱',
        email='detective@pawfiler.com', subscription_type='free',
        level=7, tier_name='견습 탐정 Lv.7',
        total_coins=1240, total_exp=340,
    )
    if HTML_ONLY:
        print("HTML 미리보기 모드 (HTML_ONLY=1)")
        html = build_html(**kwargs)
        out = 'PawFiler_리포트_v2.html'
        with open(out, 'w', encoding='utf-8') as f:
            f.write(html)
        print(f'완료: {out}  (브라우저로 열어서 확인하세요)')
    else:
        out = build_pdf(output_path='PawFiler_리포트_v2.pdf', **kwargs)
        print(f'완료: {out}')