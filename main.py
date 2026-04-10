import random
import traceback
from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

# 🌟 追加：HTMLファイルを返すためのモジュール
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# CSSやJSなどの静的ファイルを読み込めるようにする
app.mount("/static", StaticFiles(directory="."), name="static")

# トップページ（http://localhost:8000/）にアクセスした時に index2.html を返す
@app.get("/")
def read_root():
    return FileResponse("index2.html")

@app.get("/style.css")
def read_css():
    return FileResponse("style.css")

@app.get("/game.js")
def read_js():
    return FileResponse("game.js")

app.mount("/images", StaticFiles(directory="images"), name="images")
app.mount("/audio", StaticFiles(directory="audio"), name="audio")

# ==========================================
# 1. 辞書と定義
# ==========================================
TILE_NAMES = [
    "1p","2p","3p","4p","5p","6p","7p","8p","9p",
    "1s","2s","3s","4s","5s","6s","7s","8s","9s",
    "1m","9m",
    "東","南","西","北","白","發","中"
]
SEASON_TILES = {"春", "夏", "秋", "冬"} 

SORT_ORDER = {t: i for i, t in enumerate(TILE_NAMES + list(SEASON_TILES))}

DOTS = set(range(0, 9)); BAMS = set(range(9, 18)); CRACKS = {18, 19}; HONORS = set(range(20, 27))
TERMINALS = {0, 8, 9, 17, 18, 19}; ODDS = {0, 2, 4, 6, 8, 9, 11, 13, 15, 17, 18, 19}
GREEN_TILES = {10, 11, 12, 14, 16, 25}; PEACOCK_TILES = {9, 13, 15, 17, 26}
MONOCHROME_TILES = {1, 3, 7, 20, 21, 22, 23, 24}
UPPER_TILES = {6, 7, 8, 15, 16, 17, 19}; MIDDLE_TILES = {3, 4, 5, 12, 13, 14, 26}; LOWER_TILES = {0, 1, 2, 9, 10, 11, 18}
UPPER_FOUR = {5, 6, 7, 8, 14, 15, 16, 17, 19}; LOWER_FOUR = {0, 1, 2, 3, 9, 10, 11, 12, 18}
REVERSIBLE_TILES = {0, 1, 2, 3, 4, 7, 8, 10, 12, 13, 14, 16, 17, 24}
NON_RED_TILES = {1, 3, 5, 7, 10, 11, 12, 14, 16, 20, 21, 22, 23, 24, 25}
KNITTED_PATTERNS = [[18, 1, 4, 7, 11, 14, 17], [18, 2, 5, 8, 10, 13, 16], [19, 0, 3, 6, 10, 13, 16], [19, 1, 4, 7, 9, 12, 15]]

YAKU_DICT = {
    "天胡": (64, 'add'), "地胡": (64, 'add'), "七星攬月": (64, 'add'), "清幺九": (64, 'add'), "連七対": (64, 'add'), "九連宝燈": (64, 'add'),
    "十八羅漢": (32, 'add'), "大四風会": (32, 'add'), "一色四節高": (32, 'add'), "一色四步高": (32, 'add'), "紅孔雀": (32, 'add'), "七星不靠": (32, 'add'),
    "小四風会": (16, 'add'), "緑一色": (16, 'add'), "字一色": (16, 'add'), "陰陽両儀": (16, 'add'), "大三元": (16, 'add'), "全大": (16, 'add'), "全中": (16, 'add'), "全小": (16, 'add'), "寒江独釣": (16, 'add'), "十三幺九": (16, 'add'),
    "三節高": (8, 'add'), "三同刻": (8, 'add'), "断紅胡": (8, 'add'), "一気化三清": (8, 'add'), "十二金釵": (8, 'add'), "混幺九": (8, 'add'),
    "大于五": (6, 'add'), "小于五": (6, 'add'), "清一色": (6, 'add'), "清龍": (6, 'add'), "五門斉": (6, 'add'), "推不倒": (6, 'add'),
    "七対": (4, 'add'), "小三元": (4, 'add'), "碰碰胡": (4, 'add'), "下雨": (4, 'add'),
    "双同刻": (2, 'add'), "混一色": (2, 'add'), "刮風": (2, 'add'), "断么": (2, 'add'), "字刻": (2, 'add'), "全単": (2, 'add'),
    "無番和": (1, 'add'),
    "無花果": (3, 'mult'), "槓上開花": (2, 'mult'), "槍槓": (2, 'mult'), "妙手回春": (2, 'mult'), "花天月地": (2, 'mult')
}

OVERRIDE_RULES = {
    "大四風会": ["小四風会", "一気化三清", "碰碰胡"], "大三元": ["小三元"], "連七対": ["七対", "清一色"], "九連宝燈": ["清一色"],
    "十八羅漢": ["十二金釵", "碰碰胡", "寒江独釣"], "一色四節高": ["三節高", "碰碰胡"], "三同刻": ["双同刻"],
    "七星不靠": ["五門斉"], "十三幺九": ["混幺九", "五門斉"], "寒江独釣": ["碰碰胡"], "清幺九": ["混幺九", "全単"], 
    "字一色": ["混幺九", "混一色"], "陰陽両儀": ["断紅胡"], "緑一色": ["断紅胡"], "全大": ["大于五"], "全小": ["小于五"],
    "七星攬月": ["字一色", "七対"]
}

# ==========================================
# 2. AIロジック
# ==========================================
def get_visible_count(t, game_state):
    count = 0
    for i in range(4):
        count += game_state.discards[i].count(t)
        for m in game_state.melds[i]:
            count += m["tiles"].count(t)
    return count

def get_tile_num(t):
    if "p" in t or "s" in t or "m" in t: return int(t[0])
    return -1

def determine_target(cpu_idx, hand_list, game_state):
    personality = game_state.cpu_personalities[cpu_idx]
    jokers = sum(1 for t in hand_list if t in SEASON_TILES)
    terminals_honors = set(t for t in hand_list if t in TILE_NAMES and TILE_NAMES.index(t) in TERMINALS.union(HONORS))
    
    # 対子（ペア）を抽出
    counts = {}
    for t in hand_list:
        if t not in SEASON_TILES: counts[t] = counts.get(t, 0) + 1
    pairs = [t for t, c in counts.items() if c >= 2]
    
    # ==========================================
    # 1. 特殊和了役の判定
    # ==========================================
    # 🌟 修正：七星不靠の正しい判定（14枚中10枚以上それっぽい牌があれば狙う）
    max_qixing_count = 0
    for pattern in KNITTED_PATTERNS:
        c = sum(1 for i in pattern + list(HONORS) if TILE_NAMES[i] in hand_list)
        if c > max_qixing_count: max_qixing_count = c
        
    if max_qixing_count + jokers >= 10: 
        return "七星不靠"
        
    yaojiu_count = len(terminals_honors) + jokers
    if yaojiu_count >= 9: return "十三幺九"
        
    if sum(1 for t in hand_list if t in TILE_NAMES and TILE_NAMES.index(t) in ODDS) >= 10: return "全単"
        
    # ==========================================
    # 2. 面子役の判定
    # ==========================================
    term_pairs = [t for t in pairs if "1" in t or "9" in t]
    if len(term_pairs) >= 1: return "双同刻/三同刻"
        
    num_pairs = sorted([get_tile_num(t) for t in pairs if get_tile_num(t) != -1])
    if any(num_pairs[i+1] - num_pairs[i] == 1 for i in range(len(num_pairs)-1)): return "三節高/四節高"
        
    if sum(1 for t in pairs if t in ["白", "發", "中"]) >= 2: return "小三元/大三元"
    if sum(1 for t in pairs if t in ["東", "南", "西", "北"]) >= 2: return "小四喜/大四喜"
        
    suits = {'p': sum(1 for x in set(hand_list) if 'p' in x), 's': sum(1 for x in set(hand_list) if 's' in x), 'm': sum(1 for x in set(hand_list) if 'm' in x)}
    if len(pairs) == 0 and max(suits.values()) >= 6: return "一通/混一色"

    # ==========================================
    # 3. 状態役の判定
    # ==========================================
    if sum(1 for t in hand_list if t in TILE_NAMES and TILE_NAMES.index(t) in NON_RED_TILES) >= 8 and len(pairs) >= 2: return "断紅胡"
    if sum(1 for t in hand_list if t in TILE_NAMES and TILE_NAMES.index(t) in TERMINALS.union(HONORS)) >= 8 and len(pairs) >= 2: return "混老頭"
        
    nums = [get_tile_num(t) for t in hand_list if get_tile_num(t) != -1]
    if sum(1 for n in nums if n >= 6) >= 8: return "大于五"
    if sum(1 for n in nums if n <= 4) >= 8: return "小于五"
        
    if any("m" in t for t in pairs) and any(t in ["東","南","西","北","白","發","中"] for t in pairs): return "五門斉"
    if sum(1 for t in hand_list if t in TILE_NAMES and TILE_NAMES.index(t) in REVERSIBLE_TILES) >= 8 and len(pairs) >= 2: return "推不倒"
    if len(pairs) >= 3: return "対々和"
        
    return "混一色/清一色"

