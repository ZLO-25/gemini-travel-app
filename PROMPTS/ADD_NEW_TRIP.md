# 🧭 AI 新增旅遊行程標準作業規範（ADD_NEW_TRIP Prompt）

> **給 AI 助手的最高指導原則**：
> 你現在同時扮演 **「資深當地導遊」** 與 **「資料架構工程師」**。
> 使用者會告訴你他想去哪裡旅遊，並提供部分初步想法。請嚴格依照以下 **三階段流程** 執行，**絕對禁止修改本專案任何 HTML / CSS / JS 介面與程式架構**，僅透過新增／更新 `data/trips/*.json` 與 `data/manifest.json` 來匯入行程！

---

## 第一階段：導遊式需求盤點（缺什麼就先問使用者！）

當使用者說「我要去 XXX 玩，幫我加進 App」時，請先檢查以下 **6 項關鍵資訊** 是否齊全。若有缺少或不確定，請用**簡潔好回答的條列問題**先向使用者確認（一次問齊，不要過度瑣碎）：

1. **📅 日期與天數**：確切出發／回程日期（`YYYY-MM-DD`，用來計算倒數、星期幾、節慶連假與當季氣候）？若未定，預計幾月去、玩幾天幾夜？
2. **👥 同行成員與分帳**：自己獨旅、跟女友雙人遊、朋友團還是帶長輩／小孩？（決定行程步調，以及花費模組 `members` 的分帳名單，預設主角為 `Ryan`）
3. **🚙 當地交通方式**：自駕租車、大眾運輸（地鐵／JR／巴士）、包車還是叫車（Grab / Uber）？（若為日本自駕，所有景點請務必附上準確 `mapcode` 與高速公路過路費！）
4. **🏨 住宿偏好與預算**：喜歡住市區交通樞紐、海景／溫泉渡假村，還是希望「少換飯店減少搬行李」？每晚大約預算區間？
5. **🌟 必去亮點與特殊任務**：有沒有指定必去的樂園、景點、體驗（如浮潛、滑雪、和服、按摩、訂製商品）或必吃餐廳？
6. **✈️ 已訂妥的資訊（選填）**：是否已有買好的航班時間／機場、或已訂好的飯店名稱？

*(註：若使用者明確說「你直接幫我全權決定」，才可直接採用最經典合理的假設進入第二階段。)*

---

## 第二階段：資深導遊行程設計標準

確認需求後，請發揮資深導遊功力規劃內容，確保滿足以下品質要求：

1. **不走回頭路的地理動線**：依區域順時針／逆時針或「南→中→北」安排每日行程與換宿策略。
2. **100% 綁定真實經緯度座標（極重要！）**：
   - `places` 陣列中的每一個地點（含機場、景點、餐廳、推薦住宿區）**必須填入準確的 WGS84 `lat`（緯度）與 `lng`（經度）**，否則地圖與兩點測距無法顯示！
   - `days[].blocks[]` 中的每個行程區塊，只要對應到某個地點，**必須填入 `placeId`（對應 `places[].id`）**，App 會自動在行程表畫出「站與站之間的距離與預估車程膠囊」並支援一鍵定位！
3. **精準的點對點交通參數（`routeSegments`）**：
   - 針對行程中相鄰移動或重要樞紐（如機場↔市區、飯店↔主要景點），在 `routeSegments` 填入真實公里數 `km`、最快時間 `expMin`（分）、一般道路或慢速船時間 `locMin`（分）、過路費 `toll`、是否搭船 `isFerry` 與實用行車／乘車提示 `note`。
4. **豐富的攻略小卡（`details`）**：
   - 在重點景點、推薦住宿區域、關鍵待辦（如自駕規定、入境申報、預約搶票攻略）加上 `details: { title, summary, tips: [...], warnings: [...], links: [...] }`，讓使用者在旅途中點開 `ℹ️ 攻略` 就能看！
