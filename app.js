/**
 * KRX ETF Radar - Comprehensive Real-time EDA Dashboard
 * Core Application Logic & Visualizations
 */

// Global State
const state = {
  allEtfs: [],
  filteredEtfs: [],
  updatedAt: null,
  theme: localStorage.getItem('etf_theme') || 'light',
  colorScheme: localStorage.getItem('etf_color_scheme') || 'kr',
  
  // Table & Filter state
  table: {
    currentPage: 1,
    pageSize: 15,
    sortField: 'totalNetAssets',
    sortOrder: 'desc',
    searchQuery: '',
    managerFilter: '',
    typeFilter: '',
    movementFilter: 'all',
    disparityFilter: 'all',
    scaleFilter: 'all',
  },
  
  // Active Tab states
  tabs: {
    managerShareMetric: 'aum', // 'aum' | 'count'
    scatterScale: 'log',       // 'log' | 'linear'
    rankingType: 'aum',        // 'aum' | 'tradingValue' | 'turnover'
    returnPeriod: '1m',        // '1m' | '3m' | '6m' | 'daily'
  },
  
  // Chart instances
  charts: {}
};

// Formatting Utilities
const formatters = {
  number: (num) => (num === null || num === undefined) ? '-' : Number(num).toLocaleString('ko-KR'),
  
  currencyWon: (num) => {
    if (num === null || num === undefined) return '-';
    const n = Number(num);
    if (n >= 1e12) {
      return `${(n / 1e12).toFixed(1)}조 원`;
    } else if (n >= 1e8) {
      return `${(n / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억 원`;
    }
    return `${n.toLocaleString('ko-KR')}원`;
  },
  
  currencyBrief: (num) => {
    if (num === null || num === undefined) return '-';
    const n = Number(num);
    if (n >= 1e12) return `${(n / 1e12).toFixed(2)}조`;
    if (n >= 1e8) return `${(n / 1e8).toFixed(1)}억`;
    return `${n.toLocaleString('ko-KR')}`;
  },
  
  percent: (num, withSign = true) => {
    if (num === null || num === undefined || isNaN(num)) return '-';
    const n = Number(num);
    const sign = withSign && n > 0 ? '+' : '';
    return `${sign}${n.toFixed(2)}%`;
  },
  
  date: (isoStr) => {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('ko-KR', { 
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    } catch {
      return isoStr;
    }
  }
};

// Color Helper based on Active Scheme
function getStockColor(val) {
  const isGlobal = state.colorScheme === 'global';
  if (val > 0) {
    return isGlobal ? '#10b981' : '#ef4444'; // Global: Green, KR: Red
  } else if (val < 0) {
    return isGlobal ? '#ef4444' : '#3b82f6'; // Global: Red, KR: Blue
  }
  return '#94a3b8';
}

function getStockBgColor(val, alpha = 0.15) {
  const isGlobal = state.colorScheme === 'global';
  if (val > 0) {
    return isGlobal ? `rgba(16, 185, 129, ${alpha})` : `rgba(239, 68, 68, ${alpha})`;
  } else if (val < 0) {
    return isGlobal ? `rgba(239, 68, 68, ${alpha})` : `rgba(59, 130, 246, ${alpha})`;
  }
  return `rgba(148, 163, 184, ${alpha})`;
}

// Toast Notification
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Loading Overlay Helper
function setLoading(active, text = '', progress = '') {
  const overlay = document.getElementById('loadingOverlay');
  const textEl = document.getElementById('loadingText');
  const progEl = document.getElementById('loadingProgress');
  
  if (text) textEl.textContent = text;
  if (progress) progEl.textContent = progress;
  
  if (active) {
    overlay.classList.add('active');
  } else {
    overlay.classList.remove('active');
  }
}

// Brand / Issuer Categorization
const BRAND_MAP = [
  { prefix: 'KODEX', brand: 'KODEX', manager: '삼성자산운용' },
  { prefix: 'TIGER', brand: 'TIGER', manager: '미래에셋자산운용' },
  { prefix: 'ACE', brand: 'ACE', manager: '한국투자신탁운용' },
  { prefix: 'RISE', brand: 'RISE', manager: 'KB자산운용' },
  { prefix: 'KBSTAR', brand: 'KBSTAR', manager: 'KB자산운용' },
  { prefix: 'SOL', brand: 'SOL', manager: '신한자산운용' },
  { prefix: 'PLUS', brand: 'PLUS', manager: '한화자산운용' },
  { prefix: 'ARIRANG', brand: 'ARIRANG', manager: '한화자산운용' },
  { prefix: 'HANARO', brand: 'HANARO', manager: 'NH-Amundi자산운용' },
  { prefix: 'WON', brand: 'WON', manager: '우리자산운용' },
  { prefix: 'WOORI', brand: 'WOORI', manager: '우리자산운용' },
  { prefix: 'KIWOOM', brand: 'KIWOOM', manager: '키움투자자산운용' },
  { prefix: '히어로즈', brand: '히어로즈', manager: '키움투자자산운용' },
  { prefix: 'TIMEFOLIO', brand: 'TIMEFOLIO', manager: '타임폴리오자산운용' },
  { prefix: 'TIME', brand: 'TIMEFOLIO', manager: '타임폴리오자산운용' },
  { prefix: 'KoAct', brand: 'KoAct', manager: '삼성액티브자산운용' },
  { prefix: '1Q', brand: '1Q', manager: '하나자산운용' },
  { prefix: 'UNICORN', brand: 'UNICORN', manager: '현대자산운용' },
  { prefix: 'BNK', brand: 'BNK', manager: 'BNK자산운용' },
  { prefix: 'DAISHIN', brand: '대신343', manager: '대신자산운용' },
  { prefix: '대신343', brand: '대신343', manager: '대신자산운용' },
  { prefix: 'KCGI', brand: 'KCGI', manager: 'KCGI자산운용' },
  { prefix: 'IBK', brand: 'IBK', manager: 'IBK자산운용' },
  { prefix: 'TRUSTON', brand: '트러스톤', manager: '트러스톤자산운용' },
  { prefix: '트러스톤', brand: '트러스톤', manager: '트러스톤자산운용' },
  { prefix: '마이티', brand: '마이티', manager: 'DB자산운용' },
  { prefix: 'MIDAS', brand: 'MIDAS', manager: '마이다스에셋자산운용' },
  { prefix: 'TREX', brand: 'TREX', manager: '유진자산운용' },
  { prefix: 'HK', brand: 'HK', manager: '흥국자산운용' },
  { prefix: '에셋플러스', brand: '에셋플러스', manager: '에셋플러스자산운용' },
  { prefix: '파워', brand: '파워', manager: '교보악사자산운용' },
  { prefix: '아이엠에셋', brand: 'iM에셋', manager: 'iM에셋자산운용' },
  { prefix: '더제이', brand: '더제이', manager: '더제이자산운용' },
  { prefix: 'DS', brand: 'DS', manager: '디에스자산운용' },
  { prefix: 'FOCUS', brand: 'FOCUS', manager: '브레인자산운용' },
];

function identifyBrand(itemName = '') {
  const upper = itemName.toUpperCase();
  for (const b of BRAND_MAP) {
    if (upper.startsWith(b.prefix.toUpperCase())) {
      return { brand: b.brand, manager: b.manager };
    }
  }
  return { brand: '기타', manager: '기타 운용사' };
}

// Clean and Normalize Single ETF Item
function normalizeItem(raw) {
  const brandInfo = identifyBrand(raw.itemName || '');
  const curPrice = raw.currentPrice !== undefined && raw.currentPrice !== null ? Number(raw.currentPrice) : null;
  const inav = raw.iNav !== undefined && raw.iNav !== null ? Number(raw.iNav) : null;
  
  let disparity = null;
  if (raw.disparityRate !== undefined && raw.disparityRate !== null) {
    disparity = Number(raw.disparityRate);
  } else if (curPrice && inav && inav > 0) {
    disparity = Number((((curPrice - inav) / inav) * 100).toFixed(2));
  }
  
  const aum = raw.totalNetAssets ? Number(raw.totalNetAssets) : 0;
  const tVal = raw.tradingValue ? Number(raw.tradingValue) : 0;
  const turnover = aum > 0 ? Number(((tVal / aum) * 100).toFixed(2)) : 0;
  
  return {
    itemCode: String(raw.itemCode || ''),
    itemName: String(raw.itemName || ''),
    brand: raw.brand || brandInfo.brand,
    manager: raw.manager || brandInfo.manager,
    etfType: String(raw.etfType || '기타'),
    currentPrice: curPrice,
    changePrice: raw.changePrice !== undefined && raw.changePrice !== null ? Number(raw.changePrice) : 0,
    changeRate: raw.changeRate !== undefined && raw.changeRate !== null ? Number(raw.changeRate) : 0,
    priceMovement: raw.priceMovement || (raw.changeRate > 0 ? 'rising' : raw.changeRate < 0 ? 'falling' : 'steady'),
    tradingVolume: raw.tradingVolume ? Number(raw.tradingVolume) : 0,
    tradingValue: tVal,
    totalNetAssets: aum,
    returnRate1m: raw.returnRate1m !== undefined && raw.returnRate1m !== null ? Number(raw.returnRate1m) : null,
    returnRate3m: raw.returnRate3m !== undefined && raw.returnRate3m !== null ? Number(raw.returnRate3m) : null,
    returnRate6m: raw.returnRate6m !== undefined && raw.returnRate6m !== null ? Number(raw.returnRate6m) : null,
    iNav: inav,
    disparityRate: disparity,
    turnover: turnover
  };
}

// --------------------------------------------------------------------------
// Data Fetching: Hybrid Approach (Direct -> CORS Proxy -> Complete Local Snapshot)
// --------------------------------------------------------------------------

async function fetchFromNaverAPI() {
  setLoading(true, '네이버 증권 실시간 API 호출 중...', '1페이지 수집 시작');
  
  const baseUrl = 'https://stock.naver.com/api/stockSecurity/etfs/v2/domestic?listingType=aumDesc&size=100&index=';
  const proxyList = [
    (url) => url, // direct fetch first
    (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ];
  
  let workingProxyIdx = -1;
  let allItems = [];
  let reportedTotal = 0;
  
  // Test which proxy works on index 0
  for (let pIdx = 0; pIdx < proxyList.length; pIdx++) {
    const testUrl = proxyList[pIdx](`${baseUrl}0`);
    try {
      const res = await fetch(testUrl, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        if (data && data.items && data.items.length > 0) {
          workingProxyIdx = pIdx;
          reportedTotal = Number(data.totalCount || 0);
          allItems.push(...data.items);
          console.log(`Connection successful via strategy #${pIdx}`);
          break;
        }
      }
    } catch (e) {
      console.warn(`Strategy #${pIdx} failed:`, e.message);
    }
  }
  
  if (workingProxyIdx === -1) {
    throw new Error('모든 실시간 API 연결 전략(직접/프록시)이 차단되었습니다. 로컬 전체 스냅샷을 로드합니다.');
  }
  
  // Calculate total pages
  const totalPages = reportedTotal > 0 ? Math.ceil(reportedTotal / 100) : 12;
  
  // Fetch subsequent pages
  for (let idx = 1; idx < totalPages; idx++) {
    const progressPercent = Math.round(((idx + 1) / totalPages) * 100);
    setLoading(true, '실시간 ETF 데이터 페이징 수집 중...', `진행도: ${idx + 1} / ${totalPages} 페이지 (${progressPercent}%)`);
    
    try {
      const pageUrl = proxyList[workingProxyIdx](`${baseUrl}${idx}`);
      const res = await fetch(pageUrl, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json();
        if (data.items && data.items.length > 0) {
          allItems.push(...data.items);
        }
        if (!data.hasNext) break;
      }
    } catch (err) {
      console.warn(`Page ${idx} fetch warning:`, err);
    }
  }
  
  // Strict completeness verification: must not accept partial/truncated dataset (e.g. only 200 items)
  if (reportedTotal > 0 && allItems.length < reportedTotal && allItems.length < 1000) {
    throw new Error(`실시간 수집 종목 수(${allItems.length}개)가 전체 종목(${reportedTotal}개)에 미달하여 전체 스냅샷으로 전환합니다.`);
  }

  return {
    updatedAt: new Date().toISOString(),
    totalCount: allItems.length,
    items: allItems.map(normalizeItem),
    source: workingProxyIdx === 0 ? 'Naver API Direct' : 'Naver API (via CORS Proxy)'
  };
}

async function loadLocalSnapshot() {
  // 1. Try fetching data/etf_data.json
  try {
    const res = await fetch('./data/etf_data.json', { cache: 'no-cache' });
    if (res.ok) {
      const json = await res.json();
      if (json.items && json.items.length >= 1000) {
        return {
          updatedAt: json.updatedAt,
          totalCount: json.items.length,
          items: json.items.map(normalizeItem),
          source: '전체 상장 ETF 스냅샷 (1,171개)'
        };
      }
    }
  } catch (err) {
    console.warn('Failed to fetch data/etf_data.json via HTTP, checking embedded window data...', err);
  }
  
  // 2. Check window.ETF_FALLBACK_DATA (works natively on file:// scheme and guarantees full 1,171 items)
  if (window.ETF_FALLBACK_DATA && window.ETF_FALLBACK_DATA.items && window.ETF_FALLBACK_DATA.items.length > 0) {
    return {
      updatedAt: window.ETF_FALLBACK_DATA.updatedAt,
      totalCount: window.ETF_FALLBACK_DATA.items.length,
      items: window.ETF_FALLBACK_DATA.items.map(normalizeItem),
      source: '전체 상장 ETF 스냅샷 (1,171개)'
    };
  }
  
  throw new Error('로컬 스냅샷 데이터를 찾을 수 없습니다.');
}

async function loadData(forceRealtime = false) {
  setLoading(true, '전체 ETF 데이터 로딩 중...');
  try {
    let result;
    if (forceRealtime) {
      try {
        result = await fetchFromNaverAPI();
        showToast(`실시간 API로부터 전체 ${result.items.length}개 종목을 성공적으로 동기화했습니다!`, 'success');
      } catch (err) {
        console.warn('Realtime fetch failed or incomplete, falling back to complete snapshot:', err);
        showToast(`전체 ETF 분석을 위해 ${err.message}`, 'info');
        result = await loadLocalSnapshot();
      }
    } else {
      // Normal initial load: load local complete snapshot first for instant render
      try {
        result = await loadLocalSnapshot();
      } catch {
        result = await fetchFromNaverAPI();
      }
    }
    
    // GUARANTEE: If loaded dataset is incomplete (e.g. 200 items instead of full universe), force load full fallback
    if (result.items.length < 1000 && window.ETF_FALLBACK_DATA && window.ETF_FALLBACK_DATA.items && window.ETF_FALLBACK_DATA.items.length >= 1000) {
      console.warn(`불완전한 데이터셋(${result.items.length}개) 감지됨: 전체 ${window.ETF_FALLBACK_DATA.items.length}개 전체 종목으로 복원합니다.`);
      result = {
        updatedAt: window.ETF_FALLBACK_DATA.updatedAt,
        totalCount: window.ETF_FALLBACK_DATA.items.length,
        items: window.ETF_FALLBACK_DATA.items.map(normalizeItem),
        source: '전체 상장 ETF 스냅샷 (1,171개)'
      };
    }
    
    state.allEtfs = result.items;
    state.updatedAt = result.updatedAt;
    
    // Update Header Status
    const syncBadgeText = document.getElementById('syncStatusText');
    syncBadgeText.textContent = `${result.source} (${result.items.length} 종목)`;
    
    populateFilterDropdowns();
    applyFilters();
    updateKpis();
    renderAllCharts();
    renderOutlierList();
    
    setLoading(false);
  } catch (err) {
    console.error('Fatal load error:', err);
    setLoading(false);
    showToast(`데이터 로딩 실패: ${err.message}`, 'error');
  }
}

// --------------------------------------------------------------------------
// KPI Summary Metrics Calculation
// --------------------------------------------------------------------------

function updateKpis() {
  const items = state.allEtfs;
  if (!items || items.length === 0) return;
  
  const totalCount = items.length;
  const risingCount = items.filter(i => i.changeRate > 0).length;
  const fallingCount = items.filter(i => i.changeRate < 0).length;
  const steadyCount = items.filter(i => i.changeRate === 0).length;
  
  const totalAum = items.reduce((acc, i) => acc + (i.totalNetAssets || 0), 0);
  const avgAum = totalAum / totalCount;
  
  const totalTradingVal = items.reduce((acc, i) => acc + (i.tradingValue || 0), 0);
  const turnoverRatio = totalAum > 0 ? (totalTradingVal / totalAum) * 100 : 0;
  
  const validChangeRates = items.map(i => i.changeRate).filter(r => r !== null && !isNaN(r));
  const avgChangeRate = validChangeRates.length > 0 
    ? validChangeRates.reduce((a, b) => a + b, 0) / validChangeRates.length 
    : 0;
    
  const validDisparities = items.map(i => i.disparityRate).filter(d => d !== null && !isNaN(d) && Math.abs(d) < 100);
  const avgDisparity = validDisparities.length > 0 
    ? validDisparities.reduce((a, b) => a + b, 0) / validDisparities.length 
    : 0;
  const disparityOutlierCount = items.filter(i => i.disparityRate !== null && Math.abs(i.disparityRate) >= 1.0).length;
  
  // Manager Share
  const mgrAumMap = {};
  items.forEach(i => {
    mgrAumMap[i.manager] = (mgrAumMap[i.manager] || 0) + i.totalNetAssets;
  });
  const topManagerEntry = Object.entries(mgrAumMap).sort((a, b) => b[1] - a[1])[0];
  const topManagerName = topManagerEntry ? topManagerEntry[0] : '-';
  const topManagerShare = topManagerEntry ? (topManagerEntry[1] / totalAum) * 100 : 0;

  // DOM Updates
  document.getElementById('kpiTotalCount').textContent = `${totalCount.toLocaleString('ko-KR')}개`;
  document.getElementById('kpiMovementRatio').innerHTML = `
    <span class="val-up">상승 ${risingCount}</span> • 
    <span class="val-down">하락 ${fallingCount}</span> • 
    <span class="val-steady">보합 ${steadyCount}</span>
  `;
  
  document.getElementById('kpiTotalAum').textContent = formatters.currencyWon(totalAum);
  document.getElementById('kpiAvgAum').textContent = `종목당 평균 ${formatters.currencyWon(avgAum)}`;
  
  document.getElementById('kpiTotalTradingVal').textContent = formatters.currencyWon(totalTradingVal);
  document.getElementById('kpiTradingAumRatio').textContent = `일일 자산 회전율: ${turnoverRatio.toFixed(2)}%`;
  
  const avgReturnEl = document.getElementById('kpiAvgChangeRate');
  avgReturnEl.textContent = formatters.percent(avgChangeRate);
  avgReturnEl.className = `kpi-value ${avgChangeRate > 0 ? 'val-up' : avgChangeRate < 0 ? 'val-down' : 'val-steady'}`;
  
  const sentimentText = risingCount > fallingCount ? '상승 우세 (Bull)' : risingCount < fallingCount ? '하락 우세 (Bear)' : '균형 (Neutral)';
  document.getElementById('kpiMarketSentiment').textContent = `시장 심리: ${sentimentText}`;
  
  document.getElementById('kpiAvgDisparity').textContent = formatters.percent(avgDisparity, false);
  document.getElementById('kpiDisparityOutliers').textContent = `괴리율 ±1% 초과: ${disparityOutlierCount}건`;
  
  document.getElementById('kpiTopManager').textContent = topManagerName;
  document.getElementById('kpiTopManagerShare').textContent = `AUM 점유율: ${topManagerShare.toFixed(1)}% (${formatters.currencyBrief(topManagerEntry[1])})`;

  // Section 5 dynamic count synchronization
  const sec5Desc = document.getElementById('section5DescCount');
  if (sec5Desc) {
    sec5Desc.textContent = `${totalCount.toLocaleString('ko-KR')}개 전종목`;
  }
}

// --------------------------------------------------------------------------
// SECTION 1: Manager Share & Asset Category Visualizations
// --------------------------------------------------------------------------

function renderManagerShareChart() {
  const ctx = document.getElementById('chartManagerShare').getContext('2d');
  const metric = state.tabs.managerShareMetric; // 'aum' | 'count'
  const items = state.allEtfs;
  
  const mgrAgg = {};
  items.forEach(it => {
    if (!mgrAgg[it.manager]) {
      mgrAgg[it.manager] = { aum: 0, count: 0 };
    }
    mgrAgg[it.manager].aum += it.totalNetAssets;
    mgrAgg[it.manager].count += 1;
  });
  
  const sorted = Object.entries(mgrAgg).sort((a, b) => b[1][metric] - a[1][metric]);
  const topN = sorted.slice(0, 7);
  const others = sorted.slice(7);
  
  const othersVal = others.reduce((acc, curr) => acc + curr[1][metric], 0);
  
  const labels = topN.map(e => e[0]);
  const data = topN.map(e => e[1][metric]);
  if (othersVal > 0) {
    labels.push('기타 운용사');
    data.push(othersVal);
  }
  
  const palette = [
    '#2563eb', '#3b82f6', '#60a5fa', '#0ea5e9', 
    '#10b981', '#f59e0b', '#8b5cf6', '#94a3b8'
  ];
  
  if (state.charts.managerShare) state.charts.managerShare.destroy();
  
  state.charts.managerShare = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: palette,
        borderWidth: 2,
        borderColor: state.theme === 'dark' ? '#151d30' : '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            boxWidth: 12,
            font: { size: 11 },
            color: state.theme === 'dark' ? '#cbd5e1' : '#475569'
          }
        },
        tooltip: {
          callbacks: {
            label: (item) => {
              const total = data.reduce((a, b) => a + b, 0);
              const val = item.raw;
              const pct = ((val / total) * 100).toFixed(1);
              if (metric === 'aum') {
                return ` ${item.label}: ${formatters.currencyWon(val)} (${pct}%)`;
              }
              return ` ${item.label}: ${val}개 (${pct}%)`;
            }
          }
        }
      },
      cutout: '62%'
    }
  });
  
  // Insight summary text
  const totalVal = data.reduce((a, b) => a + b, 0);
  const top1Share = ((data[0] / totalVal) * 100).toFixed(1);
  const top2Share = ((data[1] / totalVal) * 100).toFixed(1);
  const combinedTop2 = (Number(top1Share) + Number(top2Share)).toFixed(1);
  
  const insightEl = document.getElementById('insightManagerShare');
  insightEl.innerHTML = `
    <strong>전체 ${items.length}개 종목 운용사 과점 분석:</strong> ${labels[0]}(${top1Share}%)와 ${labels[1]}(${top2Share}%) 상위 2개 운용사가 전체 ${metric === 'aum' ? 'AUM' : '종목 수'}의 <strong>${combinedTop2}%</strong>를 과점하고 있습니다.
  `;
}