def evaluate_tile_dynamically(t, hand_list, game_state, cpu_idx, personality):
    target = determine_target(cpu_idx, hand_list, game_state)
    
    if t in SEASON_TILES: 
        temp_hand = list(hand_list)
        temp_hand.remove(t)
        is_all_odds = all((x in SEASON_TILES or (x in TILE_NAMES and TILE_NAMES.index(x) in ODDS)) for x in temp_hand)
        if target == "全単" and is_all_odds:
            return -10000
            
        # 🌟 今回追加：七星不靠で花牌が1枚のみ、かつ打点重視(タイプ1,2)なら花牌を捨てる！
        jokers_count = sum(1 for x in hand_list if x in SEASON_TILES)
        if target == "七星不靠" and personality in [1, 2] and jokers_count == 1:
            return -10000
            
        return 10000

    if t not in TILE_NAMES: return 0
    idx = TILE_NAMES.index(t)
    score = 0
    count = hand_list.count(t)
    visible = get_visible_count(t, game_state)
    t_num = get_tile_num(t)
    
    if count == 2: score += 50
    if count >= 3: score += 120

    # 🌟 フェーズ2：性格による価値観の違い（大物手 vs スピード）
    # personality => 1:大物手, 2:大物手, 3:速攻, 4:速攻
    if personality in [1, 2]: 
        # スナイパー・ギャンブラー（大物手派）
        if idx in HONORS: score += 40 # 字牌を大事にする（役牌、字一色、混一色狙い）
        if t_num in [1, 9]: score += 30 # 端牌を大事にする（清幺九、チャンタ狙い）
    else: 
        # スピードスター・トリックスター（速攻派）
        if count == 1 and idx in HONORS: score -= 50 # 孤立した字牌は即切り
        if 3 <= t_num <= 7: score += 30 # 使いやすい中張牌を重宝する

    if count == 1 and visible >= 3 and idx in HONORS: score -= 80 
        
    if t == "發": score += 15

    target = determine_target(cpu_idx, hand_list, game_state)
    # （これ以降の `if target in ["七星不靠", "十三幺九"]:` などの処理はそのまま）

    # 🌟 修正：七星不靠と十三幺九の評価を完全に分離する！
    if target == "七星不靠":
        if count >= 2: score -= 100 
        # 一番揃っているスジのパターンを探す
        best_pattern = []
        max_c = -1
        for p in KNITTED_PATTERNS:
            c = sum(1 for i in p + list(HONORS) if TILE_NAMES[i] in hand_list)
            if c > max_c:
                max_c = c
                best_pattern = p
        # そのパターンの牌か、字牌なら超大事にする（+300点）
        if idx in best_pattern or idx in HONORS:
            if count == 1: score += 300 
        else:
            score -= 100
            
    elif target == "十三幺九":
        if count >= 2: score -= 100 
        if idx in TERMINALS.union(HONORS):
            if count == 1: score += 300 
        else: score -= 100
        
    elif target == "全単":
        if idx in ODDS: score += 80
        else: score -= 80
    elif target == "双同刻/三同刻":
        if t_num in [1, 9]: score += 80
    elif target == "三節高/四節高":
        if count >= 2: score += 80 
        # 🌟 修正：三色三節高に対応するため、他色の連番ペアがあれば加点する
        if t_num != -1:
            pair_nums = [get_tile_num(p) for p in hand_list if hand_list.count(p) >= 2 and p not in SEASON_TILES and get_tile_num(p) != -1]
            if (t_num - 1) in pair_nums or (t_num + 1) in pair_nums:
                score += 40
    elif target == "小三元/大三元":
        if t in ["白", "發", "中"]: score += 200
    elif target == "小四喜/大四喜":
        if t in ["東", "南", "西", "北"]: score += 200
    elif target == "一通/混一色" or target == "混一色/清一色":
        suits = {'p': sum(1 for x in hand_list if 'p' in x), 's': sum(1 for x in hand_list if 's' in x), 'm': sum(1 for x in hand_list if 'm' in x)}
        dom = max(suits, key=suits.get)
        if dom in t: score += 80
        elif idx in HONORS: score += 40
        else: score -= 50
    elif target == "断紅胡":
        if idx in NON_RED_TILES: score += 80
        else: score -= 80
    elif target == "混老頭":
        if idx in TERMINALS.union(HONORS): score += 100
        else: score -= 80
    elif target == "大于五":
        if t_num >= 6: score += 80
        elif t_num == -1: score -= 30
        else: score -= 80
    elif target == "小于五":
        if 1 <= t_num <= 4: score += 80
        elif t_num == -1: score -= 30
        else: score -= 80
    elif target == "五門斉":
        if "m" in t or idx in HONORS: score += 60
    elif target == "推不倒":
        if idx in REVERSIBLE_TILES: score += 80
        else: score -= 80
    elif target == "対々和":
        if count >= 2: score += 100 

    # 面子作りの基本評価（順子のタネ）
    if t_num != -1 and count >= 1 and target not in ["七星不靠", "十三幺九", "全単", "対々和", "混老頭"]:
        suit = t[-1] 
        if f"{t_num - 2}{suit}" in hand_list and f"{t_num - 1}{suit}" in hand_list: score += 80 
        if f"{t_num - 1}{suit}" in hand_list and f"{t_num + 1}{suit}" in hand_list: score += 80 
        if f"{t_num + 1}{suit}" in hand_list and f"{t_num + 2}{suit}" in hand_list: score += 80 
        if f"{t_num - 1}{suit}" in hand_list: score += 40
        if f"{t_num + 1}{suit}" in hand_list: score += 40
        if f"{t_num - 2}{suit}" in hand_list: score += 20
        if f"{t_num + 2}{suit}" in hand_list: score += 20

    score += random.randint(0, 5) 
    return score

def parse_hand(tiles, jokers):
    valid_parses = []
    def find_melds(t, j, pongs, chows, pair_idx, start_idx=0):
        if sum(t) == 0:
            valid_parses.append({'pair': pair_idx, 'pongs': list(pongs), 'chows': list(chows), 'rem_j': j})
            return
        for i in range(start_idx, 27):
            if t[i] > 0:
                needed_p = max(0, 3 - t[i])
                if j >= needed_p:
                    actual_p = 3 - needed_p
                    t[i] -= actual_p
                    find_melds(t, j - needed_p, pongs + [i], chows, pair_idx, i)
                    t[i] += actual_p
                if (0 <= i <= 6) or (9 <= i <= 15):
                    needed_c = 0
                    used = []
                    for offset in range(3):
                        if t[i + offset] > 0:
                            t[i + offset] -= 1
                            used.append(i + offset)
                        else: needed_c += 1
                    if j >= needed_c:
                        find_melds(t, j - needed_c, pongs, chows + [i], pair_idx, i)
                    for ut in used: t[ut] += 1
                return
    for i in range(27):
        needed_pair = max(0, 2 - tiles[i])
        if jokers >= needed_pair:
            actual_pair = 2 - needed_pair
            tiles[i] -= actual_pair
            find_melds(tiles, jokers - needed_pair, [], [], i, 0)
            tiles[i] += actual_pair
    return valid_parses

def expand_wild_melds(parses):
    expanded = []
    for p in parses:
        if p['rem_j'] >= 3:
            for i in range(27):
                expanded.extend(expand_wild_melds([{'pair': p['pair'], 'pongs': p['pongs'] + [i], 'chows': p['chows'], 'rem_j': p['rem_j'] - 3}]))
            for i in list(range(7)) + list(range(9, 16)):
                expanded.extend(expand_wild_melds([{'pair': p['pair'], 'pongs': p['pongs'], 'chows': p['chows'] + [i], 'rem_j': p['rem_j'] - 3}]))
        else:
            expanded.append(p)
    return expanded

def calc_yaku_score(yaku_list):
    filtered = list(dict.fromkeys(yaku_list))
    if "七星攬月" in filtered: filtered = [y for y in filtered if y in ["七星攬月", "無花果"]]
    for higher, lowers in OVERRIDE_RULES.items():
        if higher in filtered:
            for lower in lowers:
                while lower in filtered: filtered.remove(lower)
                
    b_score, mult = 0, 1
    for y in filtered:
        if y in YAKU_DICT:
            if YAKU_DICT[y][1] == 'add': b_score += YAKU_DICT[y][0]
            elif YAKU_DICT[y][1] == 'mult': mult *= YAKU_DICT[y][0]
            
    if b_score == 0:
        b_score = 1
        if "無番和" not in filtered: filtered.append("無番和")
    else:
        if "無番和" in filtered: filtered.remove("無番和")
        
    return b_score * mult, b_score, mult, filtered