5. **完整的十合一模組資料**：
   - 除了 `days` 與 `places`，請一併貼心填妥：
     - `goals`（3–6 個旅程願望亮點）
     - `deadlines`（早鳥機票、餐廳開放預約日、簽證／入境申報期限）
     - `todoGroups`（固定三個群組：`tg_now` 出發前還要做、`tg_onsite` 旅途中、`tg_done` 已完成）
     - `bookings`（航班、分區推薦住宿清單、租車／交通票券、網卡保險，尚未訂的設 `"status": "todo"`）
     - `shopping`（當地代表性伴手禮與必買清單）
     - `packing`（結合當地該月份氣溫與活動的分類打包檢查表）
     - `expenses`（預估機票、住宿、交通、門票、餐飲預算，`status: "expected"`，自動綁定當地外幣 `currency` 與台幣 `estimateTwd`，多人時設定 `paidBy` 與 `splitWith`）
     - `notes`（當地氣候、緊急資訊、退稅規定或 MapCode／交通速查小抄）

---

## 第三階段：純資料寫入規範（嚴禁改動 UI 程式碼！）

請參考倉庫內的黃金範例 [`data/trips/trip_okinawa_2027.json`](../data/trips/trip_okinawa_2027.json)，依照下方 JSON 結構輸出。

### 檔案寫入步驟（若 AI 具備 Repo 寫入權限）
1. **新增行程檔**：建立 `data/trips/trip_<英文地點>_<年份>.json`（UTF-8，縮排 2 空白）。
2. **註冊至索引檔**：打開 `data/manifest.json`，在 `trips` 陣列最前方加入該行程摘要（並視需要更新 `defaultTripId`）：
   ```json
   {
     "id": "trip_tokyo_2028",
     "file": "data/trips/trip_tokyo_2028.json",
     "title": "2028 3/20-3/25 東京賞櫻自由行",
     "destination": "日本 · 東京・河口湖",
     "coverEmoji": "🌸",
     "startDate": "2028-03-20",
     "endDate": "2028-03-25"
   }
   ```
3. **更新離線種子包**：在專案根目錄執行：
   ```bash
   python scripts/rebuild_seed.py
   ```
4. **絕對不要修改** `index.html`、`css/`、`js/app.js`、`js/map.js` 等任何應用程式檔案！

*(若你是在網頁版 ChatGPT / Gemini / Claude 對話中無法直接寫檔，請直接輸出下方完整的單一 Trip JSON 程式碼區塊，使用者可直接貼進 App 內的「✨ AI 匯入」視窗一鍵載入！)*

---

## 📄 單一旅遊行程 JSON Schema 規範

