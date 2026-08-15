import io
import json
import pandas as pd
import requests

def fetch_all_with_names():
    all_tickers = []

    # 1. NASDAQ & NYSE
    print("Fetching US Tickers (NASDAQ & NYSE)...")
    nasdaq_url = "ftp://ftp.nasdaqtrader.com/SymbolDirectory/nasdaqlisted.txt"
    other_url = "ftp://ftp.nasdaqtrader.com/SymbolDirectory/otherlisted.txt"

    try:
        # NASDAQ
        nasdaq_df = pd.read_csv(nasdaq_url, sep="|")
        nasdaq_df = nasdaq_df[:-1] # Remove footer metadata row
        for _, row in nasdaq_df.dropna(subset=["Symbol", "Security Name"]).iterrows():
            all_tickers.append({
                "ticker": str(row["Symbol"]).strip(),
                "name": str(row["Security Name"]).strip(),
                "exchange": "NASDAQ"
            })
        print(f"✓ Extracted {len(nasdaq_df)} NASDAQ tickers with names.")

        # NYSE / Other
        other_df = pd.read_csv(other_url, sep="|")
        other_df = other_df[:-1]
        nyse_df = other_df[other_df["Exchange"] == "N"]
        for _, row in nyse_df.dropna(subset=["ACT Symbol", "Security Name"]).iterrows():
            all_tickers.append({
                "ticker": str(row["ACT Symbol"]).strip(),
                "name": str(row["Security Name"]).strip(),
                "exchange": "NYSE"
            })
        print(f"✓ Extracted {len(nyse_df)} NYSE tickers with names.")
    except Exception as e:
        print(f"Error fetching US tickers: {e}")

    # 2. NSE (India)
    print("Fetching NSE Tickers...")
    nse_url = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv"
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        session = requests.Session()
        session.headers.update(headers)
        res = session.get(nse_url)
        if res.status_code == 200:
            df = pd.read_csv(io.BytesIO(res.content))
            for _, row in df.dropna(subset=["SYMBOL", "NAME OF COMPANY"]).iterrows():
                symbol = str(row["SYMBOL"]).strip()
                # Store both raw symbol and .NS suffix if needed
                all_tickers.append({
                    "ticker": symbol,
                    "name": str(row["NAME OF COMPANY"]).strip(),
                    "exchange": "NSE"
                })
                all_tickers.append({
                    "ticker": f"{symbol}.NS",
                    "name": str(row["NAME OF COMPANY"]).strip(),
                    "exchange": "NSE"
                })
            print(f"✓ Extracted {len(df)} NSE tickers with names.")
    except Exception as e:
        print(f"Error fetching NSE tickers: {e}")

    # 3. BSE (India)
    print("Fetching BSE Tickers...")
    bse_url = "https://www.bseindia.com/downloads/ipo/Equities.csv"
    try:
        session = requests.Session()
        session.headers.update(headers)
        res = session.get(bse_url)
        if res.status_code == 200:
            df = pd.read_csv(io.BytesIO(res.content))
            sec_col = "Security Id" if "Security Id" in df.columns else df.columns[1]
            name_col = "Security Name" if "Security Name" in df.columns else df.columns[2]
            
            for _, row in df.dropna(subset=[sec_col, name_col]).iterrows():
                symbol = str(row[sec_col]).strip()
                all_tickers.append({
                    "ticker": symbol,
                    "name": str(row[name_col]).strip(),
                    "exchange": "BSE"
                })
                all_tickers.append({
                    "ticker": f"{symbol}.BO",
                    "name": str(row[name_col]).strip(),
                    "exchange": "BSE"
                })
            print(f"✓ Extracted {len(df)} BSE tickers with names.")
    except Exception as e:
        print(f"Error fetching BSE tickers: {e}")

    # Save to tickers.json
    with open("tickers.json", "w", encoding="utf-8") as f:
        json.dump(all_tickers, f, indent=2)

    print(f"\n🎉 Successfully created 'tickers.json' with {len(all_tickers)} mapping entries!")

if __name__ == "__main__":
    fetch_all_with_names()