def evaluate_hand(data):
    closed_str = data.get("closed_tiles", "")
    melds = data.get("melds", [])
    ctx = data.get("win_context", {})

    winning_tile = ctx.get("winning_tile", "")
    if winning_tile: closed_str += " " + winning_tile

    closed_list = closed_str.split()
    tiles = [0] * 27
    jokers = 0
    all_used_tiles = [] 

    is_menzen = all(m["type"] == "ankan" for m in melds)
    for t in closed_list:
        if t in TILE_NAMES:
            tile_idx = TILE_NAMES.index(t)
            tiles[tile_idx] += 1
            all_used_tiles.append(tile_idx)
        elif t in SEASON_TILES: jokers += 1

    melded_pongs = []
    kan_count = 0
    base_attr = []

    for m in melds:
        meld_tile_names = m.get("tiles", [])
        meld_indices = []
        for tn in meld_tile_names:
            if tn in TILE_NAMES:
                idx = TILE_NAMES.index(tn)
                meld_indices.append(idx)
                all_used_tiles.append(idx)
        if m["type"] in ["pong", "minkan", "ankan", "hanakan"]:
            if meld_indices:
                representative_tile = max(set(meld_indices), key=meld_indices.count)
                melded_pongs.append(representative_tile)
        if m["type"] in ["ankan", "minkan", "hanakan"]:
            kan_count += 1
            if m["type"] == "ankan": base_attr.append("下雨")
            else: base_attr.append("刮風")
            
    if kan_count == 4: base_attr.append("十八羅漢")
    elif kan_count == 3: base_attr.append("十二金釵")

    if len(melds) == 4:
        base_attr.append("寒江独釣")

    has_season_in_hand = any(t in SEASON_TILES for t in closed_list)
    if not has_season_in_hand: base_attr.append("無花果")

    # 🌟 修正2：スナップショットと捨て牌数を使った「絶対に狂わない」判定
    is_tsumo = ctx.get("is_tsumo", False)
    is_first = ctx.get("is_first_turn", False)
    any_meld = ctx.get("any_meld_occurred", False)
    d_count = ctx.get("discards_count", 999) # 🌟 取得（デフォルトは大きな値）

    if is_menzen and is_first and not any_meld:
        # 天胡：親がツモ和了で、場にまだ1枚も捨てられていない時
        if ctx.get("is_dealer", False) and is_tsumo and d_count == 0:
            base_attr.append("天胡")
        # 地胡：子が和了した時、場の総捨て牌数が4枚未満（誰も2巡目に入っていない）
        elif not ctx.get("is_dealer", False) and d_count < 4:
            base_attr.append("地胡")

    if is_tsumo and winning_tile == "春": base_attr.append("妙手回春")
    if ctx.get("is_rinshan", False): base_attr.append("槓上開花")
    if ctx.get("is_haitei", False): base_attr.append("花天月地")
    if ctx.get("is_chankan", False): base_attr.append("槍槓")
    
    used_indices = set(all_used_tiles)
    if used_indices.issubset(TERMINALS.union(HONORS)):
        if used_indices.issubset(TERMINALS): base_attr.append("清幺九")
        elif used_indices.issubset(HONORS): base_attr.append("字一色")
        else: base_attr.append("混幺九")
    else:
        if not used_indices.intersection(TERMINALS) and not used_indices.intersection(HONORS): base_attr.append("断么")
            
    if used_indices.issubset(GREEN_TILES): base_attr.append("緑一色")
    if used_indices.issubset(PEACOCK_TILES): base_attr.append("紅孔雀")
    if used_indices.issubset(MONOCHROME_TILES): base_attr.append("陰陽両儀")
    if used_indices.issubset(UPPER_TILES): base_attr.append("全大")
    if used_indices.issubset(MIDDLE_TILES): base_attr.append("全中")
    if used_indices.issubset(LOWER_TILES): base_attr.append("全小")
    if used_indices.issubset(UPPER_FOUR): base_attr.append("大于五")
    if used_indices.issubset(LOWER_FOUR): base_attr.append("小于五")
    if used_indices.issubset(REVERSIBLE_TILES): base_attr.append("推不倒")
    if used_indices.issubset(NON_RED_TILES): base_attr.append("断紅胡")
    
    suit_c = sum([bool(used_indices.intersection(DOTS)), bool(used_indices.intersection(BAMS)), bool(used_indices.intersection(CRACKS))])
    has_winds = bool(used_indices.intersection({20, 21, 22, 23}))
    has_dragons = bool(used_indices.intersection({24, 25, 26}))
    if suit_c == 1 and not bool(used_indices.intersection(HONORS)): base_attr.append("清一色")
    if suit_c == 1 and bool(used_indices.intersection(HONORS)): base_attr.append("混一色")
    if suit_c == 3 and has_winds and has_dragons: base_attr.append("五門斉")

    candidates = []
    raw_parses = parse_hand(tiles, jokers)
    expanded_parses = expand_wild_melds(raw_parses)

    for p in expanded_parses:
        cand = list(base_attr)
        struct_yaku = []
        all_pongs = p['pongs'] + melded_pongs
        chows = p['chows']
        pair = p['pair']
        
        if len(all_pongs) == 4: struct_yaku.append("碰碰胡")
        char_pong_c = sum(1 for pong in all_pongs if pong in CRACKS.union(HONORS))
        struct_yaku.extend(["字刻"] * char_pong_c)
        
        suits_for_num = {n: set() for n in range(1, 10)}
        for idx in all_pongs:
            if 0 <= idx <= 8: suits_for_num[idx+1].add('p')
            elif 9 <= idx <= 17: suits_for_num[idx-8].add('s')
            elif idx == 18: suits_for_num[1].add('m')
            elif idx == 19: suits_for_num[9].add('m')
        for n in range(1, 10):
            if len(suits_for_num[n]) == 3: struct_yaku.append("三同刻")
            elif len(suits_for_num[n]) == 2: struct_yaku.append("双同刻")
            
        max_shifted_pongs = 0
        for suit in [0, 9]:
            pong_set = set(x - suit for x in all_pongs if suit <= x <= suit + 8)
            for i in range(9):
                length = 0
                while (i + length) in pong_set: length += 1
                if length > max_shifted_pongs: max_shifted_pongs = length
                
        pong_nums = []
        for idx in all_pongs:
            if 0 <= idx <= 8: pong_nums.append((idx+1, 'p'))
            elif 9 <= idx <= 17: pong_nums.append((idx-8, 's'))
            elif idx == 18: pong_nums.append((1, 'm'))
            elif idx == 19: pong_nums.append((9, 'm'))
        for n in range(1, 8):
            s1, s2, s3 = {s for num, s in pong_nums if num == n}, {s for num, s in pong_nums if num == n+1}, {s for num, s in pong_nums if num == n+2}
            for sx in s1:
                for sy in s2:
                    for sz in s3:
                        if len({sx, sy, sz}) == 3 and max_shifted_pongs < 3: max_shifted_pongs = 3

        if max_shifted_pongs >= 4: struct_yaku.append("一色四節高")
        elif max_shifted_pongs == 3: struct_yaku.append("三節高")

        has_shihoukou = False
        for suit in [0, 9]:
            chow_set = set(x - suit for x in chows if suit <= x <= suit + 6)
            for i in range(4):
                if all((i+k) in chow_set for k in range(4)): has_shihoukou = True
            if all(k in chow_set for k in [0, 2, 4, 6]): has_shihoukou = True
        if has_shihoukou: struct_yaku.append("一色四步高")

        has_chinryu = False
        for suit in [0, 9]:
            if 0+suit in chows and 3+suit in chows and 6+suit in chows: has_chinryu = True
        if has_chinryu: struct_yaku.append("清龍")

        wind_pong_types = {pong for pong in all_pongs if 20 <= pong <= 23}
        if len(wind_pong_types) == 4: struct_yaku.append("大四風会")
        elif len(wind_pong_types) == 3:
            if 20 <= pair <= 23 and pair not in wind_pong_types: struct_yaku.append("小四風会")
            else: struct_yaku.append("一気化三清")
                
        dragon_pong_types = {pong for pong in all_pongs if 24 <= pong <= 26}
        if len(dragon_pong_types) == 3: struct_yaku.append("大三元")
        elif len(dragon_pong_types) == 2 and 24 <= pair <= 26 and pair not in dragon_pong_types: struct_yaku.append("小三元")
        
        cand.extend(struct_yaku)
        candidates.append(cand)

    if len(melds) == 0:
        needed_pairs_j = sum(1 for count in tiles if count % 2 != 0)
        if jokers >= needed_pairs_j:
            if used_indices.issubset(HONORS):
                req_j_for_seven_stars = 0
                for h_idx in HONORS:
                    if tiles[h_idx] == 0:
                        req_j_for_seven_stars += 2
                    elif tiles[h_idx] % 2 != 0:
                        req_j_for_seven_stars += 1
                        
                if jokers >= req_j_for_seven_stars:
                    candidates.append(base_attr + ["七星攬月"])
                else:
                    candidates.append(base_attr + ["七対"])
            else:
                cand = base_attr + ["七対"]
                for suit_start in [0, 9]:
                    for st in range(0, 3):
                        req = [suit_start + st + i for i in range(7)]
                        
                        # 🌟 ここを修正！「min(2, tiles[t])」にして、3枚以上持っていても2枚としてカウントさせる
                        if sum(min(2, tiles[t]) for t in req) + jokers >= 14: 
                            if "七対" in cand: cand.append("連七対")
                            
                candidates.append(cand)

        if used_indices.issubset(TERMINALS.union(HONORS)) and sum(1 for i in TERMINALS.union(HONORS) if tiles[i] > 0) + jokers >= 13:
            candidates.append(base_attr + ["十三幺九"])

        if not any(count > 1 for count in tiles):
            for pattern in KNITTED_PATTERNS:
                if sum(1 for i in pattern + list(HONORS) if tiles[i] == 1) + jokers >= 14:
                    candidates.append(base_attr + ["七星不靠"])

        for suit_start in [0, 9]:
            suit_tiles = tiles[suit_start:suit_start+9]
            if sum(tiles) - sum(suit_tiles) == 0:
                target = [3,1,1,1,1,1,1,1,3]
                if jokers >= sum(max(0, target[i] - suit_tiles[i]) for i in range(9)):
                    candidates.append(base_attr + ["九連宝燈"])
                    
        if used_indices.issubset(ODDS):
            candidates.append(base_attr + ["全単"])

    if not candidates:
        return {"error": "聴牌していません", "score": 0, "yaku": []}

    best_score = -1
    best_result = None
    for cand in candidates:
        f_score, b_score, mult, f_yaku = calc_yaku_score(cand)
        if f_score > best_score:
            best_score = f_score
            best_result = (f_score, b_score, mult, f_yaku)

    final_score, base_score, multiplier, display_names = best_result
    return {"score": final_score, "base_score": base_score, "multiplier": multiplier, "yaku": display_names}

def get_waits_for_hand(hand_list, melds):
    waits = []
    closed_str = " ".join(hand_list)
    for t in TILE_NAMES + list(SEASON_TILES):
        win_ctx = {"winning_tile": t, "is_tsumo": False, "is_haitei": False}
        data = {"closed_tiles": closed_str, "melds": melds, "win_context": win_ctx}
        res = evaluate_hand(data)
        if "error" not in res: waits.append(t)
    return waits

def is_kan_valid_for_player(player_idx, kan_type, tile):
    win_tiles = game.win_tiles[player_idx]
    if not win_tiles: return True 
    
    hand = list(game.hands[player_idx])
    melds = [dict(m) for m in game.melds[player_idx]]
    last_drawn = game.last_drawn[player_idx]
    
    if any(t in SEASON_TILES for t in hand):
        return False
        
    temp_hand_orig = list(hand)
    if last_drawn in temp_hand_orig:
        temp_hand_orig.remove(last_drawn)
    original_waits = get_waits_for_hand(temp_hand_orig, melds)
    
    if kan_type == "ankan":
        if hand.count(tile) < 4: return False
        for _ in range(4): hand.remove(tile)
        melds.append({"type": "ankan", "tiles": [tile]*4})
    elif kan_type == "kakan":
        if tile not in hand: return False
        hand.remove(tile)
        found = False
        for m in melds:
            if m["type"] in ["pong", "minkan"] and m["tiles"][0] == tile:
                m["type"] = "minkan"
                m["tiles"] = [tile]*4
                found = True
                break
        if not found: return False
                
    temp_hand_new = list(hand)
    if last_drawn in temp_hand_new:
        temp_hand_new.remove(last_drawn)
    new_waits = get_waits_for_hand(temp_hand_new, melds)
    
    # 🌟 修正箇所：旧来の「完全に一致しなければダメ」という縛りを削除し、
    # 「過去のアガリ牌(win_tiles)が、新しい待ち(new_waits)に全て含まれているか」で判定する
    if not set(win_tiles).issubset(set(new_waits)):
        return False 
            
    return True

# ==========================================
# 3. 四人対局用 ゲームエンジン
# ==========================================
class GameState:
    def __init__(self):
        self.current_round = 1
        self.dealer = random.randint(0, 3) 
        self.scores = [0, 0, 0, 0] 
        self.total_scores = [0, 0, 0, 0] 
        self.cpu_targets = ["", "", "", ""]
        
        # 🌟 修正：ランダムな文字列だったものを、1〜4の性格IDに変更
        # 1:スナイパー(温存) 2:ギャンブラー(花槓) 3:スピードスター(温存) 4:トリックスター(花槓)
        self.cpu_personalities = ["", random.randint(1, 4), random.randint(1, 4), random.randint(1, 4)]
        print(f"【CPU起動】 CPU1:タイプ{self.cpu_personalities[1]}, CPU2:タイプ{self.cpu_personalities[2]}, CPU3:タイプ{self.cpu_personalities[3]}")
        
        self.just_drawn = -1 
        self.reset_round()

    def reset_round(self):
        self.wall = (TILE_NAMES * 4) + list(SEASON_TILES)
        random.shuffle(self.wall)
        self.hands = [self.sort_hand([self.wall.pop() for _ in range(13)]) for _ in range(4)]
        self.melds = [[] for _ in range(4)]
        self.win_tiles = [[] for _ in range(4)]
        self.last_drawn = [""] * 4
        self.discards = [[] for _ in range(4)]
        self.turn = self.dealer 
        self.scores = [0, 0, 0, 0]
        self.cpu_targets = ["", "", "", ""]
        self.just_drawn = -1 
        
        self.win_records = [[] for _ in range(4)]
        self.is_first_turn = [True, True, True, True]
        self.any_meld_occurred = False
        self.discards_count = 0
        
    def sort_hand(self, hand):
        return sorted(hand, key=lambda x: SORT_ORDER.get(x, 999))

game = GameState()

def get_safe_state(player_idx=0, extra_data=None):
    res = {
        "status": "success",
        "player_hand": game.hands[player_idx],
        "player_melds": game.melds[player_idx],
        "player_win_tiles": game.win_tiles[player_idx],
        "wall_count": len(game.wall),
        "turn": game.turn,
        "dealer": game.dealer,
        "current_round": game.current_round,
        "scores": game.scores,
        "total_scores": game.total_scores,
        "all_hands": game.hands,
        "all_melds": game.melds,
        "all_win_tiles": game.win_tiles,
        "cpu_targets": game.cpu_targets,
        "cpu_personalities": game.cpu_personalities 
    }
    if extra_data: res.update(extra_data)
    return res

@app.get("/start")
def start_game():
    game.__init__()
    return get_safe_state()

@app.get("/next_round")
def next_round():
    sorted_indices = sorted(range(4), key=lambda i: (game.scores[i], -((i - game.dealer) % 4)), reverse=True)
    next_dealer = sorted_indices[0] 
    
    for rank, idx in enumerate(sorted_indices):
        points = [300, 200, 100, 0][rank]
        game.total_scores[idx] += game.scores[idx] + points
        
    game.current_round += 1
    game.dealer = next_dealer
    game.reset_round()
    return get_safe_state()