function renderAssetTypeChart() {
  const ctx = document.getElementById('chartAssetType').getContext('2d');
  const items = state.allEtfs;
  
  // Categorize etfType
  const typeMap = {
    '국내주식': { aum: 0, count: 0 },
    '해외주식': { aum: 0, count: 0 },
    '국내채권': { aum: 0, count: 0 },
    '해외채권': { aum: 0, count: 0 },
    '파생/레버리지': { aum: 0, count: 0 },
    '혼합/기타': { aum: 0, count: 0 },
  };
  
  items.forEach(it => {
    const t = it.etfType || '';
    let category = '혼합/기타';
    if (t.includes('파생') || t.includes('레버리지') || t.includes('인버스')) {
      category = '파생/레버리지';
    } else if (t.includes('국내주식') || (t.includes('국내') && t.includes('주식'))) {
      category = '국내주식';
    } else if (t.includes('해외주식') || (t.includes('해외') && t.includes('주식'))) {
      category = '해외주식';
    } else if (t.includes('국내채권') || (t.includes('국내') && t.includes('채권'))) {
      category = '국내채권';
    } else if (t.includes('해외채권') || (t.includes('해외') && t.includes('채권'))) {
      category = '해외채권';
    }
    
    typeMap[category].aum += it.totalNetAssets;
    typeMap[category].count += 1;
  });
  
  const sortedTypes = Object.entries(typeMap).sort((a, b) => b[1].aum - a[1].aum);
  const labels = sortedTypes.map(e => e[0]);
  const aumData = sortedTypes.map(e => Math.round(e[1].aum / 1e12 * 10) / 10); // in 조원
  
  if (state.charts.assetType) state.charts.assetType.destroy();
  
  state.charts.assetType = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'AUM (조원)',
        data: aumData,
        backgroundColor: '#3b82f6',
        borderRadius: 4,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => {
              const raw = sortedTypes[item.dataIndex][1];
              return ` 순자산: ${item.raw}조 원 (${raw.count}개 종목)`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: state.theme === 'dark' ? '#1f2937' : '#f1f5f9' },
          ticks: { color: state.theme === 'dark' ? '#94a3b8' : '#64748b' }
        },
        y: {
          grid: { display: false },
          ticks: { color: state.theme === 'dark' ? '#cbd5e1' : '#334155' }
        }
      }
    }
  });
  
  const insightEl = document.getElementById('insightAssetType');
  insightEl.innerHTML = `
    <strong>자산군 현황 (전체 ${items.length}개):</strong> <strong>${labels[0]}</strong> 유형이 약 ${aumData[0]}조 원으로 가장 큰 규모를 형성하며, 해외주식 및 채권형 ETF의 빠른 성장세가 확인됩니다.
  `;
}

