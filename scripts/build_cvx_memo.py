"""One-off: build the CVX stock memo JSON from inline markdown body."""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "frontend" / "content" / "research" / "stock" / "cvx-2026-04-07.json"

BODY = r"""## 1. TL;DR

CVX 是強板塊裡的二當家。整合石油與天然氣這個 sub 在我們 portal 的 155 個 sub-industry 裡排第 4 名,屬於最強的那群。但這個 sub 內部只有 XOM 跟 CVX 兩檔成分股,而 XOM 在每一個時間窗口的報酬都贏 CVX。意思是,如果你只看量化排名,結論其實很簡單:**買 XOM 就好,不用看 CVX**。

那為什麼還要寫這篇?因為「機械答案」跟「最佳配置」不一定一樣。CVX 有三個 XOM 沒有的東西:**比 XOM 高一個百分點的殖利率、買回比率更高(以市值算)、Hess 整合的綜效還在前面沒兌現完**。在油價走平、長債殖利率有壓的劇本下,這三件事會讓 CVX 追上來。所以這篇的 thesis 不是「CVX 比 XOM 好」,是「**CVX 是 XOM 的高殖利率版,適合做配對的另一邊**」。

| 一句話 thesis | CVX = XOM 的高殖利率 + Hess catalyst 版 |
|---|---|
| 預期 12 個月報酬 | +15% ~ +20%(含股利) |
| 失效條件 | 油價跌破 $65 / Hess 綜效跳票 / sub mom_score 跌破 70 |

下面所有段落都會回頭來證明這張表。

---

## 2. 量化訊號快照

這段是 portal 跟任何 sell-side 報告最大的差異。賣方會跟你講 CVX 的 EBITDA、自由現金流、估值,但他們**不會告訴你「現在這個產業在輪動曲線的哪一段」**,因為他們沒有這層資料。我們有,所以這段一定要先看。

**個股、大哥、整個 sub 的六場比賽**

| | CVX | XOM | Sub 平均 | 誰贏 |
|---|---|---|---|---|
| Mom Score | 80.16 | **87.41** | 88.54 | XOM |
| Rank in sub | 2 / 2 | 1 / 2 | — | XOM |
| ret_1m | +6.1% | **+8.4%** | +7.3% | XOM |
| ret_3m | +24.2% | **+31.6%** | +27.9% | XOM |
| ret_6m | +34.0% | **+47.0%** | +40.5% | XOM |
| ret_12m | +34.9% | **+50.8%** | +42.9% | XOM |
| RVol | 0.64 | 0.77 | 0.70 | XOM |

六場比賽 XOM 贏六場,沒有一項 CVX 領先。3 個月的差距是 7 個百分點、6 個月的差距是 13 個百分點、12 個月的差距是 16 個百分點 — **而且差距是隨時間放大的,不是隨機抖動**。這代表 XOM 的 outperform 是有結構性原因的,不是運氣。下面第 4 段會講為什麼。

但這張表還有第二層資訊:**CVX 跟 XOM 的 1 週、1 個月跌幅幾乎一樣**(過去一週都跌 -4.4%、過去一個月都漲 +6 ~ +8%)。意思是兩兄弟的 beta 對油價是同步的,他們不是替代品,**他們是同方向的兩個尺寸,賺虧一起發生**。所以後面講配對時,XOM 60 / CVX 40 不是對沖,是「同向加碼但 CVX 犧牲 alpha 換 yield」。

---

**Sub 本身的「個性」 — 為什麼這個 sub 會跑出來**

| 風險 / 趨勢指標 | 數值 | 講白話 |
|---|---|---|
| Sharpe(8 週) | **5.47** | 過去兩個月「漲得又穩又陡」,稀有 |
| Beta vs SPY | 0.58 | 大盤動 1%,它只動 0.58% |
| Downside capture | **-0.24** | 大盤跌的時候它**反而漲** |
| Price vs MA200 | +29.5% | 距長期均線 +30% |
| 距 52 週高點 | -4% | 幾乎在天花板 |
| momentum_decay_rate | **-11.29** | 動能在剎車 |

這六項裡面,**前三項解釋了「為什麼現在這個 sub 值得買」**,後三項解釋「為什麼不能無腦追」。

前三項合起來在講一件事:整合油氣這個 sub 現在被市場當成**避險資產**在用。Sharpe 5.47 是極值,八週裡幾乎沒有像樣的回檔;Beta 0.58 代表它跟大盤的關聯性弱;Downside capture **負值**最關鍵 — 過去 8 週只要大盤跌、它就漲。這在歷史上不常見,通常只發生在「市場開始擔心通膨或地緣風險,資金從成長股流向硬資產」的時期。也就是現在的環境。

後三項是煞車燈。距 200 日均線已經 +30%、距 52 週高點只剩 4%、momentum decay 顯示動能正在放緩。**這不是叫你不要買,是叫你進場規模要保守**,因為這個 sub 已經跑了一段路,你不是抄底進來、是中後段加入。

---

**Sub mom_score 過去 30 天走勢**

```
日期       0  10  20  30  40  50  60  70  80  90 100
04-07      ████████████████████████████████████████████ 88.5
04-06      ████████████████████████████████████████████████ 93.5
04-03      ████████████████████████████████████████████ 88.6
04-01      ███████████████████████████████████████████████ 93.9
03-30      ███████████████████████████████████████████████ 93.9
03-25      ██████████████████████████████████████████████ 92.8
03-20      ███████████████████████████████████████████████ 93.0
03-13      █████████████████████████████████████████████ 90.3
03-09      ████████████████████████████████████████ 81.2
03-05      ███████████████████████████████████████ 79.3
02-27      █████████████████████████████████████████ 83.9
02-26      █████████████████████████████████████ 75.6
```

讀這張圖的方式很簡單:從下往上看時間。**30 天前 sub 還在 75 分,中段衝到 94 分,最近一週又掉回 88 分**。

這個曲線形狀告訴你三件事。

第一,2 月底到 3 月中是真正的「啟動段」 — 從 75 直接拉到 90,**這段是該抄底的人賺到的錢**,不是現在進場能拿到的。

第二,3 月下旬到 4 月初分數在 88-94 之間震盪,**進入了 saturation phase(飽和段)**。這段表面上看起來還是很強,但邊際買盤已經沒在推新高,只在維持高檔。

第三,過去這個禮拜分數從 94 掉到 88,**第一次出現 6 點的明顯回落**。配上前面講的 momentum_decay_rate -11.29,這個曲線正在告訴你:**輪動段大概還剩兩、三週的甜蜜期,之後就要看 catalyst 是不是接得上**。

對應到 thesis:現在進場是合理的,但要小倉位、要有停損,**而且要密切盯下個禮拜的 Q1 26 財報**(catalyst 那段會講)。

---

## 3. Sector context — 為什麼整合油氣會跑出來

要理解 CVX,必須先理解這個 sub 為什麼會在 155 個 sub 裡跑到第 4。這不是 CVX 自己的故事,是宏觀劇本把整個 sub 推上來。

**驅動鏈條**

```
油價平台站穩 $75 一帶
        ↓
OPEC+ 維持減產(沙烏地不放手)
        ↓
中東地緣風險溢價回來
        ↓
長債殖利率有壓(市場 price-in 降息)
        ↓
高殖利率股 = bond proxy 重評
        ↓
整合油氣同時兼具:殖利率 3-4% + 通膨對沖 + 低 beta
        ↓
資金 rotation → portal 抓到 sub rank 4 ⭐
```

這條鏈最關鍵的一環是「**長債殖利率有壓**」。如果長債殖利率往上、市場 price-in 鷹派,高殖利率股就沒戲;反過來,只要市場相信 Fed 今年會降息,3.6% 殖利率的 CVX 跟 2.6% 殖利率的 XOM 就會被當成「便宜的固定收益替代品」重新定價。**這也是為什麼我把「油價跌破 $65」放在失效條件,但沒有把「Fed 不降息」放上去** — 因為 Fed 不降息會傷整個 sub,但 CVX 相對 XOM 的 thesis 不會破。

還有一個小細節:這個 sub 只有兩檔成分股,所以「找 sub 內最強選手」這個傳統選股題在這裡不成立。真正的問題是**「兩兄弟誰更適合現在的情境」**,下一段就是這個對打。

---

## 4. CVX vs XOM 逐項對打

| 維度 | CVX | XOM | 誰贏 |
|---|---|---|---|
| 2025 產量(MBOED) | 3,723 | 4,700 | XOM |
| Q4 25 EPS(adj) | $1.52 | — | — |
| EPS YoY | -26% | — | XOM |
| FCF(2025) | $16.6B | ~$50B+ | XOM 規模 |
| FCF / 股利覆蓋 | 1.30x | **3.02x** | XOM |
| 2026 capex 引導 | $18-19B(低區) | $27-29B | CVX 紀律 ⭐ |
| 2026 buyback 計畫 | $12B+ | $20B | XOM 絕對額 |
| **Buyback yield(% 市值)** | **~4.0%** | ~3.5% | CVX ⭐ |
| **Dividend yield** | **3.6%** | 2.6% | CVX ⭐ |
| **Total shareholder yield** | **~7.6%** | ~6.1% | CVX ⭐ |
| 成本削減 program | 才開始($3-4B) | 已跑 7 年($15B) | CVX 邊際空間大 ⭐ |
| Forward P/E | ~16x | ~14x | XOM 便宜 |
| Hess 綜效進度 | 第一階段 $1B 已 deliver | — | CVX(catalyst 在前) ⭐ |

比分 **XOM 5 / CVX 6**,CVX 險勝,但這個勝負完全是質的、不是量的。把這 14 行讀成兩個故事會比較清楚。

**XOM 的故事是「規模 + 紀律」**。產量大、FCF 大到股利覆蓋 3 倍、成本削減做了 7 年累積 $15B 真實落袋。它是那種「不會出錯但也不會驚喜」的公司。買它的人不是想賺 alpha,是想把油氣產業的暴露度安全地塞進投組裡。

**CVX 的故事是「高殖利率 + Hess 整合 + 成本還沒削」**。第一,殖利率跟買回率合計 7.6%,比 XOM 的 6.1% 多 1.5 個百分點 — 在 10 年期殖利率 4% 出頭的環境下,1.5 個百分點不是小錢。第二,Hess 才剛併進來,$1B 第一階段綜效是「保守的下限」,管理層已經暗示後面還有 $1B+。第三,CVX 的成本削減 program 才剛開始,XOM 已經是邊際遞減的後段,**CVX 的 EPS 上修空間結構性比 XOM 大**。

所以這 6 個 ⭐ 不是說 CVX 真的比 XOM 強,是說 **CVX 把 XOM 沒押的那些賭注押了**:殖利率派發、買回密度、整合綜效、成本削減邊際空間。只要這些賭注不全部倒下,CVX 就有機會把 16 個百分點的 12 個月落後追回來一部分。

---

## 5. Thesis pillars

把上面講的東西整理成五根支柱,後面 risk 段一個一個對打:

1. **Hess 綜效兌現** — EPS run-rate 從 $6 → $8(2027)
2. **2026 產量 +7-10%** — Guyana / Gulf / 東地中海 offshore 三條線
3. **Capex 紀律** — 不擴上游、現金回給股東
4. **Total shareholder yield 7.6%** — 利率轉鬆環境下做 bond proxy 重評
5. **Sub mom_score 維持 ≥ 80** — portal 量化確認輪動段還沒結束

這五根 pillars 的順序不是隨便排的,**1 跟 2 是基本面 catalyst,3 是管理層紀律(防守),4 是估值 driver,5 是 portal 量化把關**。任何一根倒下都是 thesis 的部分受傷,但只有 1+4 同時倒下才是致命傷。

---

## 6. Risks(每一條對應一根 pillar)

| # | 風險事件 | 哪根 pillar 倒 | 觸發訊號 |
|---|---|---|---|
| 1 | Stabroek 仲裁不利 | Pillar 1(Hess) | Q2 2026 裁定結果 |
| 2 | 油價跌破 $65 | Pillar 4(yield) | FCF 覆蓋 < 1.0x |
| 3 | 為了追 XOM 產量擴 capex | Pillar 3(紀律) | 季報 capex 指引上修 |
| 4 | 動能加速減速 | Pillar 5(輪動) | sub mom_score < 70 |
| 5 | 連 3 季 EPS 輸 XOM | Pillar 1+2 一起 | 資金流向 XOM,multiple 壓縮 |

風險之間的權重不一樣,要分開講。

**最早會出問題的是 #4**,因為前面 mom_score 走勢圖已經告訴你動能在剎車。這條風險是「時間問題」,不是「會不會發生」。當 sub mom_score 跌破 70 的時候,不是 thesis 破,是「該離場了」 — 我們是在做 rotation,不是在 hold forever。

**最致命的是 #1 + #2 同時發生**。Stabroek 仲裁是 Hess 併購最大的尾部風險:這個 Guyana 巨型油田是 Hess 的核心資產,XOM 主張對它有優先承購權,如果仲裁判 XOM 贏,**CVX 等於花了 $53B 買到一個被掏空核心資產的 Hess**,Pillar 1 直接歸零。如果同時油價跌破 $65,股利覆蓋掉到 1.0x 以下,Pillar 4 也破,股價會被殺到 $130 一帶。**這是出場、不是攤平的情境**。

#3 跟 #5 是慢性風險,每一季財報都要 monitor,但不會單獨擊倒 thesis。

---

## 7. Valuation snapshot

| 指標 | CVX | XOM | 整合油氣中位 |
|---|---|---|---|
| Forward P/E | 16x | 14x | 14x |
| EV / EBITDA(NTM) | 6.5x | 6.8x | 6.5x |
| Dividend yield | **3.6%** | 2.6% | 3.0% |
| Buyback yield | **4.0%** | 3.5% | 2.5% |
| FCF / dividend | 1.30x | **3.02x** | — |

讀這張表的關鍵是**「CVX 看起來比 XOM 貴一點」這件事是不是真的**。Forward P/E 16x vs 14x,絕對數字 CVX 是貴一點。但這個「貴」是因為 CVX 的 EPS 被 Hess 整合費用一次性壓低,**等於用「不正常的 EPS」算 P/E**,自然會看起來貴。

**正常化 P/E 試算**

```
帳面 EPS (2025)             $6.0
+ Hess 整合一次性費用回沖    +$0.8
+ 2026 產量 +8% 帶動         +$0.7
                            ─────
正常化 EPS (2027F)          $7.5

正常化 P/E = $170 / $7.5 ≈ 22.7x   ← 還是貴
EPS 拉到 $8.0  →  21.3x            ← 還是貴
EPS 拉到 $9.0  →  18.9x            ← 接近合理
```

這個算式要老實面對:**就算 Hess 綜效全部兌現、產量引導全部達標,CVX 的正常化 P/E 還是落在 19-22 區間,並不便宜**。比較對象 XOM 的同一個算式大概落在 15-17 區間。所以 CVX 不是 deep value,是「為了拿到那 1.5% 的額外殖利率 + buyback 邊際差,願意付一點 multiple 溢價」。

賣方共識目標價約 $185,implied upside 約 9%,加上 3.6% 股利,12 個月帳面總報酬約 **13%**。我給的 +15-20% 是再加上「buyback 在 multiple 上的支撐還沒被市場 model 進去」這條額外賭注。**這條賭注不是穩賺,是下行受到 buyback 保護、上行靠 catalyst 兌現**。

---

## 8. Catalyst calendar

```
2026
─┬─ Apr 25 ─── Q1 26 財報 ⭐
 │            (consensus EPS $1.85,看 Hess 綜效進度)
 │
─┼─ Q2 ────── Stabroek 仲裁裁定 ⚠️ binary
 │            (Pillar 1 二元事件,生死門)
 │
─┼─ 中 ─────── Anchor / Whale first oil 🛢️
 │            (offshore production ramp 起點)
 │
─┼─ Q3 ────── Q2 26 財報 + 2026 全年指引上修
 │
─┴─ H2 ─────── Tengiz FGP 完工 (+260 kbpd)
```

時間軸上有兩個 ⭐ 跟一個 ⚠️,意義完全不同。

**Apr 25 的 Q1 26 財報**是第一個試金石。共識 EPS $1.85,如果 CVX 報出 $2.00 以上,代表 Hess 第一階段綜效真的兌現得比預期快,Pillar 1 加分,股價會 pop 5-8%。如果報出 $1.70 以下,等於告訴市場「整合沒那麼順利」,Pillar 1 受傷,要重新評估倉位。

**Q2 的 Stabroek 仲裁是 binary event** — 不是「好或不好」,是「贏或輸」。贏了 thesis 全部成立、股價有機會直接上 $190;輸了 thesis 直接破、股價可能跌到 $140。**這個事件之前不應該加碼,事件公布之後才動**。

**Q3 的全年指引上修**是慢動作 catalyst,如果 H1 表現好,管理層會在 Q2 26 財報把全年產量引導從 7-10% 往 9-11% 推,這會帶動賣方目標價同步上修,屬於「漸進式 re-rating」。

時間軸告訴你的是:**未來 3 個月的事件密度遠高於後 9 個月**。Position sizing 應該反映這件事 — 第一筆建倉小,Apr 25 財報後再決定要不要加。

---

## 9. Position sizing

| 你的策略類型 | CVX 是否入選 | 建議權重 |
|---|---|---|
| Sub-rotation top-N(N=10) | ❌ 不入選 | sub 內首選 XOM |
| Stock-level top-K within sub(K=2) | ✅ 入選 | 與 XOM 同權 |
| Pair trade(整合油氣 sleeve) | ✅ | XOM 60% / CVX 40% |
| 純殖利率 sleeve | ✅ | CVX overweight |

四種策略類型對 CVX 的處理方式都不一樣,選哪一種看你的 portal 是哪種角色。

如果你在 portal 裡跑的是**標準 sub-rotation**(每月選最強的 N 個 sub,各買代表股),CVX 不會被選到 — 因為 sub 內部 XOM 領先,top-K 規則只會挑 XOM。**這種策略下這篇 memo 對你沒用**。

如果你跑的是 **stock-level top-K within sub**(在每個入選的 sub 裡選最強的 K 檔個股),K=2 的時候 CVX 會自動入選,因為這個 sub 只有兩檔。權重跟 XOM 一樣。

如果你在做**整合油氣 sleeve 配置**(這個 sub 在投組裡分配一塊固定預算,內部再分),XOM 60% / CVX 40% 是合理的。XOM 是 anchor,CVX 是 yield + catalyst kicker。

如果你的目標是**純殖利率 sleeve**(投組裡有一塊專門收股利、不在乎短期報酬),CVX overweight 比 XOM 合理,因為殖利率高 1 個百分點 + buyback 高 0.5 個百分點 = 收益差異實打實。

**進出場規則**(可以直接存成 portal 的 backtest preset)

| 觸發 | 條件 | 目前狀態 |
|---|---|---|
| 入場 | mom_score > 70 且 sub mom_score > 75 | ✅ 滿足 |
| 加碼 | sub mom_score 創 30 天新高 | 🟡 在減速,不加碼 |
| 減碼 | sub 8 週 sharpe < 1.0 | 觀察 |
| 停損 | sub mom_score < 60 或股價跌破 MA50 | — |
| 停利 | sub mom_score 跌到歷史 30th percentile 以下 | — |

這張表要跟 catalyst 表合起來看。**現在「滿足入場」但「不加碼」**,意思是建小倉,等 Apr 25 財報出來後再決定。如果財報好 → 加碼;財報普通 → 持有;財報不及預期 → 直接砍。**量化規則和事件規則同時用,才能避開單一指標騙線**。

---

## 10. Update log

| 日期 | 資料點 | 對 thesis 的影響 | 動作 | 信心度 |
|---|---|---|---|---|
| 2026-04-07 | Initial memo | — | 建立 thesis | 中 |
| _未來_ | _Q1 26 財報_ | _待填_ | _待填_ | _待填_ |
| _未來_ | _Stabroek 裁定_ | _待填_ | _待填_ | _待填_ |

這欄是 portal 跟任何賣方 initiation 報告最大的差異 — 賣方寫完一份 30 頁報告就放著吃灰,**portal 因為每天都有量化更新,可以做到「這個 thesis 還活著嗎」這種持續追蹤**。

具體怎麼用:每次 portal 跑完當日 pipeline 後,如果發現 CVX 的 mom_score 或 sub mom_score 進入「減碼 / 停損」的觸發區,就在這張表 append 一行。每次 CVX 出財報、或 catalyst 表上的任何一個事件發生,也 append 一行。**三個月後回頭看這張表,你就知道自己當初為什麼進場、什麼時候該出場、出場理由是不是被驗證**。這是個人投資人最缺的東西 — 不是分析能力,是 thesis 的可追蹤性。

---

## Sources

- [Chevron Q4 2025 Results — Chevron Newsroom](https://www.chevron.com/newsroom/2026/q1/chevron-reports-fourth-quarter-2025-results)
- [Chevron Q4 2025 Earnings Call — Motley Fool](https://www.fool.com/earnings/call-transcripts/2026/01/30/chevron-cvx-q4-2025-earnings-call-transcript/)
- [Chevron vs ExxonMobil 2026 — 24/7 Wall St.](https://247wallst.com/investing/2026/04/02/chevron-vs-exxonmobil-which-energy-stock-will-win-in-the-new-oil-landscape/)
- [Chevron vs ExxonMobil Dividend — Motley Fool 2026-02](https://www.fool.com/investing/2026/02/18/chevron-vs-exxonmobil-which-oil-dividend-giant-is/)
- portal 量化資料:Supabase 截至 2026-04-07
"""

memo = {
    "slug": "cvx-2026-04-07",
    "ticker": "CVX",
    "company": "Chevron Corporation",
    "sector": "Energy",
    "subIndustry": "Integrated Oil & Gas",
    "date": "2026-04-07",
    "title": "強板塊裡的二當家 — CVX 是 XOM 的高殖利率版",
    "subtitle": "整合油氣 sub 排第 4,但內部 XOM 全勝。CVX 的 thesis 不是贏 XOM,是用 1.5% 額外殖利率 + Hess catalyst 換邊際勝率。",
    "stance": "Long",
    "expectedReturn": "+15% ~ +20%",
    "conviction": "中",
    "momScore": 80.16,
    "rankInSub": "2 / 2",
    "subRank": "4 / 155",
    "body": BODY,
}

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(memo, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"wrote {OUT}")