@app.get("/charleston")
def charleston(player_idx: int = 0, t1: str = "", t2: str = "", t3: str = ""):
    try:
        player_passed = [t1, t2, t3]
        for t in player_passed: game.hands[0].remove(t)
        
        cpu_passed = []
        for i in range(1, 4):
            target = determine_target(i, game.hands[i], game)
            game.cpu_targets[i] = target
            # 🌟 修正：絶対に花牌を交換の計算に入れない
            valid_candidates = [t for t in game.hands[i] if t not in SEASON_TILES]
            scored = [(t, evaluate_tile_dynamically(t, game.hands[i], game, i, game.cpu_personalities[i]) + random.randint(0, 5)) for t in valid_candidates]
            scored.sort(key=lambda x: x[1])
            passed = []
            temp_hand = list(game.hands[i])
            for st in scored:
                if st[0] in temp_hand:
                    passed.append(st[0])
                    temp_hand.remove(st[0])
                if len(passed) == 3: break
            for t in passed: game.hands[i].remove(t)
            cpu_passed.append(passed)
        
        all_passed = [player_passed, cpu_passed[0], cpu_passed[1], cpu_passed[2]]
        dice = random.randint(1, 6)
        if dice in [1, 2]: offset, msg = -1, "下家(右)へ交換"
        elif dice in [3, 4]: offset, msg = -2, "対面(正面)へ交換"
        else: offset, msg = 1, "上家(左)へ交換"
        
        for i in range(4):
            giver_idx = (i + offset) % 4
            game.hands[i].extend(all_passed[giver_idx])
            game.hands[i] = game.sort_hand(game.hands[i])
            
        game.just_drawn = -1 
        return get_safe_state(0, {"dice": dice, "direction": msg})
    except Exception as e:
        return {"error": str(e)}

@app.get("/second_charleston")
def second_charleston(player_idx: int = 0, t1: str = "", t2: str = "", t3: str = "", p0: str = "false", p1: str = "false", p2: str = "false", p3: str = "false"):
    try:
        participating = [p0.lower() == "true", p1.lower() == "true", p2.lower() == "true", p3.lower() == "true"]
        active = [i for i in range(4) if participating[i]]

        if len(active) <= 1:
            return get_safe_state(0, {"dice": 0, "direction": "参加者が足りないため不成立となりました"})

        passed_tiles = {i: [] for i in active}

        if 0 in active:
            player_passed = [t for t in [t1, t2, t3] if t]
            for t in player_passed:
                if t in game.hands[0]: game.hands[0].remove(t)
            passed_tiles[0] = player_passed

        for i in active:
            if i != 0:
                target = determine_target(i, game.hands[i], game)
                game.cpu_targets[i] = target
                # 🌟 修正：絶対に花牌を交換の計算に入れない
                valid_candidates = [t for t in game.hands[i] if t not in SEASON_TILES]
                scored = [(t, evaluate_tile_dynamically(t, game.hands[i], game, i, game.cpu_personalities[i]) + random.randint(0, 5)) for t in valid_candidates]
                scored.sort(key=lambda x: x[1])
                passed = []
                temp_hand = list(game.hands[i])
                for st in scored:
                    if st[0] in temp_hand:
                        passed.append(st[0])
                        temp_hand.remove(st[0])
                    if len(passed) == 3: break
                for t in passed: game.hands[i].remove(t)
                passed_tiles[i] = passed

        dice = random.randint(1, 6)
        msg = ""

        if len(active) == 4:
            if dice in [1, 2]: offset, msg = -1, "下家(右)へ交換"
            elif dice in [3, 4]: offset, msg = -2, "対面(正面)へ交換"
            else: offset, msg = 1, "上家(左)へ交換"
            for i in range(4):
                giver_idx = (i + offset) % 4
                game.hands[i].extend(passed_tiles[giver_idx])

        elif len(active) == 3:
            if dice in [1, 2, 3]: offset_idx, msg = -1, "参加者間で右回り(下家方向)に交換"
            else: offset_idx, msg = 1, "参加者間で左回り(上家方向)に交換"
            for idx, player in enumerate(active):
                giver_idx = active[(idx + offset_idx) % len(active)]
                game.hands[player].extend(passed_tiles[giver_idx])

        elif len(active) == 2:
            dice, msg = 0, "2人で直接交換"
            pA, pB = active[0], active[1]
            game.hands[pA].extend(passed_tiles[pB])
            game.hands[pB].extend(passed_tiles[pA])

        for i in range(4): game.hands[i] = game.sort_hand(game.hands[i])
        game.just_drawn = -1 
        return get_safe_state(0, {"dice": dice, "direction": msg})
    except Exception as e:
        traceback.print_exc()
        return {"error": f"サーバー内部エラー(/second_charleston): {str(e)}"}

@app.get("/draw")
def draw_tile(player_idx: int = 0):
    if not game.wall: return {"error": "流局"}
    tile = game.wall.pop()
    game.hands[player_idx].append(tile)
    game.last_drawn[player_idx] = tile
    game.hands[player_idx] = game.sort_hand(game.hands[player_idx])
    game.just_drawn = player_idx 
    return get_safe_state(0, {"drawn_tile": tile})

@app.get("/discard")
def discard_tile(player_idx: int = 0, tile: str = ""):
    game.is_first_turn[player_idx] = False 
    if len(game.win_tiles[player_idx]) > 0:
        if tile != game.last_drawn[player_idx]:
            return {"error": "アガリ後はツモ切りしかできません"}
            
    if tile in game.hands[player_idx]:
        game.hands[player_idx].remove(tile)
        game.discards[player_idx].append(tile) 
        game.discards_count += 1
        game.turn = (player_idx + 1) % 4
        game.just_drawn = -1 
        return get_safe_state()
    return {"error": "通信エラー: 牌が見つかりません"}

@app.get("/cpu_turn")
def cpu_turn(cpu_idx: int):
    try:
        if not game.wall: return {"error": "流局"}
        drawn = game.wall.pop()
        game.last_drawn[cpu_idx] = drawn
        
        ctx = {
            "winning_tile": drawn, 
            "is_tsumo": True, 
            "is_haitei": len(game.wall)==0,
            "is_joker_swap": False,
            "is_rinshan": False,
            "is_first_turn": game.is_first_turn[cpu_idx],
            "any_meld_occurred": game.any_meld_occurred,
            "is_dealer": game.dealer == cpu_idx,
            "discards_count": game.discards_count # 🌟 これが抜けていました！
        }

        win_data = {
            "closed_tiles": " ".join(game.hands[cpu_idx]),
            "melds": game.melds[cpu_idx],
            "win_context": ctx
        }
        res = evaluate_hand(win_data)
        if "error" not in res:
            is_hanari_zentan = ("全単" in res.get("yaku", []) and "無花果" not in res.get("yaku", []))
            
            jokers_count = sum(1 for t in game.hands[cpu_idx] + [drawn] if t in SEASON_TILES)
            is_hanari_qixing = ("七星不靠" in res.get("yaku", []) and "無花果" not in res.get("yaku", []) and jokers_count == 1 and game.cpu_personalities[cpu_idx] in [1, 2])
            
            # 🌟 今回追加：十三幺九の「ツモアガリ」見逃しロジック
            is_kokushi_pass = False
            if "十三幺九" in res.get("yaku", []):
                waits = get_waits_for_hand(game.hands[cpu_idx], game.melds[cpu_idx])
                if len(waits) < 13:
                    remaining = 0
                    for w in waits:
                        visible = get_visible_count(w, game)
                        remaining += max(0, 4 - visible - game.hands[cpu_idx].count(w))
                    if len(game.wall) >= 24 and remaining >= 3:
                        is_kokushi_pass = True
            
            if not is_hanari_zentan and not is_hanari_qixing and not is_kokushi_pass:
                game.win_tiles[cpu_idx].append(drawn)
                game.win_records[cpu_idx].append(ctx)
                game.turn = (cpu_idx + 1) % 4 
                return {"tsumo": True, "cpu_idx": cpu_idx, "winning_tile": drawn, "yaku": res.get("yaku", []), "score": res.get("score", 0)}
            # is_hanari_zentan の場合はアガリ処理をスキップして下の打牌処理へ進む

        game.hands[cpu_idx].append(drawn)
        
        did_joker_swap_in_turn = False 
        did_kakan_in_turn = False 
        kakan_tile_in_turn = ""  # 🌟 加槓した牌を記憶する変数

        while game.wall:
            seasons = [t for t in game.hands[cpu_idx] if t in SEASON_TILES]
            
            # 🌟 追加：性格2(ギャンブラー)と4(トリックスター)の時のみ花槓を実行させる
            hanakan_seasons = seasons if game.cpu_personalities[cpu_idx] in [2, 4] else []
            
            counts = {t: game.hands[cpu_idx].count(t) for t in set(game.hands[cpu_idx])}
            did_meld = False
            has_won = len(game.win_tiles[cpu_idx]) > 0
            
            if has_won and len(seasons) > 0:
                break
                
            current_target = determine_target(cpu_idx, game.hands[cpu_idx], game)
            if current_target in ["十三幺九", "七星不靠"]:
                break
                
            for t, c in counts.items():
                if c == 4 and t not in SEASON_TILES:
                    if is_kan_valid_for_player(cpu_idx, "ankan", t):
                        for _ in range(4): game.hands[cpu_idx].remove(t)
                        # 🌟 修正：CPUの暗槓は常に is_hidden を True にする
                        game.melds[cpu_idx].append({"type": "ankan", "tiles": [t]*4, "is_hidden": True})
                        game.hands[cpu_idx].append(game.wall.pop())
                        did_meld = True; break
                # 🌟 修正：seasons ではなく hanakan_seasons を見るように変更
                elif c >= 3 and hanakan_seasons and t not in SEASON_TILES and not has_won:
                    for _ in range(3): game.hands[cpu_idx].remove(t)
                    s = hanakan_seasons[0]
                    game.hands[cpu_idx].remove(s)
                    game.melds[cpu_idx].append({"type": "hanakan", "tiles": [t, s, t, t]})
                    game.hands[cpu_idx].append(game.wall.pop())
                    did_meld = True; break
            if did_meld: continue
            
            for m in game.melds[cpu_idx]:
                if m["type"] == "pong":
                    base_t = m["tiles"][0]
                    if base_t in game.hands[cpu_idx]:
                        if is_kan_valid_for_player(cpu_idx, "kakan", base_t):
                            game.hands[cpu_idx].remove(base_t)
                            m["type"] = "minkan"
                            m["tiles"].append(base_t)
                            game.hands[cpu_idx].append(game.wall.pop())
                            game.any_meld_occurred = True 
                            did_meld = True
                            did_kakan_in_turn = True 
                            kakan_tile_in_turn = base_t 
                            break
                    # 🌟 修正：こちらも hanakan_seasons を見るように変更
                    elif hanakan_seasons and not has_won:
                        s = hanakan_seasons[0]
                        game.hands[cpu_idx].remove(s)
                        m["type"] = "hanakan"
                        m["tiles"] = [base_t, s, base_t, base_t]
                        game.hands[cpu_idx].append(game.wall.pop())
                        game.any_meld_occurred = True 
                        did_meld = True
                        did_kakan_in_turn = True 
                        kakan_tile_in_turn = base_t 
                        break
            if did_meld: continue
            
            if not has_won:
                # 🌟 フェーズ3：JokerSwapの強奪判断（全単狙いの時は強奪をスルーする）
                if current_target != "全単":
                    for target_idx in range(4):
                        for m in game.melds[target_idx]:
                            if m["type"] == "hanakan":
                                base_t = m["tiles"][0]
                                season_t = m["tiles"][1]
                                if base_t in game.hands[cpu_idx]:
                                    game.hands[cpu_idx].remove(base_t)
                                    m["type"] = "minkan"
                                    m["tiles"] = [base_t]*4
                                    game.hands[cpu_idx].append(season_t)
                                    game.any_meld_occurred = True 
                                    did_meld = True
                                    did_joker_swap_in_turn = True 
                                    break
                        if did_meld: break
            if did_meld: continue
            break
        
        if len(game.win_tiles[cpu_idx]) > 0:
            discard = game.hands[cpu_idx][-1] 
        else:
            target = determine_target(cpu_idx, game.hands[cpu_idx], game)
            game.cpu_targets[cpu_idx] = target
            
            tenpai_discards = []
            for d_candidate in set(game.hands[cpu_idx]):
                if d_candidate in SEASON_TILES: 
                    temp_hand = list(game.hands[cpu_idx])
                    temp_hand.remove(d_candidate)
                    is_all_odds = all((x in SEASON_TILES or (x in TILE_NAMES and TILE_NAMES.index(x) in ODDS)) for x in temp_hand)
                    
                    # 🌟 今回追加：七星不靠のロマン派もドアホ防止を解除する
                    jokers_count = sum(1 for x in game.hands[cpu_idx] if x in SEASON_TILES)
                    is_qixing_roment = (target == "七星不靠" and game.cpu_personalities[cpu_idx] in [1, 2] and jokers_count == 1)
                    
                    if not is_all_odds and not is_qixing_roment:
                        continue # ドアホ防止1
                        
                temp_hand = list(game.hands[cpu_idx])
                temp_hand.remove(d_candidate)
                if get_waits_for_hand(temp_hand, game.melds[cpu_idx]):
                    tenpai_discards.append(d_candidate)
                    
            if tenpai_discards:
                scored = [(t, evaluate_tile_dynamically(t, game.hands[cpu_idx], game, cpu_idx, game.cpu_personalities[cpu_idx]) + random.randint(0, 5)) for t in tenpai_discards]
                scored.sort(key=lambda x: x[1])
                discard = scored[0][0]
            else:
                valid_discards = []
                for t in game.hands[cpu_idx]:
                    if t in SEASON_TILES:
                        temp_hand = list(game.hands[cpu_idx])
                        temp_hand.remove(t)
                        is_all_odds = all((x in SEASON_TILES or (x in TILE_NAMES and TILE_NAMES.index(x) in ODDS)) for x in temp_hand)
                        if is_all_odds:
                            valid_discards.append(t) # 🌟 例外：ドアホ防止2の解除
                    else:
                        valid_discards.append(t)
                        
                scored = [(t, evaluate_tile_dynamically(t, game.hands[cpu_idx], game, cpu_idx, game.cpu_personalities[cpu_idx]) + random.randint(0, 5)) for t in valid_discards]
                scored.sort(key=lambda x: x[1]) 
                discard = scored[0][0]
            
        game.hands[cpu_idx].remove(discard)
        game.discards[cpu_idx].append(discard) 
        game.discards_count += 1
        game.is_first_turn[cpu_idx] = False 
        game.hands[cpu_idx] = game.sort_hand(game.hands[cpu_idx])
        game.turn = (cpu_idx + 1) % 4
        game.just_drawn = -1 
        
        # 🌟 最後に kakan_tile を送る（ここが一番重要です）
        # 🌟 最新の盤面データも一緒にフロントエンドに送るように修正
        return get_safe_state(0, {"discard": discard, "did_joker_swap": did_joker_swap_in_turn, "did_kakan": did_kakan_in_turn, "kakan_tile": kakan_tile_in_turn})
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e)}

