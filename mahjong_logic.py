import random
import traceback

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
# 2. AI・役判定ロジック
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
    
    counts = {}
    for t in hand_list:
        if t not in SEASON_TILES: counts[t] = counts.get(t, 0) + 1
    pairs = [t for t, c in counts.items() if c >= 2]
    
    max_qixing_count = 0
    for pattern in KNITTED_PATTERNS:
        c = sum(1 for i in pattern + list(HONORS) if TILE_NAMES[i] in hand_list)
        if c > max_qixing_count: max_qixing_count = c
        
    if max_qixing_count + jokers >= 10: 
        return "七星不靠"
        
    yaojiu_count = len(terminals_honors) + jokers
    if yaojiu_count >= 9: return "十三幺九"
        
    if sum(1 for t in hand_list if t in TILE_NAMES and TILE_NAMES.index(t) in ODDS) >= 10: return "全単"
        
    term_pairs = [t for t in pairs if "1" in t or "9" in t]
    if len(term_pairs) >= 1: return "双同刻/三同刻"
        
    num_pairs = sorted([get_tile_num(t) for t in pairs if get_tile_num(t) != -1])
    if any(num_pairs[i+1] - num_pairs[i] == 1 for i in range(len(num_pairs)-1)): return "三節高/四節高"
        
    if sum(1 for t in pairs if t in ["白", "發", "中"]) >= 2: return "小三元/大三元"
    if sum(1 for t in pairs if t in ["東", "南", "西", "北"]) >= 2: return "小四喜/大四喜"
        
    suits = {'p': sum(1 for x in set(hand_list) if 'p' in x), 's': sum(1 for x in set(hand_list) if 's' in x), 'm': sum(1 for x in set(hand_list) if 'm' in x)}
    if len(pairs) == 0 and max(suits.values()) >= 6: return "一通/混一色"

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

    if personality in [1, 2]: 
        if idx in HONORS: score += 40
        if t_num in [1, 9]: score += 30
    else: 
        if count == 1 and idx in HONORS: score -= 50
        if 3 <= t_num <= 7: score += 30

    if count == 1 and visible >= 3 and idx in HONORS: score -= 80 
        
    if t == "發": score += 15

    target = determine_target(cpu_idx, hand_list, game_state)

    if target == "七星不靠":
        if count >= 2: score -= 100 
        best_pattern = []
        max_c = -1
        for p in KNITTED_PATTERNS:
            c = sum(1 for i in p + list(HONORS) if TILE_NAMES[i] in hand_list)
            if c > max_c:
                max_c = c
                best_pattern = p
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

    is_tsumo = ctx.get("is_tsumo", False)
    is_first = ctx.get("is_first_turn", False)
    any_meld = ctx.get("any_meld_occurred", False)
    d_count = ctx.get("discards_count", 999) 

    if is_menzen and is_first and not any_meld:
        if ctx.get("is_dealer", False) and is_tsumo and d_count == 0:
            base_attr.append("天胡")
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

def is_kan_valid_for_player(player_idx, kan_type, tile, game_state):
    win_tiles = game_state.win_tiles[player_idx]
    if not win_tiles: return True 
    
    hand = list(game_state.hands[player_idx])
    melds = [dict(m) for m in game_state.melds[player_idx]]
    last_drawn = game_state.last_drawn[player_idx]
    
    if any(t in SEASON_TILES for t in hand):
        return False
        
    temp_hand_orig = list(hand)
    if last_drawn in temp_hand_orig:
        temp_hand_orig.remove(last_drawn)
    
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

    if not set(win_tiles).issubset(set(new_waits)):
        return False 
            
    return True

# ==========================================
# 3. ゲーム状態の管理
# ==========================================
class GameState:
    def __init__(self):
        self.current_round = 1
        self.dealer = random.randint(0, 3) 
        self.scores = [0, 0, 0, 0] 
        self.total_scores = [0, 0, 0, 0] 
        self.cpu_targets = ["", "", "", ""]
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