// --------------------------------------------------------------------------
// SECTION 2: Liquidity & Scale (Scatter & Top 10 Ranking)
// --------------------------------------------------------------------------

function renderLiquidityScatterChart() {
  const ctx = document.getElementById('chartLiquidityScatter').getContext('2d');
  const isLog = state.tabs.scatterScale === 'log';
  const items = state.allEtfs;
  
  // Transform to scatter points: X: AUM(억원), Y: TradingValue(억원)
  const scatterPoints = items
    .filter(i => i.totalNetAssets > 0 && i.tradingValue > 0)
    .map(i => {
      const aumEok = i.totalNetAssets / 1e8;
      const tValEok = i.tradingValue / 1e8;
      return {
        x: isLog ? Math.max(1, aumEok) : aumEok,
        y: isLog ? Math.max(0.1, tValEok) : tValEok,
        item: i
      };
    });
    
  if (state.charts.liquidityScatter) state.charts.liquidityScatter.destroy();
  
  state.charts.liquidityScatter = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'ETF 종목',
        data: scatterPoints,
        backgroundColor: scatterPoints.map(p => getStockBgColor(p.item.changeRate, 0.6)),
        borderColor: scatterPoints.map(p => getStockColor(p.item.changeRate)),
        borderWidth: 1,
        pointRadius: 4,
        pointHoverRadius: 7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => {
              const it = items[0].raw.item;
              return `${it.itemName} (${it.itemCode})`;
            },
            label: (pt) => {
              const it = pt.raw.item;
              return [
                ` 운용사: ${it.manager} [${it.etfType}]`,
                ` 순자산(AUM): ${formatters.currencyWon(it.totalNetAssets)}`,
                ` 당일 거래대금: ${formatters.currencyWon(it.tradingValue)}`,
                ` 당일 등락률: ${formatters.percent(it.changeRate)}`,
                ` iNAV 괴리율: ${formatters.percent(it.disparityRate, false)}`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          type: isLog ? 'logarithmic' : 'linear',
          title: {
            display: true,
            text: isLog ? '순자산총액 AUM (억원, 로그 스케일)' : '순자산총액 AUM (억원)',
            color: state.theme === 'dark' ? '#94a3b8' : '#64748b'
          },
          grid: { color: state.theme === 'dark' ? '#1f2937' : '#f1f5f9' },
          ticks: { color: state.theme === 'dark' ? '#94a3b8' : '#64748b' }
        },
        y: {
          type: isLog ? 'logarithmic' : 'linear',
          title: {
            display: true,
            text: isLog ? '일일 거래대금 (억원, 로그 스케일)' : '일일 거래대금 (억원)',
            color: state.theme === 'dark' ? '#94a3b8' : '#64748b'
          },
          grid: { color: state.theme === 'dark' ? '#1f2937' : '#f1f5f9' },
          ticks: { color: state.theme === 'dark' ? '#94a3b8' : '#64748b' }
        }
      }
    }
  });
  
  const insightEl = document.getElementById('insightScatter');
  insightEl.innerHTML = `
    <strong>전체 ${items.length}개 유동성 산점도 분석:</strong> 우상단(고AUM & 고거래대금)에 위치한 대표지수(KODEX 200, TIGER 미국S&P500 등)로 거래대금이 극단적으로 쏠리는 반면, 좌하단 종목들은 거래 부진으로 LP 호가 스프레드 확대 위험이 있습니다.
  `;
}

