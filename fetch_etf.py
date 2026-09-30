#!/usr/bin/env python3
"""
Naver Securities Domestic ETF Full Data Collector
Fetches all domestic ETF listings from Naver Securities API and saves to data/etf_data.json
Usage:
    uv run fetch_etf.py
"""

import json
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

KST = timezone(timedelta(hours=9))
BASE_URL = "https://stock.naver.com/api/stockSecurity/etfs/v2/domestic?listingType=aumDesc&size=100&index="

BRANDS = [
    ("KODEX", "삼성자산운용"),
    ("TIGER", "미래에셋자산운용"),
    ("ACE", "한국투자신탁운용"),
    ("RISE", "KB자산운용"),
    ("KBSTAR", "KB자산운용"),
    ("SOL", "신한자산운용"),
    ("PLUS", "한화자산운용"),
    ("ARIRANG", "한화자산운용"),
    ("HANARO", "NH-Amundi자산운용"),
    ("WON", "우리자산운용"),
    ("WOORI", "우리자산운용"),
    ("KIWOOM", "키움투자자산운용"),
    ("히어로즈", "키움투자자산운용"),
    ("TIMEFOLIO", "타임폴리오자산운용"),
    ("TIME", "타임폴리오자산운용"),
    ("KoAct", "삼성액티브자산운용"),
    ("1Q", "하나자산운용"),
    ("UNICORN", "현대자산운용"),
    ("BNK", "BNK자산운용"),
    ("DAISHIN", "대신자산운용"),
    ("대신343", "대신자산운용"),
    ("KCGI", "KCGI자산운용"),
    ("IBK", "IBK자산운용"),
    ("TRUSTON", "트러스톤자산운용"),
    ("트러스톤", "트러스톤자산운용"),
    ("마이티", "DB자산운용"),
    ("MIDAS", "마이다스에셋자산운용"),
    ("TREX", "유진자산운용"),
    ("HK", "흥국자산운용"),
    ("에셋플러스", "에셋플러스자산운용"),
    ("파워", "교보악사자산운용"),
    ("아이엠에셋", "iM에셋자산운용"),
    ("더제이", "더제이자산운용"),
    ("DS", "디에스자산운용"),
    ("FOCUS", "브레인자산운용"),
]

def extract_brand(name: str):
    name_upper = name.upper()
    for brand_code, manager in BRANDS:
        if name_upper.startswith(brand_code.upper()):
            return brand_code, manager
    return "기타", "기타 운용사"

def parse_float(val):
    if val is None or val == "":
        return None
    try:
        return float(str(val).replace(",", "").replace("%", ""))
    except ValueError:
        return None

def parse_int(val):
    if val is None or val == "":
        return None
    try:
        return int(float(str(val).replace(",", "")))
    except ValueError:
        return None

def fetch_page(index: int, max_retries: int = 5):
    url = f"{BASE_URL}{index}"
    req = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Referer": "https://finance.naver.com/",
        }
    )
    for attempt in range(1, max_retries + 1):
        try:
            with urlopen(req, timeout=12) as response:
                return json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, Exception) as e:
            if attempt == max_retries:
                print(f"[ERROR] Page {index} failed after {max_retries} attempts: {e}", file=sys.stderr)
                raise
            sleep_time = attempt * 1.0
            print(f"[RETRY] Page {index} attempt {attempt} failed ({e}). Retrying in {sleep_time}s...", file=sys.stderr)
            time.sleep(sleep_time)