@app.get("/check_cpu_reaction")
def check_cpu_reaction(discarder_idx: int, tile: str, is_kakan: str = "false"):
    try:
        turn_order = [(discarder_idx + 1) % 4, (discarder_idx + 2) % 4, (discarder_idx + 3) % 4]
        is_haitei = (len(game.wall) == 0)
        is_chankan_bool = is_kakan.lower() == "true"
        
        for i in turn_order:
            if i == 0: continue 
            
            # 🌟 追加：CPU同士の槍槓でも、全部待ちが完成している奴はスルーさせる！
            if is_chankan_bool:
                waits = get_waits_for_hand(game.hands[i], game.melds[i])
                if len(waits) >= 31:
                    continue
            
            ctx = {
                "winning_tile": tile,
                "is_tsumo": False, 
                "is_haitei": is_haitei,
                "is_joker_swap": False,
                "is_rinshan": False,
                "is_chankan": is_chankan_bool,
                "is_first_turn": game.is_first_turn[i],
                "any_meld_occurred": game.any_meld_occurred,
                "is_dealer": game.dealer == i,
                "discards_count": game.discards_count # 🌟 これを必ず入れる！
            }

            data = {"closed_tiles": " ".join(game.hands[i]), "melds": game.melds[i], "win_context": ctx}
            res = evaluate_hand(data)
            if "error" not in res:
                is_hanari_zentan = ("全単" in res.get("yaku", []) and "無花果" not in res.get("yaku", []))
                
                # 🌟 今回追加：ロンの時も同様に見逃す！
                jokers_count = sum(1 for t in game.hands[i] + [tile] if t in SEASON_TILES)
                is_hanari_qixing = ("七星不靠" in res.get("yaku", []) and "無花果" not in res.get("yaku", []) and jokers_count == 1 and game.cpu_personalities[i] in [1, 2])
                
                if is_hanari_zentan or is_hanari_qixing:
                    continue # 見逃し

                # 🌟 追加：十三幺九の「13面待ち」狙いの見逃しロジック
                if "十三幺九" in res.get("yaku", []):
                    # 今の自分の待ち牌をリストアップ
                    waits = get_waits_for_hand(game.hands[i], game.melds[i])
                    
                    # 純正13面待ち（全幺九牌待ち）に届いていない場合、見逃しを検討
                    if len(waits) < 13:
                        # 待ち牌（發や中など）がまだ山にどれくらい眠っているか推測
                        remaining = 0
                        for w in waits:
                            visible = get_visible_count(w, game)
                            # 4枚から、他家の捨て牌・鳴き・自分の手牌にある分を引く
                            remaining += max(0, 4 - visible - game.hands[i].count(w))
                        
                        # 【葛藤の天秤】
                        # 山の残りが「24枚以上（中盤まで）」かつ、待ち牌が「3枚以上」生きていそうなら、ロマンを求めて見逃す！
                        # （山が少ない、または待ち牌が枯れているなら妥協してアガる）
                        if len(game.wall) >= 24 and remaining >= 3:
                            continue

                # --- 妥協、または見逃し条件を満たさなかったのでロンを実行！ ---
                if not is_chankan_bool and game.discards[discarder_idx] and game.discards[discarder_idx][-1] == tile:
                    game.discards[discarder_idx].pop()
                game.win_tiles[i].append(tile)
                game.win_records[i].append(ctx)
                return get_safe_state(0, {"reacted": True, "type": "ron", "player": i, "yaku": res.get("yaku", []), "score": res.get("score", 0)})

        if is_chankan_bool: return get_safe_state(0, {"reacted": False})

        if not is_haitei:
            for i in turn_order:
                if i == 0: continue
                if len(game.win_tiles[i]) > 0: continue
                
                # 🌟 【修正1】国士無双や七星不靠を狙っている時は絶対に鳴かない！
                current_target = determine_target(i, game.hands[i], game)
                if current_target in ["十三幺九", "七星不靠"]:
                    continue

                count = game.hands[i].count(tile)
                if count >= 2:
                    temp_hand_with_meld = list(game.hands[i])
                    temp_hand_with_meld.extend([tile, tile]) 
                    score_if_meld = evaluate_tile_dynamically(tile, temp_hand_with_meld, game, i, game.cpu_personalities[i])
                    
                    if score_if_meld > 80 or (count >= 3): 
                        if game.discards[discarder_idx] and game.discards[discarder_idx][-1] == tile:
                            game.discards[discarder_idx].pop()
                            
                        is_kan = (count >= 3)
                        call_type = "minkan" if is_kan else "pong"
                        remove_count = 3 if is_kan else 2
                        
                        for _ in range(remove_count): game.hands[i].remove(tile)
                        game.melds[i].append({"type": call_type, "tiles": [tile]*(remove_count+1)})
                        game.any_meld_occurred = True 
                        game.turn = i 
                        
                        if is_kan and game.wall:
                            drawn = game.wall.pop()
                            game.hands[i].append(drawn)
                            
                        scored = [(t, evaluate_tile_dynamically(t, game.hands[i], game, i, game.cpu_personalities[i]) + random.randint(0, 5)) for t in game.hands[i]]
                        scored.sort(key=lambda x: x[1])
                        discard = scored[0][0]
                        game.hands[i].remove(discard)
                        game.discards[i].append(discard)
                        game.is_first_turn[i] = False 
                        game.hands[i] = game.sort_hand(game.hands[i])
                        
                        game.turn = (i + 1) % 4
                        game.just_drawn = -1 
                        return get_safe_state(0, {"reacted": True, "type": call_type, "player": i, "discard": discard})

        return get_safe_state(0, {"reacted": False})
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e)}

@app.get("/meld")
def process_meld(player_idx: int = 0, type: str = "", tile: str = ""):
    try:
        drawn_tile = ""
        game.any_meld_occurred = True 
        if type == "花槓":
            if game.hands[player_idx].count(tile) < 2: return {"error": "同期エラー：指定された牌が手牌に足りません。"}
            season_used = ""
            for s in SEASON_TILES:
                if s in game.hands[player_idx]:
                    season_used = s
                    break
            if not season_used: return {"error": "同期エラー：手牌に四季牌がありません。"}
            
            game.hands[player_idx].remove(tile)
            game.hands[player_idx].remove(tile)
            game.hands[player_idx].remove(season_used)
            
            game.melds[player_idx].append({"type": "hanakan", "tiles": [tile, season_used, tile, tile]})
            game.turn = player_idx
            if game.wall:
                drawn_tile = game.wall.pop()
                game.hands[player_idx].append(drawn_tile)
                game.last_drawn[player_idx] = drawn_tile
                game.just_drawn = player_idx 
        else:
            count = 3 if type == "カン" else 2
            if game.hands[player_idx].count(tile) < count: return {"error": "同期エラー：指定された牌が手牌に足りません。"}
                
            for _ in range(count): game.hands[player_idx].remove(tile)
            game.melds[player_idx].append({"type": "pong" if type == "ポン" else "minkan", "tiles": [tile] * (count + 1)})
            game.turn = player_idx
            if type == "カン" and game.wall:
                drawn_tile = game.wall.pop()
                game.hands[player_idx].append(drawn_tile)
                game.last_drawn[player_idx] = drawn_tile
                game.just_drawn = player_idx 
            else:
                game.just_drawn = -1 
                
        game.hands[player_idx] = game.sort_hand(game.hands[player_idx])
        return get_safe_state(0, {"drawn_tile": drawn_tile})
    except Exception as e:
        return {"error": str(e)}