function renderTop10RankingChart() {
  const ctx = document.getElementById('chartTop10Ranking').getContext('2d');
  const type = state.tabs.rankingType; // 'aum' | 'tradingValue' | 'turnover'
  const items = state.allEtfs;
  
  let filteredList = [...items];
  let sortKey = 'totalNetAssets';
  let unitLabel = '억원';
  let titleText = '순자산총액(AUM) Top 10 종목';
  
  if (type === 'tradingValue') {
    sortKey = 'tradingValue';
    titleText = '당일 거래대금 Top 10 종목';
  } else if (type === 'turnover') {
    // Filter AUM >= 100억 to avoid distorting micro-caps with trivial volume
    filteredList = filteredList.filter(i => i.totalNetAssets >= 100 * 1e8);
    sortKey = 'turnover';
    unitLabel = '%';
    titleText = '유동성 회전율 Top 10 종목 (AUM 100억 이상)';
  }
  
  document.getElementById('rankingChartTitle').textContent = titleText;
  
  const top10 = filteredList.sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0)).slice(0, 10);
  
  const labels = top10.map(i => i.itemName.length > 15 ? i.itemName.slice(0, 15) + '…' : i.itemName);
  const values = top10.map(i => {
    if (type === 'turnover') return i.turnover;
    return Math.round((i[sortKey] || 0) / 1e8);
  });
  
  if (state.charts.top10Ranking) state.charts.top10Ranking.destroy();
  
  state.charts.top10Ranking = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: unitLabel,
        data: values,
        backgroundColor: '#2563eb',
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => {
              const it = top10[items[0].dataIndex];
              return `${it.itemName} (${it.itemCode})`;
            },
            label: (item) => {
              const it = top10[item.dataIndex];
              if (type === 'turnover') {
                return ` 회전율: ${item.raw}% (거래대금: ${formatters.currencyWon(it.tradingValue)})`;
              }
              return ` ${sortKey === 'totalNetAssets' ? 'AUM' : '거래대금'}: ${formatters.currencyWon(it[sortKey])}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: state.theme === 'dark' ? '#1f2937' : '#f1f5f9' },
          ticks: { color: state.theme === 'dark' ? '#94a3b8' : '#64748b' }
        },
        y: {
          grid: { display: false },
          ticks: { color: state.theme === 'dark' ? '#cbd5e1' : '#334155' }
        }
      }
    }
  });
  
  const insightEl = document.getElementById('insightRanking');
  const top1Item = top10[0];
  insightEl.innerHTML = `
    <strong>전체 ${items.length}개 중 랭킹 1위:</strong> <strong>${top1Item.itemName}</strong> (${type === 'turnover' ? `회전율 ${top1Item.turnover}%` : formatters.currencyWon(top1Item[sortKey])})가 압도적인 1위를 차지하고 있습니다.
  `;
}

// --------------------------------------------------------------------------
// SECTION 3: Multi-Period Return Distribution & Extremes
// --------------------------------------------------------------------------

function renderReturnHistogramChart() {
  const ctx = document.getElementById('chartReturnHistogram').getContext('2d');
  const period = state.tabs.returnPeriod; // '1m' | '3m' | '6m' | 'daily'
  const items = state.allEtfs;
  
  let key = 'returnRate1m';
  let title = '1개월 수익률 빈도 분포';
  if (period === '3m') { key = 'returnRate3m'; title = '3개월 수익률 빈도 분포'; }
  else if (period === '6m') { key = 'returnRate6m'; title = '6개월 수익률 빈도 분포'; }
  else if (period === 'daily') { key = 'changeRate'; title = '당일 등락률 빈도 분포'; }
  
  document.getElementById('histChartTitle').textContent = `${title} (히스토그램)`;
  
  const validRates = items.map(i => i[key]).filter(v => v !== null && !isNaN(v));
  
  // Bins for returns
  let bins = [];
  if (period === 'daily') {
    bins = [
      { label: '< -3%', min: -Infinity, max: -3, count: 0 },
      { label: '-3% ~ -1.5%', min: -3, max: -1.5, count: 0 },
      { label: '-1.5% ~ 0%', min: -1.5, max: 0, count: 0 },
      { label: '0% ~ +1.5%', min: 0, max: 1.5, count: 0 },
      { label: '+1.5% ~ +3%', min: 1.5, max: 3, count: 0 },
      { label: '> +3%', min: 3, max: Infinity, count: 0 },
    ];
  } else {
    bins = [
      { label: '< -20%', min: -Infinity, max: -20, count: 0 },
      { label: '-20% ~ -10%', min: -20, max: -10, count: 0 },
      { label: '-10% ~ 0%', min: -10, max: 0, count: 0 },
      { label: '0% ~ +10%', min: 0, max: 10, count: 0 },
      { label: '+10% ~ +20%', min: 10, max: 20, count: 0 },
      { label: '> +20%', min: 20, max: Infinity, count: 0 },
    ];
  }
  
  validRates.forEach(r => {
    for (const b of bins) {
      if (r >= b.min && r < b.max) {
        b.count++;
        break;
      }
    }
  });
  
  const bgColors = bins.map(b => {
    if (b.max <= 0) return getStockBgColor(-1, 0.75);
    if (b.min >= 0) return getStockBgColor(1, 0.75);
    return '#94a3b8';
  });
  
  if (state.charts.returnHistogram) state.charts.returnHistogram.destroy();
  
  state.charts.returnHistogram = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: bins.map(b => b.label),
      datasets: [{
        label: '종목 수',
        data: bins.map(b => b.count),
        backgroundColor: bgColors,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => ` ${item.raw}개 종목 (${((item.raw / validRates.length) * 100).toFixed(1)}%)`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: state.theme === 'dark' ? '#cbd5e1' : '#334155' }
        },
        y: {
          grid: { color: state.theme === 'dark' ? '#1f2937' : '#f1f5f9' },
          ticks: { color: state.theme === 'dark' ? '#94a3b8' : '#64748b' }
        }
      }
    }
  });
  
  const avg = validRates.reduce((a, b) => a + b, 0) / (validRates.length || 1);
  const positiveCount = validRates.filter(r => r > 0).length;
  const posRate = ((positiveCount / (validRates.length || 1)) * 100).toFixed(1);
  
  const insightEl = document.getElementById('insightHistogram');
  insightEl.innerHTML = `
    <strong>전체 ${validRates.length}개 유효 수익률 분포:</strong> 평균 수익률은 <strong>${formatters.percent(avg)}</strong>이며, 플러스 수익률 종목 비율은 <strong>${posRate}%</strong>입니다.
  `;
}

function renderReturnExtremesChart() {
  const ctx = document.getElementById('chartReturnExtremes').getContext('2d');
  const period = state.tabs.returnPeriod;
  const items = state.allEtfs;
  
  let key = 'returnRate1m';
  let periodLabel = '1개월';
  if (period === '3m') { key = 'returnRate3m'; periodLabel = '3개월'; }
  else if (period === '6m') { key = 'returnRate6m'; periodLabel = '6개월'; }
  else if (period === 'daily') { key = 'changeRate'; periodLabel = '당일'; }
  
  document.getElementById('performanceRankingTitle').textContent = `${periodLabel} 최고 & 최저 성과 Top 7`;
  
  const validItems = items.filter(i => i[key] !== null && !isNaN(i[key]));
  
  const top7 = [...validItems].sort((a, b) => b[key] - a[key]).slice(0, 7);
  const bottom7 = [...validItems].sort((a, b) => a[key] - b[key]).slice(0, 7).reverse();
  
  const combined = [...bottom7, ...top7];
  const labels = combined.map(i => i.itemName.length > 14 ? i.itemName.slice(0, 14) + '…' : i.itemName);
  const data = combined.map(i => i[key]);
  const colors = data.map(v => getStockColor(v));
  
  if (state.charts.returnExtremes) state.charts.returnExtremes.destroy();
  
  state.charts.returnExtremes = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: `${periodLabel} 수익률 (%)`,
        data: data,
        backgroundColor: colors,
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => {
              const it = combined[items[0].dataIndex];
              return `${it.itemName} (${it.itemCode})`;
            },
            label: (item) => ` ${periodLabel} 수익률: ${formatters.percent(item.raw)} (AUM: ${formatters.currencyWon(combined[item.dataIndex].totalNetAssets)})`
          }
        }
      },
      scales: {
        x: {
          grid: { color: state.theme === 'dark' ? '#1f2937' : '#f1f5f9' },
          ticks: { color: state.theme === 'dark' ? '#94a3b8' : '#64748b' }
        },
        y: {
          grid: { display: false },
          ticks: { color: state.theme === 'dark' ? '#cbd5e1' : '#334155' }
        }
      }
    }
  });
  
  const insightEl = document.getElementById('insightExtremes');
  const best = top7[0];
  const worst = bottom7[0];
  insightEl.innerHTML = `
    <strong>극단 수익률 격차:</strong> 최고 성과는 <strong>${best ? best.itemName : '-'}</strong> (${best ? formatters.percent(best[key]) : '-'}), 최저는 <strong>${worst ? worst.itemName : '-'}</strong> (${worst ? formatters.percent(worst[key]) : '-'})로 극심한 성과 양극화가 나타납니다.
  `;
}

// --------------------------------------------------------------------------
// SECTION 4: Disparity & Risk Diagnostics
// --------------------------------------------------------------------------

function renderDisparityDistChart() {
  const ctx = document.getElementById('chartDisparityDist').getContext('2d');
  const items = state.allEtfs;
  
  let normal = 0;    // -1% <= disp <= 1%
  let warning = 0;   // 1% < |disp| <= 2%
  let danger = 0;    // |disp| > 2%
  
  items.forEach(it => {
    if (it.disparityRate === null || isNaN(it.disparityRate)) return;
    const absD = Math.abs(it.disparityRate);
    if (absD <= 1.0) normal++;
    else if (absD <= 2.0) warning++;
    else danger++;
  });
  
  if (state.charts.disparityDist) state.charts.disparityDist.destroy();
  
  state.charts.disparityDist = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['정상 (±1.0% 이내)', '주의 (±1.0%~2.0%)', '위험 (±2.0% 초과)'],
      datasets: [{
        data: [normal, warning, danger],
        backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
        borderWidth: 2,
        borderColor: state.theme === 'dark' ? '#151d30' : '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 10,
            font: { size: 11 },
            color: state.theme === 'dark' ? '#cbd5e1' : '#475569'
          }
        },
        tooltip: {
          callbacks: {
            label: (item) => {
              const total = normal + warning + danger;
              return ` ${item.label}: ${item.raw}개 (${((item.raw / total) * 100).toFixed(1)}%)`;
            }
          }
        }
      },
      cutout: '60%'
    }
  });
  
  const insightEl = document.getElementById('insightDisparityDist');
  insightEl.innerHTML = `
    <strong>전체 ${items.length}개 괴리율 안전성:</strong> 전체 종목의 <strong>${(((normal) / (normal + warning + danger)) * 100).toFixed(1)}%</strong>가 정상 범위(±1% 이내)에서 순항 중이나, <strong>${danger}개</strong> 종목은 ±2% 초과 위험 상태입니다.
  `;
}

function renderPriceMovementPieChart() {
  const ctx = document.getElementById('chartPriceMovementPie').getContext('2d');
  const items = state.allEtfs;
  
  const rising = items.filter(i => i.changeRate > 0).length;
  const falling = items.filter(i => i.changeRate < 0).length;
  const steady = items.filter(i => i.changeRate === 0).length;
  
  if (state.charts.priceMovementPie) state.charts.priceMovementPie.destroy();
  
  state.charts.priceMovementPie = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: ['상승 종목', '하락 종목', '보합'],
      datasets: [{
        data: [rising, falling, steady],
        backgroundColor: [
          getStockColor(1),
          getStockColor(-1),
          '#94a3b8'
        ],
        borderWidth: 2,
        borderColor: state.theme === 'dark' ? '#151d30' : '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 10,
            font: { size: 11 },
            color: state.theme === 'dark' ? '#cbd5e1' : '#475569'
          }
        },
        tooltip: {
          callbacks: {
            label: (item) => {
              const total = rising + falling + steady;
              return ` ${item.label}: ${item.raw}개 (${((item.raw / total) * 100).toFixed(1)}%)`;
            }
          }
        }
      }
    }
  });
  
  const insightEl = document.getElementById('insightMovement');
  insightEl.innerHTML = `
    <strong>당일 수급 심리 (전체 ${items.length}개):</strong> 상승(${rising}) 대 하락(${falling}) 비율로 시장 참여자들의 심리적 편향을 가늠할 수 있습니다.
  `;
}

function renderOutlierList() {
  const container = document.getElementById('outlierList');
  const items = state.allEtfs;
  
  // Sort by absolute disparity descending
  const outliers = [...items]
    .filter(i => i.disparityRate !== null && !isNaN(i.disparityRate))
    .sort((a, b) => Math.abs(b.disparityRate) - Math.abs(a.disparityRate))
    .slice(0, 6);
    
  container.innerHTML = '';
  
  outliers.forEach(it => {
    const el = document.createElement('div');
    el.className = 'outlier-item';
    el.style.cursor = 'pointer';
    el.onclick = () => openModal(it);
    
    const isExtreme = Math.abs(it.disparityRate) >= 10.0;
    const dispColor = isExtreme ? 'var(--color-danger)' : it.disparityRate > 0 ? 'var(--color-up)' : 'var(--color-down)';
    
    el.innerHTML = `
      <div class="outlier-info">
        <div class="outlier-name">
          <span>${it.itemName}</span>
          ${isExtreme ? '<span style="font-size: 10px; background: #fee2e2; color: #dc2626; padding: 1px 5px; border-radius: 4px; font-weight: 700;">추종장애</span>' : ''}
        </div>
        <div class="outlier-code">${it.itemCode} • 현재가 ${formatters.number(it.currentPrice)}원 / iNAV ${formatters.number(it.iNav)}</div>
      </div>
      <div class="outlier-disparity" style="color: ${dispColor}">
        ${formatters.percent(it.disparityRate)}
      </div>
    `;
    container.appendChild(el);
  });
}

function renderAllCharts() {
  renderManagerShareChart();
  renderAssetTypeChart();
  renderLiquidityScatterChart();
  renderTop10RankingChart();
  renderReturnHistogramChart();
  renderReturnExtremesChart();
  renderDisparityDistChart();
  renderPriceMovementPieChart();
}

// --------------------------------------------------------------------------
// SECTION 5: Interactive Table, Filtering, Sorting & Pagination
// --------------------------------------------------------------------------

function populateFilterDropdowns() {
  const items = state.allEtfs;
  
  // Managers
  const managers = Array.from(new Set(items.map(i => i.manager).filter(Boolean))).sort();
  const mgrSelect = document.getElementById('managerFilter');
  mgrSelect.innerHTML = '<option value="">모든 운용사 (전체)</option>';
  managers.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = `${m} (${items.filter(i => i.manager === m).length})`;
    mgrSelect.appendChild(opt);
  });
  
  // Types
  const types = Array.from(new Set(items.map(i => i.etfType).filter(Boolean))).sort();
  const typeSelect = document.getElementById('typeFilter');
  typeSelect.innerHTML = '<option value="">모든 자산 유형 (전체)</option>';
  types.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = `${t} (${items.filter(i => i.etfType === t).length})`;
    typeSelect.appendChild(opt);
  });
}

function applyFilters() {
  const { searchQuery, managerFilter, typeFilter, movementFilter, disparityFilter, scaleFilter } = state.table;
  const q = searchQuery.trim().toLowerCase();
  
  state.filteredEtfs = state.allEtfs.filter(it => {
    // Search query
    if (q) {
      const matchName = it.itemName.toLowerCase().includes(q);
      const matchCode = it.itemCode.toLowerCase().includes(q);
      if (!matchName && !matchCode) return false;
    }
    
    // Manager
    if (managerFilter && it.manager !== managerFilter) return false;
    
    // Type
    if (typeFilter && it.etfType !== typeFilter) return false;
    
    // Movement
    if (movementFilter === 'rising' && it.changeRate <= 0) return false;
    if (movementFilter === 'falling' && it.changeRate >= 0) return false;
    if (movementFilter === 'steady' && it.changeRate !== 0) return false;
    
    // Disparity
    if (it.disparityRate !== null && !isNaN(it.disparityRate)) {
      const absD = Math.abs(it.disparityRate);
      if (disparityFilter === 'normal' && absD > 1.0) return false;
      if (disparityFilter === 'warning' && absD <= 1.0) return false;
      if (disparityFilter === 'danger' && absD <= 3.0) return false;
    }
    
    // Scale
    if (scaleFilter === 'mega' && it.totalNetAssets < 1e12) return false;
    if (scaleFilter === 'large' && it.totalNetAssets < 1000 * 1e8) return false;
    if (scaleFilter === 'liquid' && it.tradingValue < 100 * 1e8) return false;
    
    return true;
  });
  
  // Sort
  applySorting();
  
  // Reset to page 1
  state.table.currentPage = 1;
  renderTable();
}

function applySorting() {
  const { sortField, sortOrder } = state.table;
  const isAsc = sortOrder === 'asc';
  
  state.filteredEtfs.sort((a, b) => {
    let valA = a[sortField];
    let valB = b[sortField];
    
    if (valA === null || valA === undefined) return 1;
    if (valB === null || valB === undefined) return -1;
    
    if (typeof valA === 'string') {
      return isAsc ? valA.localeCompare(valB, 'ko') : valB.localeCompare(valA, 'ko');
    }
    return isAsc ? valA - valB : valB - valA;
  });
}

function renderTable() {
  const tbody = document.getElementById('etfTableBody');
  tbody.innerHTML = '';
  
  const { currentPage, pageSize } = state.table;
  const total = state.filteredEtfs.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  
  const startIdx = (currentPage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, total);
  const pageItems = state.filteredEtfs.slice(startIdx, endIdx);
  
  if (pageItems.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `<td colspan="14" style="text-align: center; padding: 40px; color: var(--text-muted);">조건에 일치하는 ETF 종목이 없습니다.</td>`;
    tbody.appendChild(emptyRow);
  } else {
    pageItems.forEach(it => {
      const tr = document.createElement('tr');
      
      const changeClass = it.changeRate > 0 ? 'val-up' : it.changeRate < 0 ? 'val-down' : 'val-steady';
      const dispClass = Math.abs(it.disparityRate) > 2.0 ? 'val-down' : Math.abs(it.disparityRate) > 1.0 ? 'val-up' : 'val-steady';
      
      tr.innerHTML = `
        <td class="text-center" style="font-family: monospace; font-weight: 600; color: var(--text-muted);">${it.itemCode}</td>
        <td>
          <a href="https://finance.naver.com/item/main.naver?code=${it.itemCode}" target="_blank" rel="noopener" style="font-weight: 600; color: var(--text-primary); text-decoration: none;" title="네이버 증권 상세">
            ${it.itemName}
          </a>
        </td>
        <td><span class="badge-brand">${it.brand}</span></td>
        <td style="color: var(--text-secondary); font-size: 12px;">${it.etfType}</td>
        <td class="text-right" style="font-weight: 700;">${formatters.number(it.currentPrice)}</td>
        <td class="text-right ${changeClass}">${formatters.percent(it.changeRate)}</td>
        <td class="text-right" style="color: var(--text-secondary);">${formatters.currencyBrief(it.tradingValue)}</td>
        <td class="text-right" style="font-weight: 700;">${formatters.currencyWon(it.totalNetAssets)}</td>
        <td class="text-right" style="color: var(--text-muted);">${formatters.number(it.iNav)}</td>
        <td class="text-right ${dispClass}">${formatters.percent(it.disparityRate, false)}</td>
        <td class="text-right ${it.returnRate1m > 0 ? 'val-up' : it.returnRate1m < 0 ? 'val-down' : 'val-steady'}">${formatters.percent(it.returnRate1m)}</td>
        <td class="text-right ${it.returnRate3m > 0 ? 'val-up' : it.returnRate3m < 0 ? 'val-down' : 'val-steady'}">${formatters.percent(it.returnRate3m)}</td>
        <td class="text-right ${it.returnRate6m > 0 ? 'val-up' : it.returnRate6m < 0 ? 'val-down' : 'val-steady'}">${formatters.percent(it.returnRate6m)}</td>
        <td class="text-center">
          <button class="btn btn-outline" style="padding: 3px 8px; font-size: 11px;" onclick='openModalByCode("${it.itemCode}")'>진단</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }
  
  // Update Page Info & Pagination Controls
  document.getElementById('tablePageInfo').textContent = `검색 결과: 총 ${total.toLocaleString('ko-KR')}개 종목 중 ${total > 0 ? startIdx + 1 : 0} - ${endIdx} 표시`;
  renderPaginationControls(totalPages);
}