def collect_all_etfs():
    print(f"[{datetime.now(KST).strftime('%Y-%m-%d %H:%M:%S')}] Starting ETF data collection from Naver API...")
    
    # 1. Fetch first page (index 0) to get official totalCount
    first_page = fetch_page(0)
    total_count = int(first_page.get("totalCount", 0))
    if total_count == 0:
        raise ValueError("Failed to retrieve totalCount from Naver API")
        
    total_pages = (total_count + 99) // 100
    print(f"Total ETFs reported by Naver API: {total_count} (Total {total_pages} pages expected)")
    
    page_data_map = {0: first_page.get("items", [])}
    missing_pages = [p for p in range(1, total_pages)]
    
    # 2. Fetch all remaining pages
    for p in list(missing_pages):
        try:
            p_data = fetch_page(p)
            items = p_data.get("items", [])
            page_data_map[p] = items
            missing_pages.remove(p)
            print(f"Fetched page {p}: {len(items)} items")
            time.sleep(0.05)
        except Exception as e:
            print(f"[WARN] Page {p} initial fetch failed: {e}", file=sys.stderr)
            
    # 3. Retry any missing pages
    if missing_pages:
        print(f"[INFO] Re-attempting {len(missing_pages)} failed pages: {missing_pages}...")
        for p in list(missing_pages):
            try:
                p_data = fetch_page(p, max_retries=5)
                page_data_map[p] = p_data.get("items", [])
                missing_pages.remove(p)
                print(f"Recovered page {p}: {len(page_data_map[p])} items")
            except Exception as e:
                print(f"[FATAL] Could not recover page {p}: {e}", file=sys.stderr)
                
    # 4. Assemble and deduplicate all items across all pages
    all_items = []
    seen_codes = set()
    
    for p in range(total_pages):
        for raw in page_data_map.get(p, []):
            code = raw.get("itemCode")
            if code and code not in seen_codes:
                seen_codes.add(code)
                cur_price = parse_int(raw.get("currentPrice"))
                inav = parse_float(raw.get("iNav"))
                disparity = None
                if cur_price is not None and inav is not None and inav > 0:
                    disparity = round(((cur_price - inav) / inav) * 100, 2)
                
                brand, manager = extract_brand(raw.get("itemName", ""))
                
                processed_item = {
                    "itemCode": code,
                    "itemName": raw.get("itemName", ""),
                    "brand": brand,
                    "manager": manager,
                    "etfType": raw.get("etfType", "기타"),
                    "currentPrice": cur_price,
                    "changePrice": parse_int(raw.get("changePrice")),
                    "changeRate": parse_float(raw.get("changeRate")),
                    "priceMovement": raw.get("priceMovement", "steady"),
                    "tradingVolume": parse_int(raw.get("tradingVolume")),
                    "tradingValue": parse_int(raw.get("tradingValue")),
                    "totalNetAssets": parse_int(raw.get("totalNetAssets")),
                    "returnRate1m": parse_float(raw.get("returnRate1m")),
                    "returnRate3m": parse_float(raw.get("returnRate3m")),
                    "returnRate6m": parse_float(raw.get("returnRate6m")),
                    "iNav": inav,
                    "disparityRate": disparity,
                }
                all_items.append(processed_item)

    # 5. Strict verification: ensure we did NOT stop at 200 or an incomplete count!
    if len(all_items) < total_count and len(all_items) < 1000:
        print(f"[ERROR] Collected only {len(all_items)} ETFs out of {total_count}! (Incomplete dataset detected)", file=sys.stderr)
        out_json = os.path.join("data", "etf_data.json")
        if os.path.exists(out_json):
            with open(out_json, "r", encoding="utf-8") as f:
                existing = json.load(f)
                if len(existing.get("items", [])) >= 1000:
                    print(f"[RECOVERY] Preserving existing complete dataset with {len(existing['items'])} ETFs instead of overwriting with partial {len(all_items)} items.", file=sys.stderr)
                    return existing
        raise RuntimeError(f"Data collection incomplete: only got {len(all_items)}/{total_count} items")

    os.makedirs("data", exist_ok=True)
    out_json = os.path.join("data", "etf_data.json")
    out_js = os.path.join("data", "etf_data.js")
    
    payload = {
        "updatedAt": datetime.now(KST).isoformat(),
        "totalCount": len(all_items),
        "apiReportedTotal": total_count,
        "items": all_items
    }
    
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        
    with open(out_js, "w", encoding="utf-8") as f:
        f.write("window.ETF_FALLBACK_DATA = ")
        json.dump(payload, f, ensure_ascii=False)
        f.write(";\n")
        
    print(f"Successfully collected ALL {len(all_items)} ETFs (100% complete) and saved to {out_json} and {out_js}")
    return payload

if __name__ == "__main__":
    collect_all_etfs()