@app.get("/self_meld")
def process_self_meld(player_idx: int = 0, type: str = "", tile: str = "", season: str = "", is_hidden: str = "false"):
    try:
        drawn_tile = ""
        is_hidden_bool = is_hidden.lower() == "true" # 🌟 追加：伏せフラグを取得
        
        if type != "暗槓":
            game.any_meld_occurred = True 
            
        if type == "暗槓":
            if game.hands[player_idx].count(tile) < 4: return {"error": "同期エラー：指定された牌が足りません。"}
            for _ in range(4): game.hands[player_idx].remove(tile)
            # 🌟 修正：is_hidden 情報を辞書に加える
            game.melds[player_idx].append({"type": "ankan", "tiles": [tile] * 4})
            
        elif type == "暗花槓":
            if game.hands[player_idx].count(tile) < 3 or season not in game.hands[player_idx]: return {"error": "同期エラー：指定された牌が足りません。"}
            for _ in range(3): game.hands[player_idx].remove(tile)
            game.hands[player_idx].remove(season)
            game.melds[player_idx].append({"type": "hanakan", "tiles": [tile, season, tile, tile]})
            
        elif type in ["加槓", "大明槓"]: 
            if tile not in game.hands[player_idx]: return {"error": "同期エラー：指定された牌が足りません。"}
            
            # 🌟 先に加槓を成立させてしまう（一旦4枚にする）
            for m in game.melds[player_idx]:
                if m["type"] == "pong" and m["tiles"][0] == tile:
                    m["type"] = "minkan" 
                    m["tiles"].append(tile)
                    break
            game.hands[player_idx].remove(tile)

            # 槍槓の判定
            chankan_winner = None
            for i in range(1, 4):
                p = (player_idx + i) % 4
                if len(game.win_tiles[p]) > 0: continue 

                # 🌟 ルール：全ての牌（27種+四季4種=31種）で和了れる待ちは槍槓できない
                waits = get_waits_for_hand(game.hands[p], game.melds[p])
                if len(waits) >= 31:
                    continue

                ctx = {
                    "winning_tile": tile, "is_tsumo": False, "is_haitei": False,
                    "is_joker_swap": False, "is_rinshan": False, "is_chankan": True,
                    "is_first_turn": game.discards_count == 0 and not game.any_meld_occurred,
                    "is_dealer": game.dealer == p
                }
                res = evaluate_hand({"closed_tiles": " ".join(game.hands[p]), "melds": game.melds[p], "win_context": ctx})
                
                if "error" not in res:
                    # 🌟 ここではまだ win_tiles に追加せず、当選者だけJSに教える
                    chankan_winner = p
                    break 

            if chankan_winner is not None:
                # 槍槓発生時は、まだツモらせずJS側で演出を待つ
                game.is_first_turn[player_idx] = False
                return get_safe_state(0, {"chankan_occurred": True, "winner": chankan_winner, "tile": tile})

            for m in game.melds[player_idx]:
                if m["type"] == "pong" and m["tiles"][0] == tile: # ★ 修正：Minkanをアップグレードしないようにする
                    m["type"] = "minkan" 
                    m["tiles"].append(tile)
                    break
                    
        elif type in ["加花槓", "自摸花槓"]: 
            if season not in game.hands[player_idx]: return {"error": "同期エラー：指定された四季牌が足りません。"}
            game.hands[player_idx].remove(season)
            for m in game.melds[player_idx]:
                if m["type"] == "pong" and m["tiles"][0] == tile: # ★ 修正：Minkanをアップグレードしないようにする
                    m["type"] = "hanakan"
                    m["tiles"] = [tile, season, tile, tile]
                    break

        game.turn = player_idx
        if game.wall:
            drawn_tile = game.wall.pop()
            game.hands[player_idx].append(drawn_tile)
            game.last_drawn[player_idx] = drawn_tile
            game.just_drawn = player_idx 

        game.hands[player_idx] = game.sort_hand(game.hands[player_idx])
        return get_safe_state(0, {"drawn_tile": drawn_tile})
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e)}

@app.get("/joker_swap")
def process_joker_swap(player_idx: int = 0, tile: str = "", season: str = "", target_idx: int = 0):
    try:
        if tile not in game.hands[player_idx]: return {"error": "指定された牌が手牌にありません"}
        target_meld = None
        for m in game.melds[target_idx]:
            if m["type"] == "hanakan" and m["tiles"][0] == tile:
                target_meld = m
                break
        if not target_meld: return {"error": "対応する花槓がありません"}

        game.hands[player_idx].remove(tile)
        target_meld["tiles"] = [tile, tile, tile, tile]
        target_meld["type"] = "minkan" 
        game.hands[player_idx].append(season)
        game.any_meld_occurred = True 
        
        game.last_drawn[player_idx] = season
        game.just_drawn = player_idx 
        game.turn = player_idx
        game.hands[player_idx] = game.sort_hand(game.hands[player_idx])
        
        return get_safe_state(0, {"drawn_tile": season})
    except Exception as e:
        return {"error": str(e)}

@app.get("/win_tsumo")
def process_win_tsumo(player_idx: int = 0, is_joker_swap: str = "false", is_rinshan: str = "false"):
    try:
        tile = game.last_drawn[player_idx]
        if tile in game.hands[player_idx]: game.hands[player_idx].remove(tile)
        
        is_pure_first = (game.discards_count == 0) # まだ誰も捨てていない
        
        ctx = {
            "winning_tile": tile, 
            "is_tsumo": True, 
            "is_haitei": len(game.wall)==0,
            "is_joker_swap": is_joker_swap.lower() == "true",
            "is_rinshan": is_rinshan.lower() == "true",
            "is_first_turn": game.is_first_turn[player_idx], 
            "any_meld_occurred": game.any_meld_occurred,
            "is_dealer": game.dealer == player_idx,
            "discards_count": game.discards_count # 🌟 これを必ず入れる！
        }
        
        # 🌟 ここでしっかり変数を定義して、役と点数を計算します
        win_data = {
            "closed_tiles": " ".join(game.hands[player_idx]),
            "melds": game.melds[player_idx],
            "win_context": ctx
        }
        res = evaluate_hand(win_data) 
        
        game.win_records[player_idx].append(ctx)
        game.win_tiles[player_idx].append(tile)
        game.turn = (player_idx + 1) % 4 
        
        return get_safe_state(player_idx, {"yaku": res.get("yaku", []), "score": res.get("score", 0)})
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e)}

@app.get("/win_ron")
def process_win_ron(player_idx: int = 0, tile: str = "", is_chankan: str = "false"):
    try:
        is_chankan_bool = is_chankan.lower() == "true"
        robbed_player_idx = -1 
        
        # 槍槓の特殊処理
        if is_chankan_bool:
            found_robbed = False
            for p_idx in range(4):
                for m in game.melds[p_idx]:
                    if m["tiles"].count(tile) == 4 and m["type"] in ["minkan", "hanakan"]:
                        m["tiles"].remove(tile) 
                        m["type"] = "pong"      
                        
                        # CPUが加槓していた場合の巻き戻し処理
                        if p_idx != 0: 
                            if game.discards[p_idx]:
                                game.hands[p_idx].append(game.discards[p_idx].pop())
                                game.discards_count -= 1
                            if len(game.hands[p_idx]) > 0:
                                game.wall.append(game.hands[p_idx].pop()) 
                        
                        robbed_player_idx = p_idx
                        found_robbed = True
                        break
                if found_robbed: break

        # 🌟 修正：子の第1ツモ前のロンを「地胡」として認めるためのコンテキスト
        ctx = {
            "winning_tile": tile, 
            "is_tsumo": False, 
            "is_haitei": len(game.wall)==0,
            "is_joker_swap": False,
            "is_rinshan": False,
            "is_chankan": is_chankan_bool,
            "is_first_turn": game.is_first_turn[player_idx],
            "any_meld_occurred": game.any_meld_occurred,
            "is_dealer": game.dealer == player_idx,
            "discards_count": game.discards_count # 🌟 これを必ず入れる！
        }
        
        # 🌟 ここでしっかり変数を定義して、役と点数を計算します
        win_data = {
            "closed_tiles": " ".join(game.hands[player_idx]),
            "melds": game.melds[player_idx],
            "win_context": ctx
        }
        res = evaluate_hand(win_data)

        game.win_records[player_idx].append(ctx)
        game.win_tiles[player_idx].append(tile)

        if is_chankan_bool and robbed_player_idx != -1:
            game.turn = (robbed_player_idx + 1) % 4

        return get_safe_state(player_idx, {"yaku": res.get("yaku", []), "score": res.get("score", 0)})
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e)}

@app.get("/check_win")
def check_win(player_idx: int = 0, last_tile: str = "", is_ron: str = "false", is_rinshan: str = "false", is_haitei: str = "false", is_chankan: str = "false"):
    hand = list(game.hands[player_idx])
    is_ron_bool = is_ron.lower() == "true"
    is_rinshan_bool = is_rinshan.lower() == "true"
    is_haitei_bool = is_haitei.lower() == "true"
    is_chankan_bool = is_chankan.lower() == "true"
    
    # 🌟 追加：槍槓の時、待ちが31種（全部待ち）ならアガリボタンを出さない！
    if is_chankan_bool:
        temp_hand = list(hand)
        # 万が一14枚になっている時（ツモ後など）は1枚抜いて計算する
        if len(temp_hand) % 3 == 2 and game.last_drawn[player_idx] in temp_hand:
            temp_hand.remove(game.last_drawn[player_idx])
        waits = get_waits_for_hand(temp_hand, game.melds[player_idx])
        if len(waits) >= 31:
            return {"can_win": False, "reason": "全ての牌で和了れる待ちは槍槓できません"}
    
    win_ctx = {
        "winning_tile": last_tile or "",
        "is_tsumo": not is_ron_bool,
        "is_rinshan": is_rinshan_bool,
        "is_haitei": is_haitei_bool,
        "is_joker_swap": False,
        "is_chankan": is_chankan_bool,
        "is_first_turn": game.is_first_turn[player_idx],
        "any_meld_occurred": game.any_meld_occurred,
        "is_dealer": game.dealer == player_idx,
        "discards_count": game.discards_count # 🌟 これを必ず入れる！
    }
    
    if is_ron_bool and last_tile:
        closed_str = " ".join(hand)
        win_ctx["winning_tile"] = last_tile
    else:
        last_drawn = game.last_drawn[player_idx]
        temp_hand = list(hand)
        if last_drawn in temp_hand: temp_hand.remove(last_drawn)
        closed_str = " ".join(temp_hand)
        win_ctx["winning_tile"] = last_drawn
        
    data = {"closed_tiles": closed_str, "melds": game.melds[player_idx], "win_context": win_ctx}
    
    total_tiles = len(closed_str.split()) + 1 + len(game.melds[player_idx]) * 3
    if total_tiles != 14: return {"can_win": False}
        
    res = evaluate_hand(data)
    if "error" in res: return {"can_win": False, "reason": res["error"]}
    return {"can_win": True, "score": res["score"], "yaku": res["yaku"]}