function renderPaginationControls(totalPages) {
  const container = document.getElementById('pageControls');
  container.innerHTML = '';
  
  const current = state.table.currentPage;
  
  // Prev button
  const prevBtn = document.createElement('button');
  prevBtn.className = 'page-btn';
  prevBtn.innerHTML = '‹';
  prevBtn.disabled = current <= 1;
  prevBtn.onclick = () => {
    if (state.table.currentPage > 1) {
      state.table.currentPage--;
      renderTable();
    }
  };
  container.appendChild(prevBtn);
  
  // Page numbers (display max 5 nearby buttons)
  let startP = Math.max(1, current - 2);
  let endP = Math.min(totalPages, startP + 4);
  if (endP - startP < 4) {
    startP = Math.max(1, endP - 4);
  }
  
  for (let p = startP; p <= endP; p++) {
    const pBtn = document.createElement('button');
    pBtn.className = `page-btn ${p === current ? 'active' : ''}`;
    pBtn.textContent = p;
    pBtn.onclick = () => {
      state.table.currentPage = p;
      renderTable();
    };
    container.appendChild(pBtn);
  }
  
  // Next button
  const nextBtn = document.createElement('button');
  nextBtn.className = 'page-btn';
  nextBtn.innerHTML = '›';
  nextBtn.disabled = current >= totalPages;
  nextBtn.onclick = () => {
    if (state.table.currentPage < totalPages) {
      state.table.currentPage++;
      renderTable();
    }
  };
  container.appendChild(nextBtn);
}