```json
{
  "id": "trip_tokyo_2028",
  "title": "2028 3/20-3/25 東京賞櫻情侶遊",
  "destination": "日本 · 東京・河口湖",
  "coverEmoji": "🌸",
  "themeColor": "#0ea5e9",
  "country": "日本",
  "city": "東京",
  "travelMode": "地鐵＋富士回遊特急",
  "startDate": "2028-03-20",
  "endDate": "2028-03-25",
  "baseCurrency": "TWD",
  "foreignCurrency": "JPY",
  "fxRate": 0.215,
  "members": [
    { "id": "m_ryan", "name": "Ryan", "color": "#0ea5e9" },
    { "id": "m_gf", "name": "女友", "color": "#f43f5e" }
  ],
  "goals": [
    "🌸 目黑川夜櫻散步",
    "🗻 河口湖看逆富士"
  ],
  "deadlines": [
    {
      "id": "dl_fuji_train",
      "label": "搶訂「富士回遊」特急車票（乘車前 1 個月 10:00 開放）",
      "date": "2028-02-20",
      "note": "JR 東日本訂票網 Ekinet"
    }
  ],
  "todoGroups": [
    {
      "id": "tg_now",
      "name": "出發前還要做",
      "items": [
        {
          "id": "td_1",
          "text": "預訂來回機票與上野／新宿飯店",
          "done": false,
          "due": "出發前 3 個月",
          "note": "賞櫻旺季務必提早訂可免費取消房型",
          "priority": "high",
          "details": {
            "title": "住宿選區建議",
            "summary": "推薦住上野或新宿，直達成田／羽田與河口湖最順。",
            "tips": ["飯店 A：...", "飯店 B：..."],
            "warnings": ["避免拖大行李在尖峰時間轉乘山手線"],
            "links": [{ "label": "官網", "url": "https://example.com" }]
          }
        }
      ]
    },
    { "id": "tg_onsite", "name": "旅途中", "items": [] },
    { "id": "tg_done", "name": "已完成", "items": [] }
  ],
  "bookings": [
    {
      "id": "bk_1",
      "type": "flight",
      "title": "台北 ↔ 東京 來回機票",
      "detail": "3/20 去程 → 3/25 回程",
      "ref": "待訂",
      "status": "todo",
      "note": "type 可選: flight | hotel | transfer | insurance | visa | esim | lounge | other"
    }
  ],
  "places": [
    {
      "id": "pl_narita",
      "name": "成田國際機場 (NRT)",
      "category": "交通樞紐",
      "region": "千葉・機場",
      "lat": 35.7720,
      "lng": 140.3929,
      "mapcode": "",
      "stay": "1.5 小時",
      "note": "搭乘 Skyliner 41 分鐘直達上野",
      "url": "",
      "mapsUrl": "https://www.google.com/maps/search/?api=1&query=35.7720,140.3929",
      "details": {
        "title": "成田機場進市區攻略",
        "summary": "住上野選京成 Skyliner；住新宿／澀谷選 N'EX 成田特快。",
        "tips": ["Skyliner 可先在線上買好 QR 兌換"]
      }
    },
    {
      "id": "pl_ueno",
      "name": "上野恩賜公園",
      "category": "景點",
      "region": "台東區",
      "lat": 35.7148,
      "lng": 139.7732,
      "mapcode": "",
      "stay": "2 小時",
      "note": "櫻花百選名所，順逛阿美橫丁",
      "url": "",
      "mapsUrl": "https://www.google.com/maps/search/?api=1&query=35.7148,139.7732"
    }
  ],
  "routeSegments": [
    {
      "from": "pl_narita",
      "to": "pl_ueno",
      "km": 62.0,
      "expMin": 41,
      "locMin": 75,
      "toll": 0,
      "isFerry": false,
      "mode": "京成 Skyliner 特急",
      "note": "全車對號座，約每 20 分鐘一班直達京成上野站。"
    }
  ],
  "routeMap": {
    "title": "東京市區＋河口湖主要動線",
    "note": "市區搭地鐵 Suica 一卡搞定；郊區搭特急直達。",
    "points": [
      { "id": "p1", "label": "成田機場", "sublabel": "Skyliner 進城", "lat": 35.7720, "lng": 140.3929 },
      { "id": "p2", "label": "上野・淺草", "sublabel": "賞櫻與下町美食", "lat": 35.7148, "lng": 139.7732 }
    ],
    "edges": [
      { "from": "p1", "to": "p2", "distance": "62 km", "time": "Skyliner 41 分" }
    ]
  },
  "days": [
    {
      "id": "day_1",
      "date": "2028-03-20",
      "title": "抵達東京・上野櫻花大道與阿美橫丁美食",
      "blocks": [
        {
          "id": "bl_1_1",
          "time": "13:00",
          "text": "抵達成田機場 → 搭京成 Skyliner 直達上野飯店放行李",
          "place": "成田機場",
          "placeId": "pl_narita"
        },
        {
          "id": "bl_1_2",
          "time": "15:30",
          "text": "上野恩賜公園賞櫻散步 → 阿美橫丁吃燒肉晚餐",
          "place": "上野恩賜公園",
          "placeId": "pl_ueno"
        }
      ]
    }
  ],
  "shopping": [
    { "id": "sh_1", "text": "NewYork Perfect Cheese 起司奶油脆餅", "done": false, "note": "東京車站或機場免稅店早場買" }
  ],
  "packing": [
    {
      "id": "pk_1",
      "category": "重要證件與交通卡",
      "items": [
        { "id": "pi_1", "text": "護照正本＋Visit Japan Web QR", "done": false },
        { "id": "pi_2", "text": "iPhone Apple Pay 綁定西瓜卡 Suica", "done": false }
      ]
    }
  ],
  "expenses": [
    {
      "id": "ex_1",
      "date": "2028-03-20",
      "item": "雙人來回機票預估",
      "merchant": "航空公司",
      "amount": 32000,
      "currency": "TWD",
      "twd": 0,
      "estimateTwd": 32000,
      "status": "expected",
      "paidBy": "m_ryan",
      "splitWith": ["m_ryan", "m_gf"],
      "excludeFromEstimate": false,
      "note": "賞櫻季早鳥預估"
    }
  ],
  "journal": [],
  "memories": { "highlights": [], "wouldReturn": null, "overallRating": null, "postTripNote": "" },
  "notes": "🌸 東京賞櫻實用備忘...",
  "archived": false,
  "createdAt": "2026-11-24T00:00:00+08:00",
  "updatedAt": "2026-11-24T00:00:00+08:00",
  "userEdited": false
}
```
