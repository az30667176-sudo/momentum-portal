import Image from 'next/image'

export const dynamic = 'force-static'
export const metadata = { title: '輪動週報 | Momentum Portal' }

const WEEK_DIR = '/weekly/2026-04-03'

function Exhibit({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="my-8">
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <Image
          src={`${WEEK_DIR}/${src}`}
          alt={alt}
          width={1400}
          height={900}
          className="w-full h-auto"
          unoptimized
        />
      </div>
      <figcaption className="mt-2 text-sm text-gray-500 italic">
        {caption}
      </figcaption>
    </figure>
  )
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-12 mb-3 text-xl font-bold text-black border-l-4 border-blue-600 pl-3">
      {children}
    </h2>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="my-4 leading-8 text-black text-[15px]">
      {children}
    </p>
  )
}

function B({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-black">{children}</strong>
}

export default function WeeklyPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 bg-white text-black min-h-screen">
      {/* Header */}
      <header className="mb-10 pb-6 border-b border-gray-200">
        <div className="text-xs uppercase tracking-wider text-blue-600 font-semibold mb-2">
          Momentum Portal · Weekly Rotation
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-black leading-tight">
          反彈裡的兩個錯位
        </h1>
        <p className="mt-3 text-sm text-gray-500">
          截至 2026-04-03 當週 · 快照日 2026-04-06
        </p>
      </header>

      {/* Section 1 */}
      <H2>為什麼這週的反彈不能輕易相信</H2>

      <P>
        如果只看 portal 板塊頁那張條形圖，這週像是一次乾淨的全面反攻 —— 11
        個板塊收紅 10 個，金融 +4.9% 帶頭，科技、原物料、醫療、不動產緊跟在 +3.9%
        到 +4.6% 之間。但是把同一段價格放回到 4 月的新聞背景裡，故事其實是錯位的。
      </P>

      <P>
        伊朗局勢這週並沒有降溫，反而往更壞的方向走。Hormuz 海峽到月初還處在中斷狀態，CNBC
        在 4/5 引述 Trump 再次揚言會打掉伊朗每一座電廠和橋樑，JPMorgan
        則直接把警語拉到「如果中斷拖到五月中，Brent 可能衝上 150」。同時間，美國 3 月 PPI
        月增 0.7%，明顯高過預期 0.3%，市場原本年初還預期 2026
        年降息兩碼，現在已經被壓到接近零碼。換句話說 ——
        這不是一個「通膨在下行、降息要來了」的環境，是一個「通膨黏住、降息延後、油價隨時可能再炸一次」的環境。
      </P>

      <P>
        那為什麼能源還是被砍 5%、金融還是漲 4.9%？答案不是新聞，是<B>部位</B>。
        能源族群過去三個月漲了 34%，本週 OPEC+ 再次決議 5 月增產 20.6
        萬桶/日，加上接近月底的調倉壓力，整個族群同步進入獲利了結 —— portal 上能源的{' '}
        <code className="text-xs bg-gray-100 px-1 rounded">delta_rank</code>{' '}
        全部介在 –3 到 +3 之間，<B>整群一起跌、沒有誰先破位</B>
        ，是經典的「動能解倉」而不是「趨勢翻轉」。金融則正好相反，過去兩個月一直是被砍的板塊（Nasdaq
        Bank Index 1Q 落後大盤），CNBC 在 4/1 出了一篇「重燃 2026
        銀行股反彈的三條路徑」的主題文，剛好踩在這個族群最被低配的時刻。
        <B>這兩個族群本週的方向都是被動的，不是被新聞推動的</B>。
      </P>

      <P>
        如果這個解讀是對的，那麼這次反彈本質上就是「漲跌互換」而不是「risk-on 啟動」。Portal
        上的另一條暗線正好佐證 —— 本週<B>排名爬升最快的十個次產業裡，有六個是必需消費</B>
        （家用品 Δ+26、菸草 Δ+20、軟性飲料 Δ+20、農產品 Δ+20、食品零售
        Δ+17）。這些族群絕對報酬不亮眼，但相對位階卻在快速堆積。當市場在循環股上做反彈、同時在防禦股上加碼，意思通常只有一個：
        <B>買盤心裡並沒有股價表面那麼有信心</B>。
      </P>

      {/* Exhibits */}
      <H2>圖一　板塊一週報酬：金融帶頭，能源獨黑</H2>
      <Exhibit
        src="01_sector_1w.png"
        alt="Sector 1W returns"
        caption="11 個板塊收紅 10 個，唯一收黑的能源 –5.0%。最強最弱離散度 9.9 pts，是過去六個月中位數的兩倍。"
      />
      <P>
        最強最弱離散度 9.9
        個百分點，大約是過去六個月中位數的兩倍。這個數字很重要 ——
        高離散度同時搭配指數收紅，代表本週的漲幅不是 beta 全面回補，而是<B>主動換股</B>
        。問題是，被換進來的金融、不動產、非必需消費，過去三個月分別 –6%、+3%、–6%，幾乎全是落後者。換句話說，市場本週不是在追領袖，是在撿被打趴的東西。
      </P>

      <H2>圖二　輪動地圖：右下只剩能源，左上擠滿落後者</H2>
      <Exhibit
        src="02_rotation_map.png"
        alt="Rotation map"
        caption="X 軸 3M 報酬、Y 軸 1W 報酬。能源孤伶伶卡在右下，循環股全部擠在左上。"
      />
      <P>
        橫軸是三個月、縱軸是一週。能源孤伶伶卡在右下象限 ——
        過去三個月最強、本週最弱。左上象限則擠滿了一票循環股，全部是「過去三個月落後、本週反彈」的型態。這種圖形在歷史上幾乎只有兩種解：一種是趨勢真的轉了，那會持續看到
        mom_score
        重新分佈；另一種是短線反彈掩護著長線換股，很快會回到原本的結構。在油價未解、PPI
        又高於預期的當下，第二種解的機率明顯比較高。
      </P>

      <H2>圖三　單週最強最弱十二名：金屬接棒油氣</H2>
      <Exhibit
        src="03_top_bottom_subs.png"
        alt="Top and bottom 12 sub-industries"
        caption="最弱榜清一色是能源；最強榜被工業金屬包辦。"
      />
      <P>
        最弱榜清一色是能源 —— 煤炭 –12.2%、整合油氣 –5.1%、E&P –5.3%、煉油
        –4.5%；最強榜換成了<B>鋁 +21.8%、銅 +8.6%、黃金 +10.2%</B>
        。這條金屬線是這份報告裡少數<B>有結構性新聞支撐的故事</B>：印尼 Grasberg 礦自 2025 年
        9 月山崩之後仍處於減產，Benchmark 估算到 2026 年底會少掉 59.1 萬噸銅；Goldman
        同時下調全年銅供給預估，連同 AI 資料中心對銅的需求預估從 11 萬噸跳到 47.5
        萬噸，把銅價在年初推上 12,000 美元/噸的新高。Aluminum 也同步來到三年高點 2,900
        美元/噸。<B>Portal 抓到的銅 Δ+18 是本週指數內最乾淨的單一突破訊號</B>
        ，而且這條故事的支撐不在油價、不在央行、不會被中東局勢直接打到。
      </P>

      <H2>圖四　動能榜上的解倉訊號</H2>
      <Exhibit
        src="04_energy_unwind.png"
        alt="Energy unwind"
        caption="橘色點為能源、藍色點為其他。所有能源點都在 0 軸下，但 mom_score 仍站在 80–95。"
      />
      <P>
        橘色點是能源、藍色點是其他。所有橘色點都掉到 0 軸下方，但 mom_score 仍然站在 80–95
        這個區間 —— 也就是「動能還沒掉、但價格先跌」的型態。歷史上這種型態通常代表的是部位調整，不是趨勢翻轉。能源這群股票本週的{' '}
        <code className="text-xs bg-gray-100 px-1 rounded">delta_rank</code>{' '}
        維持在 –3 到 +3 的小區間，沒有任何個股先破位，呼應「整群同步休息」的解讀。
        <B>操作建議是逢漲減一部分 size 控制風險，但不要翻空</B> —— 油價只要 Hormuz 或 OPEC+
        任一邊有變化，這個部位就會被馬上點燃。
      </P>

      <H2>圖五　排名變動：必需消費的暗線</H2>
      <Exhibit
        src="05_rank_delta.png"
        alt="Rank delta"
        caption="右側爬升榜被必需消費包辦；左側下滑榜是工業 capital goods 與資產管理。"
      />
      <P>
        右側的爬升榜被必需消費包辦，左側的下滑榜被工業 capital
        goods、資產管理、獨立電廠包辦。最戲劇的一筆是資產管理（Δ –34），即便本週仍收
        +2.5%，portal 還是把它標為「漲不動的領袖」。這張圖是這份週報裡資訊密度最高的一張 ——
        它告訴你市場目前在哪裡退、在哪裡進，而且這條退進路線跟新聞頭條上看到的「全面反彈」是矛盾的。
        <B>如果下週循環反彈失敗，市場已經提前知道要躲到必需消費</B>。
      </P>

      <H2>圖六　原物料的金屬 vs 化學分裂</H2>
      <Exhibit
        src="06_materials_split.png"
        alt="Materials split"
        caption="同一個 +4.2% 板塊內，金屬全部領漲、化學品與營建材料下跌。"
      />
      <P>
        原物料板塊整週 +4.2%，但內部頭尾差異極大：金屬全部領漲，化學品和營建材料卻在下跌。這個分裂呼應了油價的故事
        ——
        油價回落不是只打到上游能源，連帶把以原油為原料的化學品壓下來；而工業金屬走的是 AI
        算力、電氣化、礦山供給斷層的另外一條獨立題材，方向完全相反。
        <B>未來看「原物料」這個板塊不能再用一個數字概括，必須拆成金屬與化學兩條線分別追</B>。
      </P>

      {/* Action items */}
      <H2>下一次 rebal 的具體動作</H2>
      <ol className="mt-4 space-y-3 text-[15px] leading-7 text-black list-decimal list-outside pl-6">
        <li>
          <B>能源動能部位逢漲減 1/3，核心 2/3 留著</B>。廣度（89% 個股 &gt; 50DMA）和 mom_score
          （94）仍是指數第一，這是控制 size 的問題不是方向問題。Hormuz
          一旦再生變化，這個部位是唯一的避險。
        </li>
        <li>
          <B>新增工業金屬部位</B>（鋁、銅、黃金）作為新的循環商品載體，優先進銅 ——
          它是這份報告裡唯一同時擁有 portal
          訊號、結構性供給斷層、長線需求題材三重支撐的次產業。
        </li>
        <li>
          <B>工業內部做配對</B>：多運輸（陸運 +7.7%、海運 mom 87、客運 +17.4%）與重電（重電 mom
          83、營建工程 mom 80），減 capital goods 與一般機械。本週工業內部 Δrank
          的價差是所有板塊裡最大的。
        </li>
        <li>
          <B>建一個必需消費的相對防禦部位</B>
          （家用品、菸草、軟性飲料、食品零售）。絕對報酬不領，但相對排名在累積，剛好對沖循環反彈廣度不足的風險。
        </li>
        <li>
          <B>避開「漲了但排名重挫」名單</B>（資產管理、營建材料、工業機械、獨立電廠、Hotels &
          Cruise）。Portal 把它們標為破位領袖，不是回檔買點。
        </li>
        <li>
          <B>Pharma 不追</B>。+8.9% 主要反映 4/3 nusinersen 與 4/7 PADCEV+KEYTRUDA 兩個 FDA
          月曆事件，整體醫療 1M 仍 –4.5%、Health Care Tech 排名 150。當作短期事件反彈處理。
        </li>
      </ol>

      {/* Sources */}
      <H2>新聞來源</H2>
      <ul className="mt-4 space-y-2 text-sm text-gray-600 list-disc list-outside pl-6">
        <li>
          <a
            className="text-blue-600 hover:underline"
            href="https://www.cnbc.com/2026/04/05/crude-oil-prices-iran-war-strait-hormuz.html"
            target="_blank"
            rel="noreferrer"
          >
            CNBC — Oil prices edge higher after Trump reiterates threat to bomb Iran (2026-04-05)
          </a>
        </li>
        <li>
          <a
            className="text-blue-600 hover:underline"
            href="https://www.bloomberg.com/news/articles/2026-03-01/opec-agrees-in-principle-to-206k-b-d-hike-for-april-delegates"
            target="_blank"
            rel="noreferrer"
          >
            Bloomberg — OPEC+ to Resume Oil Output Increases as Iran Conflict Rages
          </a>
        </li>
        <li>
          <a
            className="text-blue-600 hover:underline"
            href="https://www.jpmorgan.com/insights/global-research/commodities/oil-price-forecast"
            target="_blank"
            rel="noreferrer"
          >
            J.P. Morgan — Oil Price Forecast for 2026
          </a>
        </li>
        <li>
          <a
            className="text-blue-600 hover:underline"
            href="https://www.cnbc.com/2026/04/01/here-are-3-ways-to-ignite-a-2026-rally-in-beaten-down-bank-stocks.html"
            target="_blank"
            rel="noreferrer"
          >
            CNBC — 3 ways to ignite a 2026 rally in beaten-down bank stocks (2026-04-01)
          </a>
        </li>
        <li>
          <a
            className="text-blue-600 hover:underline"
            href="https://www.cnbc.com/2026/03/18/treasury-yields-move-lower-all-eyes-fed-meeting.html"
            target="_blank"
            rel="noreferrer"
          >
            CNBC — Short-term yields rise after higher-than-expected inflation (2026-03-18)
          </a>
        </li>
        <li>
          <a
            className="text-blue-600 hover:underline"
            href="https://www.spglobal.com/en/research-insights/special-reports/copper-in-the-age-of-ai"
            target="_blank"
            rel="noreferrer"
          >
            S&amp;P Global — Copper in the Age of AI: Challenges of Electrification
          </a>
        </li>
        <li>
          <a
            className="text-blue-600 hover:underline"
            href="https://www.mining.com/goldman-lowers-copper-supply-forecast-on-grasberg-disruption-sees-deficit-in-2025/"
            target="_blank"
            rel="noreferrer"
          >
            MINING.COM — Goldman lowers copper supply forecast on Grasberg disruption
          </a>
        </li>
        <li>
          <a
            className="text-blue-600 hover:underline"
            href="https://www.lseg.com/en/insights/data-analytics/aluminium-copper-rally-fuelled-by-structural-strains-political-uncertainty"
            target="_blank"
            rel="noreferrer"
          >
            LSEG — Aluminium and copper: A rally fuelled by structural strains
          </a>
        </li>
        <li>
          <a
            className="text-blue-600 hover:underline"
            href="https://www.morningstar.com/economy/will-fed-cut-rates-this-year"
            target="_blank"
            rel="noreferrer"
          >
            Morningstar — Fed Rate Cuts in 2026? How an Oil Shock Is Complicating the Outlook
          </a>
        </li>
      </ul>

      <footer className="mt-16 pt-6 border-t border-gray-200 text-xs text-gray-400">
        本文僅為基於 Momentum Portal 量化訊號 +
        公開新聞所做的研究紀錄，不構成任何投資建議。所有數據截至 2026-04-06。
      </footer>
    </main>
  )
}