// --------------------------------------------------------------------------
// Detailed ETF Diagnosis Modal
// --------------------------------------------------------------------------

window.openModalByCode = function(code) {
  const it = state.allEtfs.find(i => i.itemCode === code);
  if (it) openModal(it);
};

function openModal(it) {
  const modal = document.getElementById('etfModal');
  
  document.getElementById('modalItemName').textContent = it.itemName;
  document.getElementById('modalItemCode').textContent = it.itemCode;
  document.getElementById('modalManager').textContent = `${it.manager} (${it.brand})`;
  document.getElementById('modalType').textContent = it.etfType;
  
  // Prices
  document.getElementById('modalPrice').textContent = `${formatters.number(it.currentPrice)}원`;
  const changeEl = document.getElementById('modalChangeRate');
  changeEl.textContent = `전일대비 ${it.changePrice > 0 ? '+' : ''}${formatters.number(it.changePrice)}원 (${formatters.percent(it.changeRate)})`;
  changeEl.className = it.changeRate > 0 ? 'val-up' : it.changeRate < 0 ? 'val-down' : 'val-steady';
  
  // iNAV & Disparity
  document.getElementById('modalNav').textContent = `${formatters.number(it.iNav)}원`;
  const dispEl = document.getElementById('modalDisparity');
  const isExtreme = Math.abs(it.disparityRate) >= 2.0;
  dispEl.innerHTML = `괴리율: <strong>${formatters.percent(it.disparityRate, false)}</strong> ${isExtreme ? '⚠️ (주의 필요)' : '✅ (정상 추종)'}`;
  dispEl.style.color = isExtreme ? 'var(--color-warning)' : 'var(--text-secondary)';
  
  // AUM
  document.getElementById('modalAum').textContent = formatters.currencyWon(it.totalNetAssets);
  const aumRank = state.allEtfs.filter(i => i.totalNetAssets > it.totalNetAssets).length + 1;
  document.getElementById('modalAumRank').textContent = `시장 전체 AUM 순위: ${aumRank}위 / ${state.allEtfs.length}개`;
  
  // Liquidity
  document.getElementById('modalTradingVal').textContent = formatters.currencyWon(it.tradingValue);
  document.getElementById('modalTradingVol').textContent = `당일 거래량: ${formatters.number(it.tradingVolume)}주`;
  
  // Returns
  document.getElementById('modalReturn1m').textContent = formatters.percent(it.returnRate1m);
  document.getElementById('modalReturn3m').textContent = formatters.percent(it.returnRate3m);
  document.getElementById('modalReturn6m').textContent = formatters.percent(it.returnRate6m);
  document.getElementById('modalTurnover').textContent = `${it.turnover.toFixed(2)}%`;
  
  // Naver Link
  document.getElementById('modalNaverLink').href = `https://finance.naver.com/item/main.naver?code=${it.itemCode}`;
  
  // Diagnosis Note
  let note = '';
  if (it.totalNetAssets > 1e12) {
    note += '• 본 종목은 순자산 1조원 이상의 대형 핵심 ETF로 유동성 및 호가 안정성이 뛰어납니다.<br>';
  } else if (it.totalNetAssets < 100 * 1e8) {
    note += '• 본 종목은 순자산 100억원 미만 소규모 ETF로 거래량 부족 및 상장폐지 기준에 유의해야 합니다.<br>';
  }
  if (Math.abs(it.disparityRate) > 2.0) {
    note += `• 현재 괴리율이 ${it.disparityRate}%로 시장가격과 실시간 순자산가치(iNAV) 간의 괴리가 큽니다. 매수/매도 시 호가 괴리를 필히 확인하세요.`;
  } else {
    note += '• iNAV 추종 괴리율이 1% 이내로 안정적으로 관리되고 있습니다.';
  }
  document.getElementById('modalDiagnosisNote').innerHTML = note;
  
  modal.classList.add('open');
}