@app.get("/calculate_round_scores")
def calculate_round_scores():
    results = []
    for i in range(4):
        player_total = 0
        player_yaku_list = []
        for ctx in game.win_records[i]:
            # 🌟 ポイント：保存されているctx（アガった時の状況）をそのまま判定に使う
            data = {
                "closed_tiles": " ".join(game.hands[i]),
                "melds": game.melds[i],
                "win_context": ctx
            }
            res = evaluate_hand(data)
            if "error" not in res:
                player_total += res["score"]
                player_yaku_list.append({
                    "tile": ctx["winning_tile"],
                    "score": res["score"],
                    "yaku": res["yaku"]
                })
        
        game.scores[i] += player_total
        if player_yaku_list:
            results.append({
                "player": i,
                "total_score": player_total,
                "details": player_yaku_list
            })
            
    sorted_indices = sorted(range(4), key=lambda i: (game.scores[i], -((i - game.dealer) % 4)), reverse=True)
    ranking_points = [0, 0, 0, 0]
    for rank, idx in enumerate(sorted_indices):
        ranking_points[idx] = [300, 200, 100, 0][rank]
            
    return {"status": "success", "results": results, "scores": game.scores, "ranking_points": ranking_points}

@app.get("/get_valid_self_melds")
def get_valid_self_melds(player_idx: int = 0):
    valid_melds = []
    hand = list(game.hands[player_idx])
    melds = game.melds[player_idx]
    counts = {t: hand.count(t) for t in set(hand)}
    seasons = [t for t in hand if t in SEASON_TILES]
    has_won = len(game.win_tiles[player_idx]) > 0
    last_drawn = game.last_drawn[player_idx] # 🌟 追加：最後にツモった牌を取得

    for t, c in counts.items():
        if c == 4 and t not in SEASON_TILES:
            if is_kan_valid_for_player(player_idx, "ankan", t):
                valid_melds.append({"type": "暗槓", "tile": t, "season": ""})
        if c >= 3 and seasons and t not in SEASON_TILES:
            if not has_won:
                for s in seasons:
                    valid_melds.append({"type": "暗花槓", "tile": t, "season": s})

    for m in melds:
        if m["type"] == "pong": 
            base = m["tiles"][0]
            if counts.get(base, 0) > 0:
                if is_kan_valid_for_player(player_idx, "kakan", base):
                    valid_melds.append({"type": "加槓", "tile": base, "season": ""})
            if seasons:
                if not has_won:
                    for s in seasons:
                        valid_melds.append({"type": "加花槓", "tile": base, "season": s})
        elif m["type"] == "hanakan":
            base = m["tiles"][0]
            season_t = m["tiles"][1]
            if counts.get(base, 0) > 0:
                # 🌟 修正：和了後は「ツモった牌」と一致する場合のみSwapを許可！
                if not has_won or base == last_drawn:
                    valid_melds.append({"type": "JokerSwap", "tile": base, "season": season_t, "target_idx": player_idx})

    for t_idx in range(4):
        if t_idx == player_idx: continue
        for m in game.melds[t_idx]:
            if m["type"] == "hanakan":
                base = m["tiles"][0]
                season_t = m["tiles"][1]
                if counts.get(base, 0) > 0:
                    # 🌟 修正：他人の花槓に対するSwapも同様に制限
                    if not has_won or base == last_drawn:
                        valid_melds.append({"type": "JokerSwap", "tile": base, "season": season_t, "target_idx": t_idx})
                    
    return {"valid_melds": valid_melds}

