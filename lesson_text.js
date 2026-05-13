switch (lessonId) {
    case 1:
        lessonTitle = "レッスン①：脱・平和主義【全単アタック】";
        lessonIntro = `数字の「1, 3, 5, 7, 9」と字牌だけで構成する役です。<br>偶数牌はすべてノイズ。漢は黙って奇数と字牌だけを集めましょう！
            <div style="margin-top: 15px; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; text-align: center;">
                <span style="color:#bdc3c7; font-size: 16px;">使える牌の例：</span><br>
                ${getTutImg('1m')}${getTutImg('3p')}${getTutImg('5p')}${getTutImg('7s')}${getTutImg('9s')} &nbsp; &nbsp; ${getTutImg('東')}${getTutImg('白')}${getTutImg('發')}${getTutImg('中')}
            </div>`;
        lessonQuizData = {
            qText: "Q. 次のうち、全単に【使えない】牌はどれ？",
            options: [
                { text: "1m", img: "1m" },
                { text: "5p", img: "5p" },
                { text: "6s", img: "6s" },
                { text: "中", img: "中" }
            ],
            correctIndex: 2,
            explanation: "6s は偶数なので全単には使えません。"
        };
        lessonMission = "不要な偶数を捨てて「全単」を和了せよ！";
        break;

    case 2:
        lessonTitle = "レッスン②：上下対称の美学【推不倒】";
        lessonIntro = `「上下逆さまにしても図柄が同じ牌」だけで構成する役です。<br>【対象牌】1,2,3,4,5,8,9筒 / 2,4,5,6,8,9索 / 白
            <div style="margin-top: 15px; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; text-align: center;">
                <span style="color:#bdc3c7; font-size: 16px;">すべての対象牌：</span><br>
                ${getTutImg('1p')}${getTutImg('2p')}${getTutImg('3p')}${getTutImg('4p')}${getTutImg('5p')}${getTutImg('8p')}${getTutImg('9p')} <br>
                ${getTutImg('2s')}${getTutImg('4s')}${getTutImg('5s')}${getTutImg('6s')}${getTutImg('8s')}${getTutImg('9s')} &nbsp; &nbsp;
                ${getTutImg('白')}
            </div>`;
        lessonQuizData = {
            qText: "Q. 次のうち「推不倒」に【使える】牌はどれ？",
            options: [
                { text: "7s", img: "7s" },
                { text: "6p", img: "6p" },
                { text: "4s", img: "4s" }
            ],
            correctIndex: 2,
            explanation: "4s は上下対称ですが、7sと6pは非対称なデザインです。"
        };
        lessonMission = "対象外の牌を捨てて「推不倒」を和了せよ！";
        break;

    case 3:
        lessonTitle = "レッスン③：圧倒的スケール【全大】";
        lessonIntro = `数字の「7, 8, 9」だけで構成すると『全大』。<br>逆に「1, 2, 3」だけなら『全小』、「4, 5, 6」だけなら『全中』という役になります。
            <div style="margin-top: 15px; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; text-align: center;">
                <span style="color:#bdc3c7; font-size: 16px;">全大の例：</span><br>
                ${getTutImg('7p')}${getTutImg('8p')}${getTutImg('9p')} &nbsp; &nbsp; ${getTutImg('7s')}${getTutImg('8s')}${getTutImg('9s')} &nbsp; &nbsp; ${getTutImg('9s')}${getTutImg('9s')}${getTutImg('9s')}
            </div>`;
        lessonQuizData = {
            qText: "Q. 全小・全中・全大を狙うとき、絶対に入れてはいけない牌は？",
            options: [
                { text: "字牌", img: "東" },
                { text: "索子", img: "8s" },
                { text: "萬子", img: "9m" }
            ],
            correctIndex: 0,
            explanation: "数字の縛りなので、字牌はすべてノイズになります。"
        };
        lessonMission = "デカい数字だけを集めて「全大」を和了せよ！";
        break;

    case 4:
        lessonTitle = "レッスン④：階段状の刻子【一色四節高】";
        lessonIntro = `同じ色で「111」「222」「333」「444」のように、数字が1つずつズレた「刻子」を4つ作る役です。（3つなら三節高）
            <div style="margin-top: 15px; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; text-align: center;">
                <span style="color:#bdc3c7; font-size: 16px;">一色四節高の例：</span><br>
                ${getTutImg('2p')}${getTutImg('2p')}${getTutImg('2p')} &nbsp; 
                ${getTutImg('3p')}${getTutImg('3p')}${getTutImg('3p')} &nbsp; 
                ${getTutImg('4p')}${getTutImg('4p')}${getTutImg('4p')} &nbsp; 
                ${getTutImg('5p')}${getTutImg('5p')}${getTutImg('5p')}
            </div>`;
        lessonQuizData = {
            qText: "Q. 「222p」「333p」「444p」と揃っています。四節高にするにはあと何が必要？",
            options: [
                { text: "111p か 555p", img: "1p" },
                { text: "567p の順子", img: "6p" },
                { text: "666p か 777p", img: "7p" }
            ],
            correctIndex: 0,
            explanation: "階段状に繋げるため、上下に隣接する刻子（111pか555p）が必要です。"
        };
        lessonMission = "連続した刻子を完成させ「一色四節高」を和了せよ！";
        break;

    case 5:
        lessonTitle = "レッスン⑤：赤を憎む者【陰陽両儀】";
        lessonIntro = `牌の図柄に「赤い塗料」が一切使われていない牌だけで構成する役です。<br>【対象牌】2,4,8筒 / 2,3,4,6,8索 / 東,南,西,北,白,發
            <div style="margin-top: 15px; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; text-align: center;">
                <span style="color:#bdc3c7; font-size: 16px;">使える牌の例（一切赤がない）：</span><br>
                ${getTutImg('2p')}${getTutImg('4p')}${getTutImg('8p')} &nbsp; 
                ${getTutImg('2s')}${getTutImg('3s')}${getTutImg('4s')}${getTutImg('6s')}${getTutImg('8s')} &nbsp; 
                ${getTutImg('東')}${getTutImg('北')}${getTutImg('白')}${getTutImg('發')}
            </div>`;
        lessonQuizData = {
            qText: "Q. 次のうち「陰陽両儀」で【使えない】字牌はどれ？",
            options: [
                { text: "白", img: "白" },
                { text: "發", img: "發" },
                { text: "中", img: "中" }
            ],
            correctIndex: 2,
            explanation: "中は真っ赤なのでアウトです！"
        };
        lessonMission = "赤をすべて切り捨て「陰陽両儀」を和了せよ！";
        break;

    case 6:
        lessonTitle = "レッスン⑥：面前信仰の破壊【寒江独釣で裸になれ】";
        lessonIntro = `4回副露（ポンやカン等）を行い、手牌を「たった1枚（裸単騎）」にして和了する役です。<br>鳴けば鳴くほど強くなる、このゲームの象徴です。
            <div style="margin-top: 15px; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; text-align: center;">
                <span style="color:#bdc3c7; font-size: 16px;">寒江独釣のイメージ：</span><br>
                ${getTutImg('3s')} 単騎待ちなのに、横には副露の山！<br><br>
                ${getTutImg('ura')}${getTutImg('1m')}${getTutImg('1m')}${getTutImg('ura')} &nbsp;
                ${getTutImg('3p')}${getTutImg('3p')}${getTutImg('3p')} &nbsp;
                ${getTutImg('5p')}${getTutImg('5p')}${getTutImg('5p')} &nbsp;
                ${getTutImg('白')}${getTutImg('白')}${getTutImg('白')}
            </div>`;
        lessonQuizData = {
            qText: "Q. 寒江独釣の待ち牌として最強なのはどれ？",
            options: [
                { text: "四季牌", img: "春" },
                { text: "1m", img: "1m" },
                { text: "中", img: "中" }
            ],
            correctIndex: 0,
            explanation: "四季牌は万能牌なので、他家が何を捨てても絶対和了れます！"
        };
        lessonMission = "4回鳴いて手牌を1枚にし「寒江独釣」を和了せよ！";
        break;

    case 7:
        lessonTitle = "レッスン⑦：未知の幾何学【七星不靠】";
        lessonIntro = `字牌7種（東南西北白發中）すべてと、各色で筋が被らない「147」「258」「369」を組み合わせた特殊形です。（面子不要）
            <div style="margin-top: 15px; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; text-align: center;">
                <span style="color:#bdc3c7; font-size: 16px;">七星不靠の例：</span><br>
                ${getTutImg('東')}${getTutImg('南')}${getTutImg('西')}${getTutImg('北')}${getTutImg('白')}${getTutImg('發')}${getTutImg('中')} <br><br>
                ${getTutImg('1m')} &nbsp; &nbsp; 
                ${getTutImg('2p')}${getTutImg('5p')}${getTutImg('8p')} &nbsp; &nbsp; 
                ${getTutImg('3s')}${getTutImg('6s')}${getTutImg('9s')}
            </div>`;
        lessonQuizData = {
            qText: "Q. 手牌に「1m・4m・7m」「2p・5p・8p」があります。索子は何を集めればいい？",
            options: [
                { text: "1s・4s・7s", img: "4s" },
                { text: "2s・5s・8s", img: "5s" },
                { text: "3s・6s・9s", img: "6s" }
            ],
            correctIndex: 2,
            explanation: "各色で別の筋（今回は 3, 6, 9）を担当させます。"
        };
        lessonMission = "正しい有効牌を見極めて「七星不靠」を和了せよ！";
        break;

    case 8:
        lessonTitle = "レッスン⑧：面前のロマン【一色四歩高】";
        lessonIntro = `同じ色で「123」「234」「345」「456」のように、数字が1つずつズレた「順子」を4つ作る役です。<br>鳴かずに門前で狙うと美しさが際立ちます。
            <div style="margin-top: 15px; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; text-align: center;">
                <span style="color:#bdc3c7; font-size: 16px;">一色四歩高の例：</span><br>
                ${getTutImg('2s')}${getTutImg('3s')}${getTutImg('4s')} &nbsp; 
                ${getTutImg('3s')}${getTutImg('4s')}${getTutImg('5s')} &nbsp; 
                ${getTutImg('4s')}${getTutImg('5s')}${getTutImg('6s')} &nbsp; 
                ${getTutImg('5s')}${getTutImg('6s')}${getTutImg('7s')}
            </div>`;
        lessonQuizData = {
            qText: "Q. 「345p」「456p」「567p」と揃っています。四歩高にするにはあと何が必要？",
            options: [
                { text: "234p", img: "2p" },
                { text: "345p", img: "3p" },
                { text: "666p", img: "6p" }
            ],
            correctIndex: 0,
            explanation: "階段状に繋げるため、前後に隣接する順子（234p か 678p）が必要です。"
        };
        lessonMission = "階段状の順子を完成させ「一色四歩高」を和了せよ！";
        break;

    case 9:
        lessonTitle = "レッスン⑨：最終試験【無花果＆槓上開花】";
        lessonIntro = `四季牌を1枚も持たずに和了する縛りプレイ「無花果（むいちじく）」。<br>そして、カンをした補充牌で和了する「槓上開花（リンシャンカイホウ）」。<br>これらを複合させて脳汁を出しましょう！
            <div style="margin-top: 15px; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; text-align: center;">
                <span style="color:#bdc3c7; font-size: 16px;">最高の脳汁展開：</span><br>
                ${getTutImg('1s')}${getTutImg('1s')}${getTutImg('1s')}${getTutImg('1s')} を暗槓！ <br>
                ➔ 嶺上から ${getTutImg('8p')} を引いて「ツモ！」
            </div>`;
        lessonQuizData = {
            qText: "Q. 暗槓（アンカン）をすると、山札から嶺上牌を引くことができますか？",
            options: [
                { text: "はい", img: "ura" },
                { text: "いいえ", img: "1m" }
            ],
            correctIndex: 0,
            explanation: "この性質を利用して、強引にツモ和了りをもぎ取ります。"
        };
        lessonMission = "暗槓からの嶺上ツモで、美しく暴力的な和了をキメろ！";
        break;
}