function closeModal() {
  document.getElementById('etfModal').classList.remove('open');
}

// --------------------------------------------------------------------------
// CSV Export with UTF-8 BOM
// --------------------------------------------------------------------------

function exportToCsv() {
  const items = state.filteredEtfs;
  if (!items || items.length === 0) {
    showToast('내보낼 데이터가 없습니다.', 'error');
    return;
  }
  
  const headers = [
    '종목코드', '종목명', '운용사', '브랜드', '자산분류',
    '현재가', '전일대비', '등락률(%)', '거래량', '거래대금',
    '순자산총액(AUM)', 'iNAV', '괴리율(%)', '1개월수익률(%)', '3개월수익률(%)', '6개월수익률(%)'
  ];
  
  const rows = items.map(i => [
    `"${i.itemCode}"`,
    `"${i.itemName.replace(/"/g, '""')}"`,
    `"${i.manager}"`,
    `"${i.brand}"`,
    `"${i.etfType}"`,
    i.currentPrice ?? '',
    i.changePrice ?? '',
    i.changeRate ?? '',
    i.tradingVolume ?? '',
    i.tradingValue ?? '',
    i.totalNetAssets ?? '',
    i.iNav ?? '',
    i.disparityRate ?? '',
    i.returnRate1m ?? '',
    i.returnRate3m ?? '',
    i.returnRate6m ?? ''
  ]);
  
  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `KRX_ETF_Full_Data_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  showToast(`${items.length}개 종목 데이터를 CSV로 저장했습니다.`, 'success');
}

// --------------------------------------------------------------------------
// Event Listeners & Theme Initialization
// --------------------------------------------------------------------------

function initTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  document.documentElement.setAttribute('data-color-scheme', state.colorScheme);
  updateThemeIcon();
}

function updateThemeIcon() {
  const icon = document.getElementById('themeIcon');
  if (state.theme === 'dark') {
    icon.innerHTML = '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
  } else {
    icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
  }
}

function setupEventListeners() {
  // Theme Toggle
  document.getElementById('themeToggleBtn').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('etf_theme', state.theme);
    document.documentElement.setAttribute('data-theme', state.theme);
    updateThemeIcon();
    renderAllCharts();
  });
  
  // Color Scheme Toggle (KR vs Global)
  const schemeBtn = document.getElementById('colorSchemeBtn');
  const schemeLabel = document.getElementById('colorSchemeLabel');
  schemeBtn.addEventListener('click', () => {
    state.colorScheme = state.colorScheme === 'kr' ? 'global' : 'kr';
    localStorage.setItem('etf_color_scheme', state.colorScheme);
    document.documentElement.setAttribute('data-color-scheme', state.colorScheme);
    schemeLabel.textContent = state.colorScheme === 'kr' ? '🇰🇷 한국식 색상' : '🌐 글로벌 색상';
    renderAllCharts();
    renderTable();
  });
  
  // Refresh Button
  document.getElementById('refreshBtn').addEventListener('click', () => {
    loadData(true);
  });
  
  // Export CSV
  document.getElementById('exportCsvBtn').addEventListener('click', exportToCsv);
  
  // Section 1 Tabs
  document.getElementById('marketShareTypeTabs').addEventListener('click', (e) => {
    if (e.target.dataset.metric) {
      document.querySelectorAll('#marketShareTypeTabs .tab-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      state.tabs.managerShareMetric = e.target.dataset.metric;
      renderManagerShareChart();
    }
  });
  
  // Section 2 Tabs
  document.getElementById('scatterScaleTabs').addEventListener('click', (e) => {
    if (e.target.dataset.scale) {
      document.querySelectorAll('#scatterScaleTabs .tab-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      state.tabs.scatterScale = e.target.dataset.scale;
      renderLiquidityScatterChart();
    }
  });
  
  document.getElementById('rankingTabs').addEventListener('click', (e) => {
    if (e.target.dataset.type) {
      document.querySelectorAll('#rankingTabs .tab-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      state.tabs.rankingType = e.target.dataset.type;
      renderTop10RankingChart();
    }
  });
  
  // Section 3 Tabs
  document.getElementById('returnPeriodTabs').addEventListener('click', (e) => {
    if (e.target.dataset.period) {
      document.querySelectorAll('#returnPeriodTabs .tab-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      state.tabs.returnPeriod = e.target.dataset.period;
      renderReturnHistogramChart();
      renderReturnExtremesChart();
    }
  });
  
  // Table Search & Filters
  let searchDebounceTimer = null;
  document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      state.table.searchQuery = e.target.value;
      applyFilters();
    }, 200);
  });
  
  document.getElementById('managerFilter').addEventListener('change', (e) => {
    state.table.managerFilter = e.target.value;
    applyFilters();
  });
  
  document.getElementById('typeFilter').addEventListener('change', (e) => {
    state.table.typeFilter = e.target.value;
    applyFilters();
  });
  
  // Filter Chips
  document.getElementById('movementChips').addEventListener('click', (e) => {
    if (e.target.dataset.movement) {
      document.querySelectorAll('#movementChips .chip').forEach(c => c.classList.remove('active'));
      e.target.classList.add('active');
      state.table.movementFilter = e.target.dataset.movement;
      applyFilters();
    }
  });
  
  document.getElementById('disparityChips').addEventListener('click', (e) => {
    if (e.target.dataset.disp) {
      document.querySelectorAll('#disparityChips .chip').forEach(c => c.classList.remove('active'));
      e.target.classList.add('active');
      state.table.disparityFilter = e.target.dataset.disp;
      applyFilters();
    }
  });
  
  document.getElementById('scaleChips').addEventListener('click', (e) => {
    if (e.target.dataset.scale) {
      document.querySelectorAll('#scaleChips .chip').forEach(c => c.classList.remove('active'));
      e.target.classList.add('active');
      state.table.scaleFilter = e.target.dataset.scale;
      applyFilters();
    }
  });
  
  document.getElementById('resetFilterBtn').addEventListener('click', () => {
    document.getElementById('searchInput').value = '';
    document.getElementById('managerFilter').value = '';
    document.getElementById('typeFilter').value = '';
    
    document.querySelectorAll('.filter-chips .chip').forEach(c => {
      c.classList.toggle('active', c.dataset.movement === 'all' || c.dataset.disp === 'all' || c.dataset.scale === 'all');
    });
    
    state.table.searchQuery = '';
    state.table.managerFilter = '';
    state.table.typeFilter = '';
    state.table.movementFilter = 'all';
    state.table.disparityFilter = 'all';
    state.table.scaleFilter = 'all';
    applyFilters();
  });
  
  // Table Header Sort Clicks
  document.querySelectorAll('#etfTable th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (state.table.sortField === field) {
        state.table.sortOrder = state.table.sortOrder === 'asc' ? 'desc' : 'asc';
      } else {
        state.table.sortField = field;
        state.table.sortOrder = 'desc';
      }
      
      document.querySelectorAll('#etfTable th').forEach(h => {
        h.classList.remove('sort-active');
        const text = h.textContent.replace(' ▲', '').replace(' ▼', '');
        h.textContent = text;
      });
      
      th.classList.add('sort-active');
      th.textContent += state.table.sortOrder === 'asc' ? ' ▲' : ' ▼';
      
      applySorting();
      renderTable();
    });
  });
  
  // Page Size Select
  document.getElementById('pageSizeSelect').addEventListener('change', (e) => {
    state.table.pageSize = Number(e.target.value);
    state.table.currentPage = 1;
    renderTable();
  });
  
  // Modal Close Events
  document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
  document.getElementById('modalConfirmBtn').addEventListener('click', closeModal);
  document.getElementById('etfModal').addEventListener('click', (e) => {
    if (e.target.id === 'etfModal') closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

// --------------------------------------------------------------------------
// Initialization
// --------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupEventListeners();
  loadData(false);
});