@app.get("/debug_setup")
def debug_setup(scenario: str):
    game.reset_round()
    game.discards_count = 0
    game.any_meld_occurred = False
    game.is_first_turn = [True, True, True, True]
    game.win_records = [[] for _ in range(4)]
    game.win_tiles = [[] for _ in range(4)]
    
    if scenario == "tenhou":
        game.dealer = 0
        game.turn = 0
        game.hands[0] = ["1p","1p","1p","2p","2p","2p","3p","3p","3p","4p","4p","4p","5p"]
        game.wall.append("5p") 
        
    elif scenario == "chiihou":
        game.dealer = 1
        game.turn = 1
        game.hands[0] = ["1p","1p","1p","2p","2p","2p","3p","3p","3p","4p","4p","4p","5p"]
        game.hands[1] = ["東","東","東","南","南","南","西","西","西","北","北","北","5p"]
        game.wall = ["東", "東", "東", "東", "東", "東", "東", "東","西", "西", "西", "西","南", "南", "南", "南","東", "東", "東", "東",]
        
    elif scenario == "jokerswap":
        game.dealer = 0
        game.turn = 1
        game.is_first_turn = [False, False, False, False]
        game.discards_count = 1
        game.melds[0] = [{"type": "hanakan", "tiles": ["東", "春", "東", "東"]}]
        game.hands[0] = ["1p","2p","3p","4p","5p","6p","7p","8p","9p","1s"]
        game.hands[1] = ["東","南","南","西","西","白","白","發","發","中","中","1m","2m"]
        game.wall.append("3m")
        
    elif scenario == "chankan":
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False, False, False, False]
        game.discards_count = 5
        game.melds[0] = [{"type": "pong", "tiles": ["1p", "1p", "1p"]}]
        game.hands[0] = ["1p","2p","3p","4p","5p","6p","7p","8p","9p","1s"]
        game.hands[1] = ["2p","2p","3p","3p","4p","4p","5p","5p","6p","6p","7p","7p","1p"]
        game.wall.append("2s") 

    elif scenario == "kan_jokerswap":
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False, False, False, False]
        game.discards_count = 5
        game.melds[1] = [{"type": "hanakan", "tiles": ["東", "春", "東", "東"]}]
        game.hands[0] = ["1p","1p","1p","1p", "2p","2p","2p", "3p","3p","3p", "4p","4p","4p"]
        game.hands[1] = ["南","南","南","西","西","西","北","北","北","白","白","發","發"]
        game.wall.append("東") 
        game.wall.append("5p")

    elif scenario == "kan_menzu_hakai":
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False, False, False, False]
        game.discards_count = 5
        game.hands[0] = ["1p","1p","1p","1p", "2p","3p", "5s","5s","5s", "7s","7s","7s", "8s"]
        game.hands[1] = ["東","東","東","南","南","南","西","西","西","北","北","北","白"]
        game.wall.append("4p") 
        game.wall.append("8s") 

    elif scenario == 'max_buttons':
        game.hands[0] = ["1m", "1m", "1m", "2m", "2m", "2m", "3m", "3m", "3m", "春", "夏", "秋", "冬"]
        drawn_tile = "1m" 
        turn_player_idx = 0

    elif scenario == "kokushi_13":
        game.dealer = 0
        game.turn = 0
        game.hands[0] = ["1p","9p","1s","9s","1m","9m","東","南","西","北","白","發","中"]
        game.wall.append("1p") 

    elif scenario == "chuuren":
        game.dealer = 0
        game.turn = 0
        game.hands[0] = ["1s","1s","1s","2s","3s","4s","5s","6s","7s","8s","9s","9s","9s"]
        game.wall.append("5s")

    elif scenario == "post_win_swap":
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False]*4
        game.win_tiles[0] = ["5p"] 
        game.melds[1] = [{"type": "hanakan", "tiles": ["1m", "春", "1m", "1m"]}]
        game.hands[0] = ["1p","2p","3p","4p","5p","6p","7p","8p","9p","1s","2s","3s","4s"]
        game.wall.append("1m") 

    elif scenario == "haitei_kan":
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False]*4
        game.hands[0] = ["1p","1p","1p","1p","2p","3p","4p","5p","6p","7p","8p","9p","9p"]
        game.wall = ["9p"] 

    elif scenario == "joker_pair_kan":
        game.dealer = 0
        game.turn = 0
        game.hands[0] = ["春","夏","秋","冬","1p","1p","1p","2p","2p","2p","3p","3p","3p"]
        game.wall.append("1s")

    elif scenario == "chankan_with_joker":
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False]*4
        game.melds[0] = [{"type": "pong", "tiles": ["5p", "5p", "5p"]}]
        game.hands[0] = ["1p","2p","3p","4p","6p","7p","8p","9p","1s","2s"] # 5pを加槓させる用
        # CPU1を「5p待ちの七対子」にする（2m,3m,4m,5m,6mの対子 + 3pの対子 + 4p単騎にJoker）
        game.hands[1] = ["2m","2m","3m","3m","4m","4m","5m","5m","6m","6m","3p","4p","春"]
        game.wall.append("5p")

    elif scenario == "chitoi_joker":
        game.dealer = 0
        game.turn = 0
        game.hands[0] = ["1p","1p","2p","2p","3p","3p","4p","4p","5p","5p","6p","春","夏"]
        game.wall.append("6p") 

    elif scenario == "shikantsu":
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False]*4
        game.melds[0] = [
            {"type": "ankan", "tiles": ["1m","1m","1m","1m"]},
            {"type": "minkan", "tiles": ["2m","2m","2m","2m"]},
            {"type": "minkan", "tiles": ["3m","3m","3m","3m"]}
        ]
        game.hands[0] = ["4m","4m","4m","東","東"]
        game.wall.append("4m") 

    elif scenario == "conflict_call":
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False]*4
        game.hands[0] = ["1p","2p","3p","4p","5p","6p","7p","8p","9p","1s","2s","3s","中"] 
        game.hands[1] = ["中","中","1m","2m","3m","4m","5m","6m","7m","8m","9m","1p","2p"] 
        game.hands[2] = ["中","1s","9s","1p","9p","1m","9m","東","南","西","北","白","發"] 
        game.wall.append("1m") 

    elif scenario == "all_seasons":
        game.dealer = 0
        game.turn = 0
        game.hands[0] = ["春","夏","秋","冬","1p","2p","3p","4p","5p","6p","7p","8p","9p"]
        game.wall.append("1p")

    elif scenario == "chuuren_post_win_kan":
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False]*4
        game.win_tiles[0] = ["2s", "5s", "8s", "4s", "3s"]
        game.win_records[0] = [
            {"winning_tile": "2s", "is_tsumo": False, "is_haitei": False},
            {"winning_tile": "5s", "is_tsumo": False, "is_haitei": False},
            {"winning_tile": "8s", "is_tsumo": False, "is_haitei": False},
            {"winning_tile": "4s", "is_tsumo": False, "is_haitei": False},
            {"winning_tile": "3s", "is_tsumo": False, "is_haitei": False}
        ]
        game.hands[0] = ["1s","1s","1s","2s","3s","4s","5s","6s","7s","8s","9s","9s","9s"]
        game.wall.append("1s") 

    elif scenario == "bug_renchitoi":
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False]*4
        game.hands[0] = ["3p","3p","4p","4p","5p","5p","6p","6p","7p","7p","8p","春","夏"]
        game.wall = ["9p"] 

    elif scenario == "bug_cpu_loop":
        game.dealer = 0
        game.turn = 1
        game.is_first_turn = [True, True, True, True]
        game.hands[1] = ["1s","1s","2s","2s","3s","3s","4s","4s","5s","5s","6s","6s","7s"]
        game.wall.append("7s")

    elif scenario == "bug_ui_tenhou":
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [True, True, True, True]
        game.hands[0] = ["東","東","南","南","西","西","北","北","白","白","發","發","中"]
        game.wall.append("中")
        
    elif scenario == "test_haitei_stop":
        # 海底選択停止テスト
        # 山を残り2枚にする（あなたが1枚引く＋1枚捨てる → 残り1枚＝海底牌になる）
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False]*4
        game.win_tiles[0] = ["2s", "5s", "8s", "4s", "3s"]
        game.win_records[0] = [
            {"winning_tile": "2s", "is_tsumo": False, "is_haitei": False},
            {"winning_tile": "5s", "is_tsumo": False, "is_haitei": False},
            {"winning_tile": "8s", "is_tsumo": False, "is_haitei": False},
            {"winning_tile": "4s", "is_tsumo": False, "is_haitei": False},
            {"winning_tile": "3s", "is_tsumo": False, "is_haitei": False}
        ]
        game.hands[0] = ["1s","1s","1s","2s","3s","4s","5s","6s","7s","8s","9s","9s","9s"]
        game.wall = ["白", "發", "白", "白", "1p"]

    elif scenario == "test_player_chankan":
        game.dealer = 1
        game.turn = 1
        game.is_first_turn = [False]*4
        # CPU 1 が 5p をポンしており、これから 5p を引いて加槓する
        game.melds[1] = [{"type": "pong", "tiles": ["5p", "5p", "5p"]}]
        game.hands[1] = ["1m","2m","3m","4m","5m","6m","7m","8m","9m","1s"]
        game.wall = ["1p", "5p"] # 5pを引いた後、嶺上で1pを引く予定
        
        # あなた(0) は 5p 待ち（4p・6pのカンチャン待ち）
        game.hands[0] = ["1s","1s","1s","2s","2s","2s","3s","3s","3s","9p","9p","4p","6p"]

    elif scenario == "ankan_tenhou":
        # 🌟 テスト㉔：一巡目暗槓して槓上開花天胡
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [True] * 4
        # 最初から「1p×4、2p×3、3p×3、4p×2、5p×1」を持つ（13枚）
        game.hands[0] = ["1p","1p","1p","1p","2p","2p","2p","3p","3p","3p","4p","4p","春"]
        # 山の次に引く牌を「4p」にし、嶺上牌を「5p」にする
        game.wall.append("4p")

    elif scenario == "all_waits_1st_turn":
        # 🌟 テスト㉕：一巡目でプレイヤー以外全員手牌バラバラで、プレイヤーは全部待ち
        game.dealer = 1
        game.turn = 1 # CPU1からスタート
        game.is_first_turn = [True] * 4
        
        # プレイヤー(0)は、七対子6対子＋Joker（春）の超多面張（13枚）
        game.hands[0] = ["1p","1p","1p","2p","2p","2p","4p","4p","4p","5p","5p","5p","春"]
        
        # CPUは適当なバラバラの手牌（13枚）
        game.hands[1] = ["1p","3p","5p","7p","9p","1s","3s","5s","7s","9s","東","西","白"]
        game.hands[2] = ["1p","3p","5p","7p","9p","1s","3s","5s","7s","9s","東","西","白"]
        game.hands[3] = ["1p","3p","5p","7p","9p","1s","3s","5s","7s","9s","東","西","白"]
        
        # CPU1が最初にツモってそのまま捨てる牌
        game.wall.append("北")

    elif scenario == "cpu_tenhou":
        # 🌟 CPU(1)が親で、最初のツモで天胡するテスト
        game.dealer = 1
        game.turn = 1
        game.is_first_turn = [True, True, True, True]
        game.discards_count = 0
        game.hands[1] = ["1p","1p","1p","2p","2p","2p","3p","3p","3p","4p","4p","4p","5p"]
        game.wall.append("5p") # CPU1が引いて天胡！

    elif scenario == "cpu_chiihou":
        # 🌟 CPU(1)が子で、最初のツモで地胡するテスト
        game.dealer = 0
        game.turn = 1 # プレイヤー(0)が捨て終わって、CPU1の番という設定
        game.is_first_turn = [False, True, True, True]
        game.discards_count = 1 # 場に1枚だけ捨てられている
        game.discards[0] = ["北"]
        game.hands[1] = ["1s","1s","1s","2s","2s","2s","3s","3s","3s","4s","4s","4s","5s"]
        game.wall.append("5s") # CPU1が引いて地胡！

    elif scenario == "test_zentan_flower":
        game.dealer = 0
        game.turn = 1 # CPU1のターンからスタート
        game.is_first_turn = [False, False, False, False]
        # CPU1を「奇数牌だけのテンパイ（1p,3p,5pの暗刻 + 7p,9pのシャボ待ち）」にしておく
        game.hands[1] = ["1p","1p","1m","3p","5p","7p","1s","3s","3s","7s","7s","9s","春"]
        # 山の次に引く牌を「春」にする（本来ならこれでアガリのはず！）
        game.wall.append("8s")

    elif scenario == "test_qixing_flower":
        game.dealer = 0
        game.turn = 1 # CPU1のターン
        game.is_first_turn = [False, False, False, False]
        
        # 🌟 CPU1の性格を強制的に「1(スナイパー：打点重視)」にしておく
        game.cpu_personalities[1] = 1 
        
        # 七星不靠の1シャンテン（發待ち）＋ 春(Joker) の13枚
        game.hands[1] = ["1m","2p","5p","8p","3s","6s","9s","東","南","西","北","白","春"]
        
        # 山の次に引く牌を「中」にする（これで本来は『春を發の代わりにしてアガリ』になるはず！）
        game.wall.append("中")

    elif scenario == "test_kokushi_pass":
        # 🌟 ケースA：山がたっぷりあるので、13面待ちを狙って「見逃す」テスト
        game.dealer = 0
        game.turn = 1 # CPU1
        game.hands[1] = ["1m","1m","9m","1p","9p","1s","9s","東","南","西","北","白","春"]
        # 山を30枚残しにする（見逃し閾値24枚以上をクリア）
        game.wall = ["1m"] * 30 
        game.wall = ["1m","1m","9m","1p","9p","1s","9s","1m","1m","9m","1p","9p","1s","9s","1m","1m","9m","1p","9p","1s","9s","1m","1m","9m","1p","9p","1s","9s","發", "白", "東", "白", "1p"] # これを引いて、本来ならアガリだが...？

    elif scenario == "test_kokushi_win":
        # 🌟 ケースB：山が少ないので、欲張らずに「ロン」するテスト
        game.dealer = 0
        game.turn = 0 # あなたが捨てる
        game.hands[1] = ["1m","1m","9m","1p","9p","1s","9s","東","南","西","北","白","春"]
        # 山を10枚だけにする（24枚未満なので妥協モード）
        game.wall = ["1m"] * 10
        # あなたが「發」を捨てる設定（これでロンしてくるはず）
        lastT = "發"

    elif scenario == "test_chankan_all_waits":
        # 🌟 ケース：自分が全部待ち（31種）の時に、他家が加槓して槍槓チャンスになるが、弾かれるテスト
        game.dealer = 1
        game.turn = 1 # CPU1のターン
        game.is_first_turn = [False, False, False, False]
        
        # あなた(0) は 4暗刻＋Joker(春) の13枚で、全31種の牌でアガれる「全部待ち」状態
        game.hands[0] = ["1s","1s","2s","2s","3s","3s","4s","4s","6s","6s","8s","8s","春"]
        
        # CPU 1 は 5p をポンしており、これから 5p を引いて加槓する
        game.melds[1] = [{"type": "pong", "tiles": ["5p", "5p", "5p"]}]
        game.hands[1] = ["1m","2m","3m","4m","5m","6m","7m","8m","9m","1p"]
        
        # 山の次に引く牌を「5p」にする（これでCPU1が5pをツモって加槓する）
        # 嶺上牌用として適当に「1p」も入れておく
        game.wall = ["1p", "5p"]

    elif scenario == "test_kankou_dokuchou":
        # 🧪 テスト①：寒江独釣（裸単騎）の吸収テスト
        # 4回ポンして単騎待ち。
        # 【期待する結果】「碰碰胡」が消えて「寒江独釣」だけが残ること。
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False]*4
        game.melds[0] = [
            {"type": "pong", "tiles": ["1p", "1p", "1p"]},
            {"type": "pong", "tiles": ["3p", "3p", "3p"]},
            {"type": "pong", "tiles": ["5p", "5p", "5p"]},
            {"type": "pong", "tiles": ["7p", "7p", "7p"]}
        ]
        game.hands[0] = ["9p"] # 裸単騎
        game.wall = ["9p"] # ツモってアガリ

    elif scenario == "test_daisuufoukai":
        # 🧪 テスト②：大四風会（大四喜）の吸収テスト
        # 風牌4種をすべてポンして裸単騎。
        # 【期待する結果】「小四風会」「一気化三清」「碰碰胡」「寒江独釣」がすべて消え、「大四風会」が君臨すること。
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False]*4
        game.melds[0] = [
            {"type": "pong", "tiles": ["東", "東", "東"]},
            {"type": "pong", "tiles": ["南", "南", "南"]},
            {"type": "pong", "tiles": ["西", "西", "西"]},
            {"type": "pong", "tiles": ["北", "北", "北"]}
        ]
        game.hands[0] = ["白"] 
        game.wall = ["白"] 

    elif scenario == "test_tsuuiisou_chitoi":
        # 🧪 テスト③：字一色の七対子（4枚使い含む）テスト
        # 鳴きなしで字牌だけの七対子。
        # 【期待する結果】「碰碰胡」は付かず、「字一色」と「七対」が複合して表示されること。
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False]*4
        # 東4枚、南2枚、西2枚、北2枚、白2枚、發1枚（ツモって發2枚になる）
        game.hands[0] = ["東","東","東","東","南","南","西","西","北","北","白","白","發"]
        game.wall = ["發"]

    # --- この下に既存のコードが続きます ---
    for i in range(4):
        game.hands[i] = game.sort_hand(game.hands[i])

    for i in range(4):
        game.hands[i] = game.sort_hand(game.hands[i])
        
    return get_safe_state()

@app.get("/get_waits")
def get_waits(player_idx: int = 0):
    hand = list(game.hands[player_idx])
    melds = game.melds[player_idx]
    has_won = len(game.win_tiles[player_idx]) > 0
    last_drawn = game.last_drawn[player_idx] # 🌟 追加：ツモった牌を取得
    
    # 🌟 13枚（ツモる前・鳴いた後）の通常の待ち牌チェック
    if len(hand) % 3 == 1:
        waits = []
        closed_str = " ".join(hand)
        for t in TILE_NAMES + list(SEASON_TILES):
            win_ctx = {"winning_tile": t, "is_tsumo": False, "is_haitei": False}
            res = evaluate_hand({"closed_tiles": closed_str, "melds": melds, "win_context": win_ctx})
            if "error" not in res:
                waits.append(t)
        return {"waits": waits}
    
    # 🌟 14枚（ツモった後）の「何切る」チェック
    elif len(hand) % 3 == 2:
        nanikiru_results = {}
        
        # 🌟 修正：和了している場合はツモ牌（last_drawn）のみを対象にする！
        if has_won:
            candidates = [last_drawn] if last_drawn in hand else []
        else:
            candidates = set(hand)
            
        for discard_tile in candidates:
            temp_hand = list(hand)
            temp_hand.remove(discard_tile)
            
            waits = []
            closed_str = " ".join(temp_hand)
            for t in TILE_NAMES + list(SEASON_TILES):
                win_ctx = {"winning_tile": t, "is_tsumo": False, "is_haitei": False}
                res = evaluate_hand({"closed_tiles": closed_str, "melds": melds, "win_context": win_ctx})
                if "error" not in res:
                    waits.append(t)
            
            # 聴牌する場合のみ結果に入れる
            if waits:
                nanikiru_results[discard_tile] = waits
        return {"nanikiru": nanikiru_results}
    
    return {"waits": []}